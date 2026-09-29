// SMTP-приёмник для тестов: принимает письма и складывает их в MAIL_DIR (.eml).
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'

const PORT = Number(process.env.PORT ?? 2526)
const OUT = process.env.MAIL_DIR
fs.mkdirSync(OUT, { recursive: true })
let counter = 0

net
  .createServer((socket) => {
    const send = (line) => socket.write(`${line}\r\n`)
    let buffer = ''
    let data = false
    let body = []
    send('220 sink ready')
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      let index
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index + 1)
        buffer = buffer.slice(index + 1)
        if (data) {
          if (line === '.\r\n' || line === '.\n') {
            const name = `${Date.now()}-${String(counter++).padStart(6, '0')}.eml`
            fs.writeFileSync(path.join(OUT, name), body.join(''))
            body = []
            data = false
            send('250 queued')
          } else {
            body.push(line.startsWith('..') ? line.slice(1) : line)
          }
          continue
        }
        const command = line.trim().toUpperCase()
        if (command.startsWith('EHLO') || command.startsWith('HELO')) send('250 sink')
        else if (command === 'DATA') { data = true; send('354 go') }
        else if (command === 'QUIT') { send('221 bye'); socket.end() }
        else send('250 ok')
      }
    })
    socket.on('error', () => {})
  })
  .listen(PORT, '127.0.0.1', () => console.log('smtp sink on', PORT))
