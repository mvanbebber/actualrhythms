"""Country/region of origin and a dated label for each source in the corpus.

Every date says what it is (composed / published / harmonized / recorded); where the
sources don't say, nothing is shown rather than a guess.
"""
import re

CONTINENTS = {'Europa', 'Mitteleuropa', 'Osteuropa', 'Suedosteuropa', 'Nordeuropa', 'Westeuropa',
              'Suedeuropa', 'Asien', 'Ostasien', 'Osten', ''}
COUNTRIES = {
    'Deutschland': 'Germany', 'Deutschland (BRD)': 'Germany', 'Deutschland (DDR)': 'Germany',
    'Frankreich': 'France', 'Luxemburg': 'Luxembourg', 'China': 'China', 'Irland': 'Ireland',
    'Polen': 'Poland', 'Jugoslawien': 'Yugoslavia', 'Schweiz': 'Switzerland', 'Oesterreich': 'Austria',
    'Niederlande': 'Netherlands', 'Ungarn': 'Hungary', 'UdSSR': 'USSR', 'Tschechoslowakei': 'Czechoslovakia',
    'Rumaenien': 'Romania', 'Russland': 'Russia', 'Italien': 'Italy', 'Schweden': 'Sweden', 'Ukraine': 'Ukraine',
    'Daenemark': 'Denmark', 'Mexiko': 'Mexico', 'USA': 'USA', 'Amerika': 'America', 'Nord - Amerika': 'North America',
    'Mittelamerika': 'Central America', 'Slowakei': 'Slovakia', 'Kroatien': 'Croatia', 'Slowenien': 'Slovenia',
    'Taiwan': 'Taiwan',
}
# a region named on its own implies its country
REGION_COUNTRY = {'Lothringen': 'France', 'Elsass': 'France'}
REGIONS = {
    'Lothringen': 'Lorraine', 'Elsass': 'Alsace', 'Hessen': 'Hesse', 'Schlesien': 'Silesia', 'Rheinland': 'Rhineland',
    'Niederrhein': 'Lower Rhine', 'Westfalen': 'Westphalia', 'Thueringen': 'Thuringia', 'Sachsen': 'Saxony',
    'Franken': 'Franconia', 'Schwaben': 'Swabia', 'Bayern': 'Bavaria', 'Pommern': 'Pomerania', 'Tirol': 'Tyrol',
    'Siebenbuergen': 'Transylvania', 'Rhein': 'Rhine', 'Kuhlaendchen': 'Kuhländchen', 'Boehmen': 'Bohemia',
    'Wuerttemberg': 'Württemberg', 'Steiermark': 'Styria', 'Nord - Deutschland': 'Northern Germany',
    'Norddeutschland': 'Northern Germany', 'Sueddeutschland': 'Southern Germany', 'Sued - Deutschland': 'Southern Germany',
    'Rheinpfalz': 'Palatinate', 'Pfalz': 'Palatinate', 'Ostpreussen': 'East Prussia', 'Schleswig - Holstein': 'Schleswig-Holstein',
    'Hannover': 'Hanover', 'Koeln': 'Cologne', 'Galizien': 'Galicia', 'Maehren': 'Moravia', 'Niedersachsen': 'Lower Saxony',
    'Muenster': 'Münster', 'Wuerzburg': 'Würzburg', 'Preussen': 'Prussia', 'Flandern': 'Flanders', 'flaemisch': 'Flemish',
    'Herzogtum Berg': 'Duchy of Berg', 'Untermainfranken': 'Lower Main Franconia', 'Ober - Franken': 'Upper Franconia',
    'Oberfranken': 'Upper Franconia', 'Mittel - Franken': 'Middle Franconia', 'Unter - Franken': 'Lower Franconia',
    'Ober - Hessen': 'Upper Hesse', 'Oberhessen': 'Upper Hesse', 'Niederoesterreich': 'Lower Austria',
    'Niederbayern': 'Lower Bavaria', 'Nordbayern': 'Northern Bavaria', 'Nord - Bayern': 'Northern Bavaria',
    'Schwarzwald': 'Black Forest', 'Bessarabien': 'Bessarabia', 'Batschka': 'Bačka', 'Wolga - Kolonie': 'Volga colony',
    'Kanton Bern': 'Canton of Bern', 'Lausitz': 'Lusatia', 'Oberlausitz': 'Upper Lusatia', 'Niederlausitz': 'Lower Lusatia',
    'sorbisch': 'Sorbian', 'Provinz Sachsen': 'Province of Saxony', 'Sachsen - Anhalt': 'Saxony-Anhalt',
    'Nordrhein - Westfalen': 'North Rhine-Westphalia', 'Mittelrhein': 'Middle Rhine', 'Oberrhein': 'Upper Rhine',
    'Rheinprovinz': 'Rhine Province', 'Frankfurt a.M.': 'Frankfurt am Main', 'Freiburg i. Brsg.': 'Freiburg im Breisgau',
}


