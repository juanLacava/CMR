import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CMR",
  description: "CRM WhatsApp-first para clientes, stock, pedidos y bandeja unificada."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
