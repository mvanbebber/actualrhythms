"""Jazz rhythms from the Weimar Jazz Database (WJD).

The WJD (Jazzomat Research Project, HfM Weimar) holds 456 expert transcriptions
of improvised jazz solos, Louis Armstrong to Michael Brecker. Each note has its
bar, beat, and position within the beat (tatum out of `division`), so the
rhythm is already quantised the way a transcriber heard it. We read the
MIT-licensed export in Klaus Frieler's `jazzodata` R package
(https://github.com/klausfrieler/jazzodata, data/wjd_transforms.rda and
data/wjd_meta.rda) and spell each bar as notation:

* note lengths: legato to the next attack, except at phrase ends and before
  long gaps, where the transcribed duration class decides (eighth .. dotted half);
* every note is split at beat boundaries (tied), except whole-beat values that
  start on a strong beat (half, dotted half, whole) and dotted quarters;
* beats with 3 or 6 subdivisions become triplet eighths / sixteenths.

Bars with 5-, 7-, 9-tuplets or finer, or meters other than 3/4 and 4/4, are
skipped. Swing is not notated (straight eighths, as in any jazz chart).
"""
from fractions import Fraction

TPQ = 24
BEAT = TPQ
DUPLE = {24: 'q', 18: '8d', 12: '8', 9: '16d', 6: '16', 3: '32'}
TRIPLET = {16: 'q', 8: '8', 4: '16'}          # notated value, scaled by 2/3
OK_DIVISIONS = {1, 2, 3, 4, 6, 8}
INSTRUMENTS = {
    'ts': 'tenor sax', 'tp': 'trumpet', 'as': 'alto sax', 'tb': 'trombone', 'ss': 'soprano sax',
    'cl': 'clarinet', 'cor': 'cornet', 'vib': 'vibraphone', 'bs': 'baritone sax', 'p': 'piano',
    'g': 'guitar', 'bcl': 'bass clarinet', 'ts-c': 'C-melody sax',
}
# transcribed absolute duration class -> notated length used at phrase ends / before gaps
DURCLASS_TICKS = {-2: 12, -1: 12, 0: 24, 1: 48, 2: 72}


class BadBar(Exception):
    pass


def _grid(division):
    return BEAT // division


def _spell_piece(length, triplet):
    """Spell a length that sits inside one beat as a list of codes (tied)."""
    table = TRIPLET if triplet else DUPLE
    out, rest = [], length
    while rest > 0:
        best = max((t for t in table if t <= rest), default=None)
        if best is None:
            raise BadBar('unspellable')
        out.append((best, table[best]))
        rest -= best
    return out


def spell_bar(segments, beats, divisions, flags_rest, flag_tie, flag_trip):
    """segments: [(start, end, is_rest, pitch, tied_in, tied_out)] covering the bar.
    divisions: per-beat subdivision (1, 2, 3, 4, 6 or 8).
    Returns (events [[ticks, code, flags, midi]], tie_ins)."""
    bar = beats * BEAT
    strong_half = {0, 2} if beats == 4 else {0, 1}
    events, tie_ins = [], []

    def emit(ticks, code, rest, pitch, tied_in, trip, tie_out):
        fl = (flags_rest if rest else 0) | (flag_trip if trip else 0) | (flag_tie if tie_out and not rest else 0)
        events.append([ticks, code, fl, 0 if rest else pitch])
        tie_ins.append(bool(tied_in) and not rest)

    for start, end, rest, pitch, tied_in, tied_out in segments:
        # whole-bar rest
        if rest and start == 0 and end == bar:
            emit(bar, 'w' if beats == 4 else 'hd', True, 0, False, False, False)
            continue
        pieces = []  # (ticks, code, trip)
        pos = start
        while pos < end:
            b, off = divmod(pos, BEAT)
            if off == 0:
                span = end - pos
                beats_left = span // BEAT
                if beats_left >= 4 and b == 0 and beats == 4:
                    pieces.append((96, 'w', False)); pos += 96; continue
                if beats_left >= 3 and b == 0:
                    pieces.append((72, 'hd', False)); pos += 72; continue
                if beats_left >= 2 and b in strong_half and b + 2 <= beats:
                    pieces.append((48, 'h', False)); pos += 48; continue
                if span >= 36 and b in strong_half and not rest and divisions[b + 1] in (1, 2, 4, 8) \
                        and (span == 36 or (pos + 36) % BEAT != 0):
                    pieces.append((36, 'qd', False)); pos += 36; continue
            beat_end = (b + 1) * BEAT
            seg_end = min(end, beat_end)
            trip = divisions[b] in (3, 6)
            for ticks, code in _spell_piece(seg_end - pos, trip):
                pieces.append((ticks, code, trip))
            pos = seg_end
        for i, (ticks, code, trip) in enumerate(pieces):
            emit(ticks, code, rest, pitch, tied_in if i == 0 else True, trip, i < len(pieces) - 1 or tied_out)
    return events, tie_ins


