---
name: Mis Finanzas
description: Cuaderno de finanzas — papel cálido, tinta navy y un marcador dorado para lo importante.
colors:
  paper: "#fbfaf7"
  paper-sheet: "#fffefb"
  paper-sunken: "#f6f4ee"
  paper-rule: "#ece8dd"
  paper-rule-strong: "#d8d2c2"
  ink: "#060f25"
  ink-body: "#0c1a36"
  ink-soft: "#3f4a62"
  ink-faint: "#5e6880"
  marker: "#a8842c"
  marker-fill: "#d9b86a"
  marker-text: "#7a5e15"
  gain: "#1f4a30"
  loss: "#7a2419"
  band: "#060f25"
  band-ink: "#fbfaf7"
  band-ink-faint: "#8696b2"
  band-gain: "#7fbf98"
  band-loss: "#e08a7a"
  night-paper: "#0a1429"
  night-sheet: "#101c38"
  night-sunken: "#142342"
  night-rule: "#1e2d4d"
  night-ink: "#f6f4ee"
  night-ink-soft: "#c9c3b3"
  night-ink-faint: "#9b9a95"
  night-band: "#030a1a"
  night-gain: "#86c79f"
  night-loss: "#e8917f"
typography:
  display:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "60px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.025em"
    fontFeature: "tnum, lnum"
    fontVariation: "opsz 60"
  headline:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "32px"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "24px"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Inter Tight, -apple-system, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum, lnum"
  small:
    fontFamily: "Inter Tight, -apple-system, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Inter Tight, -apple-system, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.12em"
  figures:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "13px"
    fontWeight: 400
    fontFeature: "tnum"
  hand:
    fontFamily: "Caveat, cursive"
    fontSize: "24px"
    fontWeight: 500
    lineHeight: 1.05
rounded:
  xs: "3px"
  sm: "8px"
  md: "12px"
  lg: "20px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
  "12": "48px"
  "16": "64px"
  gutter: "20px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    padding: "8px 20px"
    height: "44px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "8px 16px"
    height: "44px"
  segmented-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    height: "36px"
  input:
    backgroundColor: "{colors.paper-sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "44px"
  card:
    backgroundColor: "{colors.paper-sheet}"
    rounded: "{rounded.lg}"
    padding: "16px"
  band:
    backgroundColor: "{colors.band}"
    textColor: "{colors.band-ink}"
    padding: "20px 20px 16px"
  highlighter:
    backgroundColor: "{colors.marker-fill}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xs}"
    padding: "0 6px"
  tab-bar:
    backgroundColor: "{colors.paper-sheet}"
    textColor: "{colors.ink-faint}"
    rounded: "{rounded.pill}"
    height: "56px"
---

# Design System: Mis Finanzas

## Overview

**Creative North Star: "El cuaderno"**

Un cuaderno de finanzas en papel cálido, escrito con tinta navy, donde alguien
pasó un marcador dorado por lo único que importa hoy. Es tranquilo y táctil: las
tarjetas son hojas un tono más claro apoyadas en la página, con filete de 1 px y
una sombra de papel casi imperceptible. Los números son los protagonistas: la
serif de la marca (Source Serif 4) los escribe grandes y suaves; JetBrains Mono
los alinea en tablas y en la franja del día.

La marca no es una franja de fondo: es el color de la tinta. Hay un solo bloque
oscuro en la app, la franja **Hoy**, que concentra lo que está vivo. Fuera de
ahí, la jerarquía sale del tamaño y del espacio, no de cajas de colores. La
personalidad está en tres gestos de marcador, siempre en dorado y siempre
contados: un subrayado a mano, un resaltado y, como mucho una vez por pantalla,
una anotación al margen escrita a mano.

De noche es el mismo cuaderno: el papel pasa a ser navy profundo, la tinta pasa
a ser papel y el dorado sigue marcando.

**Key Characteristics:**
- Papel cálido de fondo, navy como tinta, dorado como único acento.
- Montos en serif; cifras de tabla en mono; texto en Inter Tight.
- Una sola franja oscura por pantalla, para lo que está vivo.
- Formas redondeadas: tarjetas de 20 px, controles en pill.
- Ayudas colapsadas detrás de "¿Cómo se calcula?".

