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
};

export default nextConfig;
