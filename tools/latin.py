"""Standard Latin rhythms: the traditional patterns every Latin musician learns.

Unlike the rest of the corpus these aren't excerpts of single recordings; each is the pattern
as it is conventionally notated. Measures use the app's compact encoding:
  w h q 8 16 (whole..sixteenth), d = dot, r = rest, ~ = tied to the next note.
Each pattern gives two bars; the 4-bar exercise plays them twice.
"""

TICKS = {'w': 96, 'h': 48, 'q': 24, '8': 12, '16': 6, '32': 3}
FLAG_REST, FLAG_TIE = 1, 2

# name, meter, two measures, instrument, origin, date label, pitches (cycled), note
PATTERNS = [
    ('Son clave (3-2)', '4/4', ['qd qd q', 'qr q q qr'], 'Claves', 'Cuba', 'traditional', [84],
     'The rhythmic key of son, salsa and mambo: the 3 side, then the 2 side.'),
    ('Son clave (2-3)', '4/4', ['qr q q qr', 'qd qd q'], 'Claves', 'Cuba', 'traditional', [84],
     'Son clave starting from its 2 side.'),
    ('Rumba clave (3-2)', '4/4', ['qd qd 8r 8', 'qr q q qr'], 'Claves', 'Cuba', 'traditional', [84],
     'Like son clave, but the third stroke is pushed to the and of 4.'),
    ('Rumba clave (2-3)', '4/4', ['qr q q qr', 'qd qd 8r 8'], 'Claves', 'Cuba', 'traditional', [84],
     'Rumba clave starting from its 2 side.'),
    ('Bossa nova clave', '4/4', ['qd qd q', 'qr qd qd'], 'Rim click', 'Brazil', 'late 1950s', [76],
     'The son clave with its last stroke moved to the and of 3.'),
    ('Tresillo', '4/4', ['qd qd q', 'qd qd q'], 'Bass, bell', 'Cuba', 'traditional', [43, 43, 50],
     'Three-three-two: the cell under habanera, tango, mambo and much of Latin music.'),
    ('Habanera', '2/4', ['8d 16 8 8', '8d 16 8 8'], 'Bass, piano left hand', 'Cuba', '19th century', [43, 43, 50, 55],
     'The dance rhythm of the habanera; also the basis of the Argentine tango.'),
    ('Cinquillo', '2/4', ['8 16 8 16 8', '8 16 8 16 8'], 'Güiro, piano', 'Cuba', '19th century', [72, 74, 72, 74, 72],
     'Five-stroke cell of the danzón and Caribbean contradanza.'),
    ('Cha-cha-chá', '4/4', ['q q 8 8 q', 'q q 8 8 q'], 'Güiro, dancers\' feet', 'Cuba', 'early 1950s', [67, 67, 69, 71, 72],
     '"One, two, cha-cha-chá" from Enrique Jorrín\'s danzón-chá.'),
    ('Tumbao', '4/4', ['qr 8r 8~ q q~', 'q 8r 8~ q q'], 'Bass', 'Cuba', 'traditional', [43, 43, 48, 48, 43],
     'The anticipated bass of son and salsa: on the and of 2 and on 4, tied over the bar.'),
    ('6/8 bell (bembé)', '12/8', ['q q 8 q q q 8', 'q q 8 q q q 8'], 'Bell', 'Cuba (West African roots)', 'traditional', [79],
     'The seven-stroke bell pattern of Afro-Cuban 6/8 and much West African music.'),
    ('6/8 clave', '12/8', ['q q qd q qd', 'q q qd q qd'], 'Claves', 'Cuba (West African roots)', 'traditional', [84],
     'Five strokes taken from the 6/8 bell pattern.'),
]


def decode(measure):
    """'qd 8~ qr' -> [[ticks, code, flags], ...]"""
    out = []
    for tok in measure.split():
        flags = 0
        if tok.endswith('~'):
            flags |= FLAG_TIE
            tok = tok[:-1]
        if tok.endswith('r'):
            flags |= FLAG_REST
            tok = tok[:-1]
        base = tok.rstrip('d')
        dots = len(tok) - len(base)
        ticks = TICKS[base] * (1.75 if dots == 2 else 1.5 if dots == 1 else 1)
        out.append([int(ticks), tok, flags])
    return out


def latin_windows():
    """Windows in build_corpus's format, validated bar by bar."""
    out = []
    for name, meter, bars, instrument, origin, date, pitches, note in PATTERNS:
        num, den = map(int, meter.split('/'))
        bar_ticks = num * 96 // den
        measures = [decode(m) for m in bars]
        for m, src in zip(measures, bars):
            if sum(e[0] for e in m) != bar_ticks:
                raise ValueError(f'{name}: "{src}" does not fill a {meter} bar')
        for size in (2, 4):
            ms = [[list(e) for e in m] for m in (measures * (size // 2))]
            flat = [e for m in ms for e in m]
            if flat[-1][2] & FLAG_TIE:
                flat[-1][2] &= ~FLAG_TIE  # nothing to tie into after the last bar
            # pitches cycle over the attacks; rests and tied continuations get 0 / the held pitch
            k, prev = 0, 0
            for i, e in enumerate(flat):
                if e[2] & FLAG_REST:
                    e.append(0)
                elif i and flat[i - 1][2] & FLAG_TIE:
                    e.append(prev)
                else:
                    prev = pitches[k % len(pitches)]; k += 1
                    e.append(prev)
            out.append({
                'meter': meter, 'bars': size, 'measures': ms,
                'src': {'title': name, 'composer': '', 'folder': 'latin', 'part': instrument, 'bar': None,
                        'origin': origin, 'date': date, 'note': note},
            })
    return out
