# ishavasyam.org

**ISHAVASYAM.ORG | SPACE STATION** — Research · Engineering · Experimentation.
Static site served by GitHub Pages (Jekyll publishes the files as-is; dev tooling is excluded in `_config.yml`).

| Route | File | Purpose |
| --- | --- | --- |
| `/` | `index.html`, `assets/css/home.css`, `assets/js/home.js` | Space Station research homepage |
| `/philosophy` | `philosophy.html`, `styles.css` | The former homepage: meaning of Ishavasyam, Isha Upanishad |

Shared: `script.js` (navigation), `assets/js/analytics.js` (GA4 CTA/event abstraction).

## Conceptual station hero

`src/station/` builds an original conceptual station (three.js) over a procedural Earth and atmosphere.
`src/station/layout.js` is the single source of truth for both the 3D model and the plan-view schematic.

- The poster images in `images/station/` are rendered from the same scene. They are the LCP image and the fallback for no-JS, no-WebGL, reduced-motion and low-power devices.
- The live canvas is a lazy-loaded enhancement (`assets/js/station.min.js`) that fades in over the poster.

## Development

```sh
npm install
npm run build            # bundle src/station → assets/js/station.min.js
npm run render:posters   # re-render hero posters (AVIF/WebP) from the scene
node tools/render-social.mjs   # OG image + apple-touch-icon
node tools/gen-schematic.mjs   # regenerate the plan-view schematic inside index.html
npm run serve            # http://localhost:4173 (mirrors GitHub Pages routing)

npm test                 # analytics + metadata/structured-data/claim-safety tests
npm run lint             # html-validate + local link/asset check (add --external via node tools/check-site.mjs --external)
npm run qa:visual        # screenshots at 14 viewports → qa-output/
npm run qa:align         # phone alignment audit: content/centre axes, justified word gaps, overflow (--shots, --guides)
npm run qa:analytics     # end-to-end GA4 verification (hits captured locally, never sent)
node tools/a11y.mjs      # axe-core WCAG audit + keyboard checks
```

Run `npm run build` after any change to `src/station/`, then `npm run render:posters` and `node tools/render-social.mjs` if the change affects the visuals.
