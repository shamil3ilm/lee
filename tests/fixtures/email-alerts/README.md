# Job-alert email fixtures — SYNTHETIC

Every file here was written by hand for lee's tests. None is a real email.
They imitate the publicly documented or observable shape of each site's
job-alert mail (sender, card layout, link formats), researched on
2026-09-27 from help pages, public job URLs and open-source alert parsers:

- LinkedIn: `jobalerts-noreply@linkedin.com`; cards `td[data-test-id="job-card"]`
  with "Company · Location"; links `/comm/jobs/view/<id>/?trackingId=…&otpToken=…`;
  the text part repeats title / company / location / "View job: <url>".
- Indeed: `alert@indeed.com`; `h2 > a` title links to `/rc/clk/dl?jk=<16 hex>`;
  sponsored `/pagead/clk?…` links carry no job key; text part "Company - Location".
- Naukri: `naukrialerts@naukri.com`; `/job-listings-<slug>-<12 digits>?src=…`.
- NaukriGulf: `…@naukrigulf.com`; `/<slug>-jid-<12 digits>`.
- Bayt: `…@bayt.com`; `/en/<country>/jobs/<slug>-<id>/` (the single-job URL
  shape is not confirmed publicly — check it against a real alert).
- GulfTalent: `…@gulftalent.com`; `/<country>/jobs/<slug>-<id>`.
- Glassdoor: `…@glassdoor.com`; `/job-listing/<slug>.htm?jl=<id>` and
  `/partner/jobListing.htm?jobListingId=<id>`.

Company names, job ids and tokens are invented. The card markup for
Naukri, NaukriGulf, Bayt, GulfTalent and Glassdoor is a plausible guess,
not a copy: no public sample of those emails was found. Add a real
(anonymised) alert here when a parser misses jobs in production.
