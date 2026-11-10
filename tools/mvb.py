"""Michael Van Bebber's transcriptions from recordings: jazz solos and heads, lead sheets, arrangements,
and songs (soul, funk, pop, rock, blues, country). Used with permission; not part of the CC BY-NC-SA
rhythm data. Sibelius scores exported as MusicXML, one tune per file.

Unlike the Parker book these scores vary: a single solo staff, a lead sheet in three transpositions,
or a full band. Every staff with its own line is read (horns, voices, guitars, bass, piano, drums);
a staff that repeats an earlier one in another transposition is skipped. The title block names the
tune and, in one of several phrasings, the player and the record:

    After Hours / Sonny Rollins Solo on "Sonny Side Up"            (title / subtitle)
    Transcribed by Michael Van Bebber                              (composer field)

    Golden Lady / As Recorded on the Album "Inner Visions" - 1973
    By Stevie Wonder / Transcribed by Michael Van Bebber
"""
import os
import re

JAZZ, SONGS = 'mvbjazz', 'mvbsongs'
TRANSCRIBER_RE = re.compile(r'\b(trans(c|cribed|\.)?|arr\.?|arranged)\b', re.I)

# files whose recording is a song rather than jazz (soul, funk, pop, rock, blues, country)
SONG_FILES = {
    'A Beautiful Life - Heartless Bastards', 'Africa - Toto', 'Another One - Mac DeMarco', "Autumn's Child",
    'Back on 74 - Jungle New', 'Boogie On Reggae Woman - Synth Bass', "Damn Right I'm Somebody - Fred Wesley and the JB's",
    'Dream Police', "Feel Like Makin' Love - Roberta Flack", 'For the First Time - Mac DeMarco',
    'Gentle On My Mind - Waylon Jennings', 'Going Down - Freddie King', 'Golden Lady - Stevie Wonder',
    'I Want My Baby Back - The Ethics', "It's Too Late - Carole King", 'Look At Me Now - The Ethics', 'Magnum P.I',
    'Money - Moonchild (Tiny Desk Version)', 'More Than a Woman - The Bee Gees', 'Off The Wall - Michael Jackson',
    'Passing Out Pieces - Mac DeMarco', 'Right Down The Line - Gerry Rafferty (New)', 'The Magician - Andy Shauf',
    'The Sky is Crying - Albert King', 'Things We Like To Do - Shuggie Otis', 'Use me up',
    'Walking On A Dream - Empire of the Sun', "We've Only Just Begun - Carpenters",
    'What a Fool Believes - The Doobie Brothers', 'White Gloves - Khruangbin (Live)', "Who's That Lady",
    'Wild, Wicked and the Tame',
}

# title blocks that are missing, or copied from another score
OVERRIDES = {
    'Dig': {'title': 'Dig', 'performer': '', 'tune_by': 'Miles Davis', 'subtitle': ''},
    'After the Love': {'title': 'After the Love'},
    "Easin' It": {'title': "Easin' It", 'subtitle': 'Intro'},
    'One O Clock Jump from Kansas City 5': {'performer': 'Kansas City 5', 'tune_by': 'Count Basie'},
    'Show-Type Tune (Bill Evans Solo)': {'performer': 'Bill Evans', 'tune_by': 'Lee Konitz'},
    "Well You Needn't": {'performer': 'John Coltrane', 'tune_by': 'Thelonious Monk', 'subtitle': 'John Coltrane solo on "Walkin\'"'},
    'Green Dolphin Sendoff': {'performer': 'Michael Van Bebber', 'tune_by': 'Bronisław Kaper'},
    'Dream Police': {'performer': 'The Isley Brothers'},
    "Who's That Lady": {'performer': 'The Isley Brothers'},
    'Battle Cry Solo': {'performer': 'Ryan Kisor'},
    'A Kiss To Build A Dream On': {'title': 'A Kiss to Build a Dream On'},
    'Lady Be Good - Charlie Parker': {'title': 'Lady Be Good', 'performer': 'Charlie Parker',
                                      'tune_by': 'George Gershwin', 'subtitle': "With Jay McShann's Orchestra, 1940"},
    'The Turnabout - Solos': {'performer': '', 'tune_by': 'Benny Carter'},
    'Monk Solo on Liza': {'performer': 'Thelonious Monk', 'tune_by': 'George Gershwin'},
    'Some Other Time - Monica': {'title': 'Some Other Time', 'performer': 'Monica Zetterlund'},
    "Feel Like Makin' Love - Roberta Flack": {'title': "Feel Like Makin' Love"},
    "We've Only Just Begun - Carpenters": {'performer': 'The Carpenters',
                                           'subtitle': 'As Recorded by The Carpenters - 1970'},
    'What a Fool Believes - The Doobie Brothers': {'performer': 'The Doobie Brothers',
                                                   'tune_by': 'Michael McDonald and Kenny Loggins'},
    "Gertrude's Bounce - Clifford Brown Solo": {'performer': 'Clifford Brown'},
    "Gertrude's Bounce - Quintet Arrangment": {'performer': 'Clifford Brown and Max Roach'},
    'Where You At?': {'title': 'Where You At?'},
    'sandu - Freddie Hubbard': {'title': 'Sandu'},
    'Lazy Bird - Solos': {'title': 'Lazy Bird'},
}
INSTRUMENT_WORDS = r'\s+(?:tenor|alto|baritone|soprano|trumpet|piano|guitar|bass|drums|sax|saxophone)$'


