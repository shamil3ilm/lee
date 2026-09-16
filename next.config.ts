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
};

export default nextConfig;
