const MENSAJE = 'mf-auth'

function bytesAHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function importarClave(password: string): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
}

async function hmacHex(password: string, mensaje: string): Promise<string> {
  const clave = await importarClave(password)
  const firma = await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(mensaje))
  return bytesAHex(firma)
}

/**
 * Genera el token de sesión: HMAC-SHA256(mensaje fijo "mf-auth", password) en hex.
 * Usa Web Crypto (crypto.subtle) para poder correr en el runtime del proxy.
 */
export async function generarToken(password: string): Promise<string> {
  return hmacHex(password, MENSAJE)
}

/**
 * Valida un token comparándolo (de forma segura ante timing attacks) contra el
 * token esperado para la clave dada. En vez de comparar strings directamente,
 * se comparan los HMAC-SHA256 de ambos tokens (doble HMAC), lo que evita
 * filtrar información por tiempo de comparación y evita depender de una
 * comparación byte a byte de longitud variable.
 */
export async function tokenValido(token: string | undefined, password: string): Promise<boolean> {
  if (!token) return false
  const esperado = await generarToken(password)
  return await compararTimingSafe(token, esperado)
}

/**
 * Compara dos strings de forma segura ante timing attacks: en vez de comparar
 * los strings directamente (lo que filtraría información por el tiempo que
 * tarda la comparación byte a byte), se comparan los HMAC-SHA256 de ambos
 * valores (doble HMAC), con longitud fija y constante independientemente del
 * contenido de entrada.
 */
export async function compararTimingSafe(a: string, b: string): Promise<boolean> {
  const claveComparacion = 'mf-auth-compare'
  const [hmacA, hmacB] = await Promise.all([
    hmacHex(claveComparacion, a),
    hmacHex(claveComparacion, b),
  ])

  if (hmacA.length !== hmacB.length) return false

  let diff = 0
  for (let i = 0; i < hmacA.length; i++) {
    diff |= hmacA.charCodeAt(i) ^ hmacB.charCodeAt(i)
  }
  return diff === 0
}

/**
 * Valida el header Authorization del agente contra AGENTE_TOKEN.
 * Token vacío o no configurado siempre rechaza: el acceso de agente es
 * opt-in explícito por env var.
 */
export async function bearerAgenteValido(header: string | null, token: string | undefined): Promise<boolean> {
  if (!token) return false
  if (!header?.startsWith('Bearer ')) return false
  const presentado = header.slice('Bearer '.length)
  if (!presentado) return false
  return compararTimingSafe(presentado, token)
}
