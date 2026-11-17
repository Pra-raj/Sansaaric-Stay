import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
// Only force HTTPS when the site is actually served over HTTPS. Without this
// flag, a local production build would rewrite http://localhost:8000 API calls
// to https:// and break them. Set NEXT_PUBLIC_HTTPS=1 for real deployments.
const isHttps = process.env.NEXT_PUBLIC_HTTPS === "1";

// The browser may only call our own site and the backend API.
let apiOrigin = "";
try {
  apiOrigin = new URL(
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api",
  ).origin;
} catch {
  // invalid URL: leave it out, requests to it will be blocked
}

// 'unsafe-inline' is needed for Next's inline bootstrap scripts and the theme
// init script in app/layout.tsx. Move to nonces later to tighten this further.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin}${isDev ? " ws: wss:" : ""}`.trim(),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isHttps ? ["upgrade-insecure-requests"] : []),
].join("; ");

const nextConfig: NextConfig = {
  // frontend/Dockerfile copies .next/standalone, so this must stay.
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self), payment=()",
          },
          ...(isHttps
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains",
                },
              ]
            : []),
        ],
      },
      {
        // Admin pages: never cached, never indexed.
        source: "/admin/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;