def essen_origin(raw):
    """'Europa, Mitteleuropa, Deutschland, Westfalen' -> 'Germany (Westphalia)'."""
    if not raw:
        return None
    groups = []  # [country, [regions]]
    for tok in re.split(r'[,;/]', raw):
        tok = re.sub(r'\s+', ' ', tok).strip()
        if tok in CONTINENTS:
            continue
        if tok in COUNTRIES:
            groups.append([COUNTRIES[tok], []])
        elif not groups:
            groups.append([REGION_COUNTRY.get(tok), [REGIONS.get(tok, tok)]])
        else:
            groups[-1][1].append(REGIONS.get(tok, tok))
    out = []
    for country, regions in groups:
        regions = [r for r in regions if r][-2:]  # the two most specific places
        if country and regions and any(country in r for r in regions):
            out.append(', '.join(regions))  # 'Southern Germany', not 'Germany (Southern Germany)'
        elif country and regions:
            out.append(f"{country} ({', '.join(regions)})")
        elif country:
            out.append(country)
        elif regions:
            out.append(', '.join(regions))
    return ' / '.join(dict.fromkeys(out)) or None


# Essen sub-collections whose printed source is known; other dates come from each song's S: citation
ESSEN_FILE_DATES = {
    'zuccal0': 'published 1838–1840',  # Kretzschmer & Zuccalmaglio, Deutsche Volkslieder mit ihren Original-Weisen
    'fink0': 'published 1843',         # G. W. Fink, Musikalischer Hausschatz der Deutschen
}

# Collection-level facts. Where a collection mixes traditions, the place it was printed goes in
# the date line, not the origin, so it isn't mistaken for where the tune comes from.
COLLECTIONS = {
    'oneills1850': ('Ireland', 'published 1903, Chicago'),        # O'Neill's Music of Ireland: 1850 Irish melodies
    'ryansMammoth': (None, 'published 1883, Boston'),             # Ryan's Mammoth Collection (Scottish, Irish, English, American)
    'airdsAirs': (None, 'published 1782–1803, Glasgow'),          # Aird's Selection of Scotch, English, Irish and Foreign Airs
    'nottingham-dataset': (None, None),                           # mixed traditions, no per-tune origin
    'bach': ('Germany', 'harmonized c. 1714–1750'),
}

