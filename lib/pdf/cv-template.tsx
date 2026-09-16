import { Document, Page, Text, View, StyleSheet, Link } from '@react-pdf/renderer'
import type { MasterCV, TailoredCV } from '@/lib/documents/types'

// Helvetica-family fonts are built into @react-pdf/renderer (no @font/register
// needed). Single accent color kept minimal for ATS friendliness.
const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#1a1a1a',
    lineHeight: 1.3,
  },
  header: { marginBottom: 12 },
  name: { fontSize: 20, fontFamily: 'Helvetica-Bold' },
  headline: { fontSize: 12, marginTop: 2 },
  contactRow: { fontSize: 10, color: '#666', marginTop: 4 },
  section: { marginTop: 12 },
  sectionHeader: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#999',
    paddingBottom: 2,
  },
  entry: { marginBottom: 8 },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  entryTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10 },
  entryDates: { fontSize: 10, color: '#666' },
  entrySubtitle: { fontSize: 10, color: '#333', marginBottom: 2 },
  bullet: { flexDirection: 'row', marginTop: 2 },
  bulletMarker: { width: 10 },
  bulletText: { flex: 1 },
  techLine: { fontSize: 9, color: '#666', marginTop: 3, fontStyle: 'italic' },
  skillsGroup: { marginBottom: 4 },
  skillsLabel: { fontFamily: 'Helvetica-Bold', fontSize: 10 },
  link: { color: '#1a1a1a', textDecoration: 'none' },
  inlineComma: { fontSize: 10 },
})

function Bullet({ children }: { children: string }) {
  return (
    <View style={styles.bullet}>
      <Text style={styles.bulletMarker}>•</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  )
}

interface CvPdfDocumentProps {
  cv: MasterCV | TailoredCV
}

export function CvPdfDocument({ cv }: CvPdfDocumentProps) {
  const contact = [cv.basics.email, cv.basics.phone, cv.basics.location].filter(Boolean).join(' · ')
  const links = [cv.basics.linkedin, cv.basics.github, cv.basics.website].filter(Boolean)
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.name}>{cv.basics.name}</Text>
          <Text style={styles.headline}>{cv.basics.headline}</Text>
          {contact ? <Text style={styles.contactRow}>{contact}</Text> : null}
          {links.length > 0 ? (
            <Text style={styles.contactRow}>
              {links.map((l, i) => (
                <Text key={i}>
                  {i > 0 ? ' · ' : ''}
                  <Link src={l as string} style={styles.link}>
                    {l}
                  </Link>
                </Text>
              ))}
            </Text>
          ) : null}
        </View>

        {cv.summary ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>Summary</Text>
            <Text>{cv.summary}</Text>
          </View>
        ) : null}

        {cv.experience.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>Experience</Text>
            {cv.experience.map((e, i) => (
              <View key={i} style={styles.entry}>
                <View style={styles.entryHeader}>
                  <Text style={styles.entryTitle}>
                    {e.role} · {e.company}
                    {e.location ? ` · ${e.location}` : ''}
                  </Text>
                  <Text style={styles.entryDates}>
                    {e.start} – {e.end}
                  </Text>
                </View>
                {e.bullets.map((b, bi) => (
                  <Bullet key={bi}>{b}</Bullet>
                ))}
                {e.tech && e.tech.length > 0 ? (
                  <Text style={styles.techLine}>Tech: {e.tech.join(', ')}</Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {cv.projects && cv.projects.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>Projects</Text>
            {cv.projects.map((p, i) => (
              <View key={i} style={styles.entry}>
                <Text style={styles.entryTitle}>
                  {p.url ? (
                    <Link src={p.url} style={styles.link}>
                      {p.name}
                    </Link>
                  ) : (
                    p.name
                  )}
                </Text>
                <Text>{p.description}</Text>
                {p.highlights?.map((h, hi) => <Bullet key={hi}>{h}</Bullet>)}
                {p.tech && p.tech.length > 0 ? (
                  <Text style={styles.techLine}>Tech: {p.tech.join(', ')}</Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {cv.education && cv.education.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>Education</Text>
            {cv.education.map((ed, i) => (
              <View key={i} style={styles.entry}>
                <View style={styles.entryHeader}>
                  <Text style={styles.entryTitle}>
                    {ed.degree} · {ed.school}
                    {ed.location ? ` · ${ed.location}` : ''}
                  </Text>
                  <Text style={styles.entryDates}>
                    {ed.start ?? ''}
                    {ed.end ? ` – ${ed.end}` : ''}
                  </Text>
                </View>
                {ed.honors ? <Text>{ed.honors}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Skills</Text>
          <View style={styles.skillsGroup}>
            <Text>
              <Text style={styles.skillsLabel}>Primary: </Text>
              {cv.skills.primary.join(', ')}
            </Text>
          </View>
          {cv.skills.secondary && cv.skills.secondary.length > 0 ? (
            <View style={styles.skillsGroup}>
              <Text>
                <Text style={styles.skillsLabel}>Also: </Text>
                {cv.skills.secondary.join(', ')}
              </Text>
            </View>
          ) : null}
        </View>

        {cv.certifications && cv.certifications.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>Certifications</Text>
            {cv.certifications.map((c, i) => (
              <View key={i} style={styles.entry}>
                <Text>
                  <Text style={styles.entryTitle}>{c.name}</Text> · {c.issuer}
                  {c.date ? ` · ${c.date}` : ''}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {cv.languages && cv.languages.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>Languages</Text>
            <Text>
              {cv.languages.map((l) => `${l.name} (${l.proficiency})`).join(', ')}
            </Text>
          </View>
        ) : null}
      </Page>
    </Document>
  )
}
