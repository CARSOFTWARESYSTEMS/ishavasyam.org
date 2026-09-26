// Static site tests: metadata, structured data, analytics wiring, CTA contracts
// and claim-safety guards. Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const home = read("index.html");
const philosophy = read("philosophy.html");

const one = (html, re) => {
  const m = html.match(new RegExp(re, "g")) || [];
  return m;
};
const attr = (html, re) => (html.match(re) || [])[1];
const jsonLd = (html) => {
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(m, "JSON-LD block present");
  return JSON.parse(m[1]);
};
const visibleText = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<svg[\s\S]*?<\/svg>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(amp|middot|mdash|ndash|rarr|rsquo|trade|copy|nbsp);/g, (_, e) => ({ amp: "&", middot: "·", mdash: "—", ndash: "–", rarr: "→", rsquo: "’", trade: "™", copy: "©", nbsp: " " })[e])
    .replace(/\s+/g, " ");

test("homepage title, description and canonical", () => {
  assert.equal(attr(home, /<title>([^<]*)<\/title>/), "Space Station Research &amp; Engineering | ISHAVASYAM.ORG");
  assert.match(attr(home, /<meta name="description" content="([^"]*)"/), /^ISHAVASYAM\.ORG is a Space Station research and engineering initiative/);
  assert.equal(one(home, '<link rel="canonical"').length, 1);
  assert.equal(attr(home, /<link rel="canonical" href="([^"]*)"/), "https://ishavasyam.org/");
});

test("philosophy page has independent metadata and canonical", () => {
  const title = attr(philosophy, /<title>([^<]*)<\/title>/);
  assert.match(title, /Philosophy of Ishavasyam/);
  assert.doesNotMatch(title, /Space Station Research/, "must not compete for the homepage theme");
  assert.equal(attr(philosophy, /<link rel="canonical" href="([^"]*)"/), "https://ishavasyam.org/philosophy");
  assert.notEqual(attr(philosophy, /<meta name="description" content="([^"]*)"/), attr(home, /<meta name="description" content="([^"]*)"/));
});

test("no accidental noindex / nofollow", () => {
  for (const html of [home, philosophy]) {
    assert.doesNotMatch(html, /noindex|nofollow/i);
  }
});

test("exactly one H1 per page", () => {
  assert.equal(one(home, "<h1[ >]").length, 1);
  assert.equal(one(philosophy, "<h1[ >]").length, 1);
});

test("Open Graph and Twitter metadata point at existing images", () => {
  for (const html of [home, philosophy]) {
    const og = attr(html, /<meta property="og:image" content="https:\/\/ishavasyam\.org\/([^"]*)"/);
    const tw = attr(html, /<meta name="twitter:image" content="https:\/\/ishavasyam\.org\/([^"]*)"/);
    assert.ok(og && existsSync(new URL(`../${og}`, import.meta.url)), `og:image exists: ${og}`);
    assert.equal(og, tw);
    assert.match(html, /<meta property="og:image:width" content="1200">/);
    assert.match(html, /<meta property="og:image:height" content="630">/);
  }
  assert.equal(attr(home, /<meta property="og:url" content="([^"]*)"/), "https://ishavasyam.org/");
  assert.equal(attr(philosophy, /<meta property="og:url" content="([^"]*)"/), "https://ishavasyam.org/philosophy");
});

test("GA4 tag is present exactly once per page with the correct ID", () => {
  for (const html of [home, philosophy]) {
    assert.equal(one(html, "googletagmanager\\.com/gtag/js\\?id=G-BXZ9C642NH").length, 1);
    assert.equal(one(html, "gtag\\('config'").length, 1);
    assert.match(html, /gtag\('config', 'G-BXZ9C642NH'\)/);
    assert.doesNotMatch(html, /googletagmanager\.com\/gtm\.js/, "no second GTM container");
    assert.equal(one(html, "/assets/js/analytics\\.js").length, 1);
  }
});

test("homepage JSON-LD states the entity, mission, frontiers, organisation and planned lab", () => {
  const ld = jsonLd(home);
  const byId = Object.fromEntries(ld["@graph"].map((n) => [n["@id"], n]));
  const initiative = byId["https://ishavasyam.org/#initiative"];
  assert.equal(initiative["@type"], "ResearchProject");
  assert.match(initiative.description, /Space Station research and engineering initiative/);
  assert.match(initiative.description, /from first principles/);
  assert.match(initiative.description, /planned and is not yet operational/);
  assert.equal(initiative.parentOrganization["@id"], "https://ishavasyam.org/#itelematics");
  const org = byId["https://ishavasyam.org/#itelematics"];
  assert.equal(org.name, "iTelematics Software Private Limited");
  assert.equal(org.address.addressLocality, "Bangalore");
  const lab = byId["https://ishavasyam.org/#research-lab"];
  assert.match(lab.name, /\(planned\)/);
  assert.match(lab.description, /not operational/);
  const page = byId["https://ishavasyam.org/#webpage"];
  assert.deepEqual(page.significantLink, ["https://aerospace.ishavasyam.org/space/space-station"]);
  assert.ok(page.relatedLink.includes("https://aerospace.ishavasyam.org/space"));
  // every @id reference resolves inside the graph
  const refs = JSON.stringify(ld).match(/"@id":"[^"]+"/g) || [];
  for (const r of refs) assert.ok(byId[r.slice(7, -1)], `dangling reference ${r}`);
});

