// Заглушка API ЮKassa: платежи (страница оплаты, сохранение карты, автосписание),
// идемпотентность, отказы банка, чеки (в т. ч. второй чек с зачётом аванса), возвраты.
import http from 'node:http'
import { randomBytes } from 'node:crypto'

const PORT = Number(process.env.PORT ?? 21992)
const AUTH = 'Basic ' + Buffer.from('shop1:sk_test').toString('base64')
const payments = new Map()
const refunds = new Map()
const receipts = [] // {id, payment_id, type, status, items, settlements, ...}
const byKey = new Map() // Idempotence-Key -> response body
const savedMethods = new Map() // id -> {revoked}
const log = []
let control = { declineReason: '', failCreate: 0, receiptPending: false }
let seq = 1000

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}
const readBody = async (req) => {
  let raw = ''
  for await (const chunk of req) raw += chunk
  return raw ? JSON.parse(raw) : {}
}
const fiscal = () => ({
  fiscal_document_number: String(seq++),
  fiscal_storage_number: '9288000100115785',
  fiscal_attribute: String(1000000000 + seq),
  registered_at: new Date().toISOString(),
})
function addReceipt(payment, extra = {}) {
  const r = {
    id: 'rc_' + randomBytes(6).toString('hex'),
    type: 'payment',
    payment_id: payment.id,
    status: control.receiptPending ? 'pending' : 'succeeded',
    items: payment.receipt?.items ?? [],
    ...(control.receiptPending ? {} : fiscal()),
    ...extra,
  }
  receipts.push(r)
  return r
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x')
    // --- управление тестом
    if (url.pathname === '/__set') {
      control = { ...control, ...(await readBody(req)) }
      return json(res, 200, control)
    }
    if (url.pathname === '/__log') return json(res, 200, { log, payments: [...payments.values()], receipts })
    if (url.pathname === '/__refund') {
      const body = await readBody(req)
      const p = payments.get(body.id)
      p.refunded_amount = { value: body.value, currency: 'RUB' }
      return json(res, 200, p)
    }
    if (url.pathname === '/__revoke') {
      const body = await readBody(req)
      savedMethods.set(body.id, { revoked: true })
      return json(res, 200, {})
    }
    // --- страница оплаты: человек платит, ЮKassa возвращает его в кабинет
    if (url.pathname.startsWith('/pay/')) {
      const p = payments.get(url.pathname.slice(5))
      if (!p) return json(res, 404, {})
      if (p.status === 'pending') {
        p.status = 'succeeded'
        p.paid = true
        const methodId = 'pm_' + randomBytes(6).toString('hex')
        p.payment_method = { type: 'bank_card', id: methodId, saved: Boolean(p.save_payment_method), title: 'Bank card *4444', card: { last4: '4444' } }
        if (p.save_payment_method) savedMethods.set(methodId, { revoked: false })
        if (p.receipt) addReceipt(p)
      }
      res.writeHead(302, { location: p.return_url })
      return res.end()
    }
    // --- API
    if (!url.pathname.startsWith('/v3/')) return json(res, 404, {})
    if (req.headers.authorization !== AUTH) return json(res, 401, { type: 'error', code: 'invalid_credentials' })
    const path = url.pathname.slice(3)

    if (req.method === 'POST') {
      const key = req.headers['idempotence-key']
      if (!key) return json(res, 400, { type: 'error', code: 'invalid_request', description: 'Idempotence-Key required' })
      const body = await readBody(req)
      log.push({ path, key, body })
      if (byKey.has(key)) return json(res, 200, byKey.get(key))

      if (path === '/payments') {
        if (control.failCreate > 0) {
          control.failCreate -= 1
          return json(res, 500, { type: 'error', code: 'internal_server_error' })
        }
        const id = 'yk_' + randomBytes(8).toString('hex')
        const p = {
          id,
          status: 'pending',
          paid: false,
          amount: body.amount,
          description: body.description,
          metadata: body.metadata,
          receipt: body.receipt,
          created_at: new Date().toISOString(),
          refunded_amount: { value: '0.00', currency: 'RUB' },
        }
        if (body.payment_method_id) {
          const method = savedMethods.get(body.payment_method_id)
          if (!method) return json(res, 400, { type: 'error', code: 'invalid_request', description: 'payment_method_id not found' })
          p.payment_method = { type: 'bank_card', id: body.payment_method_id, saved: true, title: 'Bank card *4444' }
          p.recurring = true
          if (method.revoked) {
            p.status = 'canceled'
            p.cancellation_details = { party: 'yoo_money', reason: 'permission_revoked' }
          } else if (control.declineReason) {
            p.status = 'canceled'
            p.cancellation_details = { party: 'card_issuer', reason: control.declineReason }
          } else {
            p.status = 'succeeded'
            p.paid = true
            if (p.receipt) addReceipt(p)
          }
        } else {
          p.save_payment_method = Boolean(body.save_payment_method)
          p.return_url = body.confirmation?.return_url
          p.confirmation = { type: 'redirect', confirmation_url: `http://127.0.0.1:${PORT}/pay/${id}` }
        }
        payments.set(id, p)
        byKey.set(key, p)
        return json(res, 200, p)
      }
      if (path === '/refunds') {
        const p = payments.get(body.payment_id)
        if (!p || p.status !== 'succeeded') return json(res, 400, { type: 'error', code: 'invalid_request', description: 'payment not refundable' })
        const value = Number.parseFloat(body.amount?.value ?? '0')
        const already = Number.parseFloat(p.refunded_amount?.value ?? '0')
        if (value + already > Number.parseFloat(p.amount.value) + 1e-9) return json(res, 400, { type: 'error', code: 'invalid_request', description: 'refund exceeds payment' })
        const refund = { id: 'rf_' + randomBytes(6).toString('hex'), status: control.refundStatus || 'succeeded', amount: body.amount, payment_id: p.id, description: body.description }
        refunds.set(refund.id, refund)
        p.refunded_amount = { value: (already + value).toFixed(2), currency: 'RUB' }
        if (body.receipt) addReceipt(p, { type: 'refund', items: body.receipt.items })
        byKey.set(key, refund)
        return json(res, 200, refund)
      }
      if (path === '/receipts') {
        const p = payments.get(body.payment_id)
        if (!p) return json(res, 400, { type: 'error', code: 'invalid_request', description: 'payment not found' })
        const r = addReceipt(p, { items: body.items, settlements: body.settlements, customer: body.customer })
        byKey.set(key, r)
        return json(res, 200, r)
      }
      return json(res, 404, {})
    }

    if (path.startsWith('/refunds/')) {
      const refund = refunds.get(path.slice(9))
      if (refund && control.refundSettle) refund.status = 'succeeded'
      return refund ? json(res, 200, refund) : json(res, 404, { type: 'error', code: 'not_found' })
    }
    if (path.startsWith('/payments/')) {
      const p = payments.get(path.slice(10))
      return p ? json(res, 200, p) : json(res, 404, { type: 'error', code: 'not_found' })
    }
    if (path === '/receipts') {
      const id = url.searchParams.get('payment_id')
      return json(res, 200, { type: 'list', items: receipts.filter((r) => r.payment_id === id) })
    }
    json(res, 404, {})
  })
  .listen(PORT, '127.0.0.1', () => console.log('fake yookassa on', PORT))
