"""Site housekeeping: the credit line on every page, structured data (schema.org JSON-LD) and the sitemap.

The credit line ("Developed by Michael Van Bebber · Version … · ©") is written into a <p class="made-by"> on
every page, with the version from the VERSION file at the site root: to release a new version, edit VERSION
and run this script.

Each landing page gets a WebPage and a BreadcrumbList (Actual Rhythms > the page), built from the page's own
title, description and social image, in a <script id="ld"> block that is replaced on every run. The app page
(index.html) keeps its hand-written WebSite + WebApplication block. The sitemap's lastmod dates are set to
the day each page last changed in git (today for uncommitted changes).

Usage: python3 tools/seo.py   (tools/numbers/build.py runs it after writing the In numbers page)
"""
import datetime
import html
import json
import os
import re
import subprocess

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = 'https://actualrhythms.com/'
PAGES = ['why', 'same-rhythm', 'jazz', 'teachers', 'compare', 'numbers']


def meta(s, pattern):
    m = re.search(pattern, s)
    return html.unescape(m.group(1)) if m else ''


def page_ld(slug, s):
    url = f'{BASE}{slug}/'
    title = meta(s, r'<title>([^<]*)</title>')
    name = re.sub(r'\s*\|\s*Actual Rhythms$', '', title)
    return {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'WebPage', '@id': url + '#webpage', 'url': url, 'name': name,
                'description': meta(s, r'<meta name="description" content="([^"]*)"'),
                'image': meta(s, r'<meta property="og:image" content="([^"]*)"'),
                'inLanguage': 'en', 'isAccessibleForFree': True,
                'isPartOf': {'@id': BASE + '#website'},
                'breadcrumb': {'@id': url + '#breadcrumb'},
            },
            {
                '@type': 'BreadcrumbList', '@id': url + '#breadcrumb',
                'itemListElement': [
                    {'@type': 'ListItem', 'position': 1, 'name': 'Actual Rhythms', 'item': BASE},
                    {'@type': 'ListItem', 'position': 2, 'name': name, 'item': url},
                ],
            },
        ],
    }


def structured_data():
    for slug in PAGES:
        path = os.path.join(SITE, slug, 'index.html')
        s = open(path, encoding='utf-8').read()
        block = ('<script type="application/ld+json" id="ld">\n'
                 + json.dumps(page_ld(slug, s), indent=1, ensure_ascii=False) + '\n</script>\n')
        s = re.sub(r'<script type="application/ld\+json" id="ld">.*?</script>\n', '', s, flags=re.S)
        s = s.replace('</head>', block + '</head>', 1)
        open(path, 'w', encoding='utf-8').write(s)


CREDIT_PAGES = ['index.html', '404.html'] + [f'{p}/index.html' for p in PAGES]


def credit_line():
    version = open(os.path.join(SITE, 'VERSION')).read().strip()
    year = datetime.date.today().year
    years = '2026' if year == 2026 else f'2026–{year}'
    return (f'<p class="made-by">Developed by Michael Van Bebber · Version {version} · © {years} Michael Van Bebber. '
            'The music belongs to its composers, performers and transcribers, credited with each rhythm.</p>')


def credits():
    line = credit_line()
    for rel in CREDIT_PAGES:
        path = os.path.join(SITE, rel)
        s = open(path, encoding='utf-8').read()
        if '<p class="made-by">' in s:
            s = re.sub(r'<p class="made-by">.*?</p>', line, s, count=1, flags=re.S)
        elif '</footer>' in s:  # landing pages: the last line of the footer
            s = s.replace('  </div>\n</footer>', f'    {line}\n  </div>\n</footer>', 1)
            if line not in s:
                raise SystemExit(f'{rel}: no place for the credit line')
        else:
            raise SystemExit(f'{rel}: no <p class="made-by"> or footer for the credit line')
        open(path, 'w', encoding='utf-8').write(s)


def last_changed(path):
    """The day a file last changed: its last commit, or today if it has uncommitted changes."""
    dirty = subprocess.run(['git', 'status', '--porcelain', '--', path], cwd=SITE, capture_output=True, text=True).stdout
    if not dirty.strip():
        day = subprocess.run(['git', 'log', '-1', '--format=%cs', '--', path], cwd=SITE, capture_output=True, text=True).stdout.strip()
        if day:
            return day
    return datetime.date.today().isoformat()


def sitemap():
    path = os.path.join(SITE, 'sitemap.xml')
    s = open(path).read()
    def fix(m):
        loc = m.group(1)
        rel = loc[len(BASE):]
        f = os.path.join(rel, 'index.html') if rel else 'index.html'
        if not rel:  # the app: its page, code and data
            day = max(last_changed(p) for p in ('index.html', 'app.js', 'styles.css', 'data/rhythms.js'))
        else:
            day = last_changed(f)
        return f'<loc>{loc}</loc><lastmod>{day}</lastmod>'
    s = re.sub(r'<loc>([^<]*)</loc><lastmod>[^<]*</lastmod>', fix, s)
    open(path, 'w').write(s)


if __name__ == '__main__':
    credits()
    structured_data()
    sitemap()
    print('credit line on', len(CREDIT_PAGES), 'pages; structured data on', len(PAGES), 'landing pages; sitemap dates updated')