test("philosophy JSON-LD is valid and has a breadcrumb back to the homepage", () => {
  const ld = jsonLd(philosophy);
  const crumbs = ld["@graph"].find((n) => n["@type"] === "BreadcrumbList");
  assert.equal(crumbs.itemListElement[0].item, "https://ishavasyam.org/");
  assert.equal(crumbs.itemListElement[1].item, "https://ishavasyam.org/philosophy");
});

test("visible homepage copy supports the key answer-engine facts", () => {
  const text = visibleText(home);
  assert.match(text, /ISHAVASYAM\.ORG is a Space Station research and engineering initiative/);
  assert.match(text, /Develop the capability to research, design and engineer a complete space station from first principles/);
  for (const f of ["Station Architecture", "Autonomous Systems & Station Health", "Power & Energy", "Life Support", "Avionics & Communications", "Robotics & Operations"]) {
    assert.ok(text.includes(f), `frontier visible: ${f}`);
  }
  assert.match(text, /Planned ISHAVASYAM\.ORG Space Station Research Lab/);
  assert.match(text, /does not yet exist/);
  assert.match(text, /An initiative of iTelematics Software Private Limited/);
  assert.match(text, /Research · Engineering · Experimentation/);
  assert.match(text, /Conceptual Space Station/);
});

test("mantra sits between the navigation and the hero, and links to /philosophy", () => {
  const header = home.indexOf("</header>");
  const mantra = home.indexOf('class="mantra"');
  const hero = home.indexOf('class="hero"');
  assert.ok(header < mantra && mantra < hero);
  assert.ok(home.includes("ईशावास्यमिदं सर्वं यत्किञ्च जगत्यां जगत्।"));
  assert.ok(home.includes("तेन त्यक्तेन भुञ्जीथा मा गृधः कस्यस्विद्धनम्॥"));
  assert.match(home, /<a class="mantra-link" href="\/philosophy" data-cta="explore_ishavasyam_philosophy" data-cta-location="mantra" data-link-type="internal">/);
});

test("required CTAs are wired with the documented analytics contract", () => {
  const ctas = [...home.matchAll(/<a [^>]*data-cta="[^"]*"[^>]*>/g)].map((m) => ({
    href: attr(m[0], /href="([^"]*)"/),
    name: attr(m[0], /data-cta="([^"]*)"/),
    location: attr(m[0], /data-cta-location="([^"]*)"/),
    type: attr(m[0], /data-link-type="([^"]*)"/),
  }));
  const find = (name, location) => ctas.find((c) => c.name === name && c.location === location);
  const hero = find("explore_space_station_research", "hero");
  assert.deepEqual(hero, { href: "https://aerospace.ishavasyam.org/space/space-station", name: "explore_space_station_research", location: "hero", type: "external_research_platform" });
  assert.equal(find("explore_ishavasyam_philosophy", "mantra").href, "/philosophy");
  assert.equal(find("collaborate_space_station_research", "collaboration").href, "#contact");
  assert.deepEqual(find("explore_space_research", "collaboration"), { href: "https://aerospace.ishavasyam.org/space", name: "explore_space_research", location: "collaboration", type: "external_research_platform" });
  assert.deepEqual(find("contact_sudarshana_phone", "contact"), { href: "tel:+919845561518", name: "contact_sudarshana_phone", location: "contact", type: "phone" });
  assert.deepEqual(find("view_sudarshana_profile", "contact"), { href: "https://aerospace.ishavasyam.org/about/sudarshana-karkala", name: "view_sudarshana_profile", location: "contact", type: "external_profile" });
  for (const loc of ["footer", "header", "navigation"]) assert.ok(ctas.some((c) => c.location === loc), `CTA at ${loc}`);
  // hero has exactly one call to action
  const heroHtml = home.slice(home.indexOf('class="hero"'), home.indexOf("<!-- ================= THE RESEARCH MISSION"));
  assert.equal(one(heroHtml, "data-cta=").length, 1);
});

test("the phone number and profile appear in one authoritative contact section", () => {
  const text = visibleText(home);
  assert.equal(text.split("+91 9845561518").length - 1, 1);
  assert.equal(one(home, 'href="tel:').length, 1);
  assert.equal(one(home, "about/sudarshana-karkala").length, 1);
});

