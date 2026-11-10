"""Charlie Parker heads and solos transcribed by Michael Van Bebber (used with permission; not part of
the CC BY-NC-SA rhythm data). Sibelius scores exported as MusicXML, one tune per file.

Each score holds the same line on several staves in different transpositions; only the concert-pitch
staff with the most notes is read (in counterpoint heads such as Chasin' the Bird and Ah-Leu-Cha a
second concert staff holds the other line). The title block gives the tune, the personnel, the studio,
place and date, the record and the composer:

    Billie's Bounce
    Miles Davis (trumpet) Charlie Parker (alto sax) ...
    WOR Studios, Broadway, NYC, November 26, 1945
    (Savoy MG 12009) / By Charlie Parker / Transcribed by Michael Van Bebber

Text marks in the score say who is playing: (Head), (Solo), (Improv.), (Intro), and (Tpt.), (Piano),
(Drums) ... for passages by someone else. Each excerpt is labeled by the marks in force at its first bar.
"""
import re

FOLDER = 'parkerbook'
TRANSCRIBER = 'Michael Van Bebber'
DATE_RE = re.compile(r'((?:January|February|March|April|May|June|July|August|September|October|November|December)'
                     r'(?:-(?:January|February|March|April|May|June|July|August|September|October|November|December))?'
                     r'(?:\s+\d{1,2})?,\s*(19\d\d))')


def credits(title_text, composer_text):
    """Title block -> {'title', 'composer', 'date', 'origin', 'note', 'tune_by'}."""
    lines = [l.strip() for l in (title_text or '').split('\n') if l.strip()]
    title = lines[0] if lines else ''
    rest = ' '.join(lines[1:])
    m = DATE_RE.search(rest)
    year = m.group(2) if m else None
    # the place is what follows the personnel on the date's line: 'WOR Studios, Broadway, NYC'
    place = None
    if m:
        before = rest[:m.start()].rstrip(', ')
        place = before.split(')')[-1].strip(' ,') or None
    comp = [l.strip() for l in (composer_text or '').split('\n') if l.strip()]
    record = next((l.strip('()') for l in comp if l.startswith('(')), None)
    tune_by = next((l[3:].strip() for l in comp if l.lower().startswith('by ')), None)
    where = ', '.join(x for x in (place, m.group(1) if m else None) if x)
    note = '; '.join(x for x in (
        f'Recorded {where}' if where else None,
        record,
        f'tune by {tune_by}' if tune_by and tune_by != 'Charlie Parker' else None,
    ) if x)  # the transcriber is credited in the collection's name
    return {'title': title, 'composer': 'Charlie Parker', 'date': f'recorded {year}' if year else None,
            'origin': 'USA', 'note': note[0].upper() + note[1:], 'year': int(year) if year else None}


OTHER = [('miles', 'Trumpet'), ('tpt', 'Trumpet'), ('trumpet', 'Trumpet'), ('tenor', 'Tenor sax'),
         ('piano', 'Piano'), ('drums', 'Drums'), ('bass', 'Bass')]


def section_labels(part):
    """measure number -> part label ('Alto sax, head', 'Alto sax solo', 'Trumpet', ...)."""
    from music21 import expressions
    section, player = 'Alto sax, head', 'alto'
    labels = {}
    for m in part.getElementsByClass('Measure'):
        for t in m.recurse().getElementsByClass(expressions.TextExpression):
            txt = (t.content or '').lower()
            doubling = 'unis' in txt or '8va' in txt  # the trumpet doubles Parker's line
            if 'head' in txt:
                section, player = 'Alto sax, head', 'alto'
            elif 'solo' in txt or 'improv' in txt:
                section, player = 'Alto sax solo', 'alto'
            elif 'intro' in txt:
                section, player = 'Alto sax, intro', 'alto'
            if 'alto' in txt or doubling:
                player = 'alto'
            elif not ('head' in txt or 'solo' in txt):
                for key, name in OTHER:
                    if key in txt:
                        player = name
                        break
        # a piano, bass or drums break is rests on this staff: Parker's next note ends it
        if player in ('Piano', 'Drums', 'Bass') and any(not n.isRest for n in m.recurse().notes):
            player = 'alto'
        labels[m.number] = section if player == 'alto' else player
    return labels


def norm_title(t):
    t = re.sub(r'\(no\.?\s*\d\)|no\.\s*\d', '', t.lower())
    return re.sub(r'[^a-z]', '', t)
