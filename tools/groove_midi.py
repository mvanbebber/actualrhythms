"""Latin and African drum grooves from the Groove MIDI Dataset (Gillick, Roberts, Engel, Eck & Bamman, 2019;
Magenta, https://magenta.tensorflow.org/datasets/groove, CC BY 4.0).

Ten professional drummers played the dataset on an electronic kit to a click; each performance is a MIDI file
named for its style. This reads the grooves (not the two-second fills) in Latin American, Afro-Cuban, reggae,
calypso, afrobeat and highlife styles, quantizes each to the sixteenth or the eighth-note triplet (whichever the playing fits
better), and splits the kit into its lines: kick, snare, cross-stick, hi-hat, ride and toms. The lines go into
tools/latin-rhythms.json (Latin and Caribbean) and tools/african-drums.json, spelled as notation by tools/african_drums.py.

Usage: python3 groove_midi.py DIR   (DIR: the unzipped groove/ folder of groove-v1.0.0-midionly.zip)
"""
import csv
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

# style (the dataset's label) -> (title, origin, region); styles not listed are left out
STYLES = {
    'latin/brazilian-baiao': ('Baião', 'Brazil', 'latin'),
    'latin/samba': ('Samba', 'Brazil', 'latin'),
    'latin/brazilian-samba': ('Samba', 'Brazil', 'latin'),
    'latin/brazilian-sambareggae': ('Samba-reggae', 'Brazil (Bahia)', 'latin'),
    'latin/brazilian-songo': ('Songo', 'Cuba', 'latin'),
    'latin/brazilian-ijexa': ('Ijexá', 'Brazil (Bahia)', 'latin'),
    'latin/brazilian-bossa': ('Bossa nova', 'Brazil', 'latin'),
    'latin/brazilian-maracatu': ('Maracatu', 'Brazil (Pernambuco)', 'latin'),
    'latin/brazilian-frevo': ('Frevo', 'Brazil (Pernambuco)', 'latin'),
    'latin/brazilian': ('Brazilian groove', 'Brazil', 'latin'),
    'latin/chacarera': ('Chacarera', 'Argentina', 'latin'),
    'latin/merengue': ('Merengue', 'Dominican Republic', 'latin'),
    'latin/dominican-merengue': ('Merengue', 'Dominican Republic', 'latin'),
    'latin/venezuelan-joropo': ('Joropo', 'Venezuela', 'latin'),
    'latin/venezuelan-sangueo': ('Sangueo', 'Venezuela', 'latin'),
    'latin/reggaeton': ('Reggaetón', 'Puerto Rico', 'latin'),
    'latin/bomba': ('Bomba', 'Puerto Rico', 'latin'),
    'latin/ando': ('Latin groove in 3', '', 'latin'),
    'latin': ('Latin groove', '', 'latin'),
    'afrocuban': ('Afro-Cuban groove', 'Cuba', 'latin'),
    'afrocuban/bembe': ('Bembé', 'Cuba', 'latin'),
    'afrocuban/rhumba': ('Rumba', 'Cuba', 'latin'),
    'reggae': ('Reggae', 'Jamaica', 'caribbean'),
    'reggae/slow': ('Reggae', 'Jamaica', 'caribbean'),
    'afrocuban/calypso': ('Calypso', 'Trinidad and Tobago', 'caribbean'),
    'afrobeat': ('Afrobeat', 'Nigeria', 'african'),
    'highlife': ('Highlife', 'Ghana', 'african'),
}
METERS = {'4-4': (4, 4), '3-4': (3, 4)}
# the kit's lines: General MIDI drum notes (as the dataset's Roland kit records them) -> line name
LINES = {
    'Kick': {36},
    'Snare': {38, 40},
    'Cross-stick': {37},
    'Hi-hat': {42, 22, 46, 26},
    'Ride': {51, 59, 53},
    'Toms': {48, 50, 45, 47, 43, 58},
}
MIN_VELOCITY = 15  # softer hits are mostly stray triggers of the electronic pads


def notes_of(path):
    from music21 import midi
    mf = midi.MidiFile()
    mf.open(path)
    mf.read()
    mf.close()
    out = []
    for t in mf.tracks:
        tick = 0
        for e in t.events:
            if isinstance(e, midi.DeltaTime):
                tick += e.time
            elif e.type == midi.ChannelVoiceMessages.NOTE_ON and e.velocity >= MIN_VELOCITY:
                out.append((tick, e.pitch))
    return mf.ticksPerQuarterNote, sorted(out)


def grooves(d):
    lines = []
    rows = [r for r in csv.DictReader(open(os.path.join(d, 'info.csv')))
            if r['beat_type'] == 'beat' and r['style'] in STYLES and r['time_signature'] in METERS]
    count = {}
    for r in rows:
        title, origin, region = STYLES[r['style']]
        num, den = METERS[r['time_signature']]
        tpq, notes = notes_of(os.path.join(d, r['midi_filename']))
        if not notes:
            continue
        # the grid the playing fits better: sixteenths or eighth-note triplets
        def err(step):
            return sum(min(t % step, step - t % step) for t, _ in notes) / len(notes) / step
        triplet = num == 4 and err(tpq / 3) < err(tpq / 4) * 0.8
        per_beat = 3 if triplet else 4
        step = tpq / per_beat
        slots = num * per_beat
        n_bars = int(max(t for t, _ in notes) // (tpq * num)) + 1
        drummer = int(re.sub(r'\D', '', r['drummer']))
        count[(title, drummer)] = count.get((title, drummer), 0) + 1
        k = count[(title, drummer)]
        name = f'{title} (drummer {drummer}' + (f', take {k})' if k > 1 else ')')
        bpm = int(r['bpm'])
        for line, pitches in LINES.items():
            grid = ['.'] * (n_bars * slots)
            for t, p in notes:
                if p in pitches:
                    i = int(round(t / step))
                    if i < len(grid):
                        grid[i] = 'x'
            g = ''.join(grid)
            if g.count('x') < 4:
                continue
            lines.append({
                'folder': {'latin': 'gmdlatin', 'caribbean': 'gmdcaribbean', 'african': 'gmdafrica'}[region], 'region': region,
                'title': name, 'composer': f'Drummer {drummer}', 'part': f'Drum kit: {line.lower()}',
                'meter': '12/8' if triplet else f'{num}/{den}', 'slots': slots, 'grid': g,
                'tempi': [bpm] * n_bars, 'origin': origin, 'date': 'recorded 2018',
                'note': f'{"An" if title[0] in "AEIOU" else "A"} {title.lower()} groove played on an electronic drum kit by drummer {drummer} of the '
                        'Groove MIDI Dataset (Magenta, CC BY 4.0), quantized to the '
                        + ('eighth-note triplet.' if triplet else 'sixteenth.'),
            })
    return lines


def main():
    lines = grooves(sys.argv[1])
    for region, fname, folder in (('latin', 'latin-rhythms.json', 'gmdlatin'), ('caribbean', 'latin-rhythms.json', 'gmdcaribbean'),
                                  ('african', 'african-drums.json', 'gmdafrica')):
        path = os.path.join(HERE, fname)
        old = [ln for ln in json.load(open(path)) if ln['folder'] != folder]
        new = [{k: v for k, v in ln.items() if k != 'region'} for ln in lines if ln['region'] == region]
        with open(path, 'w') as f:
            json.dump(old + new, f, ensure_ascii=False, separators=(',', ':'))
            f.write('\n')
        print(f'{folder}: {len(new)} lines')


if __name__ == '__main__':
    main()
