import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { CompanyError, parseCompany } from '@/lib/documents'
import { getStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

/** Реквизиты организации для счетов и актов: {action: "save", …поля} или {action: "delete"}. */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const store = await getStore()

  if (payload.action === 'delete') {
    await store.deleteCompany(user.id)
    return NextResponse.json({ ok: true })
  }

  try {
    const company = parseCompany(user.id, payload)
    await store.saveCompany(company)
    return NextResponse.json({ ok: true, company })
  } catch (error) {
    if (error instanceof CompanyError) return NextResponse.json({ error: error.message }, { status: 400 })
    throw error
  }
}