def clean_lines(text):
    return [re.sub(r'\s+', ' ', l).strip() for l in (text or '').split('\n') if l.strip()]


def title_from_file(stem):
    t = re.sub(r'\s*\((?:Lead Sheet|Eb\)? Lead Sheet|Live|New|Tiny Desk Version)\)', '', stem)
    t = re.sub(r'\s+Lead Sheet$', '', t)
    return t.split(' - ')[0].strip()


def tidy_title(t):
    return t if not t.islower() else re.sub(r"(^|\s)(\w)", lambda m: m.group(1) + m.group(2).upper(), t)


def credits(path, title_text, composer_text):
    stem = os.path.splitext(os.path.basename(path))[0]
    T, C = clean_lines(title_text), clean_lines(composer_text)
    title = tidy_title(T[0]) if T else title_from_file(stem)
    if title.isupper():
        title = title.title()
    subtitle_lines = T[1:]
    performer, tune_by = None, None
    texts = subtitle_lines + C
    for line in texts:
        for pat in (r'^(.+?) [Ss]olos? (?:on|from)\b', r'^(?:Solos? by) ([^,/]+)', r'^(.+?) [Ss]olo$',
                    r'As [Rr]ecorded by (?:the )?(.+?)(?: on| in| -|$)', r'As performed by (.+?)\)?$',
                    r'^(.+?) melody on\b', r'Melody, as played by (.+?)$', r'^(.+?) \((?:trumpet|piano)\)'):
            m = re.search(pat, line)
            if m and not performer:
                performer = m.group(1).strip(' ,')
    for line in C:
        if TRANSCRIBER_RE.search(line) and not line.lower().startswith('by '):
            continue
        m = re.match(r'^By (.+)$', line)
        name = m.group(1) if m else (line if not line.startswith('(') and not re.match(r'^(Solo|Solos) by', line) else None)
        if name and not tune_by:
            tune_by = re.sub(r',\s*Arr\..*$', '', name).strip()
    if not performer:
        performer = tune_by
    year = None
    for line in texts:
        m = re.search(r'\b(19[2-9]\d|20[0-2]\d)\b', line)
        if m:
            year = int(m.group(1))
            break
    subtitle = '; '.join(l for l in subtitle_lines if not TRANSCRIBER_RE.search(l))
    o = OVERRIDES.get(stem, {})
    title = o.get('title', title)
    performer = o.get('performer', performer) or ''
    tune_by = o.get('tune_by', tune_by)
    subtitle = o.get('subtitle', subtitle)
    performer = re.sub(r'^(?:the|The) (?=[A-Z])', 'The ', performer)
    performer = re.sub(INSTRUMENT_WORDS, '', re.sub(r'\s*\(.*?\)\s*$', '', performer)).strip()
    same = lambda a, b: re.sub(r'^the\s+', '', (a or '').lower()) == re.sub(r'^the\s+', '', (b or '').lower())
    if same(tune_by, performer):
        tune_by = None
    note = '; '.join(x for x in (
        subtitle or None,
        f'tune by {tune_by}' if tune_by and tune_by.lower() not in subtitle.lower() else None,
    ) if x)
    return {'title': title, 'composer': performer, 'date': f'recorded {year}' if year else None, 'year': year,
            'origin': None, 'note': note[:1].upper() + note[1:] if note else None,
            'folder': SONGS if stem in SONG_FILES else JAZZ, 'stem': stem}


