import { NextResponse } from 'next/server'
import { clientRoute } from '@/lib/client-api'
import { accessibleForClient } from '@/lib/teams'

export const dynamic = 'force-dynamic'

/** Вкладка «Доступные устройства»: устройства ваши и команды, со сведениями о системе. */
export const GET = clientRoute(async ({ user }, request) => {
  const url = new URL(request.url)
  const current = Math.max(1, Number(url.searchParams.get('current')) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize')) || 100))

  const { devices } = await accessibleForClient(user)
  const page = devices.slice((current - 1) * pageSize, current * pageSize)
  return NextResponse.json({
    total: devices.length,
    data: page.map(({ device, owner, groupName }) => ({
      id: device.rustdeskId,
      info: { device_name: device.name, os: device.os, username: device.osUsername },
      status: 1,
      user: owner.email,
      user_name: owner.email,
      note: '',
      device_group_name: groupName,
    })),
  })
})
