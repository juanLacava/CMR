import type { Metadata } from "next";
import { Instrument_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";

const bodyFont = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-body"
});

const displayFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display"
});

export const metadata: Metadata = {
  title: "CMR",
  description: "CRM centrado en WhatsApp para clientes, stock, pedidos y bandeja unificada."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>{children}</body>
    </html>
  );
}
