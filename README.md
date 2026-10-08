# Mis Finanzas

Panel de finanzas personales para seguir tus inversiones (acciones, ETFs,
cripto, bonos y efectivo) repartidas en varias plataformas, con un analista
de IA (Claude) que te deja recomendaciones todos los días.

Cada persona despliega **su propia instancia**: tus datos viven en tu cuenta
de Vercel, detrás de tu clave, y no se comparten con nadie.

## Qué hace

- **Inicio:** patrimonio total en dólares (o en pesos, con dólar cripto/MEP),
  curva de evolución neta de aportes, distribución por plataforma y por
  activo, ganancia realizada y no realizada.
- **Movimientos:** registrás depósitos, retiros, compras, ventas, dividendos e
  intereses desde un formulario, o le mandás un **screenshot** a Claude y los
  carga solo. Historial editable.
- **Evaluación:** señales por activo (tendencia, momentum, RSI), alertas,
  riesgo (volatilidad, Sharpe, drawdown, correlaciones, concentración),
  proyección Monte Carlo, simulador "¿y si compro?", backtest y una watchlist
  de oportunidades.
- **Predicciones:** bandas de precio a 1, 3 y 6 meses con el track record del
  propio modelo.
- **Recomendaciones:** el análisis diario y semanal de las rutinas de Claude,
  con órdenes concretas (monto, precio límite, stop loss, objetivo) y su
  seguimiento. Notificaciones push al celular.
- **Reporte:** resumen imprimible / PDF y export CSV.
- Precios: Yahoo Finance (acciones/ETFs, incluidas algunas de BYMA) y
  CoinGecko (~36 criptos más grandes). Insiders: OpenInsider (SEC Form 4).

> ⚠️ Las señales, proyecciones y recomendaciones son estadística y opinión de
> un modelo de lenguaje. **No son asesoramiento financiero.** La app nunca
> opera en ningún broker: solo registra lo que vos ya hiciste.

---

## Instalación en 10 minutos (Vercel)

