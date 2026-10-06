// Checks JSON Schema can't express, and applies the display order from meta.x-portfolio.

import { validate } from './validate.mjs';

/** The key each section's items are referenced by in meta.x-portfolio.order. */
export const SECTION_KEYS = Object.freeze({
  work: 'name',
  projects: 'name',
  skills: 'name',
  education: 'institution',
});

export const REQUIRED_NETWORKS = Object.freeze(['GitHub', 'LinkedIn']);

function checkUniqueKeys(profile, errors) {
  for (const [section, keyField] of Object.entries(SECTION_KEYS)) {
    const seen = new Set();
    profile[section].forEach((item, i) => {
      const key = item[keyField];
      if (seen.has(key)) errors.push(`/${section}/${i}/${keyField}: "${key}" is used twice; ${keyField} must be unique in ${section}`);
      seen.add(key);
    });
  }
}

function checkOrder(profile, order, errors) {
  for (const [section, keys] of Object.entries(order)) {
    const known = new Set(profile[section].map((item) => item[SECTION_KEYS[section]]));
    keys.forEach((key, i) => {
      if (!known.has(key)) errors.push(`/meta/x-portfolio/order/${section}/${i}: "${key}" matches no item in ${section}`);
    });
  }
}

function checkCaseStudies(profile, caseStudies, errors) {
  const ids = new Set();
  caseStudies.forEach((study, i) => {
    const path = `/meta/x-portfolio/caseStudies/${i}`;
    if (ids.has(study.id)) errors.push(`${path}/id: "${study.id}" is used twice`);
    ids.add(study.id);
    const job = profile.work.find((w) => w.name === study.work);
    if (!job) errors.push(`${path}/work: "${study.work}" matches no work item`);
    else if (study.highlight >= job.highlights.length) {
      errors.push(`${path}/highlight: ${study.highlight} is out of range (${study.work} has ${job.highlights.length} highlights)`);
    }
  });
}

function checkDates(profile, errors) {
  for (const section of ['work', 'projects', 'education']) {
    profile[section].forEach((item, i) => {
      if (!item.startDate || !item.endDate) return;
      const n = Math.min(item.startDate.length, item.endDate.length);
      if (item.endDate.slice(0, n) < item.startDate.slice(0, n)) {
        errors.push(`/${section}/${i}/endDate: ${item.endDate} is before startDate ${item.startDate}`);
      }
    });
  }
}

function checkProfiles(profile, errors) {
  const networks = profile.basics.profiles.map((p) => p.network.toLowerCase());
  for (const required of REQUIRED_NETWORKS) {
    if (!networks.includes(required.toLowerCase())) errors.push(`/basics/profiles: a "${required}" profile is required (used in the footer)`);
  }
  if (new Set(networks).size !== networks.length) errors.push('/basics/profiles: each network may appear only once');
}

/** Full validation: JSON Schema first, then cross-reference checks. Returns a list of errors. */
export function checkProfile(profile, schema) {
  const errors = validate(profile, schema);
  if (errors.length) return errors; // later checks assume the shape is right
  const x = profile.meta['x-portfolio'];
  checkUniqueKeys(profile, errors);
  checkOrder(profile, x.order, errors);
  checkCaseStudies(profile, x.caseStudies, errors);
  checkDates(profile, errors);
  checkProfiles(profile, errors);
  return errors;
}

/** Items in display order: listed keys first (in list order), then any unlisted items in file order. */
export function ordered(profile, section) {
  const keyField = SECTION_KEYS[section];
  const keys = profile.meta['x-portfolio'].order[section] || [];
  const items = profile[section];
  const listed = keys.map((key) => items.find((item) => item[keyField] === key));
  const rest = items.filter((item) => !keys.includes(item[keyField]));
  return [...listed, ...rest];
}

export function findProfile(profile, network) {
  return profile.basics.profiles.find((p) => p.network.toLowerCase() === network.toLowerCase());
}
