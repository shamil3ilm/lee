import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { InterviewPrepPack, LikelyQuestion } from '@/lib/documents/types'

// Single-column A4, 40pt margins, Helvetica — visually consistent with the CV
// template so exports feel like a set.
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
  subHeader: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    marginTop: 8,
    marginBottom: 4,
    color: '#333',
  },
  paragraph: { marginBottom: 4 },
  bullet: { flexDirection: 'row', marginTop: 2 },
  bulletMarker: { width: 10 },
  bulletText: { flex: 1 },
  question: { marginBottom: 10 },
  questionText: { fontFamily: 'Helvetica-Bold' },
  questionMeta: { fontSize: 9, color: '#666', marginTop: 1 },
  answerBlock: { marginTop: 3, marginLeft: 8 },
  answerLabel: { fontFamily: 'Helvetica-Bold', fontSize: 9, color: '#333' },
  answerText: { fontSize: 10, marginBottom: 2 },
  techNotes: { fontSize: 9, color: '#444', marginTop: 2, marginLeft: 8, fontStyle: 'italic' },
  chip: { fontSize: 9, color: '#666' },
})

function Bullet({ children }: { children: string }) {
  return (
    <View style={styles.bullet}>
      <Text style={styles.bulletMarker}>•</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  )
}

function QuestionEntry({ q, i }: { q: LikelyQuestion; i: number }) {
  return (
    <View style={styles.question} wrap={false}>
      <Text style={styles.questionText}>
        {i + 1}. {q.question}
      </Text>
      <Text style={styles.questionMeta}>
        {q.category} · {q.difficulty}
      </Text>
      {q.star_answer ? (
        <View style={styles.answerBlock}>
          <Text style={styles.answerText}>
            <Text style={styles.answerLabel}>Situation: </Text>
            {q.star_answer.situation}
          </Text>
          <Text style={styles.answerText}>
            <Text style={styles.answerLabel}>Task: </Text>
            {q.star_answer.task}
          </Text>
          <Text style={styles.answerText}>
            <Text style={styles.answerLabel}>Action: </Text>
            {q.star_answer.action}
          </Text>
          <Text style={styles.answerText}>
            <Text style={styles.answerLabel}>Result: </Text>
            {q.star_answer.result}
          </Text>
          {q.star_answer.cv_bullet_ref ? (
            <Text style={styles.techNotes}>CV: {q.star_answer.cv_bullet_ref}</Text>
          ) : null}
        </View>
      ) : null}
      {q.technical_notes ? (
        <Text style={styles.techNotes}>Notes: {q.technical_notes}</Text>
      ) : null}
    </View>
  )
}

function groupBy<T, K extends string>(items: T[], key: (t: T) => K): Record<K, T[]> {
  return items.reduce(
    (acc, item) => {
      const k = key(item)
      if (!acc[k]) acc[k] = []
      acc[k].push(item)
      return acc
    },
    {} as Record<K, T[]>,
  )
}

interface PrepPackPdfDocumentProps {
  pack: InterviewPrepPack
  jobTitle?: string
  companyName?: string
}

export function PrepPackPdfDocument({
  pack,
  jobTitle,
  companyName,
}: PrepPackPdfDocumentProps) {
  const questionsByCategory = groupBy(pack.likelyQuestions, (q) => q.category)
  const subtitle = [companyName, jobTitle].filter(Boolean).join(' · ')
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header}>
          <Text style={styles.title}>Interview Prep · {pack.stageKind}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Company Research</Text>
          {pack.companyResearch.summary ? (
            <Text style={styles.paragraph}>{pack.companyResearch.summary}</Text>
          ) : null}
          {pack.companyResearch.industry.length > 0 ? (
            <Text style={styles.chip}>Industry: {pack.companyResearch.industry.join(', ')}</Text>
          ) : null}
          {pack.companyResearch.tech_stack.length > 0 ? (
            <Text style={styles.chip}>Stack: {pack.companyResearch.tech_stack.join(', ')}</Text>
          ) : null}
          {pack.companyResearch.notable_facts.length > 0 ? (
            <View style={{ marginTop: 4 }}>
              <Text style={styles.subHeader}>Notable facts</Text>
              {pack.companyResearch.notable_facts.map((f, i) => (
                <Bullet key={i}>{f}</Bullet>
              ))}
            </View>
          ) : null}
          {pack.companyResearch.culture_signals.length > 0 ? (
            <View style={{ marginTop: 4 }}>
              <Text style={styles.subHeader}>Culture signals</Text>
              {pack.companyResearch.culture_signals.map((c, i) => (
                <Bullet key={i}>{c}</Bullet>
              ))}
            </View>
          ) : null}
        </View>

        {pack.likelyQuestions.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>Likely Questions</Text>
            {(Object.entries(questionsByCategory) as [string, LikelyQuestion[]][]).map(
              ([cat, qs]) => (
                <View key={cat}>
                  <Text style={styles.subHeader}>{cat}</Text>
                  {qs.map((q, i) => (
                    <QuestionEntry key={i} q={q} i={i} />
                  ))}
                </View>
              ),
            )}
          </View>
        ) : null}

        {pack.talkingPoints.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>Talking Points</Text>
            {pack.talkingPoints.map((t, i) => (
              <Bullet key={i}>{t}</Bullet>
            ))}
          </View>
        ) : null}

        {pack.redFlags.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>Red Flags to Probe</Text>
            {pack.redFlags.map((r, i) => (
              <Bullet key={i}>{r}</Bullet>
            ))}
          </View>
        ) : null}

        {pack.yourQuestions.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>Your Questions</Text>
            {pack.yourQuestions.map((q, i) => (
              <Bullet key={i}>{q}</Bullet>
            ))}
          </View>
        ) : null}
      </Page>
    </Document>
  )
}
