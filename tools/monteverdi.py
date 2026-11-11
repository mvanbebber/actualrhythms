"""Titles for the Monteverdi madrigals in music21's corpus.

music21 holds each madrigal twice: a scanned score (the music, but often titled with a voice name such as
'Canto', its file name, the poet, or garbled OCR text) and a RomanText harmonic analysis (.rntxt) with a
usable title. The analyses are chord labels, not a singer's line, so the build skips them; these titles
come from them, checked against each score's own text, in Italian sentence case with accents, and
corrected where the analysis is wrong (Book 3 no. 8 is 'Vattene pur, crudel', not 'La piaga c'ho nel
core', which is Book 4 no. 9).

Key: the score's file name. Value: (title, note).
"""

BOOKS = {'3': ('Third', 1592), '4': ('Fourth', 1603), '5': ('Fifth', 1605)}

TITLES = {
    'madrigal.3.1': ('La giovinetta pianta', None),
    'madrigal.3.2': ('O come è gran martire', None),
    'madrigal.3.3': ('Sovra tenere erbette e bianchi fiori', None),
    'madrigal.3.4': ('O dolce anima mia, dunque è pur vero', None),
    'madrigal.3.5': ('Stracciami pur il core', None),
    'madrigal.3.6': ("O rossignuol ch'in queste verdi fronde", None),
    'madrigal.3.7': ('Se per estremo ardore', None),
    'madrigal.3.8': ('Vattene pur, crudel, con quella pace', 'prima parte'),
    'madrigal.3.9': ("Là tra 'l sangue e le morti egro giacente", 'seconda parte of Vattene pur, crudel'),
    'madrigal.3.10': ("Poi ch'ella in sé tornò, deserto e muto", 'terza parte of Vattene pur, crudel'),
    'madrigal.3.11': ("O primavera, gioventù de l'anno", None),
    'madrigal.3.12': ('Perfidissimo volto', None),
    'madrigal.3.13': ("Ch'io non t'ami, cor mio", None),
    'madrigal.3.14': ('Occhi, un tempo mia vita', None),
    'madrigal.3.15': ('Vivrò fra i miei tormenti e le mie cure', 'prima parte'),
    'madrigal.3.16': ('Ma dove, o lasso me', 'seconda parte of Vivrò fra i miei tormenti'),
    'madrigal.3.17': ('Io pur verrò là dove sete', 'terza parte of Vivrò fra i miei tormenti'),
    'madrigal.3.18': ('Lumi, miei cari lumi', None),
    'madrigal.3.19': ('Rimanti in pace', None),
    'madrigal.3.20': ("Ond'ei, di morte la sua faccia impressa", 'seconda parte of Rimanti in pace'),
    'madrigal.4.1': ('Ah, dolente partita', None),
    'madrigal.4.2': ('Cor mio, mentre vi miro', None),
    'madrigal.4.3': ('Cor mio, non mori? E mori!', None),
    'madrigal.4.4': ('Sfogava con le stelle', None),
    'madrigal.4.5': ("Volgea l'anima mia soavemente", None),
    'madrigal.4.6': ('Anima mia, perdona', 'prima parte'),
    'madrigal.4.7': ("Che se tu se' il cor mio", 'seconda parte of Anima mia, perdona'),
    'madrigal.4.8': ('Luci serene e chiare', None),
    'madrigal.4.9': ("La piaga c'ho nel core", None),
    'madrigal.4.10': ('Voi pur da me partite, anima dura', None),
    'madrigal.4.11': ("A un giro sol de' begl'occhi lucenti", None),
    'madrigal.4.12': ('Ohimè, se tanto amate', None),
    'madrigal.4.13': ('Io mi son giovinetta', None),
    'madrigal.4.14': ("Quell'augellin che canta", None),
    'madrigal.4.15': ('Non più guerra, pietate', 'text by Giovanni Battista Guarini'),
    'madrigal.4.16': ("Sì, ch'io vorrei morire", 'text by Maurizio Moro'),
    'madrigal.4.17': ('Anima dolorosa, che vivendo', None),
    'madrigal.4.18': ('Anima del cor mio', None),
    'madrigal.4.19': ('Longe da te, cor mio', None),
    'madrigal.4.20': ("Piagn'e sospira", None),
    'madrigal.5.1': ('Cruda Amarilli, che col nome ancora', None),
    'madrigal.5.2': ("O Mirtillo, Mirtill'anima mia", None),
    'madrigal.5.3': ("Era l'anima mia", None),
    'madrigal.5.4': ('Ecco, Silvio, colei che in odio hai tanto', 'prima parte'),
    'madrigal.5.5': ('Ma se con la pietà non è in te spenta', 'seconda parte of Ecco, Silvio'),
    'madrigal.5.6': ('Dorinda, ah dirò mia, se mia non sei', 'terza parte of Ecco, Silvio'),
    'madrigal.5.7': ('Ecco, piegando le ginocchie a terra', 'quarta parte of Ecco, Silvio'),
    'madrigal.5.8': ('Ferir quel petto, Silvio?', 'quinta parte of Ecco, Silvio'),
}


def fix(src):
    """Title, date and note for a Monteverdi window's source dict (changed in place)."""
    stem = (src.get('file') or '').replace('_old', '')
    if stem not in TITLES:
        return
    title, extra = TITLES[stem]
    book = stem.split('.')[1]
    name, year = BOOKS[book]
    src['title'] = title
    src['date'] = f'published {year}'
    src['origin'] = 'Italy (Venice)'
    src['note'] = '; '.join(x for x in (f'{name} Book of Madrigals, no. {stem.split(".")[2]}', extra) if x)
