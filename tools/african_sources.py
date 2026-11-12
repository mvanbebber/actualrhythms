"""Gather the African drum sources into tools/african-drums.json (read by tools/african_drums.py).

Usage: python3 african_sources.py [--iemp DIR] [--gorilla DIR] [--djembel FILE] [--djembenet DIR]
Each option replaces that source's lines in the JSON and leaves the others as they are.

  --iemp DIR       the annotation CSVs of IEMP Malian Jembe (https://doi.org/10.17605/OSF.IO/M652X):
                   MJ_<take>_Onsets_Selected.csv and MJ_<take>_Metre.csv
  --gorilla DIR    rhythm pages saved from https://djembegorilla.com/library/ (Ensemble and World rhythms)
  --djembel FILE   https://bobmiller.yolasite.com/all.php saved as HTML (Raymond's Transcriptions, Djembe-L)
  --djembenet DIR  rhythms.php responses from https://www.djembe.net/dnet.php, one file per rhythm

All are used with permission. Only rhythms of the music itself are kept: lessons, exercises, warm-ups,
inventions and alternative handings are left out.
"""
import argparse
import csv
import glob
import html
import json
import os
import re
import statistics

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'african-drums.json')

# ---------------------------------------------------------------- IEMP Malian Jembe
IEMP_ROLES = {'J1': 'Jembe 1 (lead)', 'J2': 'Jembe 2 (accompaniment)', 'D1': 'Dundun 1 (timeline)',
              'D2': 'Dundun 2 (accompaniment)'}
IEMP_NAMES = {'J1': 'Jembe 1', 'J2': 'Jembe 2', 'D1': 'Dundun 1', 'D2': 'Dundun 2'}


def iemp_lines(d):
    out = []
    for f in sorted(glob.glob(os.path.join(d, 'MJ_*_Onsets_Selected.csv'))):
        take = os.path.basename(f)[3:-len('_Onsets_Selected.csv')]
        piece, num = take.rsplit('_', 1)
        rows = list(csv.DictReader(open(f, encoding='utf-8-sig')))
        # a cycle label is a number, or n.1 / n.2 for the two halves of an eight-beat cycle: each is a bar
        key = lambda lab: tuple(int(x) for x in lab.split('.'))
        labels = sorted({r['Label SD'].split('|')[0] for r in rows}, key=key)
        full = [c for c in labels if sum(1 for r in rows if r['Label SD'].split('|')[0] == c) == 12]
        metre = {r['Cycle']: float(r['Time']) for r in csv.DictReader(open(os.path.join(d, f'MJ_{take}_Metre.csv')))}
        order = sorted(metre, key=key)
        lengths = [metre[b] - metre[a] for a, b in zip(order, order[1:])]
        players = {k: rows[0][IEMP_NAMES[k]].strip() for k in IEMP_NAMES}
        tempi = []
        for c in full:  # quarter notes per minute: a bar is four dotted-quarter beats
            i = order.index(c) if c in order else -1
            dur = lengths[i] if 0 <= i < len(lengths) else statistics.median(lengths)
            tempi.append(round(60 / (dur / 4) * 1.5))
        ens = [f'{players[k]} ({IEMP_NAMES[k].lower()})' for k in ('J1', 'J2', 'D1', 'D2') if players[k]]
        for k, part in IEMP_ROLES.items():
            if not any(r[k].strip() for r in rows):
                continue
            grid = {}
            for r in rows:
                c, s = r['Label SD'].split('|')
                grid[(c, int(s))] = 'x' if r[k].strip() else '.'
            cells = ''.join(''.join(grid.get((c, s), '.') for s in range(1, 13)) for c in full)
            out.append({
                'folder': 'iemp', 'title': f'{piece} ({num})', 'composer': players['J1'], 'part': part + ('' if k == 'J1' else f", {players[k]}"),
                'meter': '12/8', 'slots': 12, 'grid': cells, 'tempi': tempi,
                'origin': 'Mali (Bamako)', 'date': 'recorded 2006-07',
                'note': f'{piece}, a piece of the Bamako jembe repertoire, played by ' + ', '.join(ens)
                        + '. Recorded by Rainer Polak; onsets annotated in IEMP Malian Jembe '
                          '(Polak, Tarsitani & Clayton).',
            })
    return out


