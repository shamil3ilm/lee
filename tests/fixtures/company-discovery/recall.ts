/**
 * Offline fixtures for company recall (lib/company-discovery): the park,
 * accelerator and member lists. Shaped like the real pages checked on
 * 2026-10-09 (class names and JSON keys), with SYNTHETIC filler companies
 * on `.example` domains; no contact details. The two real names are public
 * directory entries the regression test is about: Technopark lists CareStack
 * under its legal name "Good Methods Software Solutions (P) Ltd", and
 * QBurst as "QBurst Technologies (P) Ltd".
 */

const tpRow = (id: number, company: string, active = 1) => ({ id, company, short_name: company, active, is_major_company: 0, logo: '/storage/company/x.png', building: [] })

/** Technopark /api/paginated-companies: 3 pages (the real list has 25 of 20). */
export const TECHNOPARK_PAGES: Readonly<Record<number, unknown>> = {
  1: { current_page: 1, last_page: 3, per_page: 3, total: 8, data: [tpRow(101, 'Alpha Example Systems (P) Ltd'), tpRow(102, 'Beta Example Labs (P) Ltd'), tpRow(103, 'Gamma Closed Example Ltd', 0)] },
  2: { current_page: 2, last_page: 3, per_page: 3, total: 8, data: [tpRow(6254, 'Good Methods Software Solutions (P) Ltd'), tpRow(104, 'Delta Example Infotech'), tpRow(105, 'Epsilon Example Studio')] },
  3: { current_page: 3, last_page: 3, per_page: 3, total: 8, data: [tpRow(6092, 'QBurst Technologies (P) Ltd'), tpRow(106, 'Zeta Example Analytics')] },
}

/** Technopark /company-details/{id}: the profile page names the website. */
export function technoparkProfile(name: string, website: string | null): string {
  return `<!doctype html><html><body><div><h1 class="subheadingthin">${name}</h1></div>
<div class="px-8">${website ? `<a href="${website}" class="flex" target="_blank" rel="noreferrer" aria-label="Company Website">${website}<svg></svg></a>` : ''}</div>
<footer><a href="https://www.facebook.com/TechnoparkTrivandrum">Facebook</a></footer></body></html>`
}

const ipCard = (name: string, web: string | null, domains: string[], slug: string) => `
<div class="compy">
  <div class="logo"><img src="https://infopark.in/upload_images/company_logos/x.png" alt="" ></div>
  <h5>${name}</h5>
  <div class="address details">
    <!-- <div class="mail"><i class="fa-solid fa-envelope"></i> hr@hidden.example</div> -->
    ${web ? `<div class="web"><i class="fa-solid fa-globe"></i> ${web}</div>` : ''}
  </div>
  <div class="domain"><div class="domain-title">Domain</div><div class="domain-items">${domains.map((d) => `<span>${d}</span>`).join('')}</div></div>
  <!-- <div class="domain"><div class="domain-items"><span>Coworking desk</span></div></div> -->
  <div class="btn-sec">
    <a href="https://infopark.in/jobs/1"><button class="btn-white-txt">Job Openings</button></a>
    <a href="https://infopark.in/companies-profile/${slug}"><button class="btn-white-txt">Company Profile</button></a>
  </div>
</div>`

/** Infopark /companies?page=N: page 1 links pages 2 and 3. */
export const INFOPARK_PAGE_1 = `<!doctype html><html><body><div class="companies">
${ipCard('Backwater Payments Example Pvt Ltd', 'www.backwaterpay.example', ['Fintech', 'Software Development'], 'backwater-payments')}
${ipCard('QBurst Technologies', 'www.qburst.com', ['Software Development'], 'qburst-technologies')}
${ipCard('Kayal Data Example', null, ['Data Science &amp; Analytics'], 'kayal-data')}
</div>
<ul class="pagination"><li><a href="https://infopark.in/companies?page=2">2</a></li><li><a href="https://infopark.in/companies?page=3">3</a></li></ul>
</body></html>`

