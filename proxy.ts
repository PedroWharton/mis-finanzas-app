import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { tokenValido, bearerAgenteValido, compararTimingSafe } from '@/lib/auth'

// /sw.js, /manifest.json e /icons son libres: iOS necesita el manifest y los
// íconos para instalar la PWA, y el navegador re-fetchea el service worker
// aunque la cookie de 30 días haya expirado.
const RUTAS_LIBRES = ['/acceso', '/api/login', '/favicon.ico', '/sw.js', '/manifest.json', '/icons', '/icon.png', '/apple-icon.png']

function esRutaLibre(pathname: string): boolean {
  if (pathname.startsWith('/_next/')) return true
  return RUTAS_LIBRES.some((ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`))
}

export async function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD

  // Sin APP_PASSWORD: en dev local el gate queda deshabilitado; en producción
  // se cierra todo (fail-closed) para que un deploy sin la variable no deje
  // los datos financieros a la vista de cualquiera.
  if (!password) {
    if (process.env.NODE_ENV !== 'production') return NextResponse.next()
    return new NextResponse(
      'Falta configurar APP_PASSWORD en las variables de entorno del deploy (y volver a desplegar).',
      { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } }
    )
  }

  const { pathname } = request.nextUrl

  if (esRutaLibre(pathname)) {
    return NextResponse.next()
  }

  // Las rutas del agente aceptan Bearer AGENTE_TOKEN como alternativa a la
  // cookie: el routine cloud no tiene sesión de navegador.
  if (pathname.startsWith('/api/agente/')) {
    const conBearer = await bearerAgenteValido(request.headers.get('authorization'), process.env.AGENTE_TOKEN)
    if (conBearer) return NextResponse.next()
  }

  // El cron de Vercel tampoco tiene cookie: pasa con Bearer CRON_SECRET y la
  // ruta vuelve a validar (defensa doble). Sin secreto configurado no pasa.
  if (pathname.startsWith('/api/cron/')) {
    const header = request.headers.get('authorization')
    const secreto = process.env.CRON_SECRET
    if (secreto && header?.startsWith('Bearer ') && (await compararTimingSafe(header.slice('Bearer '.length), secreto))) {
      return NextResponse.next()
    }
  }

  const cookie = request.cookies.get('mf_auth')?.value
  const valido = await tokenValido(cookie, password)

  if (valido) {
    return NextResponse.next()
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const url = new URL('/acceso', request.url)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image).*)',
  ],
}
