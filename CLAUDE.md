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
- Playback: piano (`audio/piano/`) for every part except bass, guitar and drum parts, which use
  `audio/instruments/` (FluidR3 GM, CC BY 3.0) and `audio/drums/` (Salamander Drumkit, CC BY-SA 3.0); see `instrumentOf()` in `app.js`.
  Run `tools/instrument_offsets.py` after changing those samples.
- Landing pages: `why/`, `compare/`, `teachers/`, `jazz/`, `same-rhythm/`, `numbers/`, sharing `landing/landing.css`; their notation
  images in `landing/img/` are real excerpts exported from the app.
- Corpus build: `tools/build_corpus.py` writes `data/rhythms.js` and `data/occurrences.js` (loaded on demand)
  and stamps their versions. Sources: music21's corpus (cached in `tools/.windows-cache.pkl`), Joplin
  (Craig Stuart Sapp), OpenEWLD (all songs, with the owner's permission), the Weimar Jazz Database,
  `tools/latin.py`, `tools/african.py` (African timelines), and Michael Van Bebber's Charlie Parker transcriptions from his book *Charlie Parker 60 Melodies and Solos*
  (https://qpress.ca/product/60-melodies-solos-charlie-parker-omnibook) (`tools/parker.py`), and his other
  jazz and song transcriptions (`tools/mvb.py`).
- The Parker transcriptions are the owner's own work, from live recordings, published with his rights.
  Their processed excerpts are kept in `tools/parker-windows.json`, so a rebuild doesn't need the
  Sibelius exports; pass `--parker DIR` with fresh MusicXML exports to regenerate it. The same goes for his
  other transcriptions: `tools/mvb-windows.json`, regenerated with `--mvb DIR`.
