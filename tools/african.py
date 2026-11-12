"""African timelines: bell patterns that organize much West and Central African music.

Like tools/latin.py, these aren't excerpts of single recordings: each is the pattern as the music-theory
literature gives it, written out in conventional notation (same encoding and notation checks as latin.py).
Only patterns confirmed in published sources are included, mainly Godfried Toussaint's timeline studies
("The Geometry of Musical Rhythm" and his papers on African ternary and binary timelines). Players start
these cycles at different points and vary them; each is given in its most widely cited form.

The standard pattern and fume-fume also appear among the Latin rhythms in their Afro-Cuban form (the 6/8
bell and the 6/8 clave); the app links each to its twin as the same rhythm.
"""
from latin import pattern_windows

# name, meter, measures, instrument, origin, date label, pitches (cycled), note
PATTERNS = [
    ('Standard pattern (Ewe bell)', '12/8', ['q 8 8r 8 8 8r q q 8'], 'Gankogui (bell)', 'Ghana (Ewe)', 'traditional', [79],
     'The seven-stroke timeline found across sub-Saharan Africa (2-2-1-2-2-2-1): the bell of Ewe drumming such as '
     'Agbekor, and the root of the Afro-Cuban 6/8 bell.'),
    ('Fume-fume', '12/8', ['q 8 8r q 8r q qd'], 'Bell', 'Ghana', 'traditional', [79],
     'A five-stroke 12/8 timeline (2-2-3-2-3), the standard pattern with two strokes left out; '
     'the same rhythm as the Afro-Cuban 6/8 clave.'),
    ('Gahu', '4/4', ['8d 16 8r 8 8r 8 8r 8'], 'Bell', 'Ghana (Ewe)', 'traditional', [79],
     'The bell timeline of Gahu, an Ewe social dance-drumming (3-3-4-4-2 sixteenths), as Toussaint gives it.'),
    ('Shiko', '4/4', ['q 8 8 8r 8 q'], 'Bell', 'West Africa', 'traditional', [79],
     'A five-stroke timeline in four (4-2-4-2-4 sixteenths), as Toussaint gives it.'),
    ('Soukous', '4/4', ['8d 16 8r 8 8r 16 16 qr'], 'Bell', 'Congo', 'traditional', [79],
     'The timeline of Congolese soukous (3-3-4-1-5 sixteenths): son clave with its last stroke pulled forward.'),
]


def african_windows():
    return pattern_windows(PATTERNS, 'african')
