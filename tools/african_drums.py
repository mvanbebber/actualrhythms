"""African drum rhythms: grids of strokes, spelled as notation.

The sources (gathered by tools/african_sources.py into tools/african-drums.json, so a rebuild doesn't need
the downloads) give drum parts as grids: one character per pulse, a stroke letter or '.' for silence.

* IEMP Malian Jembe (Polak, Tarsitani & Clayton): onsets of whole recorded performances in Bamako,
  2006-07, each annotated with its metrical position, so they are long lines cut into 2- and 4-bar
  excerpts like any recorded solo.
* Notated ensemble rhythms (Djembe Gorilla, Raymond's Transcriptions from the Djembe-L list, djembe.net):
  each part's pattern as the transcriber gives it. A 1- or 2-bar pattern repeats, like the Latin patterns;
  a longer one (a call, a break, a solo phrase) is cut into excerpts.

Grids are spelled as percussion notation (a drum doesn't sustain, so a note lasts until the next stroke or
the end of its beat, and silence is written with rests), and checked with the same notation rules as
tools/latin.py.
"""
import json
import os

from latin import check_notation, decode

FLAG_REST = 1
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'african-drums.json')

# where each stroke sounds on the drum kit the app plays percussion with (see instrumentOf() in app.js):
# kick 64, low tom 69, medium tom 71, snare 72, high tom 74, ride 77
STROKES = {'B': 69, 'T': 74, 'S': 72}  # jembe and hand drums: bass, tone, slap


# Latin parts: pitched lines with only their attacks annotated (IEMP Cuban Son & Salsa) get one pitch each;
# percussion goes on the kit
PITCHED = (('bass', 43), ('guitar', 55), ('tres', 67), ('trumpet', 72))
LATIN_KIT = (('clave', 76), ('campana', 77), ('agog', 77), ('cowbell', 77), ('bongó', 74), ('bongo', 74),
             ('conga', 69), ('tumbadora', 69), ('cajón', 64), ('cajon', 64), ('surdo', 64), ('piano (drum)', 64),
             ('repique', 74), ('chico', 72), ('caixa', 72), ('tamborim', 74), ('shaker', 79), ('güiro', 79))


# drum-set lines (the Groove MIDI Dataset, tools/groove_midi.py)
KIT_LINES = {'kick': 64, 'snare': 72, 'cross-stick': 72, 'hi-hat': 79, 'ride': 77, 'toms': 74}


def kit_note(part, stroke):
    p = part.lower()
    if p.startswith('drum kit: '):
        return KIT_LINES.get(p[10:], 72)
    for name, m in PITCHED + LATIN_KIT:
        if p.startswith(name) or f' {name}' in p:
            return m
    if 'bell' in p:
        return 77
    if 'dununba' in p or 'doundounba' in p or p.startswith('dundun 1') or p.startswith('dun dun'):
        return 64
    if 'sangban' in p or p.startswith('dundun 2') or 'dundun' in p or 'dunun' in p:
        return 69
    if 'kenkeni' in p:
        return 71
    return STROKES.get(stroke.upper(), 72)


VALUES = {96: 'w', 72: 'hd', 48: 'h', 36: 'qd', 24: 'q', 18: '8d', 12: '8', 6: '16'}


def _note_values(a, beat):
    """Single values a stroke may be written with when it falls a ticks into a beat, longest first."""
    if beat == 36:
        allowed = [(36, a == 0), (24, a in (0, 12)), (18, a in (0, 18)), (12, a % 6 == 0), (6, True)]
    else:
        allowed = [(24, a == 0), (18, a in (0, 6)), (12, a % 6 == 0), (6, True)]
    return [v for v, ok in allowed if ok and a + v <= beat]


def _rests(a, b, beat, out):
    while a < b:
        if beat == 36:
            opts = [(36, a == 0), (24, a == 0), (12, a % 12 == 0), (6, True)]
        else:
            opts = [(24, a == 0), (12, a % 12 == 0), (6, True)]
        v = next(v for v, ok in opts if ok and a + v <= b)
        out.append((v, True))
        a += v


