import NextAuth from 'next-auth'
import { edgeAuthConfig } from './edge-config'

// Adapter-free NextAuth instance (JWT decode only). Only exposes `auth`, used
// by proxy.ts, which runs on the Node.js runtime. The DB-backed instance in
// `./index.ts` is for route handlers, server actions and RSC.
export const { auth: edgeAuth } = NextAuth(edgeAuthConfig)
