import type { CSSProperties, ReactElement } from 'react'
import type { DigestLine } from './digest'
import { RADAR_KIND_LABELS, RADAR_SOURCE_LABELS, isRadarKind, isRadarSource } from './types'

/**
 * "Radar: new on your watch terms" for the weekly digest and the daily
 * discovery email (inline styles only, like the rest of the emails).
 */

const item: CSSProperties = { margin: '0 0 8px 0' }
const meta: CSSProperties = { color: '#666', fontSize: '12px' }
const link: CSSProperties = { color: '#1a1a1a', textDecoration: 'underline' }

function sourcesText(sources: readonly string[]): string {
  return sources.map((s) => (isRadarSource(s) ? RADAR_SOURCE_LABELS[s] : s)).join(', ')
}

export function RadarSection({
  lines,
  appBaseUrl,
  sectionStyle,
  h2Style,
}: {
  lines: readonly DigestLine[]
  appBaseUrl: string
  sectionStyle?: CSSProperties
  h2Style?: CSSProperties
}): ReactElement | null {
  if (lines.length === 0) return null
  return (
    <div style={sectionStyle}>
      <h2 style={h2Style}>Radar: new on your watch terms</h2>
      <ul style={{ paddingLeft: '18px', margin: 0 }}>
        {lines.map((l) => (
          <li key={l.id} style={item}>
            <a href={`${appBaseUrl}/radar/${l.id}`} style={link}>
              {l.name}
            </a>
            <span style={meta}>
              {' '}
              · {isRadarKind(l.kind) ? RADAR_KIND_LABELS[l.kind] : l.kind} · {l.terms.join(', ')} · {sourcesText(l.sources)}
            </span>
          </li>
        ))}
      </ul>
      <p style={meta}>
        <a href={`${appBaseUrl}/radar?watched=1`} style={link}>
          Open the Radar
        </a>
      </p>
    </div>
  )
}
