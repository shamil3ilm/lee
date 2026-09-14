type Level = 'debug' | 'info' | 'warn' | 'error'
type Fields = Record<string, unknown>

function emit(level: Level, event: string, fields?: Fields): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  debug: (event: string, fields?: Fields) => emit('debug', event, fields),
  info:  (event: string, fields?: Fields) => emit('info',  event, fields),
  warn:  (event: string, fields?: Fields) => emit('warn',  event, fields),
  error: (event: string, fields?: Fields) => emit('error', event, fields),
}
