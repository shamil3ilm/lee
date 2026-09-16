import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { CoverLetter, MasterCV } from '@/lib/documents/types'

const styles = StyleSheet.create({
  page: {
    paddingTop: 60,
    paddingBottom: 60,
    paddingHorizontal: 60,
    fontFamily: 'Helvetica',
    fontSize: 11,
    color: '#1a1a1a',
    lineHeight: 1.5,
  },
  senderBlock: { marginBottom: 20 },
  senderName: { fontFamily: 'Helvetica-Bold', fontSize: 12 },
  senderMeta: { fontSize: 10, color: '#666' },
  date: { marginBottom: 20, fontSize: 11 },
  greeting: { marginBottom: 12 },
  paragraph: { marginBottom: 10 },
  closing: { marginTop: 20 },
})

interface CoverLetterPdfDocumentProps {
  letter: CoverLetter
  // Optional sender contact info from the master CV, printed as a letterhead.
  sender?: {
    name: string
    email?: string
    phone?: string
    location?: string
  }
  date?: string
}

export function CoverLetterPdfDocument({
  letter,
  sender,
  date,
}: CoverLetterPdfDocumentProps) {
  const senderName = sender?.name ?? letter.senderName
  const senderMeta = sender
    ? [sender.email, sender.phone, sender.location].filter(Boolean).join(' · ')
    : ''
  const dateStr =
    date ??
    new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.senderBlock}>
          <Text style={styles.senderName}>{senderName}</Text>
          {senderMeta ? <Text style={styles.senderMeta}>{senderMeta}</Text> : null}
        </View>
        <Text style={styles.date}>{dateStr}</Text>
        <Text style={styles.greeting}>{letter.greeting}</Text>
        {letter.paragraphs.map((p, i) => (
          <Text key={i} style={styles.paragraph}>
            {p}
          </Text>
        ))}
        <Text style={styles.closing}>{letter.closing}</Text>
      </Page>
    </Document>
  )
}

export type CoverLetterSender = Pick<MasterCV['basics'], 'name' | 'email' | 'phone' | 'location'>
