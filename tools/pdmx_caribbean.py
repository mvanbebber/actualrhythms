"""Caribbean songs from PDMX (the Public Domain MusicXML dataset, https://zenodo.org/records/13763756).

The scores of PDMX that are Caribbean music: Jamaican mento and folk songs, Trinidadian calypso, and Jamaican
ska, rocksteady and reggae, one score per song, credits cleaned up here. Used with permission. Read like
tools/pdmx_african.py; the processed excerpts are kept in tools/pdmx-caribbean-windows.json (pass
--pdmx-caribbean DIR to build_corpus.py to regenerate them).
"""
FOLDER = 'pdmxcaribbean'

# PDMX hash -> (title, composer or performer, origin, date, note)
SCORES = {
    'QmYD4smPJdRw3VQ8VYogjDDqJ225NrkaeNCHwSEHMP6jaA': ('Day-O (Banana Boat Song)', '', 'Jamaica', 'traditional',
        'A Jamaican work song of the banana loaders, made famous by Harry Belafonte in 1956.'),
    'QmYcP1tA6Bjex6bqfaz9FF2AZcDdtC4MqDa1vCXdDCybJM': ('Jamaica Farewell', 'Irving Burgie (Lord Burgess)', 'Jamaica', 'composed 1955',
        'A calypso by Irving Burgie, sung by Harry Belafonte.'),
    'QmWzoAhbh1roUDphLBfMRHzDPxs2DaYqNafXvWZLSFNoEm': ('Matilda', 'King Radio (Norman Span)', 'Trinidad and Tobago', 'composed 1938',
        'A calypso by King Radio, made famous by Harry Belafonte.'),
    'QmZNxrKKsfAL6iUzDe2rWQhYXPeGon8s7GE6QW6AZ2tYw6': ('Linstead Market', '', 'Jamaica', 'traditional',
        'A Jamaican mento folk song.'),
    'QmaCM1MVj8zQB4PT4wDDofFc9XP7Vt3rNxUfSz7qh9AQZe': ('Mary Ann', 'Roaring Lion', 'Trinidad and Tobago', 'composed 1945',
        'A Trinidadian calypso.'),
    'QmR4Hwp9CFqV8tvx6dKDfGhTyVoTefYV86T5aTnk93NzJt': ('Rumba Calypso', '', 'Jamaica', 'traditional',
        'A Jamaican folk calypso.'),
    'QmTNj4Sc1J5b6ciaP25P3ShQsedHnBDR54Y5S2bmS4CHaQ': ('Mockingbird', '', 'West Indies', 'traditional',
        'A West Indian folk song.'),
    'Qmaj9qdJ4AN3tj5D7zsn9pyrxMwM5H1DnRHQHwrzNxn93r': ('Kingston Town', 'Lord Creator', 'Jamaica', 'recorded 1970',
        'A Jamaican reggae song by Lord Creator, later covered by UB40.'),
    'QmNotnHECHzBDQ1x94AuZE4pLKgj4PBDAgwFGXFEbWABZn': ('The Virgin Mary Had a Baby Boy', '', 'Trinidad and Tobago', 'traditional',
        'A West Indian Christmas carol from Trinidad.'),
    'QmWus5cY36SYPhmdYhFDsD7P2GLvr7NCkmyt4RuNR7K6LL': ('Calabash', 'The Skatalites', 'Jamaica', 'recorded 1960s',
        'A ska instrumental by the Skatalites.'),
    'QmWtJLywfMxs1htLUrkVpBnCfeT83HnFLUc4GiexfZCtGG': ('Rivers of Babylon', 'The Melodians', 'Jamaica', 'recorded 1970',
        'A rocksteady and reggae song by the Melodians, after Psalm 137.'),
}


def jobs(d):
    """(path, folder, meta) jobs for build_corpus.process_file, one per score found in d."""
    import os
    for h, (title, composer, origin, date, note) in SCORES.items():
        p = os.path.join(d, h + '.json')
        if os.path.exists(p):
            yield (p, FOLDER, {'title': title, 'composer': composer, 'origin': origin, 'date': date, 'note': note})
