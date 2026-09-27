type Level = 'debug' | 'info' | 'warn' | 'error'
type Fields = Record<string, unknown>

/**
 * Optional persistence hook (lib/logs/sink.ts installs it on the server via
 * instrumentation.ts). Kept on globalThis so every server bundle shares it,
 * and so this module stays import-free (usable from any runtime).
 */
export type LogSink = (level: Level, event: string, fields: Fields | undefined) => void

const g = globalThis as typeof globalThis & { __leeLogSink?: LogSink }

export function setLogSink(sink: LogSink | undefined): void {
  g.__leeLogSink = sink
}

function emit(level: Level, event: string, fields?: Fields): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
  const sink = g.__leeLogSink
  if (!sink || level === 'debug') return
  try {
    sink(level, event, fields)
  } catch {
    // The sink reports its own failures to stdout; logging never throws.
  }
}

export const logger = {
  debug: (event: string, fields?: Fields) => emit('debug', event, fields),
  info:  (event: string, fields?: Fields) => emit('info',  event, fields),
  warn:  (event: string, fields?: Fields) => emit('warn',  event, fields),
  error: (event: string, fields?: Fields) => emit('error', event, fields),
}
