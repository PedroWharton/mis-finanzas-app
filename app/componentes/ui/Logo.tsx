// El monograma de la app (el mismo del ícono): cuadrado navy, MF dorado
// y filete doble.
export function Logo({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      role="img"
      aria-label="Mis Finanzas"
      className={`shrink-0 rounded-[7px] ring-1 ring-[var(--logo-ring)] ${className}`}
    >
      <rect width="512" height="512" fill="#060f25" />
      <text
        x="256"
        y="308"
        textAnchor="middle"
        fontFamily="var(--font-display), Georgia, serif"
        fontSize="196"
        fontWeight="500"
        fill="#d9b86a"
        letterSpacing="-5"
      >
        MF
      </text>
      <rect x="151" y="354" width="210" height="9" fill="#a8842c" />
      <rect x="151" y="370" width="210" height="4" fill="#d9b86a" />
    </svg>
  )
}
