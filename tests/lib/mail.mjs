// Письма из SMTP-приёмника (MAIL_DIR): темы с разбором кодировки =?UTF-8?…?=.
import fs from 'node:fs'
import path from 'node:path'

function decodeWords(value) {
  return value
    .replace(/\?=\s+=\?/g, '?==?')
    .replace(/=\?utf-8\?([bq])\?([^?]*)\?=/gi, (_, encoding, text) =>
      encoding.toLowerCase() === 'b'
        ? Buffer.from(text, 'base64').toString('utf8')
        : Buffer.from(text.replace(/_/g, ' ').replace(/=([0-9a-f]{2})/gi, (m, hex) => String.fromCharCode(parseInt(hex, 16))), 'latin1').toString('utf8'),
    )
}

/** Письма получателю: [{subject, raw}] в порядке прихода. */
export function mailsTo(to, dir = process.env.MAIL_DIR) {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .sort()
    .map((file) => fs.readFileSync(path.join(dir, file), 'utf8'))
    .filter((raw) => raw.includes(`To: ${to}`))
    .map((raw) => {
      const head = raw.split(/\r?\n\r?\n/)[0].replace(/\r?\n[ \t]+/g, ' ')
      return { subject: decodeWords(head.match(/^Subject: (.*)$/m)?.[1] ?? ''), raw }
    })
}
