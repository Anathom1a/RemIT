import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Тревоги клиента (попытка с адреса вне белого списка и т. п.). Пока не
 * храним — отвечаем успехом, чтобы клиент не повторял запрос.
 */
export function POST() {
  return NextResponse.json({ code: 0, message: 'success', data: '' })
}
