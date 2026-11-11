#!/usr/bin/env python3
"""Extract real rhythms from the public-domain music21 corpus.

Every excerpt the trainer shows is a 2- or 4-bar window cut from an actual
melodic line (a folk tune, a chorale voice, a quartet part, a rag...).
Nothing is generated: rhythms are deduplicated, and each unique rhythm keeps
a few of the real places it occurs, with their pitches, so the app can name
the source and play the melody back.

Usage:  python3 tools/build_corpus.py [--out data/rhythms.js] [--jobs 4]
Requires: pip install music21
"""
import argparse, json, os, sys, time
from collections import defaultdict
from fractions import Fraction
from multiprocessing import Pool

TPQ = 24  # ticks per quarter note (covers 32nds and triplets)

# corpus folder -> (collection label, genre filter key)
COLLECTIONS = {
    'bach': ('J. S. Bach chorales', 'chorale'),
    'essenFolksong': ('Essen folksong collection', 'folk'),
    'oneills1850': ("O'Neill's Music of Ireland", 'folk'),
    'ryansMammoth': ("Ryan's Mammoth Collection", 'folk'),
    'nottingham-dataset': ('Nottingham folk tunes', 'folk'),
    'airdsAirs': ("Aird's Airs", 'folk'),
    'miscFolk': ('Folk songs', 'folk'),
    'joplin': ('Scott Joplin', 'ragtime'),
    'beethoven': ('Beethoven', 'classical'),
    'mozart': ('Mozart', 'classical'),
    'haydn': ('Haydn', 'classical'),
    'schubert': ('Schubert', 'classical'),
    'schumann_robert': ('Robert Schumann', 'classical'),
    'schumann_clara': ('Clara Schumann', 'classical'),
    'chopin': ('Chopin', 'classical'),
    'handel': ('Handel', 'classical'),
    'corelli': ('Corelli', 'classical'),
    'cpebach': ('C. P. E. Bach', 'classical'),
    'weber': ('Weber', 'classical'),
    'verdi': ('Verdi', 'classical'),
    'beach': ('Amy Beach', 'classical'),
    'monteverdi': ('Monteverdi madrigals', 'classical'),
    'liliuokalani': ('Liliʻuokalani', 'classical'),
    'johnson_j_r': ('J. Rosamond Johnson', 'classical'),
    'leadSheet': ('Lead sheets', 'classical'),
    'parkerbook': ('Charlie Parker 60 Melodies and Solos', 'jazz'),
    'mvbjazz': ('Jazz transcriptions by Michael Van Bebber', 'jazz'),
    'mvbsongs': ('Song transcriptions by Michael Van Bebber', 'popular'),
    'wjd': ('Weimar Jazz Database', 'jazz'),
    'joplinrags': ("Scott Joplin's rags (Sapp edition)", 'ragtime'),
    'openewld': ('OpenEWLD lead sheets', 'popular'),
    'latin': ('Standard Latin rhythms', 'latin'),
}

# a credit and a link shown with a collection's name
COLLECTION_EXTRA = {
    'parkerbook': {'credit': 'transcribed by Michael Van Bebber', 'url': 'https://qpress.ca/product/60-melodies-solos-charlie-parker-omnibook'},
}
UNPITCHED_MIDI = 72
METERS = {'2/4', '3/4', '4/4', '2/2', '3/8', '6/8', '9/8', '12/8', '3/2', '6/4'}
TYPE_CODE = {'whole': 'w', 'half': 'h', 'quarter': 'q', 'eighth': '8', '16th': '16', '32nd': '32'}
FLAG_REST, FLAG_TIE, FLAG_TRIP, FLAG_TSTART, FLAG_TSTOP = 1, 2, 4, 8, 16


class Skip(Exception):
    pass


def snap_ticks(ql):
    """Quarter lengths -> ticks. Some exporters (Sibelius) write a triplet eighth as 0.33203125
    rather than 1/3 and make up the difference on the last note; within a fifth of a tick, round."""
    t = Fraction(ql) * TPQ
    r = round(t)
    return Fraction(r) if abs(t - r) <= Fraction(1, 5) else t


def event_of(n):
    """Return [ticks, code, flags, midi] for a note/chord/rest, or raise Skip."""
    d = n.duration
    if d.isGrace or n.quarterLength == 0:
        return None
    ticks = snap_ticks(n.quarterLength)
    if ticks.denominator != 1:
        raise Skip('ticks')
    if d.type not in TYPE_CODE or d.dots > 2 or len(d.components) > 1:
        raise Skip('type')
    flags = 0
    if d.tuplets:
        if len(d.tuplets) > 1:
            raise Skip('nested tuplet')
        t = d.tuplets[0]
        if (t.numberNotesActual, t.numberNotesNormal) != (3, 2):
            raise Skip('tuplet')
        flags |= FLAG_TRIP
    code = TYPE_CODE[d.type] + 'd' * d.dots
    midi = 0
    if n.isRest:
        flags |= FLAG_REST
    else:
        if n.tie is not None and n.tie.type in ('start', 'continue'):
            flags |= FLAG_TIE
        pitches = getattr(n, 'pitches', None) or ()
        if n.isChord and pitches:
            ps = sorted({p.midi for p in pitches})
            midi = ps if len(ps) > 1 else ps[0]  # a chord keeps every note, for playback
        elif getattr(n, 'pitch', None) is not None and hasattr(n.pitch, 'midi'):
            midi = n.pitch.midi
        else:
            midi = UNPITCHED_MIDI  # drums: one note on the piano
    tie_in = (not n.isRest) and n.tie is not None and n.tie.type in ('stop', 'continue')
    return [int(ticks), code, flags, midi], tie_in


