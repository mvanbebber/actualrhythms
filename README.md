# Actual Rhythms

A rhythm sight-reading trainer in the spirit of Rhythm Sight Reading Trainer, with one difference: **every rhythm is a real passage from real music**. Nothing is randomly generated. Each excerpt is a 2- or 4-bar window cut from an actual melodic line, and after you play it the app tells you where it came from and can play the original melody.

## How it works

1. Pick tempo, difficulty (1–5), length, time signatures and repertoire.
2. Press **Start** (or Enter, or just start tapping). One bar of count-in clicks plays.
3. Tap each note's attack on the pad, or with Space / F / J.
4. Each note is colored by timing (within 35 ms, within 75 ms, loose, missed); your taps appear as tick marks under the staff. You get a score, your average early/late tendency, and the source of the rhythm.

Every excerpt plays twice (it's written with a repeat sign). **→ / N** loads the next rhythm and **←** goes back to earlier ones. The star on the source card saves an excerpt to **Favorites** (kept in your browser), listed in the corpus browser to play or practice later. **Listen** plays the original part on a sampled grand piano, or on sampled bass, guitar or drums when the excerpt comes from one of those parts. Each tap during an attempt plays a short click. **Calibrate** measures your device's audio/input delay (useful with Bluetooth headphones).

## Where the rhythms come from

`tools/build_corpus.py` walks the public-domain scores bundled with [music21](https://web.mit.edu/music21/):

| Repertoire | Collections |
|---|---|
| Folk tunes | Essen folksong collection, O'Neill's *Music of Ireland* (1850), Ryan's *Mammoth Collection* (1883), Nottingham folk tunes, Aird's Airs |
| Bach chorales | Soprano and bass lines of ~370 chorales |
| Classical | Mozart, Haydn, Beethoven, Schubert, Schumann, Chopin, Handel, Corelli, Monteverdi and others: every part |
| Ragtime | All 47 of Scott Joplin's rags (right hand), from Craig Stuart Sapp's digital edition (CC BY-NC-SA 4.0) |
| Pop songs | All 568 lead sheets in [OpenEWLD](https://github.com/00sapo/OpenEWLD): Tin Pan Alley, Broadway, standards, traditional songs. Songs that are not US public domain (first performed after 1930) are included with the site owner's permission; without `--openewld-all` the build keeps only US public domain |
| Latin rhythms | **IEMP Uruguayan Candombe** ([Jure, Rocamora, Tarsitani & Clayton](https://doi.org/10.17605/OSF.IO/WFX7K)): twelve candombe performances recorded in Montevideo in 2014, every stroke of the chico, piano and repique drums annotated at its metrical position; **IEMP Cuban Son & Salsa** ([Poole, Tarsitani & Clayton](https://doi.org/10.17605/OSF.IO/SFXA2)): five songs played by the Havana group Asere in 2009 (El cantante, Palo Santo and others), with the clave, bass, guitar, tres, bongó, bell, cajón, congas and trumpet parts, each two-bar clave cycle written as two bars of 4/4. Both are cut into excerpts like any recorded solo, with the recording's tempo at that point, and used with permission (`tools/latin_sources.py`, kept in `tools/latin-rhythms.json`, spelled by `tools/african_drums.py`). Also the Latin American rhythms of the **[Djembe Gorilla](https://djembegorilla.com/library/)** library (samba, bossa nova, afoxé, ijexá, xote, bembé, dembow) and **Raymond's Transcriptions** (Djembe-L), and 123 Latin American songs and dances from **[PDMX](https://zenodo.org/records/13763756)**, one score each (`tools/pdmx_latin.py`): tangos by Gardel, Villoldo, Matos Rodríguez and Piazzolla, zambas and chacareras, choros and maxixes by Nazareth, Chiquinha Gonzaga, Pixinguinha and Zequinha de Abreu, baião, samba and bossa nova (Luiz Gonzaga, Ary Barroso, Jobim, Bonfá, Jorge Ben, Caetano Veloso), Cuban son, bolero and danza (Matamoros, Farrés, Simons, Lecuona, Cervantes), Mexican canciones and sones (Consuelo Velázquez, Juventino Rosas, Ponce, La bamba), and songs from Puerto Rico, Colombia, Venezuela, Peru, Chile and Panama; all used with permission. And 68 drum-set grooves from the **[Groove MIDI Dataset](https://magenta.tensorflow.org/datasets/groove)** (Gillick, Roberts, Engel, Eck & Bamman, 2019; CC BY 4.0), played by professional drummers on an electronic kit to a click: baião, samba, samba-reggae, songo, ijexá, bossa nova, maracatu, frevo, chacarera, merengue, joropo, sangueo, reggaetón, bomba, bembé and rumba here, and afrobeat and highlife among the African rhythms. Each is quantized to the sixteenth or the eighth-note triplet, whichever the playing fits, and split into kick, snare, cross-stick, hi-hat, ride and tom lines (`tools/groove_midi.py`). Plus 22 standard patterns written out in `tools/latin.py`, each with its origin and a short description: son and rumba clave (3-2 and 2-3), bossa nova clave and bass, cáscara (3-2 and 2-3), tresillo, habanera, cinquillo, milonga, cha-cha-chá, tumbao, reggaetón dembow, samba bass drum, sesquialtera, the 6/8 bell and 6/8 clave, and the tambú, tonada and second bembé bells from Toussaint. These are the patterns as conventionally notated, not excerpts of single recordings, written in as few bars as they need (one-bar patterns play four times, two-bar patterns twice) and checked at build time against the imaginary-barline rule: nothing crosses the middle of a 4/4 or 12/8 bar, and nothing that starts off the beat runs into the next beat. They show whatever Length is set to, and are linked to corpus excerpts whose notes fall in the same places |
| African rhythms | Drum parts and songs from Africa, all used with permission: **IEMP Malian Jembe** ([Polak, Tarsitani & Clayton](https://doi.org/10.17605/OSF.IO/M652X)): eleven performances of Manjanin, Maraka and Woloso recorded in Bamako in 2006–07, every stroke of the lead jembe, accompanying jembe and dunduns annotated at its metrical position, cut into excerpts like any recorded solo, with the recording's tempo at that point; the ensemble rhythms of the **[Djembe Gorilla](https://djembegorilla.com/library/)** library (Guinea, Mali, Ivory Coast and the North African rhythms of Egypt, Morocco, Tunisia, Algeria, Libya and Sudan); **Raymond's Transcriptions** from the Djembe-L list, compiled by [Bob Miller](https://bobmiller.yolasite.com/); **[Djembe N E T](https://www.djembe.net/)** (Kpanlogo); and 35 African songs from **[PDMX](https://zenodo.org/records/13763756)** (anthems, hymns, folk and popular songs: Nkosi Sikelel' iAfrika, Mbube, Pata Pata, Malaika, Soul Makossa and others, `tools/pdmx_african.py`). The drum archives are gathered by `tools/african_sources.py` into `tools/african-drums.json` and spelled as percussion notation by `tools/african_drums.py` (a stroke lasts until the next one or the end of its beat; the same notation checks as the Latin patterns). Lessons, exercises, warm-ups, inventions and rhythms from outside Africa are left out. A part that repeats every bar or two plays as a pattern, like the Latin rhythms; strokes play on the drum kit (bass, tone and slap on different drums, dunduns on the low drums, bells on the ride). Plus 11 African timelines written out in `tools/african.py`, as published in Godfried Toussaint's timeline studies: the standard pattern (Ewe bell), fume-fume, Gahu, Shiko, Soukous, and the Soli, Yoruba, Asaadua, Sorsonet, Bemba and Ashanti bells |
| Jazz solos | 456 transcribed improvisations from the [Weimar Jazz Database](https://jazzomat.hfm-weimar.de/) (Armstrong, Parker, Rollins, Coltrane, Davis, Brecker and others), via the MIT-licensed [jazzodata](https://github.com/klausfrieler/jazzodata) export |
| Charlie Parker | 59 heads and solos (1944–1953) from [*Charlie Parker 60 Melodies and Solos*](https://qpress.ca/product/60-melodies-solos-charlie-parker-omnibook), transcribed from the recordings by Michael Van Bebber, used with permission, all rights reserved. Read from the concert-pitch staff of his Sibelius scores (exported as MusicXML), labeled head, solo or trumpet from the score's text marks, with the session, record and metronome mark of each tune. They replace the Weimar Jazz Database's transcriptions of the same recordings. The processed excerpts are kept in `tools/parker-windows.json`; pass `--parker DIR` with the MusicXML exports to regenerate them |
| Michael Van Bebber's transcriptions | 135 more recordings he transcribed (used with permission, all rights reserved): 102 jazz solos, heads, lead sheets and arrangements (Coltrane, Clifford Brown, Freddie Hubbard, Horace Silver, Monk, Basie and others) and 33 soul, funk, pop and rock songs (Stevie Wonder, Michael Jackson, Khruangbin and others). Every staff with its own line is read, labeled by instrument (piano staves as right and left hand, drums included); staves that repeat another in a different transposition are skipped. Credits come from each score's title block (`tools/mvb.py`). Processed excerpts are kept in `tools/mvb-windows.json`; pass `--mvb DIR` to regenerate them |

For multi-voice staves (piano, divisi) it reads the busiest voice in each bar. For each line it keeps complete bars only, splits them into 2- and 4-bar windows, drops windows that start in the middle of a tied note or use tuplets other than triplets, and deduplicates identical rhythms (keeping up to five sources each, with their pitches). Each rhythm is then graded:

| Level | Contains |
|---|---|
| 1 Beats | Attacks only on beats |
| 2 Subdivided | Eighth-note grid (simple time), the basic flow of compound time |
| 3 Syncopated | Dotted quarters, ties, off-beat entries after rests, eighth-level syncopation |
| 4 Sixteenths | Sixteenth grid |
| 5 Advanced | Triplets, 32nds, sixteenth-level syncopation |

## Layouts

The interface picks one of four layouts from the viewport's size (never the device type):

| Layout | When | Settings appear as |
|---|---|---|
| Phone | narrower than 600px | bottom sheet |
| Phone landscape | 500px tall or less, wider than tall | full-screen dialog; score and controls left, tall Tap pad right |
| Medium (iPad portrait, Split View) | 600–999px wide | slide-over panel from the right |
| Wide (iPad landscape, laptop) | 1000px+ wide and taller than 500px | persistent sidebar |

Notation is laid out per measure: bars wrap only at barlines, each bar gets width in proportion to how dense it is, and the score re-renders at its real pixel width when the space changes (deferred until an attempt finishes). On very narrow screens an unusually dense bar may scroll sideways inside the score box rather than be squeezed.

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
git clone --depth 1 https://github.com/00sapo/OpenEWLD /tmp/OpenEWLD
```

```bash
git clone --depth 1 https://github.com/craigsapp/joplin /tmp/joplin
```

```bash
python3 tools/build_corpus.py --wjd /tmp/jazzodata/data --openewld /tmp/OpenEWLD --openewld-all --joplin /tmp/joplin
```

The Joplin edition is licensed CC BY-NC-SA 4.0, so the rhythm data that includes it is shared under the same license (see `data/LICENSE.md`) and Actual Rhythms stays free and non-commercial.

Jazz solos are spelled into notation by `tools/wjd.py`: the database gives each note's bar, beat and subdivision; notes are held to the next attack (or to their transcribed length at phrase ends), split at beat boundaries with ties, and beats subdivided in 3 or 6 become triplets. Swing eighths are written straight, as on any jazz chart.

To add your own music, drop MusicXML / ABC / kern files into a folder and add it to `COLLECTIONS` in the script (any format music21 can read works).

## Files

- `index.html` – page structure and icons
- `styles.css` – design tokens and the four responsive layouts
- `app.js` – notation (VexFlow), audio (Web Audio), tap capture, scoring and the UI
- `tests/ui-check.js` – Playwright check of every layout and the practice flow (`node tests/ui-check.js`)
- `data/rhythms.js` – generated rhythm corpus
- `vendor/vexflow.js` – VexFlow 4.2.3 (MIT)
- `audio/piano/` – Salamander Grand Piano V3 by Alexander Holm (CC BY 3.0), MP3 encoding from [@audio-samples](https://github.com/darosh/samples-piano-mp3) (MIT): velocity layers 6, 8, 10 and 13 plus key-release samples
- `audio/instruments/` – acoustic, electric and synth bass and clean electric and steel-string guitar from the FluidR3 GM SoundFont by Frank Wen (CC BY 3.0), MP3 renderings from [midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts), every minor third
- `audio/drums/` – one hit each of kick, snare, two toms, hi-hat (closed, open and pedal), ride and crash from the Salamander Drumkit by Alexander Holm (CC BY-SA 3.0; these trimmed MP3s are shared under the same license), from [Salamander-Drumkit-Trim](https://github.com/SoerenSofke/Salamander-Drumkit-Trim)
- `tools/instrument_offsets.py` – measures each bass, guitar and drum sample's onset and loudness
- `tools/wjd.py` – jazz solo extraction
- `tools/extra_sources.py` – Joplin edition and OpenEWLD loaders (with the US public-domain filter)
- `tools/origins.py` – country of origin and dated label for every source
- `tools/latin.py`, `tools/latin_sources.py`, `tools/pdmx_latin.py`, `tools/groove_midi.py` – the Latin rhythms
- `tools/african.py`, `tools/african_drums.py`, `tools/african_sources.py`, `tools/pdmx_african.py` – the African rhythms
- `tools/build_corpus.py` – corpus extraction

## Hosting

Deployed on Netlify at https://actualrhythms.com. `netlify.toml` configures it: no build command, the repository root is published, and `tools/` is not served. Connect the GitHub repo in Netlify and every push to `main` redeploys.
