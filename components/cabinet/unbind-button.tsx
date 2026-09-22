'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function UnbindButton({ rustdeskId }: { rustdeskId: string }) {
  const router = useRouter()

  async function handleClick() {
    await fetch(`/api/v1/devices?id=${encodeURIComponent(rustdeskId)}`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <Button variant="danger" size="sm" onClick={handleClick}>
      Отвязать
    </Button>
  )
}
