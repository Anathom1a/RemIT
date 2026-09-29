// HTTP-клиент для тестов: хранит cookie сессии, разбирает JSON, отдаёт текст
// страницы без разметки (как его видит человек).
export function session(base = process.env.BASE, ip = '10.200.0.1') {
  let cookie = ''
  async function request(method, path, body, headers = {}) {
    const response = await fetch(base + path, {
      method,
      headers: {
        'x-real-ip': ip,
        ...(cookie ? { cookie } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    })
    const set = response.headers.getSetCookie?.() ?? []
    if (set.length) {
      const jar = new Map(cookie ? cookie.split('; ').map((pair) => pair.split(/=(.*)/s).slice(0, 2)) : [])
      for (const line of set) {
        const [pair] = line.split(';')
        const [name, value] = pair.split(/=(.*)/s)
        jar.set(name, value)
      }
      cookie = [...jar].map(([name, value]) => `${name}=${value}`).join('; ')
    }
    const text = await response.text()
    let data = null
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
    return { status: response.status, data, text, headers: response.headers }
  }
  return {
    get: (path, headers) => request('GET', path, undefined, headers),
    post: (path, body = {}, headers) => request('POST', path, body, headers),
    /** Текст страницы без тегов — для проверок «что видит человек». */
    async page(path) {
      const response = await request('GET', path)
      return { status: response.status, text: pageText(response.text), html: response.text }
    },
  }
}

export function pageText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
}

/** Проверки набора: собирает результаты и печатает итог. */
export function checker() {
  const ok = []
  const fail = []
  const check = (label, condition, extra = '') =>
    (condition ? ok : fail).push(`${label} ${typeof extra === 'object' ? JSON.stringify(extra)?.slice(0, 500) : extra}`)
  function finish() {
    console.log('OK:\n  ' + ok.join('\n  '))
    if (fail.length) {
      console.log('\nFAIL:\n  ' + fail.join('\n  '))
      console.log(`\n${ok.length} прошли, ${fail.length} упали`)
      process.exit(1)
    }
    console.log(`\nВсе проверки прошли: ${ok.length}`)
    process.exit(0)
  }
  return { check, finish }
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Ждёт, пока fn не вернёт истинное значение. */
export async function until(fn, ms = 45_000, step = 1000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const value = await fn()
    if (value) return value
    await sleep(step)
  }
  return null
}
