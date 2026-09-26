// Unit tests for assets/js/analytics.js — run with `npm test` (node:test, no browser).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../assets/js/analytics.js", import.meta.url), "utf8");

/** Load the module into an isolated "window" with a recording gtag. */
function load({ gtag = "record", pathname = "/", document } = {}) {
  const calls = [];
  const sandbox = {
    URL,
    location: { href: `https://ishavasyam.org${pathname}`, origin: "https://ishavasyam.org", pathname },
    document,
  };
  if (gtag === "record") sandbox.gtag = (...args) => calls.push(args);
  else if (gtag === "throw") sandbox.gtag = () => { throw new Error("blocked"); };
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox);
  return { api: sandbox.IshavasyamAnalytics, calls };
}

const plain = (o) => JSON.parse(JSON.stringify(o));

test("trackCTA sends exactly one cta_click with the documented parameters", () => {
  const { api, calls } = load();
  api.trackCTA({
    name: "explore_space_station_research",
    text: "Explore Space Station Research →",
    location: "hero",
    destination: "https://aerospace.ishavasyam.org/space/space-station",
    linkType: "external_research_platform",
  });
  assert.equal(calls.length, 1);
  const [cmd, event, params] = calls[0];
  assert.equal(cmd, "event");
  assert.equal(event, "cta_click");
  assert.deepEqual(plain(params), {
    cta_name: "explore_space_station_research",
    cta_text: "Explore Space Station Research →",
    cta_location: "hero",
    destination_url: "https://aerospace.ishavasyam.org/space/space-station",
    page_path: "/",
    link_type: "external_research_platform",
  });
});

test("internal destinations are reported as same-origin paths", () => {
  const { api } = load();
  assert.equal(api.sanitizeDestination("/philosophy"), "/philosophy");
  assert.equal(api.sanitizeDestination("#contact"), "/#contact");
});

test("external destinations drop query strings and fragments", () => {
  const { api } = load();
  assert.equal(api.sanitizeDestination("https://example.org/a/b?email=x@y.com#frag"), "https://example.org/a/b");
});

test("phone CTA never sends the number — only contact_method: phone", () => {
  const { api, calls } = load();
  api.trackCTA({
    name: "contact_sudarshana_phone",
    text: "+91 9845561518",
    location: "contact",
    destination: "tel:+919845561518",
    linkType: "phone",
    contactMethod: "phone",
  });
  const params = plain(calls[0][2]);
  assert.equal(params.cta_name, "contact_sudarshana_phone");
  assert.equal(params.cta_location, "contact");
  assert.equal(params.link_type, "phone");
  assert.equal(params.contact_method, "phone");
  assert.equal(params.destination_url, "tel:");
  assert.doesNotMatch(JSON.stringify(params), /9845561518|98455/);
});

test("mailto destinations and email-like text are redacted", () => {
  const { api, calls } = load();
  api.trackCTA({ name: "connect_email", text: "Write to someone@example.com", location: "x", destination: "mailto:someone@example.com", linkType: "email" });
  const json = JSON.stringify(calls[0][2]);
  assert.doesNotMatch(json, /someone@example\.com/);
  assert.match(json, /"destination_url":"mailto:"/);
});

test("phone-like strings are redacted from free text even on non-phone links", () => {
  const { api } = load();
  const p = api.buildCTAParams({ name: "x", text: "Call +91 98455 61518 today", location: "y", linkType: "internal" });
  assert.doesNotMatch(p.cta_text, /\d{5}/);
});

test("profile CTA reports the public profile URL as destination", () => {
  const { api, calls } = load();
  api.trackCTA({
    name: "view_sudarshana_profile",
    text: "View Profile",
    location: "contact",
    destination: "https://aerospace.ishavasyam.org/about/sudarshana-karkala",
    linkType: "external_profile",
  });
  const p = plain(calls[0][2]);
  assert.equal(p.link_type, "external_profile");
  assert.equal(p.destination_url, "https://aerospace.ishavasyam.org/about/sudarshana-karkala");
});

test("missing or failing gtag never throws (analytics cannot break navigation)", () => {
  const none = load({ gtag: "none" });
  assert.doesNotThrow(() => none.api.trackCTA({ name: "a", location: "b" }));
  const broken = load({ gtag: "throw" });
  assert.doesNotThrow(() => broken.api.trackCTA({ name: "a", location: "b" }));
});

test("trackCTA without a name sends nothing", () => {
  const { api, calls } = load();
  assert.equal(api.trackCTA({ location: "hero" }), null);
  assert.equal(calls.length, 0);
});

test("unknown link types fall back to internal", () => {
  const { api } = load();
  assert.equal(api.buildCTAParams({ name: "a", linkType: "weird" }).link_type, "internal");
});

test("research_frontier_select is sent at most once per frontier and interaction", () => {
  const { api, calls } = load();
  api.trackFrontier("power_energy", "scope_expand");
  api.trackFrontier("power_energy", "scope_expand");
  api.trackFrontier("power_energy", "schematic_legend");
  assert.equal(calls.length, 2);
  assert.equal(calls[0][1], "research_frontier_select");
});

test("delegated click tracking binds once and emits one event per click", () => {
  const listeners = [];
  const document = { addEventListener: (type, fn) => listeners.push([type, fn]) };
  const { api, calls } = load({ document });
  // the module auto-binds on load; a second bind must be a no-op
  assert.equal(api.bindCTATracking(document), false);
  assert.equal(listeners.length, 1);

  const link = {
    dataset: { cta: "explore_ishavasyam_philosophy", ctaLocation: "mantra", linkType: "internal" },
    textContent: "Meaning & Philosophy →",
    getAttribute: () => "/philosophy",
  };
  const target = { closest: (sel) => (sel === "[data-cta]" ? link : null) };
  listeners[0][1]({ target });
  assert.equal(calls.length, 1);
  const p = plain(calls[0][2]);
  assert.equal(p.cta_name, "explore_ishavasyam_philosophy");
  assert.equal(p.cta_text, "Meaning & Philosophy");
  assert.equal(p.destination_url, "/philosophy");

  // clicks outside tracked elements send nothing
  listeners[0][1]({ target: { closest: () => null } });
  assert.equal(calls.length, 1);
});
