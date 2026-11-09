# Actual Rhythms

A rhythm sight-reading trainer in the spirit of Rhythm Sight Reading Trainer, with one difference: **every rhythm is a real passage from real music**. Nothing is randomly generated. Each excerpt is a 2- or 4-bar window cut from an actual melodic line, and after you play it the app tells you where it came from and can play the original melody.

## How it works

1. Pick tempo, difficulty (1–5), length, time signatures and repertoire.
2. Press **Start** (or Enter, or just start tapping). One bar of count-in clicks plays.
3. Tap each note's attack on the pad, or with Space / F / J.
4. Each note is colored by timing (within 35 ms, within 75 ms, loose, missed); your taps appear as tick marks under the staff. You get a score, your average early/late tendency, and the source of the rhythm.

Every excerpt plays twice (it's written with a repeat sign). **→ / N** loads the next rhythm and **←** goes back to earlier ones. **Listen** plays the rhythm on a sampled grand piano; **Hear the melody** plays the original passage. **Calibrate** measures your device's audio/input delay (useful with Bluetooth headphones).

## Where the rhythms come from

`tools/build_corpus.py` walks the public-domain scores bundled with [music21](https://web.mit.edu/music21/):

| Repertoire | Collections |
|---|---|
| Folk tunes | Essen folksong collection, O'Neill's *Music of Ireland* (1850), Ryan's *Mammoth Collection* (1883), Nottingham folk tunes, Aird's Airs |
| Bach chorales | Soprano and bass lines of ~370 chorales |
| Classical | Mozart, Haydn, Beethoven, Schubert, Schumann, Chopin, Handel, Corelli, Monteverdi and others: every part |
| Ragtime | Joplin, *Maple Leaf Rag* (right hand) |
| Jazz solos | 456 transcribed improvisations from the [Weimar Jazz Database](https://jazzomat.hfm-weimar.de/) (Armstrong, Parker, Rollins, Coltrane, Davis, Brecker and others), via the MIT-licensed [jazzodata](https://github.com/klausfrieler/jazzodata) export |

For multi-voice staves (piano, divisi) it reads the busiest voice in each bar. For each line it keeps complete bars only, splits them into 2- and 4-bar windows, drops windows that start in the middle of a tied note or use tuplets other than triplets, and deduplicates identical rhythms (keeping up to five sources each, with their pitches). Each rhythm is then graded:

| Level | Contains |
|---|---|
| 1 Beats | Attacks only on beats |
| 2 Subdivided | Eighth-note grid (simple time), the basic flow of compound time |
| 3 Syncopated | Dotted quarters, ties, off-beat entries after rests, eighth-level syncopation |
| 4 Sixteenths | Sixteenth grid |
| 5 Advanced | Triplets, 32nds, sixteenth-level syncopation |

## Running it

It's a static site with no build step:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

To regenerate the rhythm data (takes several minutes):

```bash
pip install music21 pyreadr
```

```bash
git clone --depth 1 https://github.com/klausfrieler/jazzodata /tmp/jazzodata
```

```bash
python3 tools/build_corpus.py --wjd /tmp/jazzodata/data
```

Jazz solos are spelled into notation by `tools/wjd.py`: the database gives each note's bar, beat and subdivision; notes are held to the next attack (or to their transcribed length at phrase ends), split at beat boundaries with ties, and beats subdivided in 3 or 6 become triplets. Swing eighths are written straight, as on any jazz chart.

To add your own music, drop MusicXML / ABC / kern files into a folder and add it to `COLLECTIONS` in the script (any format music21 can read works).

## Files

- `index.html` – page and styles
- `app.js` – notation (VexFlow), audio (Web Audio), tap capture and scoring
- `data/rhythms.js` – generated rhythm corpus
- `vendor/vexflow.js` – VexFlow 4.2.3 (MIT)
- `audio/piano/` – Salamander Grand Piano V3 by Alexander Holm (CC BY 3.0), MP3 encoding from [@audio-samples](https://github.com/darosh/samples-piano-mp3) (MIT): velocity layers 6, 8, 10 and 13 plus key-release samples
- `tools/wjd.py` – jazz solo extraction
- `tools/build_corpus.py` – corpus extraction

## Hosting

Deployed on Netlify at https://actualrhythms.com. `netlify.toml` configures it: no build command, the repository root is published, and `tools/` is not served. Connect the GitHub repo in Netlify and every push to `main` redeploys.
