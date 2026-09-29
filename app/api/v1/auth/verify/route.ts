import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { VerificationLimitError, sendVerification } from '@/lib/email-verification'

export const dynamic = 'force-dynamic'

/** Повторное письмо «подтвердите почту» для вошедшего пользователя. */
export async function POST() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (user.emailVerifiedAt) return NextResponse.json({ ok: true, already: true })
  try {
    const sent = await sendVerification(user)
    if (!sent) {
      return NextResponse.json({ error: 'Письмо не отправилось. Попробуйте позже или напишите в поддержку.' }, { status: 502 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof VerificationLimitError) return NextResponse.json({ error: error.message }, { status: 429 })
    throw error
  }
}
