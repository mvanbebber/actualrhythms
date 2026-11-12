"""African songs from PDMX (the Public Domain MusicXML dataset, https://zenodo.org/records/13763756).

PDMX holds 250,000 MuseScore scores shared under public-domain or CC0 terms. These are the ones that are
African music: anthems, hymns, folk and popular songs, with each score's credits cleaned up here. Every
staff with notes is read, like the rest of the corpus. Used with permission.

PDMX ships each score as MusicRender JSON (notes with onsets and durations in ticks, plus time signatures and
barlines), not MusicXML; to_score() turns one into a music21 score of measures. The processed excerpts are
kept in tools/pdmx-african-windows.json; pass --pdmx-african DIR (the scores' JSON files from PDMX.tar.gz,
named by their PDMX hash) to build_corpus.py to regenerate them.
"""
from fractions import Fraction
FOLDER = 'pdmxafrica'

# PDMX hash -> (title, composer or performer, origin, date, note)
SCORES = {
    'QmRG6LTvCDUqz2MHZMc7c88n3BjcgBDJcjhjLPcYmsr5JF': ("Nkosi Sikelel' iAfrika", 'Enoch Sontonga', 'South Africa', 'composed 1897',
        'The hymn that became a pan-African anthem, now part of the national anthems of South Africa, Tanzania and Zambia.'),
    'QmYyKAcJL8oDFw2sdzNXWN9W2EFnZaniruAV6rh8F2zkJb': ('God Bless Our Homeland Ghana', 'Philip Gbeho', 'Ghana', 'composed 1956',
        'The national anthem of Ghana.'),
    'QmZVp3sZHADs5egZLUMJEJ78sX6gm9km1yiqCS557z1oUQ': ('Siyahamba', '', 'South Africa (Zulu)', 'traditional',
        'A Zulu song, "We are marching in the light of God".'),
    'QmWgUPv21DKt9Ajcq6y8AERpivp54XDNyCmoGT71A7hybf': ('Pata Pata', 'Miriam Makeba', 'South Africa (Xhosa)', 'recorded 1967',
        "Miriam Makeba's hit, from a Xhosa dance song."),
    'Qmeq25BQGQ8gVUak8MKQbkSHw17VGDrAeu9gKBAk8QXq3w': ('The Lion Sleeps Tonight (Mbube)', 'Solomon Linda', 'South Africa (Zulu)', 'recorded 1939',
        'Solomon Linda\'s "Mbube", known in English as "The Lion Sleeps Tonight".'),
    'QmRavwuSw4qDr5MpiUQZRu1iKwDTGwQX9pvMf338oAwaSp': ('Asimbonanga', 'Johnny Clegg', 'South Africa', 'recorded 1987',
        'Johnny Clegg and Savuka\'s song for Nelson Mandela.'),
    'QmU4nHi51zgmtvnyFwfTXgUeLN734iYTrqsJEZHArVS9r8': ('Shosholoza', '', 'South Africa (Ndebele, Zulu)', 'traditional',
        'A work song of the miners who traveled from Zimbabwe to the South African mines.'),
    'QmVy4WrvSa9z7UXtAoF2WCk2hfENKb77Nv3EqnmgGC9Tix': ('Watsha', '', 'South Africa', 'traditional', 'A South African folk song.'),
    'QmV2tFVc7tCcjBHyDdRmc6PEZ6aS1VwpbA1hY3PPMgZF9j': ('Amen Siakudumisa', '', 'South Africa (Xhosa)', 'traditional',
        'A Xhosa hymn of praise.'),
    'QmcVpoT9KjGRStj2fLjV6ZAvSEowz9izYaZFYjws6cCY4P': ('Rea Go Boka', '', 'South Africa (Sotho, Tswana)', 'traditional',
        'A South African hymn, "We worship you".'),
    'QmdupbULZraGvHBhrEuA7cC28Duemcfg652dsKpEq6p8sP': ('Hona Jwale', '', 'Lesotho, South Africa (Sotho)', 'traditional', 'A Sotho song.'),
    'QmPubYQccHapwoDxDt6wG2Wforzp8MRz3u5kZhSmM6wuoH': ('Volo Volo', '', 'South Africa (Xhosa)', 'traditional', 'A Xhosa song.'),
    'QmVnUNrHjh1b761axHqSxvAE6GXuwnKpzgNCyg21bNJ5aK': ('Tula Ngemba na Ntoto Nvimba', '', 'Southern Africa', 'traditional',
        'A song for peace over the whole earth.'),
    'QmVrho1hCxZofB6jqPe2VjsBuYiNmAU1p5LNWpUre4S5av': ('Mbele Mama', '', 'East Africa', 'traditional', 'A traditional song, sung as a round.'),
    'QmRCcZpKJjtRFghJ6DyqAD1XuqojqKSfvDDSeN6jDGk8kW': ('Malaika', '', 'Kenya, Tanzania (Swahili)', 'traditional',
        'A Swahili love song, "My angel", made famous by Fadhili William and Miriam Makeba.'),
    'QmcdM911L8QxSozobKUUu3dveMY5KVeToJgvixwg1UEYDr': ('Chemtengure', '', 'Zimbabwe (Shona)', 'traditional', 'A Shona song, arranged for voices from marimba music.'),
    'QmcQJF9ANPyQNUdQcBnNch28zwgmgMCCS2DEa5QsRztuCw': ('Sansa Kroma', '', 'Ghana (Akan)', 'traditional', 'An Akan children\'s song about the hawk.'),
    'QmYoQWuwGW6dVLfa2r67UGNpbu5E3JjXFhTzspCEBP8987': ('Ayelevi', '', 'Ghana', 'traditional', 'A Ghanaian folk song.'),
    'QmRVcus7Zek4V7nkU4eWkLe5MstfiXV5yvaBjC3M2XKv6B': ('Jesu, Jesu', '', 'Ghana (Chereponi)', 'traditional',
        'A Ghanaian folk melody from Chereponi, known as a hymn through Tom Colvin.'),
    'QmcfdKihptGsCUWWDhm6X75QXLMbKJueB8h7YqaVRJdVyu': ('Me Nyame (Nkyinho)', '', 'Ghana (Akan)', '', 'A Twi hymn.'),
    'QmUNavPicYkyRS4RiFv5QZkuquV9DwnRphMRvS9bD69dNh': ('Me Nyame Yɛ', '', 'Ghana (Akan)', '', 'A Twi hymn.'),
    'QmbkrtQH7WbUNQ5zezUivvxgouWVPz5XJ1vUR1tLarkZNn': ('Kokoleoko', '', 'West Africa', 'traditional', 'A West African song about the rooster.'),
    'Qmd77kVVLfxY5vgDuiwdK1tn598xw7awpY5zF1tvoD4hFD': ('Banuwa', '', 'Liberia', 'traditional', 'A Liberian song, sung as a round.'),
    'QmbJXkHEdSzV2KN4P6nyPCsAa2EY48MbK4oBmFuQurzgd8': ('Banaha', '', 'Congo', 'traditional', 'A Congolese folk song.'),
    'QmfQBHtKf8FdTN9pMKfAWgkABbZkEvEf2F3ukrnBk8R4us': ('Soul Makossa', 'Manu Dibango', 'Cameroon', 'recorded 1972',
        "Manu Dibango's makossa hit."),
    'QmY4Vr4iXMAE1qYLR3remrWt5iWFt43mrXxmLbBcUKarzG': ('If', 'Davido', 'Nigeria', 'recorded 2017', 'An Afrobeats hit by Davido.'),
    'QmPL3q1WwgXk9yFFmx5rLdtpD7TR75Yy7yFAUFqjsiufHq': ('E Je Ka Jo Yo', '', 'Nigeria (Yoruba)', '', 'A Yoruba song of rejoicing.'),
    'Qmb9r9NST4nu9vMDZSMt5jTLovrCeLKmXKzygZoC2UZX7p': ('Eh Soom Boo', '', 'Nigeria', 'traditional', 'A Nigerian folk song.'),
    'QmPyobmLYthDgPVmTk2U4BNb6xuxLy6DhbPuhLc6R1RmLJ': ('Sol Ela (Song of the Evening)', '', 'Nigeria (Ogoni)', '',
        'An Ogoni song, arranged by Holyone Tombari Dodoh.'),
    'QmNQaYry7gquEaQ9UWogxBc7Pti7mtMaVjzKFFVK2hSurj': ('I Am What He Is', 'Just-Joe O. Adeola', 'Nigeria', '', 'A Nigerian choral song.'),
    'QmXTb32RFLf4epszByELu1wNW7dX7JyhW6eq4u3ehtyjVq': ('ANMSFAC Anthem', 'Nsuhoridem Pius', 'Nigeria', 'composed 2020',
        'The anthem of the All Nigeria Major Seminary Festival of Art and Culture.'),
    'QmPCHnnypNEqRJnyC2kQfZh2jRcB2YU9ZbWAcRoAhpLsZ5': ('Ekisa Kya Yesu', 'Nsiko Samuel', 'Uganda', '', 'Ugandan Pentecostal worship.'),
    'QmR9398jUvxswCz8kx7aRvof3EanVFVBmGMM457PPUnogy': ('Ayi Yesu Kabaka Owe Kisa', '', 'Uganda', '', 'Ugandan Pentecostal worship.'),
}


