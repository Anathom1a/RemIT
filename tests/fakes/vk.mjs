// Заглушка VK ID: authorize → redirect с code; oauth2/auth проверяет PKCE; oauth2/user_info отдаёт профиль.
import http from 'node:http'
import { createHash, randomBytes } from 'node:crypto'

const PORT = Number(process.env.PORT ?? 21991)
let profile = { user_id: 1001, first_name: 'Иван', last_name: 'ВК', email: 'vk1@example.com' }
const codes = new Map() // code -> { challenge, redirect, clientId, profile, used }
const tokens = new Map() // access_token -> profile
const log = []

const readBody = async (req) => {
  let raw = ''
  for await (const chunk of req) raw += chunk
  return Object.fromEntries(new URLSearchParams(raw))
}
const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x')
    if (url.pathname === '/__set') {
      const body = JSON.parse((await (async () => { let r = ''; for await (const c of req) r += c; return r })()) || '{}')
      profile = body
      return json(res, 200, {})
    }
    if (url.pathname === '/__log') return json(res, 200, log)
    if (url.pathname === '/authorize') {
      const q = url.searchParams
      log.push({ authorize: Object.fromEntries(q) })
      if (q.get('response_type') !== 'code' || q.get('code_challenge_method') !== 'S256' || !q.get('code_challenge') || !q.get('state')) {
        return json(res, 400, { error: 'bad authorize request' })
      }
      const code = randomBytes(8).toString('hex')
      codes.set(code, { challenge: q.get('code_challenge'), redirect: q.get('redirect_uri'), clientId: q.get('client_id'), profile: { ...profile }, used: false })
      const back = new URL(q.get('redirect_uri'))
      back.search = new URLSearchParams({ code, state: q.get('state'), device_id: 'dev-' + code, type: 'code_v2', expires_in: '600' }).toString()
      res.writeHead(302, { location: back.toString() })
      return res.end()
    }
    if (url.pathname === '/oauth2/auth' && req.method === 'POST') {
      const body = await readBody(req)
      log.push({ token: body })
      const entry = codes.get(body.code)
      if (!entry || entry.used) return json(res, 200, { error: 'invalid_grant', error_description: 'code invalid' })
      const challenge = createHash('sha256').update(body.code_verifier ?? '').digest('base64url')
      if (challenge !== entry.challenge) return json(res, 200, { error: 'invalid_grant', error_description: 'PKCE mismatch' })
      if (body.grant_type !== 'authorization_code' || body.redirect_uri !== entry.redirect || body.client_id !== entry.clientId || !body.device_id) {
        return json(res, 200, { error: 'invalid_request', error_description: 'bad params' })
      }
      entry.used = true
      const token = randomBytes(12).toString('hex')
      tokens.set(token, entry.profile)
      return json(res, 200, { access_token: token, refresh_token: 'r', id_token: 'i', token_type: 'Bearer', expires_in: 3600, user_id: entry.profile.user_id, state: body.state, scope: 'email' })
    }
    if (url.pathname === '/oauth2/user_info' && req.method === 'POST') {
      const body = await readBody(req)
      const p = tokens.get(body.access_token)
      if (!p) return json(res, 200, { error: 'invalid_token' })
      return json(res, 200, { user: { ...p } })
    }
    json(res, 404, { error: 'not found' })
  })
  .listen(PORT, '127.0.0.1', () => console.log('fake vk on', PORT))
