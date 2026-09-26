/*
 * ISHAVASYAM.ORG — analytics abstraction (GA4 via gtag.js)
 *
 * The Google tag is loaded once per page in <head>; its `config` call sends
 * the page_view (page_title / page_location / page_path are collected by GA4).
 * This module is the only place custom events are sent from.
 *
 *   Declarative:  <a data-cta="name" data-cta-location="hero" data-link-type="internal">
 *   Programmatic: IshavasyamAnalytics.trackCTA({ name, text, location, destination, linkType })
 *
 * Privacy: no email addresses, phone numbers, names from free text or form
 * contents are ever sent. mailto:/tel: destinations are reduced to their
 * scheme, and phone/email-like strings are redacted from every parameter.
 * Analytics failures never block navigation.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.IshavasyamAnalytics = api;
    if (root.document) api.bindCTATracking(root.document);
  }
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  var EVENTS = { cta_click: true, research_frontier_select: true };
  var LINK_TYPES = {
    internal: true,
    external_research_platform: true,
    external_profile: true,
    external: true,
    phone: true,
    email: true,
  };
  var EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  var PHONE_RE = /\+?\d[\d\s().-]{6,}\d/g;
  var MAX_LEN = 100;

  function clean(value) {
    if (value === undefined || value === null) return undefined;
    var s = String(value).replace(/\s+/g, " ").trim();
    s = s.replace(EMAIL_RE, "[redacted]").replace(PHONE_RE, "[redacted]");
    return s.slice(0, MAX_LEN);
  }

  function slug(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60);
  }

  /** Reduce a destination to something safe to report. */
  function sanitizeDestination(href, base) {
    if (!href) return undefined;
    var raw = String(href).trim();
    var scheme = raw.match(/^([a-z][a-z0-9+.-]*):/i);
    if (scheme && !/^https?$/i.test(scheme[1])) return scheme[1].toLowerCase() + ":";
    try {
      var u = new URL(raw, base || (root.location && root.location.href) || "https://ishavasyam.org/");
      var sameOrigin = root.location && u.origin === root.location.origin;
      var path = u.pathname + (u.hash && sameOrigin ? u.hash : "");
      return clean(sameOrigin ? path : u.origin + u.pathname);
    } catch (e) {
      return undefined;
    }
  }

  function pagePath() {
    return (root.location && root.location.pathname) || undefined;
  }

  function send(eventName, params) {
    if (!EVENTS[eventName]) return false;
    try {
      if (typeof root.gtag !== "function") return false;
      root.gtag("event", eventName, params);
      return true;
    } catch (e) {
      return false;
    }
  }

  function buildCTAParams(opts) {
    var linkType = LINK_TYPES[opts.linkType] ? opts.linkType : "internal";
    var params = {
      cta_name: slug(opts.name),
      cta_text: clean(opts.text),
      cta_location: slug(opts.location) || "unknown",
      destination_url: sanitizeDestination(opts.destination),
      page_path: pagePath(),
      link_type: linkType,
    };
    if (opts.contactMethod) params.contact_method = slug(opts.contactMethod);
    // Contact links never report the visible text (it may be a phone number or address).
    if (linkType === "phone" || linkType === "email") {
      params.cta_text = linkType;
      params.contact_method = linkType;
    }
    Object.keys(params).forEach(function (k) {
      if (params[k] === undefined || params[k] === "") delete params[k];
    });
    return params;
  }

  /** Send one cta_click. Returns the parameters that were (or would be) sent. */
  function trackCTA(opts) {
    if (!opts || !opts.name) return null;
    var params = buildCTAParams(opts);
    send("cta_click", params);
    return params;
  }

  var selectedOnce = {};
  /** research_frontier_select — at most once per frontier + interaction per page view. */
  function trackFrontier(frontierId, interaction) {
    var id = slug(frontierId);
    var how = slug(interaction) || "select";
    if (!id || selectedOnce[id + ":" + how]) return null;
    selectedOnce[id + ":" + how] = true;
    var params = { frontier_id: id, interaction: how, page_path: pagePath() };
    send("research_frontier_select", params);
    return params;
  }

  function ctaFromElement(el) {
    var d = el.dataset || {};
    var text = d.ctaText || (el.textContent || "").replace(/[→↗]/g, "");
    return {
      name: d.cta,
      text: text,
      location: d.ctaLocation,
      destination: el.getAttribute("href"),
      linkType: d.linkType,
      contactMethod: d.contactMethod,
    };
  }

  /** One delegated listener per document; never prevents default navigation. */
  function bindCTATracking(doc) {
    if (!doc || doc.__ishavasyamCtaBound) return false;
    doc.__ishavasyamCtaBound = true;
    doc.addEventListener("click", function (event) {
      try {
        var target = event.target;
        var el = target && target.closest ? target.closest("[data-cta]") : null;
        if (el) trackCTA(ctaFromElement(el));
      } catch (e) {
        /* analytics must never break the page */
      }
    });
    return true;
  }

  return {
    trackCTA: trackCTA,
    trackFrontier: trackFrontier,
    bindCTATracking: bindCTATracking,
    sanitizeDestination: sanitizeDestination,
    buildCTAParams: buildCTAParams,
    ctaFromElement: ctaFromElement,
    _reset: function () {
      selectedOnce = {};
    },
  };
});
