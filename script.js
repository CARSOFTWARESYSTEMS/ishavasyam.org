(function () {
  "use strict";

  var header = document.querySelector(".site-header");
  var navToggle = document.querySelector(".nav-toggle");
  var primaryNav = document.getElementById("primary-nav");
  var body = document.body;

  /* Header background toggles once the page scrolls past the hero fold */
  function updateHeaderState() {
    if (!header) return;
    if (window.scrollY > 40) {
      header.classList.add("is-scrolled");
    } else {
      header.classList.remove("is-scrolled");
    }
  }

  updateHeaderState();
  window.addEventListener("scroll", updateHeaderState, { passive: true });

  /* Mobile navigation */
  function closeNav() {
    if (!navToggle || !primaryNav) return;
    navToggle.setAttribute("aria-expanded", "false");
    body.classList.remove("nav-open");
  }

  function openNav() {
    if (!navToggle || !primaryNav) return;
    navToggle.setAttribute("aria-expanded", "true");
    body.classList.add("nav-open");
  }

  if (navToggle && primaryNav) {
    navToggle.addEventListener("click", function () {
      var isOpen = navToggle.getAttribute("aria-expanded") === "true";
      if (isOpen) {
        closeNav();
      } else {
        openNav();
      }
    });

    primaryNav.addEventListener("click", function (event) {
      if (event.target.tagName === "A") {
        closeNav();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && navToggle.getAttribute("aria-expanded") === "true") {
        closeNav();
        navToggle.focus();
      }
    });

    /* Close the mobile menu if the viewport grows past the mobile breakpoint */
    var mobileMediaQuery = window.matchMedia("(min-width: 1024px)");
    var handleViewportChange = function (event) {
      if (event.matches) closeNav();
    };
    if (mobileMediaQuery.addEventListener) {
      mobileMediaQuery.addEventListener("change", handleViewportChange);
    } else if (mobileMediaQuery.addListener) {
      mobileMediaQuery.addListener(handleViewportChange);
    }
  }

  /* Footer year */
  var yearEl = document.getElementById("current-year");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }
})();