# ---------------------------------------------------------------- Djembe Gorilla
GORILLA_PULSES = {'in-3': ('12/8', 12), 'in-4': ('4/4', 16), 'in-9': ('9/8', 9)}
COUNTRIES = {'ivory-coast': 'Ivory Coast', 'burkina-faso': 'Burkina Faso', 'sierra-leone': 'Sierra Leone'}
SKIP_PART = re.compile(r'handing', re.I)
# the hand-drum strokes as Djembe Gorilla writes them: bass, tone, slap (capitals are accented);
# dunun and bell parts are just hits
GORILLA_STROKE = {'b': 'B', 'o': 'T', 's': 'S'}


def _text(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s))).strip()


def gorilla_lines(d, region='africa', folder='djembegorilla'):
    """Rhythms tagged with the region (africa, or america for tools/latin_sources.py)."""
    out = []
    for f in sorted(glob.glob(os.path.join(d, '*.html'))):
        t = open(f, encoding='utf-8').read()
        head = t[:t.find('patterns_section')] if 'patterns_section' in t else t
        origins = sorted(set(re.findall(r'origin-([\w-]+)', head)) - {region, 'link'})
        if f'origin-{region}' not in head:
            continue
        sig = re.search(r'tv_show_time-signature-([\w-]+)', t)
        if not sig or sig.group(1) not in GORILLA_PULSES:
            continue
        meter, slots = GORILLA_PULSES[sig.group(1)]
        title = html.unescape(re.search(r'<title>(.*?)</title>', t, re.S).group(1)).split(':')[0].split('|')[0].strip()
        desc = re.search(r'<meta name="description" content="([^"]*)"', t)
        desc = html.unescape(desc.group(1)).strip() if desc else ''
        desc = re.sub(r'\s*[.…]*$', '', desc)
        sentences = re.findall(r'[^.!?]+[.!?]', desc)
        note = ' '.join(sentences[:2]) if sentences else ''
        origin = ', '.join(COUNTRIES.get(o, o.replace('-', ' ').title()) for o in origins)
        seen = set()
        for m in re.finditer(r'<div class="patterns_section" data-instrument="([^"]*)" data-token="([^"]*)"', t):
            k = t.find('pattern_title', m.start())
            name = _text(t[k:k + 400].split('>', 1)[1].split('<div', 1)[0]) if k >= 0 else ''
            token = m.group(2)
            if not token or SKIP_PART.search(name) or len(token) % slots:
                continue
            inst = m.group(1)
            if re.match(r'djembe', inst) and not re.match(r'(djembe|jembe)', name, re.I):
                part = 'Hand drum' + ('' if name.lower() == 'basic' else f' ({name.lower()})')
            else:
                part = name or inst
            hand = not re.search(r'bell|dun|sangban|kenkeni', part, re.I)
            cells = ''.join('.' if c == '-' else (GORILLA_STROKE.get(c.lower(), 'S') if hand else 'x') for c in token)
            if (part, cells) in seen or cells.count('.') == len(cells):
                continue
            seen.add((part, cells))
            out.append({'folder': folder, 'title': title, 'composer': '', 'part': part,
                        'meter': meter, 'slots': slots, 'grid': cells, 'loop': True,
                        'origin': origin, 'date': 'traditional', 'note': note})
    return out


