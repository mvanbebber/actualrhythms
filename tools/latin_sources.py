"""Gather the Latin drum and ensemble sources into tools/latin-rhythms.json (read by tools/african_drums.py,
which spells every grid as notation; the format is the same as tools/african-drums.json).

Usage: python3 latin_sources.py [--candombe DIR] [--cuban DIR] [--gorilla DIR] [--djembel FILE]
Each option replaces that source's lines in the JSON and leaves the others as they are.

  --candombe DIR  IEMP Uruguayan Candombe (https://doi.org/10.17605/OSF.IO/WFX7K): UC_<take>_Onsets_Selected.csv
                  and UC_<take>_Metre.csv
  --cuban DIR     IEMP Cuban Son & Salsa (https://doi.org/10.17605/OSF.IO/SFXA2): CSS_Song<n>_Onsets_Selected.csv
                  and CSS_Song<n>_Metre.csv
  --gorilla DIR   rhythm pages saved from https://djembegorilla.com/library/ (the ones tagged America)
  --djembel FILE  https://bobmiller.yolasite.com/all.php saved as HTML (its Afro-Cuban, Brazilian and Haitian rhythms)

All are used with permission. As for the African sources, only rhythms of the music itself are kept.
"""
import argparse
import csv
import glob
import json
import os
import re
import statistics

from african_sources import djembel_lines, gorilla_lines

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'latin-rhythms.json')

# ---------------------------------------------------------------- IEMP Uruguayan Candombe
# the takes' players, from UC_Files_and_Metadata.pdf
CANDOMBE_PLAYERS = {
    '211': {'R1': 'Fernando Silva', 'C': 'Luis Giménez', 'P': 'Gustavo Oviedo'},
    '212': {'R1': 'Fernando Silva', 'C': 'Luis Giménez', 'P': 'Gustavo Oviedo'},
    '213': {'R1': 'Fernando Silva', 'C': 'Luis Giménez', 'P': 'Gustavo Oviedo'},
    '221': {'R1': 'Sergio Ortuño', 'C': 'Héctor Manuel Suárez', 'P': 'Gustavo Oviedo'},
    '222': {'R1': 'Sergio Ortuño', 'C': 'Héctor Manuel Suárez', 'P': 'Gustavo Oviedo'},
    '231': {'R1': 'Sergio Ortuño', 'C': 'Luis Giménez', 'P': 'Héctor Manuel Suárez'},
    '232': {'R1': 'Sergio Ortuño', 'C': 'Luis Giménez', 'P': 'Héctor Manuel Suárez'},
    '241': {'R1': 'Luis Giménez', 'C': 'Sergio Ortuño', 'P': 'Héctor Manuel Suárez'},
    '242': {'R1': 'Héctor Manuel Suárez', 'C': 'Luis Giménez', 'P': 'Sergio Ortuño'},
    '311': {'R1': 'Fernando Silva', 'C': 'Luis Giménez', 'P': 'Gustavo Oviedo', 'R2': 'Sergio Ortuño'},
    '312': {'R1': 'Sergio Ortuño', 'C': 'Luis Giménez', 'P': 'Gustavo Oviedo', 'R2': 'Fernando Silva'},
    '321': {'R1': 'Luis Giménez', 'C': 'Sergio Ortuño', 'P': 'Héctor Manuel Suárez', 'R2': 'Fernando Silva'},
}
CANDOMBE_PARTS = {'R1': 'Repique', 'R2': 'Repique 2', 'C': 'Chico', 'P': 'Piano (drum)'}


def _cycles(rows, sep, per):
    """The complete cycles' labels, in order."""
    key = lambda lab: tuple(int(x) for x in re.split(r'[.:]', lab))
    labels = sorted({r['Label SD'].split(sep)[0] for r in rows}, key=key)
    return [c for c in labels if sum(1 for r in rows if r['Label SD'].split(sep)[0] == c) == per]


def candombe_lines(d):
    out = []
    for f in sorted(glob.glob(os.path.join(d, 'UC_*_Onsets_Selected.csv'))):
        take = os.path.basename(f).split('_')[1]
        rows = list(csv.DictReader(open(f, encoding='utf-8-sig')))
        full = _cycles(rows, ':', 16)
        # the metre file marks the four beats of each cycle (n.1 .. n.4); a cycle is one 4/4 bar
        metre = [(r['Cycle'], float(r['Time'])) for r in csv.DictReader(open(os.path.join(d, f'UC_{take}_Metre.csv')))]
        starts = {c.split('.')[0]: t for c, t in metre if c.endswith('.1')}
        nums = sorted(starts, key=int)
        lengths = {a: starts[b] - starts[a] for a, b in zip(nums, nums[1:])}
        med = statistics.median(lengths.values())
        tempi = [round(60 / (lengths.get(str(int(c)), med) / 4)) for c in full]
        players = CANDOMBE_PLAYERS.get(take, {})
        ens = ', '.join(f'{players[k]} ({CANDOMBE_PARTS[k].replace(" (drum)", "").lower()})' for k in ('R1', 'R2', 'C', 'P') if k in players)
        for k, part in CANDOMBE_PARTS.items():
            if not any(r[k].strip() for r in rows):
                continue
            grid = {(r['Label SD'].split(':')[0], int(r['SD'])): 'x' if r[k].strip() else '.' for r in rows}
            cells = ''.join(''.join(grid.get((c, s), '.') for s in range(1, 17)) for c in full)
            out.append({
                'folder': 'iempcandombe', 'title': f'Candombe ({take})', 'composer': players.get('R1', ''),
                'part': part + (f", {players[k]}" if k != 'R1' and k in players else ''),
                'meter': '4/4', 'slots': 16, 'grid': cells, 'tempi': tempi,
                'origin': 'Uruguay (Montevideo)', 'date': 'recorded 2014',
                'note': f'Candombe drumming played by {ens}. Recorded by Martín Rocamora; onsets annotated in '
                        'IEMP Uruguayan Candombe (Jure, Rocamora, Tarsitani & Clayton).',
            })
    return out


