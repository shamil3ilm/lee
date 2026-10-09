/** Client-safe. */

/** The text of a referral ask; the user edits and sends it themselves. */
export function referralDraft(input: { personName: string; company: string; role: string | null; myName: string | null }): string {
  const first = input.personName.split(' ')[0] || input.personName
  const role = input.role ? ` the ${input.role} role` : ' an opening'
  return [
    `Hi ${first},`,
    '',
    `I hope you are well. I noticed ${input.company} has${role} and I am planning to apply.`,
    `Would you be open to a quick chat about the team, or to referring me if you think I could be a fit? I am happy to share my CV first.`,
    '',
    `Thank you${input.myName ? `,\n${input.myName}` : '!'}`,
  ].join('\n')
}