# ---------------------------------------------------------------- Raymond's Transcriptions (Djembe-L)
# headings inside a rhythm's entry, not rhythms of their own
DJEMBEL_SUBHEADS = re.compile(r"^(INTRO|INTRODUCTION|BREAK.*|END BREAK|DJEMBE|JEMBE|CONGA/DJEMBE|DJUN/BELL|DUN|SOLO|"
                              r"SECOND|OLD|OLDER|NEW|OR|OTHER POST|REPEAT 2|MELODY|SONG|CULTURAL CONTEXT|KEY|"
                              r"DUNS-COMBINATION.*|MIDDLE DRUM.*|HIGH DRUM.*|MADOU'S VERSION|MADOU PHRASES)$")
# lessons, exercises, inventions, and rhythms from outside Africa (Cuba, Brazil, Haiti, Uruguay, Europe, rock)
DJEMBEL_SKIP = re.compile(r"EXERCISE|INVENTION|PRACTICE|WARM|FOUNDATION|DREAM RHYTHM|FAIRFIELD|DESMOINES|INDIAN SUMMER|"
                          r"UNNAMED|UNKNOWN|SIMPLE GROOVE|TWO PART GROOVE|ROCK RHYTHM|SINGING IN THE SILENCE|"
                          r"MISCELL|INTERNET DISCUSSION|BELL PATTERNS|BELL SONG|AGOGO|DARSIE|^BOB$|^FIRE$|^DIALOG$|"
                          r"^TRANCE$|MARKETPLACE|OUTSIDE THE WALL|BAHAVENTO|BOUSHAY|WEST AFRICAN 6/8|"
                          r"CHANGO|COMPARSA|IJEXA|XJESA|OGGUN|OYA SONG|POLSKA|RABODAY|RHUMBA|RUMBA|RUCHENITSA|"
                          r"URUGUAY|YANVALOU|HOW TO|^KEY$")
DJEMBEL_ORIGIN = {'ADOWA': 'Ghana (Akan)', 'ATSIA': 'Ghana (Ewe)', 'GAHU': 'Ghana (Ewe)', 'FUME FUME': 'Ghana',
                  'HIGHLIFE': 'Ghana', 'SHIKO': 'Nigeria', 'AKIWOWO': 'Nigeria (Yoruba)', 'NIGERIAN RHYTHM': 'Nigeria',
                  'GIRIAMA SPIRIT DANCE': 'Kenya (Giriama)', 'ZAMBIA RHYTHM': 'Zambia'}
COUNT_TOKEN = re.compile(r"^([1-9]|[.*&+ea-]|\|:?|:\|)$")
STROKE_TOKEN = re.compile(r"^([A-Za-z]{1,2}|[.-])$")


def _count_line(line):
    """Slot columns, pulses per beat and beats of a count line ('1 . . 2 . . 3 . . 4 . .'), or None."""
    toks = [(m.start(), m.group()) for m in re.finditer(r'\S+', line)]
    k = next((i for i, (_, t) in enumerate(toks) if t == '1'), None)
    if k is None or k > 2:
        return None
    body = toks[k:]
    while body and body[-1][1] in ('|', ':|'):
        body.pop()
    if len(body) < 6 or not all(COUNT_TOKEN.match(t) for _, t in body):
        return None
    nums = [i for i, (_, t) in enumerate(body) if t.isdigit()]
    if len(nums) < 2 or body[nums[1]][1] != '2':
        return None
    per = nums[1] - nums[0]
    if any(b - a != per for a, b in zip(nums, nums[1:])) or len(body) != per * len(nums):
        return None
    return [c for c, _ in body], per, len(nums)