# (folder, title pattern, origin, date) — first match wins
WORKS = [
    ('beethoven', r'^Op\. 18', 'Austria (Vienna)', 'composed 1798–1800'),
    ('beethoven', r'^Op\. 59', 'Austria (Vienna)', 'composed 1806'),
    ('beethoven', r'^Op\. 74', 'Austria (Vienna)', 'composed 1809'),
    ('beethoven', r'^Op\. 13[23]', 'Austria (Vienna)', 'composed 1825'),
    ('mozart', r'K\. 80\b', 'Italy (Lodi)', 'composed 1770'),
    ('mozart', r'K\. 15[56]\b', 'Italy', 'composed 1772'),
    ('mozart', r'K\. 458\b', 'Austria (Vienna)', 'composed 1784'),
    ('mozart', r'K\. 545\b', 'Austria (Vienna)', 'composed 1788'),
    ('haydn', r'^Op\. 1 No\. 1', 'Austria', 'composed c. 1757–1762'),
    ('haydn', r'^Op\. 74 No\. 1', 'Austria (Vienna)', 'composed 1793'),
    ('schubert', r'Lindenbaum', 'Austria (Vienna)', 'composed 1827'),
    ('chopin', r'Op\. 6', 'Poland', 'composed c. 1830–1832'),
    ('corelli', r'opus 3', 'Italy (Rome)', 'published 1689'),
    ('cpebach', r'Wq\. 55', 'Germany', 'published 1779'),
    ('handel', r'(?i)rinaldo', 'England (London)', 'composed 1711'),
    ('verdi', r'(?i)donna', 'Italy (Venice)', 'composed 1851'),
    ('weber', r'(?i)concertino', 'Germany (Munich)', 'composed 1811'),
    ('schumann_robert', r'Tr.nen', 'Germany (Leipzig)', 'composed 1840'),
    ('schumann_robert', r'^Op\. 41', 'Germany (Leipzig)', 'composed 1842'),
    ('schumann_clara', r'(?i)polonaise', 'Germany (Leipzig)', 'published 1831'),
    ('schumann_clara', r'(?i)trio', 'Germany (Dresden)', 'composed 1846'),
    ('joplin', r'', 'USA (Sedalia, Missouri)', 'published 1899'),
    ('liliuokalani', r'', 'Hawaii', 'composed 1878'),
    ('johnson_j_r', r'', 'USA (Jacksonville, Florida)', 'composed 1900'),
    ('leadSheet', r'(?i)alexander', 'USA (New York)', 'published 1911'),
    ('leadSheet', r'(?i)jeanie', 'USA', 'published 1854'),
    ('beach', r'', 'USA', None),
    ('monteverdi', r'^(Madrigal\.)?3\.', 'Italy (Venice)', 'published 1592'),
    ('monteverdi', r'^Madrigal\.4\.', 'Italy (Venice)', 'published 1603'),
    ('monteverdi', r'^Madrigal\.5\.', 'Italy (Venice)', 'published 1605'),
    ('monteverdi', r'', 'Italy (Venice)', 'published 1592–1605'),
]


def origin_and_date(src):
    """src: the window's source dict. Returns (origin, date)."""
    folder, title = src['folder'], src['title']
    if folder == 'essenFolksong':
        date = src.get('s_year') and f"published {src['s_year']}" or ESSEN_FILE_DATES.get(src.get('file'))
        return essen_origin(src.get('origin_raw')), date
    if folder == 'monteverdi' and src.get('date'):  # set from the book (tools/monteverdi.py)
        return src.get('origin'), src.get('date')
    if folder in ('wjd', 'joplinrags', 'openewld', 'latin', 'african', 'iemp', 'djembegorilla', 'djembel', 'djembenet', 'pdmxafrica', 'iempcandombe', 'iempcuba', 'gorillalatin', 'djembellatin', 'pdmxlatin', 'parkerbook', 'mvbjazz', 'mvbsongs'):  # metadata supplied by the source itself
        return src.get('origin'), src.get('date')
    if folder in COLLECTIONS:
        return COLLECTIONS[folder]
    if folder == 'miscFolk':  # a few tunes carry a dated publisher, e.g. 'Preston (1780)'
        m = re.search(r'\((1[5-9]\d\d)\)', src.get('composer') or '')
        return None, m and f'published {m.group(1)}'
    for f, pat, origin, date in WORKS:
        if f == folder and re.search(pat, title):
            return origin, date
    return None, None
