import type { CSSProperties, ReactElement } from 'react'
import type { PipelineSnapshot } from './weekly'

// Inline styles only — no external CSS. Most email clients strip <style> tags
// or refuse to load external stylesheets. Colors kept accessible and neutral.
const styles: Record<string, CSSProperties> = {
  wrapper: {
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    maxWidth: '600px',
    margin: '0 auto',
    padding: '24px',
    color: '#1a1a1a',
    fontSize: '14px',
    lineHeight: 1.5,
    backgroundColor: '#ffffff',
  },
  h1: { fontSize: '20px', margin: '0 0 4px 0', fontWeight: 600 },
  subline: { color: '#666', margin: '0 0 24px 0', fontSize: '13px' },
  section: { marginBottom: '28px' },
  h2: {
    fontSize: '14px',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: '#333',
    margin: '0 0 8px 0',
    borderBottom: '1px solid #ddd',
    paddingBottom: '4px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  th: {
    textAlign: 'left',
    padding: '4px 8px',
    fontWeight: 600,
    borderBottom: '1px solid #eee',
    color: '#444',
  },
  td: { padding: '4px 8px', borderBottom: '1px solid #f0f0f0' },
  list: { margin: 0, paddingLeft: '18px' },
  listItem: { marginBottom: '4px' },
  meta: { color: '#666', fontSize: '12px' },
  empty: { color: '#888', fontStyle: 'italic' },
  footer: {
    marginTop: '32px',
    paddingTop: '12px',
    borderTop: '1px solid #eee',
    color: '#888',
    fontSize: '12px',
  },
  link: { color: '#1a1a1a', textDecoration: 'underline' },
}

function formatDateTime(d: Date): string {
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  })
}

function daysSince(d: Date): number {
  return Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000))
}

interface WeeklyDigestEmailProps {
  snapshot: PipelineSnapshot
  appBaseUrl?: string
}

export function WeeklyDigestEmail({
  snapshot,
  appBaseUrl = 'https://employ4me.vercel.app',
}: WeeklyDigestEmailProps): ReactElement {
  const {
    applicationsByStatus,
    totalApplications,
    upcomingInterviews,
    topDiscoveries,
    staleApplications,
    upcomingTodos,
  } = snapshot
  return (
    <div style={styles.wrapper}>
      <h1 style={styles.h1}>Your Employ week</h1>
      <p style={styles.subline}>
        This week at a glance: {totalApplications} applications ·{' '}
        {upcomingInterviews.length} interviews · {topDiscoveries.length} discoveries ·{' '}
        {staleApplications.length} stale · {upcomingTodos.length} todos
      </p>

      <div style={styles.section}>
        <h2 style={styles.h2}>Applications by status</h2>
        {applicationsByStatus.length === 0 ? (
          <p style={styles.empty}>No applications yet — add one from the dashboard.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Count</th>
              </tr>
            </thead>
            <tbody>
              {applicationsByStatus.map((r) => (
                <tr key={r.status}>
                  <td style={styles.td}>{r.status}</td>
                  <td style={styles.td}>{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={styles.section}>
        <h2 style={styles.h2}>Upcoming interviews (next 7 days)</h2>
        {upcomingInterviews.length === 0 ? (
          <p style={styles.empty}>Nothing scheduled.</p>
        ) : (
          <ul style={styles.list}>
            {upcomingInterviews.map((s) => (
              <li key={s.stageId} style={styles.listItem}>
                <strong>{s.stageKind}</strong> · {s.jobTitle}
                {s.companyName ? ` @ ${s.companyName}` : ''}
                <br />
                <span style={styles.meta}>{formatDateTime(s.scheduledAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={styles.section}>
        <h2 style={styles.h2}>Top discoveries</h2>
        {topDiscoveries.length === 0 ? (
          <p style={styles.empty}>No new discoveries.</p>
        ) : (
          <ul style={styles.list}>
            {topDiscoveries.map((d) => (
              <li key={d.id} style={styles.listItem}>
                {d.title}
                {d.companyName ? ` @ ${d.companyName}` : ''}
                {d.matchScore !== null ? (
                  <span style={styles.meta}> · score {d.matchScore}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={styles.section}>
        <h2 style={styles.h2}>Upcoming this week</h2>
        {upcomingTodos.length === 0 ? (
          <p style={styles.empty}>No todos due in the next 7 days.</p>
        ) : (
          <ul style={styles.list}>
            {upcomingTodos.map((t) => (
              <li key={t.id} style={styles.listItem}>
                {t.title}
                {t.priority > 0 ? (
                  <span style={styles.meta}>
                    {' '}· {t.priority === 3 ? 'high' : t.priority === 2 ? 'med' : 'low'}
                  </span>
                ) : null}
                <br />
                <span style={styles.meta}>
                  {t.dueAt ? `due ${formatDateTime(t.dueAt)}` : 'no due date'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={styles.section}>
        <h2 style={styles.h2}>Stale follow-ups (14+ days)</h2>
        {staleApplications.length === 0 ? (
          <p style={styles.empty}>No stale follow-ups. Keep the streak going.</p>
        ) : (
          <ul style={styles.list}>
            {staleApplications.map((a) => (
              <li key={a.id} style={styles.listItem}>
                {a.jobTitle}
                {a.companyName ? ` @ ${a.companyName}` : ''}
                <br />
                <span style={styles.meta}>
                  next action was {daysSince(a.nextActionAt)} days ago
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={styles.footer}>
        Sent by Employ. Manage this email in your{' '}
        <a href={`${appBaseUrl}/settings/notifications`} style={styles.link}>
          notification settings
        </a>
        .
      </div>
    </div>
  )
}

/**
 * Render the weekly digest React component to a static HTML string suitable
 * for use as the `htmlBody` of a Gmail send request. Includes a minimal
 * <!doctype html> wrapper so email clients apply their standard rendering.
 *
 * Uses a runtime require of react-dom/server so Next.js doesn't warn about
 * server-only APIs being imported through a route module: the require only
 * executes on the server at render time.
 */
export function renderWeeklyDigestHtml(
  snapshot: PipelineSnapshot,
  appBaseUrl?: string,
): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { renderToStaticMarkup } = require('react-dom/server') as {
    renderToStaticMarkup: (el: ReactElement) => string
  }
  const body = renderToStaticMarkup(
    <WeeklyDigestEmail snapshot={snapshot} appBaseUrl={appBaseUrl} />,
  )
  return `<!doctype html><html><head><meta charset="utf-8"><title>Employ · Weekly Digest</title></head><body style="margin:0;padding:0;background:#f7f7f7;">${body}</body></html>`
}