def solo_bars(notes, beats, flags):
    """notes: dataframe rows of one solo sorted by onset. Returns {bar: (events, tie_ins)} or None per bar."""
    flags_rest, flag_tie, flag_trip = flags
    bar_len = beats * BEAT
    # absolute tick positions
    rows = []
    bad_bars = set()
    for r in notes.itertuples():
        d = int(r.division)
        if d not in OK_DIVISIONS or int(r.period) != beats:
            bad_bars.add(int(r.bar))
            continue
        pos = int(r.bar) * bar_len + (int(r.beat) - 1) * BEAT + (int(r.tatum) - 1) * _grid(d)
        rows.append((pos, int(r.pitch_raw), d, int(r.durclass_abs_raw), bool(r.phrase_end)))
    rows.sort()
    if not rows:
        return {}
    # beat divisions from attacks; collisions invalidate the bar
    div = {}
    seen = set()
    for pos, _, d, _, _ in rows:
        if pos in seen:
            bad_bars.add(pos // bar_len)
        seen.add(pos)
        bkey = pos // BEAT
        if div.get(bkey, d) != d:
            bad_bars.add(pos // bar_len)
        div[bkey] = d

    def snap(t, onset):
        g = _grid(div.get(t // BEAT, 2))
        s = (t // g) * g
        return s if s > onset else s + g

    # note spans
    spans = []
    for i, (pos, pitch, d, dc, pend) in enumerate(rows):
        nxt = rows[i + 1][0] if i + 1 < len(rows) else pos + 4 * BEAT
        ioi = nxt - pos
        if pend or ioi > 2 * BEAT or i + 1 == len(rows):
            end = min(nxt, pos + DURCLASS_TICKS.get(dc, 12))
            end = min(nxt, snap(end, pos))
        else:
            end = nxt
        spans.append((pos, end, pitch))
    first_bar = rows[0][0] // bar_len
    last_bar = rows[-1][0] // bar_len
    out = {}
    si = 0
    for bar in range(first_bar, last_bar + 1):
        if bar in bad_bars:
            out[bar] = None
            continue
        b0, b1 = bar * bar_len, (bar + 1) * bar_len
        segs, cur = [], b0
        for s, e, p in spans:
            if e <= b0 or s >= b1:
                continue
            s2, e2 = max(s, b0), min(e, b1)
            if s2 > cur:
                segs.append((cur - b0, s2 - b0, True, 0, False, False))
            segs.append((s2 - b0, e2 - b0, False, p, s < b0, e > b1))
            cur = e2
        if cur < b1:
            segs.append((cur - b0, b1 - b0, True, 0, False, False))
        divisions = [div.get(bar * beats + k, 2) for k in range(beats)] + [2]
        try:
            out[bar] = spell_bar(segs, beats, divisions, flags_rest, flag_tie, flag_trip)
        except BadBar:
            out[bar] = None
    return out


def wjd_bars(data_dir, flags):
    """Yield (src_info, bars) per solo, where bars is the list format build_corpus uses:
    [(bar_number, meter, events, tie_ins) or None, ...]."""
    import os
    import pyreadr
    t = pyreadr.read_r(os.path.join(data_dir, 'wjd_transforms.rda'))['wjd_transforms']
    meta = pyreadr.read_r(os.path.join(data_dir, 'wjd_meta.rda'))['wjd_meta']
    meta = meta.set_index('melid')
    for melid, notes in t.groupby('melid'):
        m = meta.loc[melid]
        beats = {'4/4': 4, '3/4': 3}.get(m['signature'])
        if not beats:
            continue
        notes = notes.sort_values('onset')
        bars = solo_bars(notes, beats, flags)
        if not bars:
            continue
        lst = [(b + 1, f'{beats}/4') + bars[b] if bars[b] else None for b in sorted(bars)]
        year = int(m['recordingyear']) if m['recordingyear'] == m['recordingyear'] else None
        inst = INSTRUMENTS.get(m['instrument'], m['instrument'])
        part = f"{inst} solo"
        title = m['title'] + (f" ({m['titleaddon']})" if m['titleaddon'] else '')
        if int(m['solopart']) > 1:
            title += f", solo {int(m['solopart'])}"
        tune_by = (m['composer'] or '').strip()
        yield {'title': title, 'composer': m['performer'], 'folder': 'wjd', 'part': part[0].upper() + part[1:],
               'date': f'recorded {year}' if year else None,
               'note': f'Tune by {tune_by}' if tune_by and tune_by != m['performer'] else None}, lst
