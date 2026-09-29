// Заглушка Telegram Bot API: складывает сообщения, отдаёт их на /__log.
import http from 'node:http'
const messages = []
http.createServer(async (req, res) => {
  let raw = ''
  for await (const chunk of req) raw += chunk
  if (req.url === '/__log') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(messages)) }
  if (req.url === '/__clear') { messages.length = 0; res.writeHead(200); return res.end('{}') }
  const m = req.url.match(/^\/bot([^/]+)\/sendMessage/)
  if (!m) { res.writeHead(404); return res.end() }
  let body = {}
  if ((req.headers['content-type'] ?? '').includes('json')) body = JSON.parse(raw || '{}')
  else body = Object.fromEntries(new URLSearchParams(raw))
  messages.push({ token: m[1], chat_id: String(body.chat_id), text: body.text, at: Date.now() })
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ ok: true, result: {} }))
}).listen(Number(process.env.PORT ?? 21993), '127.0.0.1', () => console.log('fake telegram on', process.env.PORT ?? 21993))
