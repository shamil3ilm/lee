import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { InterviewDebrief } from '@/lib/documents/types'

// Single-column A4, 40pt margins, Helvetica — matches the prep-pack template
// so exports feel like a set. Kept intentionally lean; the debrief is a
// reflection artefact, not a marketing document.
const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#1a1a1a',
    lineHeight: 1.35,
  },
  header: { marginBottom: 14 },
  title: { fontSize: 18, fontFamily: 'Helvetica-Bold' },
  subtitle: { fontSize: 11, color: '#444', marginTop: 2 },
  confidence: {
    marginTop: 6,
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#333',
  },
  section: { marginTop: 14 },
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
  paragraph: { marginBottom: 4 },
  bullet: { flexDirection: 'row', marginTop: 2 },
  bulletMarker: { width: 10 },
  bulletText: { flex: 1 },
  question: { marginBottom: 8 },
  questionText: { fontFamily: 'Helvetica-Bold', fontSize: 10 },
  questionMeta: { fontSize: 9, color: '#666', marginTop: 1 },
  questionNote: { fontSize: 9, color: '#333', marginTop: 2, marginLeft: 8 },
})

const CONFIDENCE_LABEL: Record<InterviewDebrief['outcomeConfidence'], string> = {
  likely_advance: 'Likely to advance',
  unclear: 'Unclear',
  likely_rejected: 'Likely rejected',
}

function Bullet({ children }: { children: string }) {
  return (
    <View style={styles.bullet}>
      <Text style={styles.bulletMarker}>•</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  )
}

interface DebriefPdfDocumentProps {
  debrief: InterviewDebrief
  stageKind?: string
  jobTitle?: string
  companyName?: string
}

export function DebriefPdfDocument({
  debrief,
  stageKind,
  jobTitle,
  companyName,
}: DebriefPdfDocumentProps) {
  const subtitle = [companyName, jobTitle].filter(Boolean).join(' · ')
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header}>
          <Text style={styles.title}>
            Interview Debrief{stageKind ? ` · ${stageKind}` : ''}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <Text style={styles.confidence}>
            Outcome: {CONFIDENCE_LABEL[debrief.outcomeConfidence]}
          </Text>
        </View>

        {debrief.summary ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>Summary</Text>
            <Text style={styles.paragraph}>{debrief.summary}</Text>
          </View>
        ) : null}

        {debrief.wentWell.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>What went well</Text>
            {debrief.wentWell.map((w, i) => (
              <Bullet key={i}>{w}</Bullet>
            ))}
          </View>
        ) : null}

        {debrief.toImprove.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>To improve</Text>
            {debrief.toImprove.map((t, i) => (
              <Bullet key={i}>{t}</Bullet>
            ))}
          </View>
        ) : null}

        {debrief.questionsAsked.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>Questions asked</Text>
            {debrief.questionsAsked.map((q, i) => (
              <View key={i} style={styles.question} wrap={false}>
                <Text style={styles.questionText}>
                  {i + 1}. {q.question}
                </Text>
                <Text style={styles.questionMeta}>answer: {q.myAnswerQuality}</Text>
                {q.note ? <Text style={styles.questionNote}>{q.note}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}

        {debrief.redFlags.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>Red flags</Text>
            {debrief.redFlags.map((r, i) => (
              <Bullet key={i}>{r}</Bullet>
            ))}
          </View>
        ) : null}

        {debrief.followUpRecommendations.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>Follow-up recommendations</Text>
            {debrief.followUpRecommendations.map((r, i) => (
              <Bullet key={i}>{r}</Bullet>
            ))}
          </View>
        ) : null}

        {debrief.reasoning ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>Reasoning</Text>
            <Text style={styles.paragraph}>{debrief.reasoning}</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  )
}
