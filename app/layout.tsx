import type { Metadata, Viewport } from "next";
import { Source_Serif_4, Inter_Tight, JetBrains_Mono, Caveat } from "next/font/google";
import "./globals.css";

// Variable con eje óptico: suave en el patrimonio, firme en tamaños chicos.
const sourceSerif = Source_Serif_4({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["opsz"],
  style: ["normal", "italic"],
});

const interTight = Inter_Tight({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono-wb",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// La letra a mano de las anotaciones al margen (una por pantalla, como mucho).
const caveat = Caveat({
  variable: "--font-mano",
  subsets: ["latin"],
  weight: ["500"],
});

export const metadata: Metadata = {
  title: "Mis Finanzas",
  description: "Panel de finanzas personales",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1429" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${sourceSerif.variable} ${interTight.variable} ${jetbrainsMono.variable} ${caveat.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