# ---------------------------------------------------------------- IEMP Cuban Son & Salsa
# from CSS_Files_and_Metadata.pdf: title, song credit, genre and clave
CUBAN_SONGS = {
    '1': ('El cantante', 'Rubén Blades', 'son, 2-3 clave'),
    '2': ('Palo Santo', 'Henry Fiol', 'son, 3-2 clave'),
    '3': ('Yo nací en un solar', 'Vicente Arencibia', 'rumba and salsa, 3-2 rumba clave'),
    '4': ('Tumbao sangreao', 'David Echevarría, John Hollis, Michel Padrón and Alejandro Albar', 'son, 2-3 clave'),
    '5': ('Habanera', 'Miguel Román', 'son, 2-3 clave'),
}
CUBAN_PARTS = {'Clave': 'Clave', 'Bass ': 'Bass guitar', 'Guitar': 'Guitar', 'Tres': 'Tres', 'Bongo': 'Bongó',
               'Bell': 'Bell (campana)', 'Cajon': 'Cajón', 'Conga': 'Congas', 'Trumpet': 'Trumpet'}


def cuban_lines(d):
    out = []
    for f in sorted(glob.glob(os.path.join(d, 'CSS_Song*_Onsets_Selected.csv'))):
        num = re.search(r'Song(\d+)', f).group(1)
        title, credit, genre = CUBAN_SONGS[num]
        rows = list(csv.DictReader(open(f, encoding='utf-8-sig')))
        full = _cycles(rows, '|', 16)
        metre = {r['Cycle']: float(r['Time']) for r in csv.DictReader(open(os.path.join(d, f'CSS_Song{num}_Metre.csv')))}
        nums = sorted(metre, key=int)
        lengths = {a: metre[b] - metre[a] for a, b in zip(nums, nums[1:])}
        med = statistics.median(lengths.values())
        # a cycle is the two-bar clave: sixteen eighth-note pulses, written as two bars of 4/4
        tempi = [round(60 / (lengths.get(c, med) / 8)) for c in full for _ in (0, 1)]
        for col, part in CUBAN_PARTS.items():
            if not any(r[col].strip() for r in rows):
                continue
            grid = {(r['Label SD'].split('|')[0], int(r['SD'])): 'x' if r[col].strip() else '.' for r in rows}
            cells = ''.join(grid.get((c, s), '.') + '.' for c in full for s in range(1, 17))
            out.append({
                'folder': 'iempcuba', 'title': title, 'composer': credit, 'part': part,
                'meter': '4/4', 'slots': 16, 'grid': cells, 'tempi': tempi,
                'origin': 'Cuba', 'date': 'recorded 2009',
                'note': f'A {genre}, played by the Havana group Asere at the Open University. Onsets annotated '
                        'in IEMP Cuban Son & Salsa (Poole, Tarsitani & Clayton).',
            })
    return out


# ---------------------------------------------------------------- Djembe Gorilla, Djembe-L
DJEMBEL_LATIN = r"^(CHANGO|COMPARSA|IJEXA|XJESA|OGGUN|OYA SONG|RUMBA|RHUMBA Y'ESA|RABODAY|YANVALOU)$"
DJEMBEL_LATIN_ORIGIN = {'Chango': 'Cuba (Afro-Cuban)', 'Comparsa': 'Cuba', 'Ijexa': 'Brazil (Bahia)', 'Xjesa': 'Brazil (Bahia)',
                        'Oggun': 'Cuba (Afro-Cuban)', 'Oya Song': 'Cuba (Afro-Cuban)', 'Rumba': 'Cuba',
                        "Rhumba Y'esa": 'Cuba', 'Raboday': 'Haiti', 'Yanvalou': 'Haiti'}
DJEMBEL_LATIN_TITLE = {'Xjesa': 'Ijexá', 'Ijexa': 'Ijexá', 'Oggun': 'Oggún', 'Chango': 'Changó',
                       'Oya Song': 'Oyá', "Rhumba Y'esa": 'Rumba yesá'}


def djembel_latin(path):
    out = djembel_lines(path, keep=DJEMBEL_LATIN, folder='djembellatin')
    for ln in out:
        ln['origin'] = DJEMBEL_LATIN_ORIGIN.get(ln['title'])
        ln['title'] = DJEMBEL_LATIN_TITLE.get(ln['title'], ln['title'])
    return out


def gorilla_latin(d):
    out = gorilla_lines(d, region='america', folder='gorillalatin')
    for ln in out:
        ln['part'] = ln['part'].replace('Hand drum', 'Drum')
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--candombe')
    ap.add_argument('--cuban')
    ap.add_argument('--gorilla')
    ap.add_argument('--djembel')
    a = ap.parse_args()
    lines = json.load(open(OUT)) if os.path.exists(OUT) else []
    for folder, arg, fn in (('iempcandombe', a.candombe, candombe_lines), ('iempcuba', a.cuban, cuban_lines),
                            ('gorillalatin', a.gorilla, gorilla_latin), ('djembellatin', a.djembel, djembel_latin)):
        if arg:
            new = fn(arg)
            lines = [ln for ln in lines if ln['folder'] != folder] + new
            print(f'{folder}: {len(new)} lines')
    with open(OUT, 'w') as f:
        json.dump(lines, f, ensure_ascii=False, separators=(',', ':'))
        f.write('\n')


if __name__ == '__main__':
    main()
