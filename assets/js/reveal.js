/*
 * Scroll reveal for the homepage and /sudarshanakarkala. Optional: blocks that start below the fold
 * rise into place once as they enter the viewport. Without this script, under reduced motion or
 * without IntersectionObserver, every block is simply visible.
 */
(function () {
  "use strict";

  if (!("IntersectionObserver" in window)) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var SELECTOR = [
    ".section-head",
    ".mission .question",
    ".mission-text",
    ".schematic",
    ".facts > div",
    ".frontier-list > li",
    ".researchers-text",
    ".researchers-roles",
    ".pipeline > li",
    ".lab-split > div",
    ".collaborate-inner",
    ".contact",
    ".service-list > li",
  ].join(",");

  var fold = window.innerHeight * 0.92;
  var blocks = [].filter.call(document.querySelectorAll(SELECTOR), function (el) {
    return el.getBoundingClientRect().top > fold;
  });
  if (!blocks.length) return;

  /* once risen, hand the block back to its own transitions (card hover lifts, etc.) */
  function settle(event) {
    var el = event.currentTarget;
    if (event.target !== el || event.propertyName !== "transform") return;
    el.removeEventListener("transitionend", settle);
    el.classList.remove("reveal", "is-revealed");
    el.style.removeProperty("--reveal-delay");
  }

  var observer = new IntersectionObserver(function (entries) {
    var entering = entries
      .filter(function (entry) { return entry.isIntersecting; })
      .map(function (entry) { return entry.target; })
      .sort(function (a, b) {
        var ra = a.getBoundingClientRect();
        var rb = b.getBoundingClientRect();
        return Math.round(ra.top - rb.top) || ra.left - rb.left;
      });
    entering.forEach(function (el, i) {
      observer.unobserve(el);
      el.style.setProperty("--reveal-delay", Math.min(i, 5) * 80 + "ms");
      el.addEventListener("transitionend", settle);
      el.classList.add("is-revealed");
    });
  }, { rootMargin: "0px 0px -8% 0px" });

  blocks.forEach(function (el) {
    el.classList.add("reveal");
    observer.observe(el);
  });
})();