## Colors

Papel, tinta y un marcador. El verde y el rojo existen solo para ganancia y
pérdida, siempre con signo.

### Primary
- **Tinta navy** (ink): títulos, cifras, botones primarios, pestaña activa, bordes fuertes de pills. El cuerpo de texto usa la tinta un paso más suave (ink-body).

### Secondary
- **Marcador dorado** (marker): trazos, subrayados, línea de "aportado", anillo de foco.
- **Resaltador** (marker-fill): fondo detrás de un texto navy corto (el activo que más se movió).
- **Dorado de texto** (marker-text): cuando el dorado tiene que leerse como texto (anotación a mano, leyenda "Aportado"); 5,9:1 sobre papel.

### Neutral
- **Papel** (paper) de fondo, **hoja** (paper-sheet) para tarjetas, **papel hundido** (paper-sunken) para detalles desplegados y barras vacías.
- **Filete** (paper-rule) para bordes y divisores de 1 px.
- **Tinta suave** (ink-soft, 8,5:1) y **tinta tenue** (ink-faint, 5,3:1): segundo y tercer nivel de texto. Ningún texto baja de ink-faint.

### Named Rules
**The One Marker Rule.** El dorado es el único acento y marca una sola cosa por bloque: lo importante. Nunca decora, nunca es una categoría de gráfico.

**The Ink Not Band Rule.** El navy es la tinta, no un fondo. La única superficie navy es la franja "Hoy" (y el cuadrado del logo).

**The Signed Money Rule.** Ganancia (gain) y pérdida (loss) llevan siempre signo +/−; el color confirma, no informa. El bordó no se usa como decoración.

## Typography

**Display Font:** Source Serif 4 variable con eje óptico (con Georgia)
**Body Font:** Inter Tight (con -apple-system)
**Figures Font:** JetBrains Mono, para cifras y tickers en tablas, franja y ejes
**Hand Font:** Caveat 500, para una anotación al margen

**Character:** La serif de la marca escribe los montos como en un libro mayor
hecho a mano; Inter Tight lleva lo funcional; la mono pone las cifras en
columna. La letra a mano aparece como una nota del dueño del cuaderno.

### Hierarchy
- **Display** (500, 60 px, lh 1, -0.025em): el patrimonio en Inicio.
- **Headline** (500, 32 px mobile / 40 px desktop): título de página.
- **Title** (500, 24 px, serif): título de cada tarjeta; sin mayúsculas.
- **Body** (400, 15 px, lh 1.45): texto corrido; 62ch máximo en ayudas.
- **Small** (13 px): metadatos, ayudas, leyendas.
- **Label** (600, 11 px, 0.12em, mayúsculas): solo encabezados de tabla y rótulos de la franja.
- **Figures** (mono 12–30 px): cifras en tablas y en la franja; tabulares y alineadas a la derecha.

### Named Rules
**The Size Not Bold Rule.** La jerarquía de cifras sale del tamaño. La negrita queda para el valor principal de una fila.

**The One Hand Rule.** Como máximo una anotación a mano por pantalla, solo si dice algo útil ("MU cayó 4,8 % hoy"), nunca para un dato que haya que leer con precisión.

## Layout

Mobile primero (390 px). Gutter de 20 px (32 px desde `sm`), contenedor de
1080 px (1360 px en páginas anchas). Las tarjetas se apilan con 16 px; dentro,
padding de 16 px (24 px desde `sm`). Encabezado de papel: monograma MF + "Mis
Finanzas" arriba, título serif de la página y su dato clave. La barra de
pestañas flota a 12 px del borde inferior, por eso el contenido deja 128 px
abajo. En desktop aparece un índice lateral de 244 px sobre papel hundido y la
barra desaparece. La franja oscura va a sangre en el celular y con radio de
20 px en pantallas anchas.

Peso proporcional: cuando un bloque representa plata (plataformas, propósitos),
el espacio que ocupa es proporcional a su peso.

## Elevation & Depth

Casi plano. Las tarjetas se separan del papel con un filete de 1 px y una sombra
de papel apoyado (`0 2px 20px rgba(6,15,37,.05)`). Solo la barra de pestañas
flota (`0 4px 24px rgba(6,15,37,.12)`). En oscuro las sombras se oscurecen y la
profundidad la dan los tres niveles de navy (página, hoja, hundido).