def _pattern(line, cols, per_bar):
    """(label, cells) of an instrument line under a count line, or None."""
    clean = re.sub(r'[()|:]', ' ', line)
    clean = re.sub(r'(->|>>|:\||\|:|\||\(hot!\)|hot!)\s*$', '', clean.rstrip()).rstrip()
    clean = re.sub(r'\s+(->|>>|:\||\|)\s*$', '', clean)
    toks = [(m.start(), m.group()) for m in re.finditer(r'\S+', clean)]
    run = []
    for c, t in reversed(toks):
        if not STROKE_TOKEN.match(t):
            break
        run.append((c, t))
    run.reverse()
    # spaces may stand for silence: then the strokes must sit in the count line's columns
    def by_columns():
        start = cols[0] - 1
        label = clean[:start].strip().rstrip(':')
        cells = []
        for c in cols:
            ch = clean[c] if c < len(clean) else ' '
            cells.append('.' if ch in ' .-' else ch)
        body = re.sub(r'[ .-]', '', clean[start:])
        if len(body) != sum(1 for x in cells if x != '.'):
            return None
        return label, cells
    if run and len(run) % per_bar == 0 and len(run) >= len(cols):
        while len(run) > len(cols) and len(run) % len(cols):
            run.pop(0)
        if len(run) % per_bar == 0:
            label = clean[:run[0][0]].strip().rstrip(':').strip()
            cells = ['.' if t in '.-' else t for _, t in run]
            return label, cells
    if run and len(clean) > cols[0]:
        return by_columns()
    return None


PART_WORDS = re.compile(r'djemb|jemb|\bdj\b|dun|sangb|sanban|kenk|kekeni|bell|solo|frase|break|call|response|intro|'
                        r'accomp|lead|part|krin|shekere|bass|echauf|enchauf|signal|^[SDK]$', re.I)
SHORT = {'S': 'Sangban', 'D': 'Dununba', 'K': 'Kenkeni', 'Dj': 'Djembe', 'Dun': 'Dundun', 'Duns': 'Dunduns'}
DUN = re.compile(r'dun|sangb|sanban|kenk|kekeni', re.I)


def _clean_label(label):
    """A part name from a line's label, or '' when the label isn't one."""
    label = re.sub(r'\s+', ' ', label.replace('é', 'e').replace('è', 'e')).strip(' :*>^$')
    if label.count('(') != label.count(')') or label.startswith('('):
        return ''
    if not label or len(label) > 28 or not PART_WORDS.search(label) or re.search(r'[.;,@?]|\d{2}|\b[A-Za-z]\b \S', label):
        return ''
    label = SHORT.get(label, label)
    low = label.lower()
    m = re.fullmatch(r'(?:dj|djembe|jembe)\s*#?\s*(\d)', low)
    if m:
        return f'Djembe {m.group(1)}'
    m = re.fullmatch(r'(?:dun|dunun|dundun|dun dun)\s*(\d)', low)
    if m:
        return f'Dundun {m.group(1)}'
    m = re.fullmatch(r'frase\s*(\d)', low)
    if m:
        return f'Solo phrase {m.group(1)}'
    label = re.sub(r'\s*#\s*', ' ', label)
    if label.isupper():
        label = label.capitalize()
    return label[:1].upper() + label[1:]


def _part_name(label, group, prev, cells):
    all_x = {c.lower() for c in cells if c != '.'} <= {'x'}
    name = _clean_label(label)
    if name.lower() in ('bell', 'drum') and group:
        name = group + (' bell' if name.lower() == 'bell' else '')
    if not name:
        base = prev or group
        if all_x and base and DUN.search(base) and 'bell' not in base.lower():
            return base + ' bell'
        if not base:
            return 'Bell' if all_x else ''
        if not all_x and base.endswith(' bell'):
            return base[:-5]
        return base
    return name


