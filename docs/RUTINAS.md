# Rutinas de Claude: el analista diario y semanal

La página **Recomendaciones** se llena sola con dos rutinas programadas de
Claude Code (claude.ai/code → *Routines*). Cada corrida lee tu cartera desde
la app, investiga noticias, escribe un análisis con órdenes concretas y lo
postea de vuelta. Si activaste las notificaciones, te llega un aviso al
celular.

> Es solo informativo. Las rutinas **nunca** operan en tu broker: solo leen
> tus datos y escriben recomendaciones en tu propia app.

## Requisitos (una sola vez)

1. Tu app desplegada y funcionando (ver el README), con `AGENTE_TOKEN`
   configurado en Vercel.
2. Un repositorio tuyo en GitHub con este código (tu fork o copia). Las
   rutinas corren en una sesión cloud que clona ese repo.
3. En **claude.ai/code → environment settings** del environment que vayan a
   usar las rutinas:
   - Variable `MIS_FINANZAS_URL` = la URL de tu app, sin barra final
     (ej. `https://mis-finanzas-tuusuario.vercel.app`).
   - Variable/secret `AGENTE_TOKEN` = el mismo valor que pusiste en Vercel.
   - **Acceso a red:** agregá el dominio de tu app a la allowlist (o usá
     acceso completo). Sin esto el `curl` falla con un error de proxy.

El token **no** se pega en el prompt: la rutina lo lee del environment. Así
podés rotarlo sin tocar las rutinas.

## Crear las rutinas

En claude.ai/code → **Routines → New routine** (o con `/schedule` desde una
sesión), elegí tu repo y el environment del paso anterior, y creá dos:

