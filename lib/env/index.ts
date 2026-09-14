import { parseEnv } from './schema'

export const env = parseEnv(process.env)
export type { Env } from './schema'
