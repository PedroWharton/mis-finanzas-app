<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Screenshot de movimientos → carga automática a prod

Si el mensaje del usuario es (o contiene) un screenshot de movimientos
financieros (DolarApp, Nexo, Binance, etc.) con poco o ningún texto, tu tarea
es cargarlos a producción SIN pedir confirmación:

1. **Extraé** todas las operaciones visibles: `fecha` (YYYY-MM-DD; si el
   screenshot no muestra el año, asumí el año en curso, y si eso da una fecha
   futura usá el año anterior), `tipo` (`deposito`, `retiro`, `compra`,
   `venta`, `dividendo`, `interes`, `rendimiento`), `plataforma` (inferila de
   la UI de la app), `ticker`, `cantidad`, `montoUSD`. Varias acreditaciones
   de interés/rendimiento del mismo activo en el mismo día van como UNA
   operación con los montos sumados y una `nota` (ej. "3 acreditaciones").
   Rendimientos in-kind (Nexo acredita unidades): incluí `ticker` y
   `cantidad`. Renta en cash: sin `ticker`.
2. **Consultá lo ya cargado:** `GET $MIS_FINANZAS_URL/api/agente/movimientos`
   con header `Authorization: Bearer $AGENTE_TOKEN`. Descartá las operaciones
   que ya figuran.
3. **Cargá las nuevas:** `POST $MIS_FINANZAS_URL/api/agente/movimientos` con
   el mismo header y body `{"operaciones": [...]}`.
4. **Ante 409** (duplicados): quitá del batch las operaciones listadas en
   `duplicados` y volvé a postear el resto. Informá cuáles se omitieron.
5. **Respondé en el chat** con el `resumen` devuelto, las `advertencias`
   (ej. efectivo negativo) y cualquier rechazo. Si la imagen es ilegible o
   ambigua, preguntá en vez de adivinar. Si cargás una cripto cuyo ticker no
   figura en `TICKERS_CRIPTO` (`lib/precios.ts`, cubre las ~36 más grandes),
   avisá que la app no va a poder cotizarla.

Si `MIS_FINANZAS_URL` o `AGENTE_TOKEN` no están definidas, o el request falla
por red bloqueada, decilo explícitamente: el usuario debe configurar las
variables y la allowlist de red en claude.ai/code → environment settings.

Esto solo REGISTRA en la app operaciones que el usuario ya hizo. JAMÁS
intentes ejecutar operaciones reales en ningún broker o exchange.
