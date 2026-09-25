import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @electric-sql/pglite ships a WASM binary that Next's server bundler
  // fails to resolve correctly when included in a compiled server chunk
  // ("h.instantiateWasm is not a function"). Mark it (and postgres-js,
  // which also has native bindings) as external so Node loads them from
  // node_modules at runtime.
  serverExternalPackages: [
    '@electric-sql/pglite',
    'postgres',
    'unpdf',
    'mammoth',
    // @react-pdf/renderer ships CJS + native canvas fallbacks that Next's
    // bundler mis-resolves; loading it externally at runtime keeps it stable.
    '@react-pdf/renderer',
    // pdf-lib is pure JS but its CJS entry re-exports internals that Next's
    // server bundler can trip over when the module is imported in a route
    // handler. External load matches how @react-pdf is treated.
    'pdf-lib',
  ],
  // The LaTeX templates in lib/latex/templates/*.tex are read via fs at
  // runtime; Next's file-tracing doesn't pick them up automatically because
  // they aren't statically imported. Tell the tracer to bundle them so
  // Vercel Lambdas ship them alongside the compiled code.
  outputFileTracingIncludes: {
    '/api/latex/compile': ['./lib/latex/templates/**/*.tex'],
    '/api/documents/[id]/pdf': ['./lib/latex/templates/**/*.tex'],
    '/documents/new/latex': ['./lib/latex/templates/**/*.tex'],
    '/documents/[id]/edit': ['./lib/latex/templates/**/*.tex'],
  },
  // v17 §0 — "Lab" became "Playground". Permanent (308) redirects keep old
  // bookmarks working; `:path*` also matches the bare `/lab` hub.
  async redirects() {
    return [
      { source: '/learn', destination: '/playground', permanent: true },
      { source: '/lab/:path*', destination: '/playground/models/:path*', permanent: true },
    ];
  },
};

export default nextConfig;
