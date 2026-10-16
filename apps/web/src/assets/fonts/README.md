# Fonts

Self-hosted web fonts for the SF-Manager design system
(`web-visual-foundation` spec, "Fonts Load From the App's Own Origin").
`src/index.css` declares them with `@font-face`; Vite fingerprints the files at
build time, so no request leaves the app's origin.

| Family        | Role                        | Files                                  | Source (npm, via jsDelivr)               |
| ------------- | --------------------------- | -------------------------------------- | ---------------------------------------- |
| Montserrat    | Headings, wordmark          | `montserrat-latin[-ext]-wght-normal`   | `@fontsource-variable/montserrat@5.3.0`  |
| Public Sans   | Body text, labels, controls | `public-sans-latin[-ext]-wght-normal`  | `@fontsource-variable/public-sans@5.3.0` |
| IBM Plex Mono | Codes, dates, IDs           | `ibm-plex-mono-latin[-ext]-400-normal` | `@fontsource/ibm-plex-mono@5.3.0`        |

- Montserrat and Public Sans are variable fonts (`wght` 100-900): one file per
  subset covers every weight in use.
- Each family ships two subsets, Latin and Latin Extended. The
  `unicode-range` values in `index.css` are copied from each package's CSS, so
  the browser downloads the Latin Extended file only when a page needs it
  (for example "Ŀ").
- All three are licensed under the SIL Open Font License 1.1. The license
  files are next to the fonts (`*-OFL.txt`) and must ship with them.

To update a font, download the same file names from a newer package version
and copy its `unicode-range` values into `index.css`.
