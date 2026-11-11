import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LLM Stream Demo",
  description: "Мини-приложение: запрос к дешёвой LLM со стримингом ответа.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
