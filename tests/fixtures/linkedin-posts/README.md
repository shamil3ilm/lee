# LinkedIn post fixtures — SYNTHETIC

Hand-written for lee's tests. No file here is a real email or a real post;
every person, company, address and activity id is invented (`.example`
domains). They imitate the observable shape of LinkedIn's member
notification emails (sender `…@linkedin.com`, `/comm/` tracking links with
`midToken` / `otpToken` / `trk`, `/comm/in/<slug>` actor links,
`/feed/update/urn:li:activity:<id>` and `/posts/<slug>-activity-<id>-…`
post links). LinkedIn changes these emails often: the parser is tolerant
and counts unreadable emails, so add an anonymised real sample here when it
misses posts in production.

- `single-hiring.html` — "X posted": one hiring post (Dubai, Laravel).
- `digest.html` — "Top posts for you": three posts, two hiring (one Arabic), one anniversary.
- `shared.html` — "X shared a post": commentary plus the shared hiring post.
- `not-hiring.html` — "X posted": a new-job announcement (no hiring intent).
- `single-hiring.txt` — the plain-text part only (no HTML).
- `posts.ts` — 40 labelled posts for the classifier, plus 10 held out.