def staff_labels(parts, cred):
    """One label per staff: the instrument ('Electric bass', 'Rhythm guitar', 'Drums', 'Vocal'), piano
    staves as right and left hand, repeated names numbered; a lone staff is 'Solo' or 'Melody' unless
    it names a rhythm-section instrument."""
    single = len(parts) == 1
    raw = [part_label(p.partName, p.getInstrument().instrumentName, False) for p in parts]
    if single:
        lab = raw[0]
        generic = lab in ('Part', 'Concert', 'Concert pitch', 'C', 'Bb', 'B flat', 'B flat part', 'Eb', 'Treble clef',
                          'Trumpet', 'Clarinet', 'Flute', 'Alto saxophone', 'Tenor saxophone', 'Trombone', '')
        texts = ' '.join([cred.get('note') or '', cred['stem']]).lower()
        if 'solo' in texts:
            return ['Solo']
        if generic:
            return ['Melody']
        return [lab]
    out, seen = [], {}
    for i, lab in enumerate(raw):
        seen[lab] = seen.get(lab, 0) + 1
        out.append(lab)
    counts = {lab: n for lab, n in seen.items()}
    k = {}
    for i, lab in enumerate(out):
        if counts[lab] > 1:
            k[lab] = k.get(lab, 0) + 1
            if lab in ('Piano', 'Electric piano', 'Rhodes', 'Rhodes piano', 'Wurlitzer piano', 'Keyboards', 'Electric organ', 'Organ', 'Pipe organ', 'Synthesizer') and counts[lab] == 2:
                out[i] = f"{lab} ({'right' if k[lab] == 1 else 'left'} hand)"
            else:
                out[i] = f'{lab} {k[lab]}'
    return out


GENERIC_NAME = re.compile(r'^(c|bb|b flat|b flat part|b♭|eb|e flat|tenor|concert|concert pitch|treble clef|'
                          r'bass clef|p\d+|\*.*|miles|roberta|karen|amber.*|keys.*|.*/.*|)$', re.I)
NAMES = [
    (r'roland jx.*string synth.*|string synth.*', 'String synthesizer'), (r'\d-string bass guitar|bass guitar', 'Electric bass'),
    (r'lead el\.? guitar', 'Lead electric guitar'), (r'el\.? guitar', 'Electric guitar'), (r'bari\.? sax', 'Baritone sax'),
    (r'bass synthesizer.*|synth bass', 'Synth bass'), (r'acoustic bass|upright bass|contrabass|double bass', 'Upright bass'),
    (r'drum set|drumset|drum kit|drums', 'Drums'), (r'lead vocals?', 'Lead vocal'), (r'background vo(cals?|x)', 'Background vocal'),
    (r'jazz guitar', 'Guitar'), (r'tenor trombone', 'Trombone'), (r'trumpet in b.*|b.? trumpet', 'Trumpet'),
    (r'clarinet in b.*', 'Clarinet'), (r'prophet 5', 'Synthesizer'), (r'guitar\s+voice', 'Guitar'),
]


def part_label(name, instrument, single_staff):
    """A readable part name, from the staff's name or, when that is a key or a person, its instrument."""
    def tidy(x):
        x = re.sub(r'\s*\((?:\d+|Sounding.*?|.*?8vb.*?)\)', '', (x or '')).strip()
        x = re.sub(r'^[IVX]+ \((.+)\)$', r'\1', x)
        x = re.sub(r'\s+\d+$', '', x)
        for pat, rep in NAMES:
            if re.fullmatch(pat, x, re.I):
                return rep
        return x[:1].upper() + x[1:].lower() if x else ''
    raw = (name or '').strip()
    if raw.lower() == 'miles':
        return 'Trumpet (Miles Davis)'
    if re.match(r'prophet', raw, re.I):
        return 'Synthesizer'
    if GENERIC_NAME.match(raw):
        raw = instrument if instrument and not re.fullmatch(r'\(?\d*\)?', instrument) else 'Melody'
    lab = tidy(raw)
    if re.search(r'\b(voice|vocal|vox)\b', lab, re.I) and lab.lower() not in ('lead vocal', 'background vocal'):
        lab = 'Vocal'
    return lab or 'Part'
