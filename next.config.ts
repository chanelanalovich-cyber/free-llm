import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Отключаем сжатие ответа: gzip буферизует SSE-поток и ломает посимвольную отдачу.
  compress: false,
};

export default nextConfig;
