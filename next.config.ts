import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    // Los comprobantes pueden pesar hasta 5 MB; damos margen al body de Server Actions.
    serverActions: { bodySizeLimit: "6mb" },
  },
  async headers() {
    // El runtime de desarrollo de Next.js (React Fast Refresh / HMR de webpack)
    // necesita `eval()` para funcionar, y su cliente de recarga en caliente
    // abre un WebSocket. Una CSP que no lo permita no rompe la app en sí, pero
    // sí impide que React arranque en el navegador: sin JavaScript, un botón
    // como "Entrar" cae al envío nativo del formulario (por eso se veía la
    // contraseña en la URL). Esto solo se relaja fuera de producción.
    const isDev = process.env.NODE_ENV !== "production";
    const scriptSrc = isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'";
    const connectSrc = isDev ? "connect-src 'self' ws: wss:" : "connect-src 'self'";

    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Next inyecta estilos y scripts inline en el runtime del App Router.
              scriptSrc,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              connectSrc,
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
