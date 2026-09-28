import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getHistory, historyCsv } from '@/lib/history'

export const dynamic = 'force-dynamic'

/** Журнал подключений файлом для Excel — за период, который даёт тариф. */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const history = await getHistory(user)
  const today = new Date().toISOString().slice(0, 10)
  return new Response(historyCsv(history), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="remit-history-${today}.csv"`,
      'cache-control': 'private, no-store',
    },
  })
}
