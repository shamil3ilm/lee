import type { CSSProperties, ReactElement } from 'react'
import type { NewDigestSection } from './digest'

/**
 * "What's new" in the weekly digest (inline styles only, like the rest of
 * the emails): the week's top few per category, each linking to its
 * source, with the reasons it ranked.
 */

const item: CSSProperties = { margin: '0 0 6px 0' }
const meta: CSSProperties = { color: '#666', fontSize: '12px' }
const link: CSSProperties = { color: '#1a1a1a', textDecoration: 'underline' }
const h3: CSSProperties = { fontSize: '13px', margin: '10px 0 4px 0' }

export function WhatsNewSection({
  sections,
  appBaseUrl,
  sectionStyle,
  h2Style,
}: {
  sections: readonly NewDigestSection[]
  appBaseUrl: string
  sectionStyle?: CSSProperties
  h2Style?: CSSProperties
}): ReactElement | null {
  if (sections.length === 0) return null
  return (
    <div style={sectionStyle}>
      <h2 style={h2Style}>What&apos;s new this week</h2>
      {sections.map((s) => (
        <div key={s.category}>
          <h3 style={h3}>{s.label}</h3>
          <ul style={{ paddingLeft: '18px', margin: 0 }}>
            {s.lines.map((l) => (
              <li key={l.id} style={item}>
                <a href={l.url} style={link}>
                  {l.name}
                </a>
                {l.reasons.length > 0 ? <span style={meta}> · {l.reasons.join(' · ')}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p style={meta}>
        <a href={`${appBaseUrl}/radar/new`} style={link}>
          Open What&apos;s new
        </a>
      </p>
    </div>
  )
}
