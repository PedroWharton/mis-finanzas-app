import { NextResponse } from 'next/server'
import { generarToken, compararTimingSafe } from '@/lib/auth'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function POST(request: Request) {
  const password = process.env.APP_PASSWORD

  if (!password) {
    return NextResponse.json({ ok: true })
  }

  let clave: string | undefined
  try {
    const body = await request.json()
    clave = body?.clave
  } catch {
    clave = undefined
  }

  if (typeof clave !== 'string' || !(await compararTimingSafe(clave, password))) {
    await sleep(800)
    return NextResponse.json({ ok: false, error: 'Clave incorrecta' }, { status: 401 })
  }

  const token = await generarToken(password)
  const response = NextResponse.json({ ok: true })
  response.cookies.set('mf_auth', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })
  return response
}
