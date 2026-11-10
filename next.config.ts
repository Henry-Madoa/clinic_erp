import type { NextConfig } from "next";

/*
 * Security headers sent with every response. The CSP allows inline styles and scripts because
 * the root layout renders the runtime theme tokens and the light/dark bootstrap inline (see
 * app/layout.tsx); everything else is same-origin, plus Cloudinary for uploaded images.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://res.cloudinary.com",
  "font-src 'self' data:",
  "connect-src 'self' https://api.cloudinary.com",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  // Don't advertise the framework.
  poweredByHeader: false,
  // Dev mode logs every Server Function call with its arguments — passwords, M-Pesa secrets and
  // app passwords included. Credentials must never reach a log, development or not.
  logging: { serverFunctions: false },
  // The Postgres driver and Prisma's engine load native/dynamic code and must stay real
  // server-side requires rather than being traced into the bundle.
  serverExternalPackages: ["pg", "@prisma/client", "@prisma/adapter-pg"],
  experimental: {
    agentFeedback: true,
    // Server Actions carry the admin forms; uploaded files go browser-to-Cloudinary.
    serverActions: { bodySizeLimit: "4mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