def djembel_lines(path, keep=None, folder='djembel'):
    """keep: a pattern of the titles to read instead (the Latin ones, for tools/latin_sources.py)."""
    text = open(path, encoding='utf-8', errors='replace').read()
    text = html.unescape(re.sub(r'<br\s*/?>', '\n', text, flags=re.I))
    text = re.sub(r'<[^>]+>', '', text).replace('\xa0', ' ')
    lines = text.splitlines()
    start = next(i for i, l in enumerate(lines) if l.strip().startswith('ABIOUEKA'))
    out, seen = [], set()
    title, count, group, prev = None, None, '', ''
    for line in lines[start:]:
        s = line.strip()
        if re.match(r"^[A-Z][A-Z0-9'/ ,()-]{2,}$", s) and not re.match(r'^([A-Z] )+[A-Z]?$', s + ' '):
            h = s.rstrip(' ,')
            if not DJEMBEL_SUBHEADS.match(h):
                title, count, group, prev = h, None, '', ''
            continue
        if not title or (not re.search(keep, title) if keep else DJEMBEL_SKIP.search(title)):
            continue
        c = _count_line(line)
        if c:
            count, prev = c, ''
            continue
        if not count:
            g = _clean_label(s)
            if g:
                group = g
        if not s:
            continue
        if count is None:
            continue
        cols, per, beats = count
        if per not in (2, 3, 4) or beats % 4:
            continue
        per_bar = per * 4
        pat = _pattern(line, cols, per_bar)
        if not pat:
            g = _clean_label(s)
            if g:
                group, prev = g, ''
            continue
        label, cells = pat
        letters = {x[0] for x in cells if x != '.'}
        if not letters or letters <= set('rlRLfF') or re.search(r'hand|count|time|lead-in|follow', label, re.I):
            continue
        part = _part_name(label, group, prev, cells)
        prev = part
        if not part or re.search(r'hand', part, re.I):
            continue
        hand = not re.search(r'bell|dun|sangban|sangba|kenkeni|bass drum', part, re.I)
        if per == 2:  # eighth-note counts: written in sixteenths
            cells = [x for c in cells for x in (c, '.')]
            per, per_bar = 4, 16
        meter = '12/8' if per == 3 else '4/4'
        def stroke(x):
            u = x[0].upper()
            return {'B': 'B', 'T': 'T', 'O': 'T'}.get(u, 'S') if hand else 'x'
        grid = ''.join('.' if x == '.' else stroke(x) for x in cells)
        name = ' '.join(w.capitalize() if not w.startswith('(') else w.lower() for w in title.split())
        key = (name, part, grid)
        if key in seen or grid.count('.') == len(grid):
            continue
        seen.add(key)
        out.append({'folder': folder, 'title': name, 'composer': '', 'part': part, 'meter': meter,
                    'slots': per_bar, 'grid': grid, 'loop': True,
                    'origin': DJEMBEL_ORIGIN.get(title.split(' (')[0]), 'date': 'traditional', 'note': None})
    return out


# ---------------------------------------------------------------- djembe.net
DNET_SKIP = {'Raboday', 'Rhumba', 'Samba', 'Watusi', 'Welcome'}  # Haiti, Cuba, Brazil, and an arrangement


def djembenet_lines(d):
    out = []
    for f in sorted(glob.glob(os.path.join(d, '*.html'))):
        t = open(f, encoding='latin-1').read()
        m = re.search(r'<title>Djembe N E T: ([^<]*)</title>', t)
        if not m or m.group(1).strip() in DNET_SKIP:
            continue
        title = m.group(1).strip()
        count = re.findall(r'class=Notfont valign=bottom>([^<]*)<', t)
        if not count or count[0].strip() != '1234567812345678':
            continue  # only the 16-pulse bars of 4/4 are read
        ctx = re.search(r'Cultural Context Keyword Guide">([^<(]*)', t)
        origin = html.unescape(ctx.group(1)).replace('\xa0', ' ').strip() if ctx else None
        seen = set()
        for name, token in re.findall(r"value='([^']*)' onMouseDown=\"LH_play\('([^']*)'", t):
            name = name.strip()
            if len(token) % 16 or re.search(r'hand', name, re.I):
                continue
            part = {'Bass': 'Bass drum'}.get(name, name)
            hand = re.match(r'(djembe|signal)', part, re.I)
            if part.lower() == 'signal':
                part = 'Signal (djembe)'
            cells = ''.join('.' if c == '-' else ({'b': 'B', 't': 'T', 'o': 'T'}.get(c.lower(), 'S') if hand else 'x')
                            for c in token)
            if (part, cells) in seen:
                continue
            seen.add((part, cells))
            out.append({'folder': 'djembenet', 'title': title, 'composer': '', 'part': part, 'meter': '4/4',
                        'slots': 16, 'grid': cells, 'loop': True, 'origin': origin, 'date': 'traditional',
                        'note': None})
    return out