export const CYBERPARK_PAGE = `<!doctype html><html><body>
<div class="grid col-300"><div class="cmpny-detail clearfix">
  <div class="company-image clearfix"><div class="image"><img alt="" src="https://cyberparks.in/wp-content/uploads/x.png"></div></div>
  <div class="company-email">
    <div class="comp_name">Malabar Code Example Private Limited. </div>
    <div class="comp_web"><a href="http://www.malabarcode.example" target="_blank"><img src="../images/web_icon.png"> Website </a>
      <span class="flt_rigt"><a href="https://cyberparks.in/listings/malabar-code-example/" target="_blank">Details</a></span>
    </div>
  </div>
</div></div>
<div class="grid col-300"><div class="cmpny-detail clearfix"><div class="company-email"><div class="comp_name"> </div></div></div></div>
</body></html>`

export const UL_CYBERPARK_PAGE = `<!doctype html><html><body><div class="row">
<div class="col-md-3"><a name="indexq" href="http://www.qburst.com" target="new" class="com_link"><div class="card com_card"><div class="card-body"><h5 class="card-title text-center">QBURST </h5></div></div></a></div>
<div class="col-md-3"><a name="indexs" href="http://www.calicutsoft.example" target="new" class="com_link"><div class="card com_card"><div class="card-body"><h5 class="card-title text-center">Calicut Soft Example </h5></div></div></a></div>
</div></body></html>`

export const FLAT6LABS_SITEMAP = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://flat6labs.com/Company/</loc></url>
<url><loc>https://flat6labs.com/ar/Company/riyadh-ledger/</loc></url>
<url><loc>https://flat6labs.com/Company/riyadh-ledger/</loc></url>
<url><loc>https://flat6labs.com/fr/Company/cairo-crafts/</loc></url>
</urlset>`

export function flat6labsCompany(name: string, country: string, website: string): string {
  return `<!doctype html><html><body><div class="widget-con"><div class="title"><h1>${name}<strong>${country}</strong></h1></div>
<ul class="logos"><li><span>Website</span><a href="${website}"><img alt="image"></a></li><li><span>Graduated from</span><a href="https://flat6labs.com/program/x/"><img alt="image"></a></li></ul></div></body></html>`
}

export const STARTUP_BAHRAIN_PAGE = `<!doctype html><html><body>
<h2>Ecosystem</h2><p>intro <a href="https://other.example/"><strong>Not a startup</strong></a></p>
<h3 class="framer-text">Startups</h3>
<a href="https://pearlpay.example/" target="_blank"><div><p class="framer-text"><strong class="framer-text">Pearl Pay Example</strong></p></div><div><p class="framer-text">pearlpay.example</p></div></a>
<a href="https://pearlpay.example/" target="_blank"><div><p class="framer-text"><strong class="framer-text">Pearl Pay Example</strong></p></div></a>
<a href="https://startupbahrain.com/submit" target="_blank"><strong class="framer-text">Submit to the database →</strong></a>
<h3 class="framer-text">Enablers</h3>
<a href="https://bank.example/" target="_blank"><strong class="framer-text">Some Bank Example</strong></a>
</body></html>`

export const NASSCOM_PAGE = `<!doctype html><html><body><section class="tabs-content"><div class="row">
<div class="col-md-4"><div class="perspectives_card"><div class="perspectives_card_content"><h3 class="job_title">Lagoon Logic Example Private Limited</h3><div class="seperator"></div><div class="action-btn"><div class="category">Kochi</div><div class="fee"><a href="https://lagoonlogic.example/" target="_blank"><img alt="Link"></a></div></div></div></div></div>
<div class="col-md-4"><div class="perspectives_card"><div class="perspectives_card_content"><h3 class="job_title">Deccan Cloud Example Limited</h3><div class="seperator"></div><div class="action-btn"><div class="category">Hyderabad</div><div class="fee"><a href="https://deccancloud.example/" target="_blank"><img alt="Link"></a></div></div></div></div></div>
</div></section><ul class="pager"><li><a class="button" href="?page=1" rel="next">Load more</a></li></ul></body></html>`