def spell_bar(meter, cells):
    """cells: one character per pulse ('.' = silence). Returns the bar's encoding, e.g. 'q 8 8r qd'."""
    num, den = map(int, meter.split('/'))
    unit = 96 // den
    compound = num % 3 == 0 and num > 3
    beat = unit * 3 if compound else unit
    bar = unit * num
    step = bar // len(cells)
    if step * len(cells) != bar or step % 6:
        raise ValueError(f'{len(cells)} pulses do not fit a bar of {meter}')
    attacks = [i * step for i, c in enumerate(cells) if c != '.']
    beats = []
    for b0 in range(0, bar, beat):
        pts = [t - b0 for t in attacks if b0 <= t < b0 + beat]
        ev = []
        if not pts:
            ev.append((beat, True))
        else:
            _rests(0, pts[0], beat, ev)
            for i, a in enumerate(pts):
                end = pts[i + 1] if i + 1 < len(pts) else beat
                gap = end - a
                vals = _note_values(a, beat)
                if gap % 12 == 0 and all(p % 12 == 0 for p in pts):
                    vals = [v for v in vals if v % 12 == 0] or vals
                v = next(v for v in vals if v <= gap)
                ev.append((v, False))
                _rests(a + v, end, beat, ev)
        beats.append(ev)
    # empty beats: a whole-bar rest, or two empty beats in either half of 4/4 and 12/8
    whole = [(beat, True)]
    if all(e == whole for e in beats):
        return 'wr' if bar == 96 else ' '.join([VALUES[bar // 2] + 'r'] * 2) if bar == 144 else \
            ' '.join(VALUES[beat] + 'r' for _ in beats)
    merged = []
    i = 0
    nb = len(beats)
    while i < nb:
        if nb == 4 and i in (0, 2) and beats[i] == whole and beats[i + 1] == whole:
            merged.append([(beat * 2, True)])
            i += 2
            continue
        merged.append(beats[i])
        i += 1
    return ' '.join(VALUES[v] + ('r' if r else '') for ev in merged for v, r in ev)


def bar_events(name, meter, cells, part):
    """Events [[ticks, code, flags, midi]] of one bar of a grid."""
    m = decode(spell_bar(meter, cells))
    check_notation(name, meter, m)
    strokes = iter(c for c in cells if c != '.')
    for e in m:
        e.append(0 if e[2] & FLAG_REST else kit_note(part, next(strokes)))
    return m


def drum_windows(windows_from_bars, path=DATA):
    """Every line in african-drums.json (or tools/latin-rhythms.json) as build_corpus windows
    (windows_from_bars cuts long lines)."""
    if not os.path.exists(path):
        return []
    with open(path) as f:
        lines = json.load(f)
    out = []
    for ln in lines:
        meter, slots = ln['meter'], ln['slots']
        grid = ln['grid']
        cells = [grid[i:i + slots] for i in range(0, len(grid), slots)]
        src = {'title': ln['title'], 'composer': ln.get('composer', ''), 'folder': ln['folder'], 'part': ln['part'],
               'origin': ln.get('origin'), 'date': ln.get('date'), 'note': ln.get('note')}
        if ln.get('loop') and len(cells) <= 2:
            ms = [bar_events(ln['title'], meter, c, ln['part']) for c in cells]
            if sum(1 for m in ms for e in m if not e[2] & FLAG_REST) < 2:
                continue
            out.append({'meter': meter, 'bars': len(ms), 'measures': ms, 'fixed': True, 'src': dict(src, bar=None)})
            continue
        if ln.get('loop'):
            cells = cells * 2  # a longer repeating phrase: read it around its repeat too
        bars = []
        for k, c in enumerate(cells):
            if '?' in c:
                bars.append(None)  # a cycle the annotation doesn't cover
                continue
            evs = bar_events(ln['title'], meter, c, ln['part'])
            bars.append((k + 1, meter, evs, [False] * len(evs)))
        tempi = ln.get('tempi')
        for w in windows_from_bars(bars, src):
            if ln.get('loop'):
                w['src']['bar'] = None
            if tempi:
                w['tempo'] = tempi[w['src']['bar'] - 1]
            out.append(w)
    return out