test("claim-safety guards on the homepage", () => {
  const text = visibleText(home);
  const banned = [
    /ISHAVASYAM™/, /IN-SPACe/i, /\bfounder\b/i, /\bCEO\b/, /leadership/i, /intern(ship)?s?\b/i, /apply now/i,
    /we'?re hiring/i, /join our team/i, /India'?s first/i, /world'?s first/i, /\bapproved by\b/i, /\baffiliated with\b/i,
    /revolutioni[sz]/i, /disrupt/i, /cutting-edge/i, /\bcourses?\b/i, /certificat/i, /student/i,
  ];
  for (const re of banned) assert.doesNotMatch(text, re, `homepage must not contain ${re}`);
});

test("sitemap lists exactly the canonical URLs and robots.txt allows crawling", () => {
  const sitemap = read("sitemap.xml");
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs, ["https://ishavasyam.org/", "https://ishavasyam.org/philosophy"]);
  const imgs = [...sitemap.matchAll(/<image:loc>https:\/\/ishavasyam\.org\/([^<]+)<\/image:loc>/g)].map((m) => m[1]);
  for (const i of imgs) assert.ok(existsSync(new URL(`../${i}`, import.meta.url)), `sitemap image exists: ${i}`);
  const robots = read("robots.txt");
  assert.match(robots, /Sitemap: https:\/\/ishavasyam\.org\/sitemap\.xml/);
  assert.doesNotMatch(robots, /Disallow:\s*\/\s*$/m);
});

test("legacy homepage anchors are forwarded to /philosophy", () => {
  assert.match(home, /vision\|guru\|meaning\|research\|approach\|connect/);
  for (const id of ["vision", "guru", "meaning", "research", "approach", "connect"]) {
    assert.match(philosophy, new RegExp(`id="${id}"`), `philosophy keeps #${id}`);
  }
});

test("the live 3D scene is optional: reduced motion, Save-Data and weak GPUs keep the poster", () => {
  const js = read("assets/js/home.js");
  assert.match(js, /prefers-reduced-motion: reduce/);
  assert.match(js, /if \(!hero \|\| reduceMotion\.matches\) return false/);
  assert.match(js, /saveData/);
  assert.match(js, /failIfMajorPerformanceCaveat/);
  // poster exists for both compositions and every referenced size
  for (const src of home.matchAll(/\/images\/station\/[a-z0-9-]+\.(avif|webp|jpg)/g)) {
    assert.ok(existsSync(new URL(`..${src[0]}`, import.meta.url)), `poster exists: ${src[0]}`);
  }
  // essential hero content is real HTML, not canvas
  assert.match(home, /<h1 class="hero-title"/);
  assert.match(home, /<p class="hero-mission">Develop the capability/);
});

test("frontiers are six accessible disclosures, collapsed by default, each tagged for analytics", () => {
  const details = [...home.matchAll(/<details([^>]*)>\s*<summary>([^<]*)<\/summary>/g)];
  assert.equal(details.length, 6);
  for (const [, attrs, label] of details) {
    assert.doesNotMatch(attrs, /\bopen\b/, "collapsed by default");
    assert.match(attrs, /data-frontier="[a-z_]+"/);
    assert.equal(label, "Explore research scope");
  }
  // the detailed research scope is preserved (not deleted) — 38 scope items in total
  const scope = home.slice(home.indexOf('<ol class="frontier-list">'), home.indexOf("</ol>", home.indexOf('<ol class="frontier-list">')));
  assert.equal((scope.match(/<li>/g) || []).length, 38);
});

test("research problem shows four compact facts after the schematic", () => {
  const facts = home.slice(home.indexOf('<dl class="facts">'), home.indexOf("</dl>"));
  const dts = [...facts.matchAll(/<dt>([^<]+)<\/dt>/g)].map((m) => m[1]);
  assert.deepEqual(dts, ["Mission", "Current work", "Research lab", "Organisation"]);
  assert.ok(home.indexOf('<figure class="schematic"') < home.indexOf('<dl class="facts">'));
  assert.match(facts, /Planned/);
});

test("lab progression is numbered and keeps current vs planned states", () => {
  const steps = [...home.matchAll(/<li class="step step--(current|planned)">\s*<h3><span class="step-num">(\d\d)<\/span> (\w+)<\/h3>/g)].map((m) => [m[2], m[3], m[1]]);
  assert.deepEqual(steps, [
    ["01", "Model", "current"], ["02", "Simulate", "current"], ["03", "Experiment", "planned"], ["04", "Validate", "planned"], ["05", "Integrate", "planned"],
  ]);
});

test("desktop and stacked hero compositions use the same media condition in HTML, CSS and JS", () => {
  const WIDE = "(min-width: 1024px) and (min-aspect-ratio: 5/4)";
  const css = read("assets/css/home.css");
  const js = read("assets/js/home.js");
  assert.ok(home.includes(`media="${WIDE}"`));
  assert.ok(home.includes(`media="not all and ${WIDE}"`));
  assert.ok(css.includes(`@media ${WIDE}`));
  assert.ok(css.includes(`@media not all and ${WIDE}`));
  assert.ok(js.includes(`matchMedia("${WIDE}")`));
});