def fix_triplets(events):
    """Mark triplet bracket start/stop. A bracket closes when its notated
    (2/3-scaled) length is a whole quarter, eighth or half."""
    i = 0
    while i < len(events):
        if events[i][2] & FLAG_TRIP:
            j, acc = i, 0
            while j < len(events) and events[j][2] & FLAG_TRIP:
                acc += events[j][0]
                if acc in (TPQ // 2, TPQ, TPQ * 2) and j > i:
                    break
                j += 1
            if j >= len(events) or acc not in (TPQ // 2, TPQ, TPQ * 2):
                raise Skip('ragged triplet')
            events[i][2] |= FLAG_TSTART
            events[j][2] |= FLAG_TSTOP
            i = j + 1
        else:
            i += 1


def voice_events(src, bar_ticks):
    evs, tie_ins = [], []
    pos = 0
    for n in src.notesAndRests:
        if n.duration.isGrace or n.quarterLength == 0:
            continue  # grace notes, chord symbols
        if snap_ticks(n.offset) != pos:
            raise Skip('gap/overlap')
        r = event_of(n)
        if r is None:
            continue
        ev, tie_in = r
        evs.append(ev)
        tie_ins.append(tie_in)
        pos += ev[0]
    if pos != bar_ticks or not evs:
        raise Skip('incomplete bar')
    fix_triplets(evs)
    return evs, tie_ins


def measure_events(m, bar_ticks):
    """Events for one bar. In multi-voice bars (piano right hand, divisi) take the
    voice that actually plays the most: most sounding time, then most attacks."""
    if not m.hasVoices():
        return voice_events(m, bar_ticks)
    best, best_key = None, None
    for v in m.voices:
        try:
            evs, tins = voice_events(v, bar_ticks)
        except Skip:
            continue
        sounding = sum(e[0] for e in evs if not e[2] & FLAG_REST)
        attacks = sum(1 for e, t in zip(evs, tins) if not e[2] & FLAG_REST and not t)
        key = (sounding, attacks)
        if best_key is None or key > best_key:
            best, best_key = (evs, tins), key
    if best is None:
        raise Skip('no usable voice')
    # notes in the other voices that start with one of this voice's attacks sound with it
    evs, tins = best
    starts, pos = {}, 0
    for i, (e, t) in enumerate(zip(evs, tins)):
        if not e[2] & FLAG_REST and not t:
            starts[pos] = i
        pos += e[0]
    for v in m.voices:
        for n in v.notes:
            if n.duration.isGrace or n.quarterLength == 0:
                continue
            if n.tie is not None and n.tie.type in ('stop', 'continue'):
                continue
            i = starts.get(snap_ticks(n.offset))
            if i is None:
                continue
            extra = [p.midi for p in getattr(n, 'pitches', ()) if hasattr(p, 'midi')]
            have = evs[i][3] if isinstance(evs[i][3], list) else [evs[i][3]]
            merged = sorted(set(have) | set(extra))
            evs[i][3] = merged if len(merged) > 1 else merged[0]
    return evs, tins


import re
import string

def pretty_from_path(path, folder):
    """'beethoven/opus59no1/movement2.mxl' -> 'Op. 59 No. 1, mvt. 2'"""
    rel = path.split(os.sep + folder + os.sep, 1)[-1]
    parts = os.path.splitext(rel)[0].split(os.sep)
    out = []
    for part in parts:
        t = part
        t = re.sub(r'^bwv(.+)$', r'BWV \1', t, flags=re.I)
        t = re.sub(r'^opus(\d+)', r'Op. \1', t, flags=re.I)
        t = re.sub(r'no(\d+)', r' No. \1', t, flags=re.I)
        t = re.sub(r'^movement(\d+)$', r'mvt. \1', t, flags=re.I)
        t = re.sub(r'^k(\d+)$', r'K. \1', t, flags=re.I)
        t = t.replace('_', ' ').strip()
        out.append(t)
    return ', '.join(out)


def looks_like_filename(t):
    return bool(re.search(r'\.(mxl|xml|krn|abc|musicxml|mid)$', t, re.I)) or bool(re.match(r'^(bwv|movement|opus)\d', t, re.I))


def clean_title(t, folder):
    if any('\x80' <= ch <= '\x9f' for ch in t):
        try:
            t = t.encode('latin-1').decode('cp437')  # Essen files are DOS-encoded
        except UnicodeError:
            pass
    t = t.strip().rstrip('.').strip()
    if t.isupper() and len(t) > 3 and not re.match(r'^(BWV|K\. |OP\. )', t):
        t = string.capwords(t.lower())
    return t


def score_title(s, path, folder):
    md = s.metadata
    title = None
    if md is not None:
        title = md.title or md.movementName
        if title and (title.strip().isdigit() or looks_like_filename(title.strip())):
            title = None
    fallback = pretty_from_path(path, folder)
    if not title:
        title = ('Chorale ' + fallback) if folder == 'bach' else fallback
    elif folder in ('beethoven', 'mozart', 'haydn') and re.search(r'\b(op|k|movement|score|quartet)\b', title, re.I):
        title = fallback
    elif folder in ('bach', 'beethoven', 'mozart', 'haydn') and fallback not in title:
        title = f'{clean_title(title, folder)} ({fallback})'
    composer = md.composer if md is not None and md.composer else None
    if folder == 'bach':
        composer = 'J. S. Bach'
    return clean_title(title, folder), composer


def iter_scores(path):
    from music21 import converter, stream
    obj = converter.parse(path)
    if isinstance(obj, stream.Opus):
        yield from obj.scores
    else:
        yield obj


def parts_of(score, folder):
    parts = list(score.parts) if score.parts else [score]
    if folder in ('joplin', 'joplinrags'):
        parts = parts[:1]  # right hand only
    out = []
    for i, p in enumerate(parts):
        name = (p.partName or '').strip()
        if folder == 'bach':
            if i not in (0, len(parts) - 1):
                continue
            name = name or ('Soprano' if i == 0 else 'Bass')
        out.append((p, name))
    return out


def abc_source_years(path):
    """X number -> year printed in that tune's S: (source) line, if any. music21 drops S:."""
    years, x = {}, None
    try:
        with open(path, encoding='latin-1') as f:
            for line in f:
                if line.startswith('X:'):
                    x = line[2:].strip()
                elif line.startswith('S:') and x is not None:
                    m = re.search(r'\b(1[5-9]\d\d)\b', line)
                    if m:
                        years[x] = m.group(1)
    except OSError:
        pass
    return years


def score_tempos(s):
    """A function: offset (quarter lengths) -> the quarter-note BPM marked in force there, or None.
    Only metronome marks with a written number count; a tempo word alone ('Allegro') gives nothing."""
    from music21 import tempo
    marks = []
    for mm in s.recurse().getElementsByClass(tempo.MetronomeMark):
        if mm.number is None or mm.numberImplicit:
            continue
        try:
            q = mm.getQuarterBPM()
            off = float(mm.getOffsetInHierarchy(s))
        except Exception:
            continue
        if q and 20 <= q <= 500:
            marks.append((off, q))
    marks.sort()

    def at(off):
        cur = None
        for o, q in marks:
            if o <= off + 1e-6:
                cur = q
        return cur
    return at


def enc_pitch(p):
    """Pitches as hex MIDI numbers: '3c' for one note, '(3c4043)' for a chord."""
    if isinstance(p, (list, tuple)):
        return '(' + ''.join(f'{int(x):02x}' for x in p) + ')' if len(p) > 1 else f'{int(p[0]):02x}'
    return f'{int(p):02x}'


def process_parker(path):
    """One Charlie Parker transcription (tools/parker.py): the concert-pitch first staff only,
    each excerpt labeled head, solo or the other player from the score's text marks."""
    import parker
    try:
        s = next(iter_scores(path))
        md = s.metadata
        c = parker.credits(md.title if md else '', md.composer if md else '')
        c['title'] = re.sub(r'\s+No\.\s*(\d)$', r' (No. \1)', c['title'])
        # the concert-pitch staff with the most notes (counterpoint heads put the second line on its
        # own staff; the bass-clef trombone copy is skipped)
        concert = [p for p in s.parts if p.getInstrument().transposition is None
                   and 'trombone' not in (p.getInstrument().instrumentName or '').lower()] or list(s.parts[:1])
        part = max(concert, key=lambda p: len(p.recurse().notes))
        labels = parker.section_labels(part)
        tempo_at = score_tempos(s)
        bar_offsets = {m.number: float(m.offset) for m in part.getElementsByClass('Measure')}
        out = []
        for w in extract_part(part, 'Alto sax', c['title'], c['composer'], parker.FOLDER):
            bar = w['src']['bar']
            w['src'].update({'part': labels.get(bar, 'Alto sax'), 'origin': c['origin'], 'date': c['date'],
                             'note': c['note'], 'file': os.path.basename(path), 'year': c['year']})
            off = bar_offsets.get(bar)
            w['tempo'] = tempo_at(off) if off is not None else None
            out.append(w)
        return out
    except Exception as e:
        print(f'parker: {os.path.basename(path)}: {e}', file=sys.stderr)
        return []


def process_mvb(path):
    """One of Michael Van Bebber's transcriptions (tools/mvb.py): every staff with its own line,
    labeled by instrument; transposing staves are read at sounding pitch."""
    import mvb
    if os.path.splitext(os.path.basename(path))[0] in mvb.EXCLUDE_FILES:
        return []
    try:
        s = next(iter_scores(path))
        md = s.metadata
        c = mvb.credits(path, md.title if md else '', md.composer if md else '')
        tempo_at = score_tempos(s)
        parts = [p for p in s.parts if any(not n.isRest for n in p.recurse().notes)]
        labels = mvb.staff_labels(parts, c)
        out, seen = [], []
        for part, label in zip(parts, labels):
            # the same line in another transposition: same rhythm bar for bar
            sig = []
            for m in part.getElementsByClass('Measure'):
                sig.append(tuple((n.quarterLength, n.isRest) for n in m.recurse().notesAndRests if n.quarterLength))
            if any(sum(a == b for a, b in zip(sig, t)) >= 0.9 * max(len(sig), 1) for t in seen):
                continue
            seen.append(sig)
            if part.getInstrument().transposition is not None:
                try:
                    part = part.toSoundingPitch()
                except Exception:
                    pass
            bar_offsets = {m.number: float(m.offset) for m in part.getElementsByClass('Measure')}
            for w in extract_part(part, label, c['title'], c['composer'], c['folder']):
                bar = w['src']['bar']
                w['src'].update({'origin': c['origin'], 'date': c['date'], 'note': c['note'],
                                 'file': os.path.basename(path), 'year': c['year']})
                off = bar_offsets.get(bar)
                w['tempo'] = tempo_at(off) if off is not None else None
                out.append(w)
        return out
    except Exception as e:
        print(f'mvb: {os.path.basename(path)}: {e}', file=sys.stderr)
        return []


def process_file(args):
    path, folder = args[0], args[1]
    meta = args[2] if len(args) > 2 else None
    results = []
    try:
        scores = list(iter_scores(path))
    except Exception:
        return results
    s_years = abc_source_years(path) if path.endswith('.abc') else {}
    fname = os.path.splitext(os.path.basename(path))[0]
    for s in scores:
        try:
            tempo_at = score_tempos(s)
            title, composer = score_title(s, path, folder)
            if meta:
                title, composer = meta['title'], meta['composer']
            md = s.metadata
            extra = {'file': fname, 'origin': (meta or {}).get('origin'), 'date': (meta or {}).get('date'),
                     'origin_raw': clean_title(md.localeOfComposition, folder) if md is not None and md.localeOfComposition else None,
                     's_year': s_years.get(str(md.number)) if md is not None and md.number is not None else None}
            for part, pname in parts_of(s, folder):
                bar_offsets = {m.number: float(m.offset) for m in part.getElementsByClass('Measure')}
                for w in extract_part(part, pname, title, composer, folder):
                    w['src'].update(extra)
                    off = bar_offsets.get(w['src']['bar'])
                    w['tempo'] = tempo_at(off) if off is not None else None
                    results.append(w)
        except Exception:
            continue
    return results


def extract_part(part, pname, title, composer, folder):
    from music21 import meter
    bars = []  # (number, meter_str, events, tie_ins) or None
    ts = None
    for m in part.getElementsByClass('Measure'):
        t = m.timeSignature
        if t is None:
            found = m.getContextByClass(meter.TimeSignature)
            t = found if found is not None else ts
        ts = t
        if ts is None:
            bars.append(None)
            continue
        msig = ts.ratioString
        bar_ticks = int(Fraction(ts.barDuration.quarterLength) * TPQ)
        try:
            evs, tins = measure_events(m, bar_ticks)
            bars.append((m.number, msig, evs, tins))
        except Exception:
            bars.append(None)
    return windows_from_bars(bars, {'title': title, 'composer': composer, 'folder': folder, 'part': pname})


def windows_from_bars(bars, src):
    """Cut a line's bars [(number, meter, events, tie_ins) or None] into 2- and 4-bar windows."""
    out = []
    for size in (2, 4):
        for start in range(0, len(bars) - size + 1, size):
            win = bars[start:start + size]
            if any(b is None for b in win):
                continue
            msig = win[0][1]
            if msig not in METERS or any(b[1] != msig for b in win):
                continue
            if win[0][3][0]:
                continue  # starts mid-tie
            # ties within window must land on a note
            measures = [[list(e) for e in b[2]] for b in win]
            flat = [e for mm in measures for e in mm]
            tins = [t for b in win for t in b[3]]
            ok = True
            for k, e in enumerate(flat):
                if e[2] & FLAG_TIE:
                    if k + 1 >= len(flat):
                        e[2] &= ~FLAG_TIE
                    elif not tins[k + 1] or (flat[k + 1][2] & FLAG_REST):
                        e[2] &= ~FLAG_TIE
                elif k + 1 < len(flat) and tins[k + 1] and not (flat[k + 1][2] & FLAG_REST):
                    ok = False  # dangling tie stop
            if not ok:
                continue
            onsets = sum(1 for k, e in enumerate(flat)
                         if not e[2] & FLAG_REST and not (k and flat[k - 1][2] & FLAG_TIE))
            if onsets < size * 1.5:
                continue
            out.append({
                'meter': msig, 'bars': size, 'measures': measures,
                'src': dict(src, bar=win[0][0]),
            })
    return out


def complexity(meter_str, measures):
    """A finer reading-difficulty score than the five levels, for sorting: how varied the values are, how
    often they change, syncopation, offbeat attacks and rests, ties, triplets (most of all mixed with
    sixteenths), with repeated bars counting less. Returns an int (score x 10)."""
    num, den = map(int, meter_str.split('/'))
    compound = den == 8 and num % 3 == 0 and num > 3
    beat = TPQ * 4 // den * (3 if compound else 1)
    half = beat // (3 if compound else 2)
    bar = TPQ * 4 // den * num
    flat = [e[:3] for m in measures for e in m]
    # tokens: sounding notes (ties merged) and rests
    toks, pos, k = [], 0, 0
    while k < len(flat):
        t, code, fl = flat[k]
        start = pos
        L = t
        while not fl & FLAG_REST and fl & FLAG_TIE and k + 1 < len(flat):
            k += 1
            pos += t
            t, code2, fl = flat[k]
            L += t
        toks.append((start, L, bool(flat[k][2] & FLAG_REST) if L == t else False, bool(fl & FLAG_TRIP)))
        pos += t
        k += 1
    values = [(L, r) for _, L, r, _ in toks]
    distinct = len(set(values))
    changes = sum(1 for a, b in zip(values, values[1:]) if a != b)
    sync8 = sync16 = off16 = offrests = 0
    for start, L, rest, trip in toks:
        p = start % beat
        if rest:
            offrests += p != 0
            continue
        if trip:
            continue
        if p and p % half:
            off16 += 1
            sync16 += p + L > beat
        elif p:
            sync8 += p + L > beat
    ties = sum(1 for t, code, fl in flat if fl & FLAG_TIE and not fl & FLAG_REST)
    trip_groups = sum(1 for t, code, fl in flat if fl & FLAG_TSTART)
    bars = len(measures)
    mixed = 0
    for m in measures:
        has_trip = any(e[2] & FLAG_TRIP for e in m)
        has16 = any(not e[2] & FLAG_TRIP and e[1].startswith(('16', '32')) for e in m)
        mixed += has_trip and has16
    keys = [json.dumps([e[:3] for e in m]) for m in measures]
    repeats = sum(1 for a, b in zip(keys, keys[1:]) if a == b) / max(1, bars - 1)
    per_bar = (changes + 3 * sync16 + 2 * sync8 + off16 + 1.5 * trip_groups + 2 * mixed + offrests + ties) / bars
    score = (per_bar + 1.5 * distinct) * (1 - 0.4 * repeats)
    return int(round(score * 10))


def difficulty(meter_str, measures):
    """1 = beats only ... 5 = triplets / 32nds / 16th syncopation."""
    num, den = map(int, meter_str.split('/'))
    compound = den == 8 and num % 3 == 0 and num > 3
    beat = TPQ * 4 // den * (3 if compound else 1)
    half = beat // (3 if compound else 2)
    flat = [e for m in measures for e in m]
    bar = TPQ * 4 // den * num
    pos, trip, has32, grid, sync, dotq, offrest, ties = 0, False, False, 1, False, False, False, False
    for k, (t, code, fl) in enumerate(e[:3] for e in flat):
        p = pos % bar
        onset = not fl & FLAG_REST and not (k and flat[k - 1][2] & FLAG_TIE)
        if fl & FLAG_TRIP:
            trip = True
        if code.startswith('32'):
            has32 = True
        if fl & FLAG_TIE:
            ties = True
        if onset:
            if p % beat == 0:
                g = 1
            elif p % half == 0:
                g = 2
            else:
                g = 4
            grid = max(grid, g)
            # sounding length including ties
            L, j = t, k
            while flat[j][2] & FLAG_TIE and j + 1 < len(flat):
                j += 1
                L += flat[j][0]
            if p % beat and (p % beat) + L > beat:
                sync = True if g == 2 else 'fine'
            if not compound and code in ('qd',) and p % beat == 0:
                dotq = True
            if g >= 2 and k and flat[k - 1][2] & FLAG_REST:
                offrest = True
        pos += t
    if trip or has32 or sync == 'fine' or (grid == 4 and (sync or ties)):
        return 5
    if grid == 4:
        return 4
    if grid == 2 and (sync or dotq or offrest or ties):
        return 3
    if grid == 2:
        return 2
    return 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', 'data', 'rhythms.js'))
    ap.add_argument('--jobs', type=int, default=os.cpu_count())
    ap.add_argument('--max-sources', type=int, default=3)
    ap.add_argument('--cache', default=os.path.join(os.path.dirname(__file__), '.windows-cache.pkl'),
                    help='parsed windows are cached here; delete it to re-parse the corpus')
    ap.add_argument('--joplin', metavar='DIR',
                    help='clone of https://github.com/craigsapp/joplin (CC BY-NC-SA 4.0); adds all of Joplin\'s rags')
    ap.add_argument('--openewld', metavar='DIR',
                    help='clone of https://github.com/00sapo/OpenEWLD; adds US-public-domain popular songs')
    ap.add_argument('--openewld-all', action='store_true',
                    help='with --openewld: keep every song, not only US public domain (requires permission)')
    ap.add_argument('--parker', metavar='DIR',
                    help='MusicXML exports of Michael Van Bebber\'s Charlie Parker transcriptions (used with permission)')
    ap.add_argument('--mvb', metavar='DIR',
                    help="MusicXML exports of Michael Van Bebber's transcriptions (used with permission)")
    ap.add_argument('--wjd', metavar='DIR',
                    help="jazzodata's data/ folder (git clone https://github.com/klausfrieler/jazzodata); adds jazz solos")
    args = ap.parse_args()
    import pickle

    from music21 import corpus
    import origins
    jobs = []
    for p in corpus.getPaths():
        parts = str(p).split(os.sep)
        folder = next((f for f in COLLECTIONS if f in parts), None)
        if folder:
            jobs.append((str(p), folder))
    # some pieces ship as both .krn and .mxl: keep the .mxl
    have = {os.path.splitext(j[0])[0] for j in jobs if j[0].endswith('.mxl')}
    jobs = [j for j in jobs if not (j[0].endswith('.krn') and os.path.splitext(j[0])[0] in have)]
    print(f'{len(jobs)} files', file=sys.stderr)

    t0 = time.time()
    if os.path.exists(args.cache):
        with open(args.cache, 'rb') as f:
            found = pickle.load(f)
        print(f'loaded {len(found)} cached windows', file=sys.stderr)
    else:
        found = []
        with Pool(args.jobs) as pool:
            for i, res in enumerate(pool.imap_unordered(process_file, sorted(jobs), chunksize=2)):
                found.extend(res)
                if i % 100 == 0:
                    print(f'  {i}/{len(jobs)} files, {len(found)} windows, {time.time()-t0:.0f}s', file=sys.stderr)
        with open(args.cache, 'wb') as f:
            pickle.dump(found, f)

    extra_jobs = []
    if args.joplin or args.openewld:
        import extra_sources
        if args.joplin:
            extra_jobs += list(extra_sources.joplin_jobs(args.joplin))
            found = [w for w in found if w['src']['folder'] != 'joplin']  # the same Maple Leaf Rag, better edition
        if args.openewld:
            extra_jobs += list(extra_sources.openewld_jobs(args.openewld, us_pd_only=not args.openewld_all))
            print('openewld: kept %d songs, skipped %d' % extra_sources.openewld_jobs.counts, file=sys.stderr)
    if extra_jobs:
        n0 = len(found)
        with Pool(args.jobs) as pool:
            for res in pool.imap_unordered(process_file, extra_jobs, chunksize=2):
                found.extend(res)
        print(f'extra sources: {len(found) - n0} windows from {len(extra_jobs)} files', file=sys.stderr)

    import latin  # standard Latin patterns, written out in tools/latin.py
    lw = latin.latin_windows()
    found.extend(lw)
    print(f'latin: {len(lw)} windows from {len(latin.PATTERNS)} patterns', file=sys.stderr)

    if args.wjd:
        import wjd
        n0 = len(found)
        for src, bars in wjd.wjd_bars(args.wjd, (FLAG_REST, FLAG_TIE, FLAG_TRIP)):
            clean = []
            for b in bars:
                try:
                    if b:
                        fix_triplets(b[2])
                    clean.append(b)
                except Skip:
                    clean.append(None)
            for w in windows_from_bars(clean, src):
                w['tempo'] = src.get('tempo')
                found.append(w)
        print(f'jazz: {len(found) - n0} windows from the Weimar Jazz Database', file=sys.stderr)

    # Michael Van Bebber's Charlie Parker transcriptions: parsed with --parker, otherwise read from the
    # processed excerpts saved by the last parse (so a rebuild doesn't need the Sibelius exports)
    import parker
    parker_cache = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'parker-windows.json')
    book = []
    if args.parker:
        import glob
        paths = sorted(glob.glob(os.path.join(args.parker, '*.musicxml')) + glob.glob(os.path.join(args.parker, '*.mxl')))
        with Pool(args.jobs) as pool:
            for res in pool.imap_unordered(process_parker, paths):
                book.extend(res)
        book.sort(key=lambda w: (w['src']['title'], w['src']['bar'], w['bars']))
        with open(parker_cache, 'w') as f:
            json.dump(book, f, separators=(',', ':'), ensure_ascii=False)
        print(f'parker: parsed {len(paths)} transcriptions, saved {parker_cache}', file=sys.stderr)
    elif os.path.exists(parker_cache):
        with open(parker_cache) as f:
            book = json.load(f)
    # Michael Van Bebber's other transcriptions (jazz and songs), the same way
    mvb_cache = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mvb-windows.json')
    mine = []
    if args.mvb:
        import glob
        paths = sorted(glob.glob(os.path.join(args.mvb, '**', '*.musicxml'), recursive=True)
                       + glob.glob(os.path.join(args.mvb, '**', '*.mxl'), recursive=True))
        with Pool(args.jobs) as pool:
            for res in pool.imap_unordered(process_mvb, paths):
                mine.extend(res)
        mine.sort(key=lambda w: (w['src']['file'], w['src']['part'], w['src']['bar'], w['bars']))
        with open(mvb_cache, 'w') as f:
            json.dump(mine, f, separators=(',', ':'), ensure_ascii=False)
        print(f'mvb: parsed {len(paths)} transcriptions, saved {mvb_cache}', file=sys.stderr)
    elif os.path.exists(mvb_cache):
        with open(mvb_cache) as f:
            mine = json.load(f)
    import mvb
    mine = [w for w in mine if os.path.splitext(w['src'].get('file', ''))[0] not in mvb.EXCLUDE_FILES]
    book = book + mine
    if book:
        # the same recorded solo from the Weimar Jazz Database gives way to the owner's transcription
        tunes = {}
        for w in book:  # only solo transcriptions (a lead sheet is not the recorded solo)
            if w['src']['folder'] == parker.FOLDER or w['src']['part'] == 'Solo':
                tunes.setdefault((parker.norm_title(w['src']['title']), w['src']['composer']), set()).add(w['src'].get('year'))
        def replaced(w):
            s = w['src']
            if s['folder'] != 'wjd':
                return False
            years = tunes.get((parker.norm_title(re.sub(r',\s*solo \d+$', '', s['title'])), s['composer']))
            m = re.search(r'(19\d\d)', s.get('date') or '')
            return years is not None and (None in years or (m and int(m.group(1)) in years))
        gone = sorted({w['src']['title'] for w in found if replaced(w)})
        found = [w for w in found if not replaced(w)]
        found.extend(book)
        print(f'parker + mvb: {len(book)} windows; replace WJD solos: {", ".join(gone)}', file=sys.stderr)

    # a triplet group must start on its own grid (a beat for triplet eighths, half a beat for triplet
    # sixteenths, half a bar for triplet quarters); one that starts off the beat and runs into the next
    # beat can't be written cleanly, so drop the window (checked here so cached windows are covered)
    def triplets_aligned(w):
        for meas in w['measures']:
            pos = start = 0
            for e in meas:
                if e[2] & FLAG_TSTART:
                    start = pos
                pos += e[0]
                if e[2] & FLAG_TSTOP and start % (pos - start):
                    return False
        return True
    n0 = len(found)
    found = [w for w in found if triplets_aligned(w)]
    print(f'dropped {n0 - len(found)} windows with off-beat triplet groups', file=sys.stderr)

    # final tidy-up of names (cheap, so it runs on cached windows too)
    COMPOSERS = {'beethoven': 'Ludwig van Beethoven', 'mozart': 'Wolfgang Amadeus Mozart', 'haydn': 'Joseph Haydn',
                 'schubert': 'Franz Schubert', 'chopin': 'Frédéric Chopin', 'joplin': 'Scott Joplin',
                 'handel': 'George Frideric Handel', 'corelli': 'Arcangelo Corelli', 'cpebach': 'C. P. E. Bach',
                 'weber': 'Carl Maria von Weber', 'verdi': 'Giuseppe Verdi', 'beach': 'Amy Beach',
                 'monteverdi': 'Claudio Monteverdi', 'schumann_robert': 'Robert Schumann',
                 'schumann_clara': 'Clara Schumann', 'bach': 'J. S. Bach', 'liliuokalani': 'Liliʻuokalani',
                 'johnson_j_r': 'J. Rosamond Johnson'}
    for w in found:
        s = w['src']
        m = re.match(r'^\S*_\S*\s*\((.+)\)$', s['title'])
        if m:
            s['title'] = m.group(1)
        # Essen's DOS encoding leaves 'á' where German has 'ß'
        if s['folder'] == 'essenFolksong' and 'á' in s['title'] and re.search(r'\b(der|die|das|und|ein|ich|sch\w*)\b|sch', s['title'], re.I):
            s['title'] = s['title'].replace('á', 'ß')
        if s['folder'] == 'essenFolksong':  # drop source page references: '(273), S. 583', '(Band 1), S. 11'
            s['title'] = re.sub(r'\s*\((?:Band \d+|[\d\-]+[a-z]?)\)', '', s['title'])
            s['title'] = re.sub(r',\s*S\.\s*\d+\w*\s*$', '', s['title']).strip() or s['title']
        if s['title'].islower() and s['folder'] != 'latin':
            s['title'] = string.capwords(s['title'])
        if s['folder'] in COMPOSERS:
            s['composer'] = COMPOSERS[s['folder']]

    # Compound meters: a beat of rest is one dotted rest (a dotted quarter in 6/8, 9/8 and 12/8, a dotted
    # half in 6/4), not a quarter rest and an eighth rest
    def merge_beat_rests(meter_str, measures):
        num, den = map(int, meter_str.split('/'))
        if not (num % 3 == 0 and num > 3):
            return 0
        beat = TPQ * 4 // den * 3
        code = {36: 'qd', 72: 'hd'}.get(beat)
        if not code:
            return 0
        changed = 0
        for m in measures:
            if len(m) == 1:
                continue  # a whole-bar rest stays as it is
            out, pos, i = [], 0, 0
            while i < len(m):
                e = m[i]
                if pos % beat == 0 and e[2] & FLAG_REST and not e[2] & FLAG_TRIP:
                    j, acc = i, 0
                    while j < len(m) and m[j][2] & FLAG_REST and not m[j][2] & FLAG_TRIP and acc < beat:
                        acc += m[j][0]
                        j += 1
                    if acc == beat and j - i > 1:
                        out.append([beat, code, FLAG_REST] + ([0] if len(e) > 3 else []))
                        pos += beat
                        i = j
                        changed += 1
                        continue
                out.append(e)
                pos += e[0]
                i += 1
            m[:] = out
        return changed
    n_merged = sum(merge_beat_rests(w['meter'], w['measures']) for w in found if not w.get('fixed'))
    print(f'compound meters: {n_merged} beats of rest written as one dotted rest', file=sys.stderr)

    # dedupe by rhythm (pitches ignored)
    uniq = {}
    sources = []
    src_index = {}
    for w in found:
        s = w['src']
        # Latin patterns stay their own entries (at their natural length); they're linked to matching
        # excerpts below by where the notes fall
        key = ('latin', s['title']) if w.get('fixed') else (w['meter'], json.dumps([[e[:3] for e in m] for m in w['measures']]))
        skey = (s['title'], s['composer'], s['folder'])
        if skey not in src_index:
            src_index[skey] = len(sources)
            origin, date = origins.origin_and_date(s)
            sources.append([s['title'], s['composer'] or '', s['folder'], origin or '', date or '', s.get('note') or ''])
        occ = [src_index[skey], s['part'], s['bar'], [[e[3] for e in m] for m in w['measures']]]
        if w.get('tempo'):
            occ.append(int(round(w['tempo'])))  # quarter notes per minute: marked in the score, or the recording's average
        if key not in uniq:
            uniq[key] = {'m': w['meter'], 'b': w['bars'],
                         'r': [[e[:3] for e in m] for m in w['measures']],
                         'n': 0, 'o': []}
            if w.get('fixed'):
                uniq[key]['f'] = 1  # natural length: shown whatever Length is set to
        u = uniq[key]
        # a rhythm counts once per piece: its first passage there stands for the piece (repeats,
        # recapitulations and other parts playing the same rhythm aren't new occurrences)
        if occ[0] in u.setdefault('seen', set()):
            continue
        u['seen'].add(occ[0])
        u['n'] += 1
        u.setdefault('all', []).append(occ)  # every occurrence, for the lazily loaded data/occurrences.js
        if len(u['o']) < args.max_sources and all(o[0] != occ[0] for o in u['o']):
            u['o'].append(occ)

    # 'Also found in' for Latin patterns: corpus excerpts whose attacks fall in the same places,
    # however they're notated (a 1-bar pattern is compared with 2-bar excerpts, repeated)
    by_onsets = {}
    for k, u in uniq.items():
        if not u.get('f') and u['b'] == 2:
            by_onsets.setdefault(latin.onset_signature(u['m'], u['r']), []).append(u)
    for k, u in uniq.items():
        if u.get('f'):
            for other in sorted(by_onsets.get(latin.onset_signature(u['m'], u['r']), []), key=lambda x: -x['n']):
                u['all'] = u.get('all', []) + [o for o in other['all'] if o[0] not in {q[0] for q in u['all']}]
                u['n'] = len(u['all'])
                for o in other['o']:
                    if len(u['o']) < args.max_sources and all(o[0] != q[0] for q in u['o']):
                        u['o'].append([o[0], o[1], o[2], [list(m) for m in o[3]]] + o[4:])  # a copy: encoded separately below

    items = []
    for u in uniq.values():
        u['l'] = difficulty(u['m'], u['r'])
        u['d'] = complexity(u['m'], u['r'])
        items.append(u)
    items.sort(key=lambda u: (u['b'], u['l'], u['m'], -u['n']))

    # Rhythm families: the same rhythm in proportion, however it's written (2/4 '8 8 q' is 2/2 'q q h';
    # four bars of 2/4 can be two of 4/4). Key: where each attack and each rest starts, as a fraction
    # of the whole excerpt, ties merged. A 1-bar Latin pattern is compared as two bars, repeated.
    def prop_key(u):
        ms = u['r'] * (2 if u.get('f') and u['b'] == 1 else 1)
        flat = [e for m in ms for e in m]
        total = sum(e[0] for e in flat)
        marks, pos, prev_rest = [], 0, False
        for i, e in enumerate(flat):
            rest = bool(e[2] & FLAG_REST)
            tied_in = i and flat[i - 1][2] & FLAG_TIE and not rest
            if rest and not prev_rest:
                marks.append(('r', Fraction(pos, total)))
            elif not rest and not tied_in:
                marks.append(('a', Fraction(pos, total)))
            prev_rest = rest
            pos += e[0]
        return tuple(marks)
    fam = {}
    for i, u in enumerate(items):
        fam.setdefault(prop_key(u), []).append(i)
    n_fam = 0
    for idxs in fam.values():
        if len(idxs) > 1:
            for i in idxs:
                items[i]['g'] = n_fam
            n_fam += 1
    for idxs in fam.values():
        if len(idxs) > 1:
            pieces = {o[0] for i in idxs for o in items[i]['all']}
            for i in idxs:
                items[i]['gn'] = len(pieces)  # pieces using this rhythm in any spelling
    print(f'{n_fam} rhythm families group {sum(len(v) for v in fam.values() if len(v) > 1)} rhythms written more than one way', file=sys.stderr)

    # every occurrence beyond the few kept in rhythms.js, loaded only when someone asks to see them all
    part_ix, parts = {}, []
    def pidx(name):
        name = name or ''
        if name not in part_ix:
            part_ix[name] = len(parts); parts.append(name)
        return part_ix[name]
    from collections import Counter
    extra = []
    for u in items:
        kept = Counter((o[0], o[1], o[2]) for o in u['o'])  # each kept occurrence is skipped once
        rows = []
        done = set()
        u.pop('seen', None)
        for o in u.pop('all', []):
            k = (o[0], o[1], o[2])
            if o[0] in done:
                continue
            done.add(o[0])
            if kept[k]:
                kept[k] -= 1
                continue
            row = [o[0], pidx(o[1]), o[2], [''.join(enc_pitch(p) for p in m) for m in o[3]]]
            if len(o) > 4:
                row.append(o[4])
            rows.append(row)
        extra.append(rows)
    # compact encoding: one string per measure, space-separated tokens
    # code + markers: r rest, ~ tied to next, t triplet, [ bracket start, ] bracket stop
    def enc_ev(e):
        t, code, fl = e
        return code + ''.join(c for bit, c in ((FLAG_REST, 'r'), (FLAG_TIE, '~'), (FLAG_TRIP, 't'),
                                                 (FLAG_TSTART, '['), (FLAG_TSTOP, ']')) if fl & bit)
    for u in items:
        u['r'] = [' '.join(enc_ev(e) for e in m) for m in u['r']]
        for o in u['o']:  # pitches as 2-digit hex MIDI numbers, one string per measure
            o[3] = [''.join(enc_pitch(p) for p in m) for m in o[3]]
    occ_path = os.path.join(os.path.dirname(os.path.abspath(args.out)), 'occurrences.js')
    with open(occ_path, 'w') as f:
        f.write('window.RHYTHM_OCC=')
        json.dump({'parts': parts, 'o': extra}, f, separators=(',', ':'), ensure_ascii=False)
        f.write(';\n')
    print(f'wrote {occ_path} ({os.path.getsize(occ_path)/1e6:.1f} MB)', file=sys.stderr)

    import hashlib
    with open(occ_path, 'rb') as fh:
        occ_url = 'data/occurrences.js?v=' + hashlib.sha1(fh.read()).hexdigest()[:10]
    data = {
        'version': 3, 'tpq': TPQ,
        'occurrences': occ_url,
        'collections': {k: dict({'label': v[0], 'genre': v[1]}, **COLLECTION_EXTRA.get(k, {}))
                        for k, v in COLLECTIONS.items()
                        if any(src[2] == k for src in sources)},  # only collections with pieces in this build
        'sources': sources,
        'rhythms': items,
    }
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, 'w') as f:
        f.write('window.RHYTHM_DATA=')
        json.dump(data, f, separators=(',', ':'), ensure_ascii=False)
        f.write(';\n')

    # Stamp index.html's link to the data with a fingerprint of its contents, so browsers can't
    # keep using a cached older corpus after a rebuild.
    import hashlib
    index = os.path.join(os.path.dirname(os.path.abspath(args.out)), '..', 'index.html')
    if os.path.exists(index) and os.path.basename(args.out) == 'rhythms.js':
        with open(args.out, 'rb') as fh:
            digest = hashlib.sha1(fh.read()).hexdigest()[:10]
        with open(index, encoding='utf-8') as fh:
            html = fh.read()
        html2 = re.sub(r'data/rhythms\.js(\?v=[^"]*)?"', f'data/rhythms.js?v={digest}"', html)
        if html2 != html:
            with open(index, 'w', encoding='utf-8') as fh:
                fh.write(html2)
        print(f'index.html now loads data/rhythms.js?v={digest}', file=sys.stderr)

    from collections import Counter
    print(f'{len(found)} windows -> {len(items)} unique rhythms from {len(sources)} pieces', file=sys.stderr)
    print('by level:', sorted(Counter((u["b"], u["l"]) for u in items).items()), file=sys.stderr)
    print('by meter:', Counter(u['m'] for u in items).most_common(), file=sys.stderr)
    print(f'wrote {args.out} ({os.path.getsize(args.out)/1e6:.1f} MB) in {time.time()-t0:.0f}s', file=sys.stderr)


if __name__ == '__main__':
    main()
