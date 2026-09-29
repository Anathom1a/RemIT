// Заглушка S3 (PUT/GET, требует подпись SigV4) и приёма отчёта о резервной копии.
import http from 'node:http'
const objects = new Map(), reports = [], log = []
http.createServer(async (req, res) => {
  const chunks = []
  for await (const c of req) chunks.push(c)
  const body = Buffer.concat(chunks)
  if (req.url === '/__log') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ log, reports, objects: [...objects.keys()] })) }
  if (req.url === '/report') { reports.push({ auth: req.headers.authorization, body: JSON.parse(body.toString()) }); res.writeHead(200); return res.end('{}') }
  const auth = req.headers.authorization ?? ''
  log.push({ method: req.method, url: req.url, signed: auth.startsWith('AWS4-HMAC-SHA256 Credential=AK123/'), size: body.length })
  if (!auth.startsWith('AWS4-HMAC-SHA256')) { res.writeHead(403); return res.end('unsigned') }
  if (req.method === 'PUT') { objects.set(req.url, body); res.writeHead(200); return res.end() }
  if (req.method === 'GET' && objects.has(req.url)) { res.writeHead(200); return res.end(objects.get(req.url)) }
  res.writeHead(404); res.end()
}).listen(Number(process.env.PORT ?? 21995), "127.0.0.1")
