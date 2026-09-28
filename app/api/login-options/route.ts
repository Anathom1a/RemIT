import { NextResponse } from 'next/server'
import { VK_CLIENT_OP, vkEnabled } from '@/lib/vk'

export const dynamic = 'force-dynamic'

/** Способы входа кроме пароля. Клиент рисует по ним кнопки: у нас — VK ID. */
export function GET() {
  if (!vkEnabled()) return NextResponse.json([])
  return NextResponse.json([`common-oidc/${JSON.stringify([{ name: VK_CLIENT_OP }])}`, `oidc/${VK_CLIENT_OP}`])
}