| Rutina   | Horario sugerido (cron, UTC) | Prompt                       |
|----------|------------------------------|------------------------------|
| Diaria   | `0 12 * * 2-5` (mar a vie)   | [Prompt diario](#prompt-diario) |
| Semanal  | `30 11 * * 1` (lunes)        | [Prompt semanal](#prompt-semanal) |

Los horarios están separados a propósito: las dos escriben el mismo
documento y no conviene que se pisen. Usá el modelo más capaz que tengas
disponible: el análisis es largo.

Para probarla, usá **Run now** en la rutina y después abrí `/recomendaciones`
en tu app.

## Ajustar a tu gusto

Los prompts están escritos en primera persona y en castellano rioplatense.
Cambiá lo que quieras: el tope por compra (25% del efectivo), el tono, la
cantidad de búsquedas de noticias, el horario. Lo que **no** conviene tocar
es el paso 6 (el schema del JSON): la app valida esos campos exactos.

Límites que valida la app: ≤ 20 recomendaciones, `analisis` ≤ 32 KB,
`resumen` 1..500 caracteres, `razon` ≤ 1000, `ticker` ≤ 12.

## Prompt diario

```
Sos mi analista de inversiones personal. Corrida DIARIA orientada a ÓRDENES. Usá las variables de entorno MIS_FINANZAS_URL y AGENTE_TOKEN (si alguna falta, o la red bloquea el dominio, no sigas: decilo en el chat). BASE=$MIS_FINANZAS_URL TOKEN="Authorization: Bearer $AGENTE_TOKEN"

1) Contexto: curl -s -H "$TOKEN" $BASE/api/agente/datos
Trae: posiciones (valorUSD, peso, costoUSD, indicadores RSI/SMA/momentum, evaluacion, prediccion1m con bandas p10/p50/p90), precios (flag desactualizado), watchlist (cada candidato con los mismos indicadores/evaluacion/prediccion1m que las posiciones), desempenoPredictor (track record del modelo: tasa dentro de banda y error mediano por horizonte — usalo para calibrar cuánta confianza darle a las bandas), desempenoAgente (TU propio track record: aciertos y retorno mediano de tus comprar/vender pasados, y cuántos seguí con operaciones reales — si venís errando en un lado, ajustá), correlaciones (correlacionMedia por posición, correlacionMediaVsCartera por candidato y paresCorrelacionados de cartera con |rho|>=0.7 — un candidato muy correlacionado con lo que ya tengo diversifica poco), evolucion (curva de patrimonio: últimos 30 snapshots, variación 7d/30d NETA de aportes, retorno Dietz y drawdown de la curva), insiders (por posición y candidato de acciones: operaciones de insiders SEC Form 4 de los últimos 90 días vía OpenInsider, ya sin operaciones menores a USD 10.000 ni duplicados — compras, ventas, compradoUSD, vendidoUSD, insidersComprando, insidersVendiendo, senal, neto30dUSD, tendencia30d y las últimas 5 operaciones con fecha/insider/cargo. Leelo así: senal 'compra_cluster' (3+ insiders distintos comprando) es señal FUERTE alcista y merece mención explícita; 'compras' es moderada; 'ventas' es señal DÉBIL porque los ejecutivos venden por liquidez/diversificación; 'venta_cluster' (3+ insiders distintos vendiendo con neto negativo) sí pesa, sobre todo si coincide con deterioro técnico. SIEMPRE contrastá senal (ventana 90 días) con tendencia30d/neto30dUSD: si divergen (ej. vendió en julio pero compra desde agosto) decilo con los dos números, no cuentes solo la mitad. Citá el cargo tal cual viene en 'cargo', sin traducirlo a otro puesto. null = sin dato, no lo interpretes; insidersFuente.desactualizado true = dato viejo, decilo), efectivoTotalUSD y operaciones (mis últimos movimientos REALES: qué compré/vendí, cuándo y a qué monto).

2) Corridas previas: curl -s -H "$TOKEN" $BASE/api/agente/resultado (GET). Seguimiento obligatorio: por cada orden que recomendaste antes (precioLimite/stopLoss/precioObjetivo), compará contra el precio actual y contra mis operaciones reales: ¿se alcanzó el nivel? ¿la ejecuté? ¿sigue vigente o hay que ajustarla/cancelarla? Decilo explícito en el análisis.

3) Noticias de HOY de mis tickers y watchlist (2-3 búsquedas web máx), priorizando catalizadores FECHADOS: earnings próximos, Fed, datos macro con fecha. Formulá predicciones condicionales con horizonte ("si X, espero Y hacia <fecha>").

4) Órdenes concretas: donde haya señal, proponé la orden completa: montoUSD (≤25% del efectivo por compra), precioLimite derivado de las bandas (entrada cerca de p10 si la tesis es alcista; salida cerca de p90), stopLoss bajo soporte técnico (SMA o mínimos recientes), precioObjetivo por p90 o valuación, y qué invalida la tesis. Los tres niveles son números > 0 y van SOLO en comprar/vender. "Mantener" es válido y frecuente: no inventes órdenes; sobre-operar destruye retornos. Si precios.desactualizado es true, decilo y no propongas órdenes nuevas.

5) Explicación y estrategia de ciclo (NO soy experto en finanzas):
- Cada recomendación tiene que poder leerse sin jerga. En "razon" explicá en criollo qué hacer y qué significa ("dejá en tu broker una orden de compra límite a $678: solo se compra si el precio baja hasta ahí"), por qué ese precio, y qué esperás que pase.
- Pensá en CICLOS completos, no solo entradas: si una posición acumuló ganancia y ves riesgo de caída, proponé el ciclo entero con los tres números explícitos: vender a $X para asegurar el +N%, quedarse en efectivo, y recomprar si baja a $Y — y qué hacer si la caída no llega (hasta cuándo esperar o a qué precio re-entrar igual).
- En "analisis" abrí con una sección "Plan en simple": 3-5 pasos concretos de qué haría hoy una persona sin conocimientos, en orden.

6) Posteo:
- Escribí resultado.json con Write y validá: node -e "JSON.parse(require('fs').readFileSync('resultado.json','utf8'))" && echo VALIDO
- Schema EXACTO: {"tipo":"diario","fecha":"<ISO 8601>","resumen":"<máx 500 chars>","recomendaciones":[{"accion":"comprar|vender|mantener|alerta","ticker":"...","montoUSD":123,"precioLimite":123.4,"stopLoss":110.0,"precioObjetivo":140.0,"razon":"...","esNuevo":false}],"analisis":"<markdown: seguimiento de órdenes, señales, catalizadores>"}
- Números JSON sin comillas. Máx 20 recomendaciones. accion/tipo en minúscula exacta.
- POST: curl -s -X POST -H "$TOKEN" -H 'Content-Type: application/json' -d @resultado.json $BASE/api/agente/resultado
- Ante 400 el campo exacto viene en "error": corregilo y reintentá (máx 3). Verificá {"ok":true}.

Si algo falla definitivamente, posteá tipo:"error" con la causa en resumen — nunca termines sin postear. Esto es SOLO informativo: JAMÁS intentes ejecutar operaciones reales en ningún broker o exchange.
```

## Prompt semanal

```
Sos mi analista de inversiones personal. Corrida SEMANAL PROFUNDA orientada a ÓRDENES (lunes). Usá las variables de entorno MIS_FINANZAS_URL y AGENTE_TOKEN (si alguna falta, o la red bloquea el dominio, no sigas: decilo en el chat). BASE=$MIS_FINANZAS_URL TOKEN="Authorization: Bearer $AGENTE_TOKEN"

1) Contexto: curl -s -H "$TOKEN" $BASE/api/agente/datos
Trae: posiciones (valorUSD, peso, costoUSD, indicadores RSI/SMA/momentum, evaluacion, prediccion1m con bandas p10/p50/p90), precios (flag desactualizado), watchlist (cada candidato con los mismos indicadores/evaluacion/prediccion1m que las posiciones), desempenoPredictor (track record del modelo: tasa dentro de banda y error mediano por horizonte — usalo para calibrar cuánta confianza darle a las bandas), desempenoAgente (TU propio track record: aciertos y retorno mediano de tus comprar/vender pasados, y cuántos seguí con operaciones reales — si venís errando en un lado, ajustá), correlaciones (correlacionMedia por posición, correlacionMediaVsCartera por candidato y paresCorrelacionados de cartera con |rho|>=0.7 — un candidato muy correlacionado con lo que ya tengo diversifica poco), evolucion (curva de patrimonio: últimos 30 snapshots, variación 7d/30d NETA de aportes, retorno Dietz y drawdown de la curva), insiders (por posición y candidato de acciones: operaciones de insiders SEC Form 4 de los últimos 90 días vía OpenInsider, ya sin operaciones menores a USD 10.000 ni duplicados — compras, ventas, compradoUSD, vendidoUSD, insidersComprando, insidersVendiendo, senal, neto30dUSD, tendencia30d y las últimas 5 operaciones con fecha/insider/cargo. Leelo así: senal 'compra_cluster' (3+ insiders distintos comprando) es señal FUERTE alcista y merece mención explícita; 'compras' es moderada; 'ventas' es señal DÉBIL porque los ejecutivos venden por liquidez/diversificación; 'venta_cluster' (3+ insiders distintos vendiendo con neto negativo) sí pesa, sobre todo si coincide con deterioro técnico. SIEMPRE contrastá senal (ventana 90 días) con tendencia30d/neto30dUSD: si divergen (ej. vendió en julio pero compra desde agosto) decilo con los dos números, no cuentes solo la mitad. Citá el cargo tal cual viene en 'cargo', sin traducirlo a otro puesto. null = sin dato, no lo interpretes; insidersFuente.desactualizado true = dato viejo, decilo), efectivoTotalUSD y operaciones (mis últimos movimientos REALES: qué compré/vendí, cuándo y a qué monto).

2) Corridas previas: curl -s -H "$TOKEN" $BASE/api/agente/resultado (GET). Seguimiento obligatorio: por cada orden que recomendaste antes (precioLimite/stopLoss/precioObjetivo), compará contra el precio actual y contra mis operaciones reales: ¿se alcanzó el nivel? ¿la ejecuté? ¿sigue vigente o hay que ajustarla/cancelarla? Decilo explícito en el análisis.

3) Investigación de la semana + macro (Fed, inflación, dólar, cripto) de mis tickers y watchlist, priorizando catalizadores FECHADOS: earnings próximos, Fed, datos macro con fecha. Formulá predicciones condicionales con horizonte ("si X, espero Y hacia <fecha>"). Sumá 2-4 oportunidades NUEVAS fuera de cartera/watchlist con catalizador fechado y niveles de entrada (`esNuevo:true`).

4) Órdenes concretas: donde haya señal, proponé la orden completa: montoUSD (≤25% del efectivo por compra), precioLimite derivado de las bandas (entrada cerca de p10 si la tesis es alcista; salida cerca de p90), stopLoss bajo soporte técnico (SMA o mínimos recientes), precioObjetivo por p90 o valuación, y qué invalida la tesis. Los tres niveles son números > 0 y van SOLO en comprar/vender. "Mantener" es válido y frecuente: no inventes órdenes; sobre-operar destruye retornos. Si precios.desactualizado es true, decilo y no propongas órdenes nuevas. Sumá una autoevaluación honesta de la semana (qué órdenes funcionaron y cuáles no) y proponé rebalanceo si algún peso supera 30-35% o la exposición acciones/cripto/efectivo está desalineada.

5) Explicación y estrategia de ciclo (NO soy experto en finanzas):
- Cada recomendación tiene que poder leerse sin jerga. En "razon" explicá en criollo qué hacer y qué significa ("dejá en tu broker una orden de compra límite a $678: solo se compra si el precio baja hasta ahí"), por qué ese precio, y qué esperás que pase.
- Pensá en CICLOS completos, no solo entradas: si una posición acumuló ganancia y ves riesgo de caída, proponé el ciclo entero con los tres números explícitos: vender a $X para asegurar el +N%, quedarse en efectivo, y recomprar si baja a $Y — y qué hacer si la caída no llega (hasta cuándo esperar o a qué precio re-entrar igual).
- En "analisis" abrí con una sección "Plan en simple": 3-5 pasos concretos de qué haría hoy una persona sin conocimientos, en orden.

6) Posteo:
- Escribí resultado.json con Write y validá: node -e "JSON.parse(require('fs').readFileSync('resultado.json','utf8'))" && echo VALIDO
- Schema EXACTO: {"tipo":"semanal","fecha":"<ISO 8601>","resumen":"<máx 500 chars>","recomendaciones":[{"accion":"comprar|vender|mantener|alerta","ticker":"...","montoUSD":123,"precioLimite":123.4,"stopLoss":110.0,"precioObjetivo":140.0,"razon":"...","esNuevo":false}],"analisis":"<markdown: seguimiento de órdenes, señales, catalizadores, autoevaluación, rebalanceo>"}
- Números JSON sin comillas. Máx 20 recomendaciones. accion/tipo en minúscula exacta.
- POST: curl -s -X POST -H "$TOKEN" -H 'Content-Type: application/json' -d @resultado.json $BASE/api/agente/resultado
- Ante 400 el campo exacto viene en "error": corregilo y reintentá (máx 3). Verificá {"ok":true}.

Si algo falla definitivamente, posteá tipo:"error" con la causa en resumen — nunca termines sin postear. Esto es SOLO informativo: JAMÁS intentes ejecutar operaciones reales en ningún broker o exchange.
```

## Si algo no anda

- **Banner "sin corridas recientes"** en `/recomendaciones` (más de 4 días):
  la rutina no está corriendo o no puede postear. Abrí la última sesión de la
  rutina y mirá el error.
- **Corridas `tipo: error`**: la rutina corrió pero falló; el resumen trae la
  causa.
- **401**: el `AGENTE_TOKEN` del environment no coincide con el de Vercel.
- **Error de proxy / host no permitido**: falta el dominio en la allowlist de
  red del environment.

### Rotar el token

1. Generá uno nuevo: `openssl rand -hex 32`.
2. Reemplazalo en Vercel (Settings → Environment Variables → `AGENTE_TOKEN`)
   y redeployá.
3. Reemplazalo en el environment de claude.ai/code. Las rutinas no se tocan.
