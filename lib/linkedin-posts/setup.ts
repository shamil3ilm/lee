/**
 * Client-safe. How the user turns on the LinkedIn emails lee reads and the
 * "Send to lee" bookmarklet: shown in Settings › LinkedIn › Hiring posts
 * and mirrored in docs/job-sources.md. LinkedIn renames these settings from
 * time to time; the steps say where to look rather than promise exact labels.
 */

export const EMAIL_SETUP_STEPS: readonly string[] = [
  'On LinkedIn, open Me › Settings & Privacy › Notifications (linkedin.com/mypreferences/d/categories/notifications).',
  'Under “Connecting with others”, open “Updates from your network” and switch Email on (frequency: Individual or Daily digest).',
  'Under “Posting and commenting”, switch Email on for the post notifications you want (mentions, comments and reactions on posts you follow).',
  'If your account shows a “Searching for a job” category with hiring or job-post updates, switch Email on there too.',
  'Follow recruiters and hiring managers in your target cities, and ring the bell on their profile so their new posts are emailed to you.',
  'Use the Google account you signed in to lee with, so these emails land in the inbox lee reads (read-only).',
]

export const BOOKMARKLET_STEPS: readonly string[] = [
  'Show your bookmarks bar (Ctrl+Shift+B, or ⌘+Shift+B on a Mac).',
  'Drag the “Send to lee” button below onto the bookmarks bar.',
  'On a hiring post, select the post’s text, then click the bookmark once. lee opens in a new tab with the text and the page link filled in for you to review.',
  'Nothing is added until you click Add. The bookmark sends only what you selected and the page address, and only when you click it.',
]

export const MOBILE_STEPS: readonly string[] = [
  'In the LinkedIn app, open the post, tap ··· (or Share) › Copy link to post, then long-press the text and Copy.',
  'In lee, open Discovery › Add from text or link and paste the text and the link.',
]