# the same rhythm under the archives' spellings, and titles that name a version rather than the rhythm
TITLE_FIXES = {'Libertie': 'Liberté', 'Liberte': 'Liberté', 'Makuru (macru)': 'Makuru (Macru)', 'Gidanba': 'Gidamba',
               'Djole 4 / Joli': 'Djole (Joli)', 'Tako Saba': 'Takosaba', 'Soli De Manian': 'Soli de Manian'}
# Djembe Gorilla's spelling of a rhythm, for its country; and the countries of a few it doesn't have
SAME_AS = {'Abondon': 'Abondan', 'Dennadon': 'Denadon', 'Kebendo': 'Ke Bendo', 'Kennefoli': 'Kene Foli',
           'Lamba': 'Lamban', 'Liberté': 'Liberte 1', 'Makuru (Macru)': 'Makru', 'Soli de Manian': 'Soli des Manian',
           'Sunu': 'Sunun', 'Gina Fore': 'Guinea Fare'}
ORIGINS = {'Kakilambe': 'Guinea (Baga)', 'Soli': 'Guinea', 'Didadi': 'Mali', 'Dansa': 'Mali', 'Gbegbe': 'Ivory Coast'}


def _norm_title(t):
    t = re.sub(r"\s*(\(madou's version\)|\(osei\)|- ivory coast|with solos|hand parts|solo|- madou dembele's.*)$",
               '', t, flags=re.I).strip()
    t = re.sub(r'\s+\d$', '', t)
    return TITLE_FIXES.get(t, t)


def tidy(lines):
    """Shared titles and origins across the archives (a rhythm's country from Djembe Gorilla when the
    other archives don't give one)."""
    origin = {}
    for ln in lines:
        if ln['folder'] == 'djembegorilla' and ln.get('origin'):
            origin.setdefault(ln['title'].lower(), ln['origin'])
    for ln in lines:
        if ln['folder'] in ('djembel', 'djembenet'):
            ln['title'] = _norm_title(ln['title'])
            if not ln.get('origin'):
                t = ln['title']
                ln['origin'] = (origin.get(SAME_AS.get(t, t).lower()) or origin.get(re.sub(r'\s*\(.*', '', t).lower())
                                or ORIGINS.get(t))
        # a pattern written over more bars than it fills: keep the bars it plays
        k = ln['slots']
        bars = [ln['grid'][i:i + k] for i in range(0, len(ln['grid']), k)]
        if ln.get('loop'):
            while len(bars) > 1 and set(bars[-1]) == {'.'}:
                bars.pop()
            if len(bars) == 2 and bars[0] == bars[1]:
                bars.pop()
            ln['grid'] = ''.join(bars)
    return lines


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--iemp')
    ap.add_argument('--gorilla')
    ap.add_argument('--djembel')
    ap.add_argument('--djembenet')
    a = ap.parse_args()
    lines = json.load(open(OUT)) if os.path.exists(OUT) else []
    for folder, arg, fn in (('iemp', a.iemp, iemp_lines), ('djembegorilla', a.gorilla, gorilla_lines),
                            ('djembel', a.djembel, lambda p: djembel_lines(p)),
                            ('djembenet', a.djembenet, lambda p: djembenet_lines(p))):
        if arg:
            new = fn(arg)
            lines = [ln for ln in lines if ln['folder'] != folder] + new
            print(f'{folder}: {len(new)} lines')
    lines = tidy(lines)
    with open(OUT, 'w') as f:
        json.dump(lines, f, ensure_ascii=False, separators=(',', ':'))
        f.write('\n')


if __name__ == '__main__':
    main()
