# Actual Rhythms: notes for Claude

## House rules (from the owner)
- **American English everywhere**: the app, the landing pages, the README, comments and commit messages.
  practice/practicing (never practise), color, center, license, labeled, behavior, catalog, -ize.
  The only exception is code you can't rename, such as the HTML attribute `aria-labelledby`.
- The site is free and non-commercial. Keep it that way.
- Pushing to `main` deploys https://actualrhythms.com (Netlify). Run `node tests/ui-check.js <outdir>`
  first and push only if it exits 0.

## Layout
- Static site, no build step: `index.html`, `app.js`, `styles.css`, `vendor/vexflow.js`, `data/`.
- Landing pages: `why/`, `compare/`, `teachers/`, `jazz/`, sharing `landing/landing.css`; their notation
  images in `landing/img/` are real excerpts exported from the app.
- Corpus build: `tools/build_corpus.py` writes `data/rhythms.js` and `data/occurrences.js` (loaded on demand)
  and stamps their versions. Sources: music21's corpus (cached in `tools/.windows-cache.pkl`), Joplin
  (Craig Stuart Sapp), OpenEWLD (all songs, with the owner's permission), the Weimar Jazz Database,
  `tools/latin.py`, and Michael Van Bebber's Charlie Parker transcriptions (`tools/parker.py`).
- The Parker transcriptions are the owner's own work, from live recordings, published with his rights.
  Their processed excerpts are kept in `tools/parker-windows.json`, so a rebuild doesn't need the
  Sibelius exports; pass `--parker DIR` with fresh MusicXML exports to regenerate it.
