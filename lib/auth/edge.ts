import NextAuth from 'next-auth'
import { edgeAuthConfig } from './edge-config'

// Edge-runtime NextAuth instance. Only exposes `auth` (used by proxy.ts as
// middleware). The DB-backed instance in `./index.ts` is for Node runtime.
export const { auth: edgeAuth } = NextAuth(edgeAuthConfig)
