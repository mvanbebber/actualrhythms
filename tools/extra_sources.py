"""Extra corpora that aren't in music21: Joplin's rags (Craig Sapp's Humdrum edition) and the
public-domain lead sheets of OpenEWLD. Each yields (path, folder, meta) jobs for build_corpus.py;
meta supplies the title, composer, origin and dated label shown in the app.

Copyright: OpenEWLD is "free of copyright" by European life+70 rules, which is not the same as US
public domain. Only songs first performed in 1930 or earlier, traditional songs, and undated songs
whose writers all died before 1931 are used (US public domain as of 2026: published by 1930).
"""
import os
import re
import sqlite3

US_PD_LAST_YEAR = 1930
NATIONALITY = {'United States': 'USA', 'United Kingdom': 'UK', 'Russian Federation': 'Russia'}


def joplin_jobs(root):
    """root: a clone of https://github.com/craigsapp/joplin (CC BY-NC-SA 4.0)."""
    kern = os.path.join(root, 'kern')
    for f in sorted(os.listdir(kern)):
        if not f.endswith('.krn'):
            continue
        path = os.path.join(kern, f)
        head = {}
        with open(path, encoding='utf-8', errors='replace') as fh:
            for line in fh:
                m = re.match(r'^!!!(\w+(?:-\w+)?):\s*(.*)$', line)
                if m:
                    head.setdefault(m.group(1), m.group(2).strip())
                elif not line.startswith('!'):
                    break
        title = head.get('OTL') or os.path.splitext(f)[0]
        year = (head.get('PDT') or head.get('ODT') or '')[:4]
        yield path, 'joplinrags', {
            'title': title, 'composer': 'Scott Joplin', 'origin': 'USA',
            'date': f'published {year}' if year.isdigit() else None,
        }


def openewld_jobs(root):
    """root: a clone of https://github.com/00sapo/OpenEWLD."""
    db = sqlite3.connect(os.path.join(root, 'OpenEWLD.db'))
    works = db.execute('select id, title, first_performance_date, path_leadsheet from works').fetchall()
    kept = skipped = 0
    for wid, title, date, path in works:
        authors = db.execute('''select wa.author, a.death, a.nationality from work_author wa
                                left join authors a on a.common_name = wa.author where wa.id = ?''', (wid,)).fetchall()
        traditional = any('Traditional' in (a[0] or '') for a in authors)
        people = [a for a in authors if 'Traditional' not in (a[0] or '')]
        year = int(str(date)[:4]) if date and str(date)[:4].isdigit() else None
        deaths = [int(str(a[1])[:4]) if a[1] and str(a[1])[:4].isdigit() else None for a in people]
        if year is not None:
            ok = year <= US_PD_LAST_YEAR
        elif traditional and not people:
            ok = True
        else:
            ok = bool(people) and all(d is not None and d <= US_PD_LAST_YEAR for d in deaths)
        if not ok:
            skipped += 1
            continue
        kept += 1
        nats = list(dict.fromkeys(NATIONALITY.get(a[2], a[2]) for a in people if a[2]))
        # the folder name lists every writer ('Lorenz_Hart-Richard_Rodgers'); the author table can miss some
        folder_names = [n.replace('_', ' ') for n in path.split('/')[1].split('-') if 'Traditional' not in n]
        composer = ' & '.join(folder_names or [a[0] for a in people])
        yield os.path.join(root, path), 'openewld', {
            'title': title, 'composer': composer,
            'origin': ' / '.join(nats) or None,
            'date': f'first performed {year}' if year else ('traditional' if traditional and not people else None),
        }
    openewld_jobs.counts = (kept, skipped)
