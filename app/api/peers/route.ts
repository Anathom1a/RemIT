import { NextResponse } from 'next/server'
import { clientRoute } from '@/lib/client-api'
import { getStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

/** Вкладка «Доступные устройства»: устройства аккаунта со сведениями о системе. */
export const GET = clientRoute(async ({ user }, request) => {
  const url = new URL(request.url)
  const current = Math.max(1, Number(url.searchParams.get('current')) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize')) || 100))

  const store = await getStore()
  const devices = await store.listDevicesByUser(user.id)
  const page = devices.slice((current - 1) * pageSize, current * pageSize)
  return NextResponse.json({
    total: devices.length,
    data: page.map((device) => ({
      id: device.rustdeskId,
      info: { device_name: device.name, os: device.os, username: device.osUsername },
      status: 1,
      user: user.email,
      user_name: user.email,
      note: '',
      device_group_name: '',
    })),
  })
})
