import type { CSSProperties } from 'react'
import { APP_NAME, BRAND_COLORS } from '@/lib/brand'

const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 16px 0' }
const name: CSSProperties = {
  fontSize: '16px',
  fontWeight: 600,
  letterSpacing: '-0.01em',
  color: BRAND_COLORS.tile,
  textTransform: 'lowercase',
}

/**
 * Logo + wordmark at the top of every email. Email clients (Gmail included)
 * strip inline SVG, so the mark is the PNG app icon served by the app itself.
 */
export function EmailBrandHeader({ appBaseUrl }: { appBaseUrl: string }) {
  return (
    <div style={row}>
      <img
        src={`${appBaseUrl}/apple-icon.png`}
        width={28}
        height={28}
        alt=""
        style={{ borderRadius: '7px', display: 'block' }}
      />
      <span style={name}>{APP_NAME}</span>
    </div>
  )
}