### Named Rules
**The Paper Rule.** Una hoja nunca va dentro de otra hoja. Dentro de una tarjeta se separa con filetes o con papel hundido, no con otra tarjeta.

## Shapes

Redondeado y amable: 20 px en tarjetas, 12 px en inputs y tiles internos, pill
en botones, selectores, badges y la barra de pestañas, 3 px en el resaltador.
Bordes de 1 px de filete; 1,5 px de tinta en controles pill.

## Components

### Buttons
- **Primary:** pill de tinta llena, texto papel, 44 px de alto; hover un paso más claro; `active` baja 1 px. Uno por pantalla.
- **Secondary:** pill transparente con borde de tinta de 1,5 px; hover papel hundido.
- **Texto:** subrayado dorado de 1,5 px ("Ver las 9 posiciones").
- **Focus:** anillo dorado de 3 px en todo lo interactivo.

### Chips
- **Badge:** pill con borde al 40 % del color del texto, 11 px en mayúsculas (veredictos).
- **Segmentado:** pill con borde de tinta; la opción activa se llena de tinta (USD / ARS).

### Cards / Containers
- **Panel:** hoja de 20 px de radio, filete, sombra de papel, título serif de 24 px, ayuda colapsada al pie.
- **Franja:** bloque navy con rótulo en mayúsculas, cifra principal en mono de 30 px y grilla de 2×2 con filetes; el mayor movimiento va resaltado.
- **Colapsable:** misma hoja, resumen de 15 px semibold y chevron que rota.
- **Estado vacío:** hoja punteada de 1,5 px con título serif.

### Inputs / Fields
- **Style:** borde de filete fuerte, hoja de fondo, 12 px, 16 px de texto en mobile para evitar zoom.
- **Focus:** borde de tinta y anillo dorado.

### Navigation
- **Barra de pestañas (mobile):** pill flotante con borde de tinta; la sección activa se ensancha, se llena de tinta y muestra su nombre.
- **Índice lateral (desktop):** papel hundido, monograma MF, ítems en pill; activo lleno de tinta; filete dorado doble al pie.

### Marcador (signature)
- **Subrayado:** trazo dorado de 3,4 px con leve temblor bajo la cifra clave; se dibuja en 700 ms al entrar.
- **Resaltado:** fondo dorado claro detrás de un texto navy corto.
- **Anotación:** Caveat dorado con una flecha a mano hacia el dato.

### Gráficos
Ejes sin línea, grilla punteada de filete, cifras de eje en mono, tooltip como
hoja con cifras en mono, cursor dorado. Serie principal en tinta con área al
12 %; "aportado" en dorado punteado. Las categorías usan tintas navy y grises de
papel, nunca el dorado.

### Movimiento
Ease-out exponencial (`cubic-bezier(.16,1,.3,1)`), 140/200/520 ms. Un momento
por pantalla: el patrimonio cuenta hasta su valor (900 ms), las cifras de la
franja suben escalonadas y el subrayado se dibuja. Con `prefers-reduced-motion`
todo aparece en su estado final.

## Do's and Don'ts

### Do:
- **Do** escribir todo en tinta navy sobre papel y reservar el dorado para lo importante.
- **Do** usar cifras tabulares, alineadas a la derecha, en mono dentro de tablas.
- **Do** decir contra qué fecha se compara una variación ("en 87 días, desde el 14 de julio").
- **Do** colapsar las ayudas y ocultar bloques sin datos (renta en US$ 0,00).
- **Do** mantener objetivos táctiles de 44 px y el anillo de foco dorado.

### Don't:
- **Don't** usar fondos navy salvo la franja "Hoy" y el logo.
- **Don't** usar el dorado para categorías, decoración ni más de un gesto por bloque.
- **Don't** poner más de una anotación a mano por pantalla, ni usarla para cifras.
- **Don't** anidar tarjetas, ni usar rótulos en mayúsculas como títulos de sección.
- **Don't** usar fotos, ilustraciones de stock, gradientes violetas ni glassmorphism.
- **Don't** depender solo del color para comunicar ganancia o pérdida.