def to_score(path):
    """A music21 Score from a PDMX MusicRender JSON file: one part per track (drum tracks skipped), each a
    line of the track's highest notes, in measures from the score's barlines."""
    import json
    from music21 import chord, meter, note, stream
    d = json.load(open(path))
    res = d['resolution']
    ql = lambda t: Fraction(t, res)
    bars = sorted({b['time'] for b in d['barlines']} | {0})
    end = d.get('song_length') or 0
    tss = sorted(d['time_signatures'], key=lambda t: t['time'])
    def ts_at(t):
        cur = tss[0] if tss else {'numerator': 4, 'denominator': 4}
        for x in tss:
            if x['time'] <= t:
                cur = x
        return cur['numerator'], cur['denominator']
    # bar starts: the barlines, else every bar of the running time signature
    starts, t = [], 0
    while t < end:
        starts.append(t)
        n, dd = ts_at(t)
        nxt = t + res * 4 * n // dd
        later = [b for b in bars if t < b < nxt]
        t = later[0] if later else nxt
    score = stream.Score()
    used = {}
    for tr in d['tracks']:
        if str(tr.get('is_drum')) == 'True':
            continue
        notes = [n for n in tr['notes'] if not n.get('is_grace') and n['duration'] > 0]
        if not notes:
            continue
        by_on = {}
        for n in notes:
            by_on.setdefault(n['time'], []).append(n)
        onsets = sorted(by_on)
        line = []  # (start, end, pitches): the top line, each note cut at the next onset
        for i, on in enumerate(onsets):
            top = max(by_on[on], key=lambda n: n['pitch'])
            stop = on + max(n['duration'] for n in by_on[on] if n['pitch'] == top['pitch'])
            if i + 1 < len(onsets):
                stop = min(stop, onsets[i + 1])
            line.append((on, stop, [top['pitch']]))
        part = stream.Part()
        name = tr.get('name') if tr.get('name') not in (None, 'None', '') else 'Melody'
        used[name] = used.get(name, 0) + 1
        part.partName = name if used[name] == 1 else f'{name} {used[name]}'
        prev_ts = None
        for k, b0 in enumerate(starts):
            b1 = starts[k + 1] if k + 1 < len(starts) else end
            m = stream.Measure(number=k + 1)
            ts = ts_at(b0)
            if ts != prev_ts:
                m.insert(0, meter.TimeSignature(f'{ts[0]}/{ts[1]}'))
                prev_ts = ts
            for s0, s1, ps in line:
                if s1 <= b0 or s0 >= b1:
                    continue
                a, z = max(s0, b0), min(s1, b1)
                el = note.Note(ps[0]) if len(ps) == 1 else chord.Chord(ps)
                el.quarterLength = ql(z - a)
                if s0 < b0 or s1 > b1:
                    from music21 import tie
                    el.tie = tie.Tie('stop' if s1 <= b1 else 'continue' if s0 < b0 else 'start')
                m.insert(ql(a - b0), el)
            m.makeRests(fillGaps=True, inPlace=True, timeRangeFromBarDuration=True)
            part.append(m)
        score.insert(0, part)
    return score


def jobs(d):
    """(path, folder, meta) jobs for build_corpus.process_file, one per score found in d."""
    import os
    for h, (title, composer, origin, date, note) in SCORES.items():
        for ext in ('.json', '.mxl', '.musicxml', '.xml'):
            p = os.path.join(d, h + ext)
            if os.path.exists(p):
                yield (p, FOLDER, {'title': title, 'composer': composer, 'origin': origin, 'date': date, 'note': note})
                break