Necesitás una cuenta de [GitHub](https://github.com) y una de
[Vercel](https://vercel.com) (el plan gratuito alcanza).

### 1. Tu copia del repo

Hacé un **fork** de este repositorio en tu cuenta de GitHub. Tus datos
**no** se guardan en el repo, así que tu fork puede ser público o privado.

### 2. Crear el proyecto en Vercel

1. En Vercel: **Add New → Project** → importá tu fork. No cambies nada de la
   configuración del build.
2. En el proyecto: **Storage → Create Database → Blob**, elegí acceso
   **Private** y conectalo al proyecto. Eso crea sola la variable
   `BLOB_READ_WRITE_TOKEN`: ahí van a vivir tus datos.

### 3. Variables de entorno

En el proyecto: **Settings → Environment Variables** (entorno *Production*).

| Variable            | ¿Obligatoria? | Para qué |
|---------------------|---------------|----------|
| `APP_PASSWORD`      | **Sí**        | La clave para entrar a la app. Sin ella, en producción la app no abre (a propósito). |
| `BLOB_READ_WRITE_TOKEN` | **Sí**    | La crea Vercel al conectar el Blob (paso 2). |
| `CRON_SECRET`       | Recomendada   | Habilita la corrida diaria automática (precios, curva, avisos). |
| `AGENTE_TOKEN`      | Para Claude   | Token que usan las rutinas y la carga por screenshot. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Opcional | Notificaciones push. `VAPID_SUBJECT` = `mailto:tu@email.com`. |
| `BLOB_PATH_SUFFIX`  | Opcional      | Sufijo para separar datos de otro entorno (ej. `-preview`). |

Para generar los valores:

```bash
openssl rand -hex 32               # CRON_SECRET y AGENTE_TOKEN (uno distinto para cada uno)
npx web-push generate-vapid-keys   # las dos claves VAPID
```

Guardá `AGENTE_TOKEN` en algún lado: lo vas a necesitar para configurar Claude.

### 4. Deploy

**Deployments → Redeploy** (las variables nuevas solo aplican a deploys
nuevos). Abrí tu URL (`https://<proyecto>.vercel.app`), poné tu clave y
listo: el navegador la recuerda 30 días.

### 5. Primeros pasos en la app

1. **Movimientos → Registrar operación → Depósito**: cada plataforma (ej.
   "Mi broker") se crea con su primer depósito.
2. Registrá tus compras con ticker y cantidad. Las cripto van con el ticker
   pelado (`BTC`, `ETH`).
3. En el celular: abrila en Safari/Chrome → *Agregar a pantalla de inicio*.
   Después, **Recomendaciones → Activar notificaciones** (requiere las claves
   VAPID).

La corrida diaria (`vercel.json`, 21:30 UTC) guarda la foto del día, baja
históricos y avisa cambios de señal. También se guarda una foto cada vez que
abrís el inicio.

---

## Claude: carga por screenshot y analista diario

Las dos funciones usan **Claude Code en la nube** ([claude.ai/code](https://claude.ai/code))
trabajando sobre tu fork. Configuración, una sola vez:

1. En claude.ai/code, conectá GitHub y elegí tu fork.
2. En **environment settings** del environment que vayas a usar:
   - Variable `MIS_FINANZAS_URL` = la URL de tu app, sin barra final.
   - Variable `AGENTE_TOKEN` = el mismo valor que en Vercel.
   - **Red:** agregá el dominio de tu app a la allowlist (o acceso completo).

### Cargar movimientos con un screenshot

Abrí una sesión nueva sobre tu fork (desde la web o desde la app de Claude en
el celular, pestaña **Code**), pegá el screenshot de tus movimientos y
mandalo, sin escribir nada más. Claude extrae las operaciones, descarta
duplicados, las carga a tu app y te responde con el resumen. Las
instrucciones que sigue están en [`AGENTS.md`](AGENTS.md).

### Analista diario y semanal

Seguí [`docs/RUTINAS.md`](docs/RUTINAS.md): tiene los dos prompts listos para
copiar y pegar y los horarios sugeridos.

---

## Desarrollo local

```bash
npm install
npm run dev        # http://localhost:3000
```

En local no hace falta configurar nada: sin `APP_PASSWORD` no pide clave y,
sin `BLOB_READ_WRITE_TOKEN`, los datos se guardan como JSON en `data/`
(ignorado por git). Para probar con variables, copiá `.env.example` a
`.env.local`.

```bash
npx vitest run       # tests
npx tsc --noEmit     # tipos
npm run lint
npm run bajar-datos  # copia los datos del Blob de producción a data/ (lee BLOB_READ_WRITE_TOKEN de .env.local)
```

Stack: Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, Recharts,
Vercel Blob, Web Push, Vitest.

### Cómo se guardan los datos

Un documento JSON por tema (`portfolio`, `snapshots`, `historicos`,
`watchlist`, `predicciones`, `recomendaciones`, …): en `data/*.json` en local
o en `mis-finanzas/<doc>.json` del Blob privado en producción
(`lib/storage.ts`). Todos los montos están en USD.

Tipos de operación: `deposito` / `retiro` (aportes externos), `compra` /
`venta`, `dividendo` / `interes` / `rendimiento` (renta; `interes` y
`rendimiento` pueden acreditar unidades del activo, como hace Nexo).

### Acciones argentinas (BYMA)

Las que cotizan en pesos se mapean a mano en `BYMA`, dentro de
`lib/precios.ts` (símbolo de Yahoo con `.BA` y divisor para las ON que
cotizan cada 100 nominales). Agregá las tuyas ahí.

## Seguridad

- Un usuario por instalación, con una clave (`APP_PASSWORD`). La cookie dura
  30 días; cambiar la clave invalida todas las sesiones.
- `AGENTE_TOKEN` solo abre `/api/agente/*`; `CRON_SECRET` solo `/api/cron/*`.
- Los datos van a un Blob **privado**: no se pueden leer sin el token de
  Vercel.
- Usá una clave larga: no hay bloqueo por intentos, solo una demora por
  intento fallido.

## Licencia

[MIT](LICENSE).
