"""Build the In numbers page (numbers/index.html) from stats.json (tools/numbers/stats.js) and the notation SVGs in img/.
Also writes corpus.html beside this script: the same infographic as a standalone page."""
import json, re, os, html

HERE = os.path.dirname(os.path.abspath(__file__))
st = json.load(open(os.path.join(HERE, 'stats.json')))
esc = html.escape
fmt = lambda n: f'{n:,}'

# genre identity colors: the validated categorical palette, in its fixed order
GC = {'folk': '#2a78d6', 'chorale': '#eb6834', 'classical': '#1baf7a', 'ragtime': '#eda100',
      'jazz': '#e87ba4', 'popular': '#008300', 'latin': '#6250d6', 'african': '#e34948',
      # a ninth genre gets no generated hue: it takes the neutral "other" gray (every row is labeled)
      'caribbean': '#898781'}
G = st['genres']
GL = {g['g']: g['label'] for g in G}


def svg(name):
    s = open(os.path.join(HERE, 'img', name)).read()
    s = re.sub(r'\s(width|height)="[^"]*"', '', s, count=2)
    return s.replace('<svg ', '<svg class="notation" aria-hidden="true" ', 1)


def hbars(rows, maxv, unit=''):
    """rows: (label, value, color, tip, valtext)"""
    out = []
    for label, v, color, tip, vt in rows:
        w = 0 if not maxv else max(0.6, 100 * v / maxv)
        out.append(f'''<div class="hb" data-tip="{esc(tip)}" tabindex="0">
  <span class="hb-label">{label}</span>
  <span class="hb-track"><span class="hb-bar" style="width:{w:.2f}%;background:{color}"></span></span>
  <span class="hb-val">{vt}</span>
</div>''')
    return '\n'.join(out)


T = st['totals']
years_span = T['maxY'] - T['minY']

# --- genre small multiples
def genre_panel(key, title, value, fmtv, note):
    rows = sorted(G, key=lambda g: -value(g))
    mx = max(value(g) for g in G)
    return f'''<div class="panel"><h3>{title}</h3><p class="panel-note">{note}</p>
{hbars([(f'<i class="sw" style="background:{GC[g["g"]]}"></i>{esc(g["label"])}', value(g), GC[g['g']],
        f'{g["label"]}: {fmtv(value(g))} {title.lower()}', fmtv(value(g))) for g in rows], mx)}</div>'''

per_piece = lambda g: g['rhythms'] / g['pieces'] if g['pieces'] else 0
genre_html = (genre_panel('p', 'Pieces', lambda g: g['pieces'], fmt, 'Each piece counts once.')
              + genre_panel('r', 'Rhythms', lambda g: g['rhythms'], fmt, 'A rhythm counts once in every genre it appears in.')
              + genre_panel('pp', 'Rhythms per piece', per_piece, lambda v: f'{v:.1f}', 'Long works give many; a folk tune gives a few.'))

# --- collections
cols = [c for c in st['collections'] if c['pieces'] >= 9]
cmx = max(c['pieces'] for c in cols)
coll_html = hbars([(esc(c['label']), c['pieces'], GC[c['genre']], f"{c['label']} ({GL[c['genre']]}): {fmt(c['pieces'])} pieces", fmt(c['pieces'])) for c in cols], cmx)

# --- timeline: one row per genre, a column per decade, each row scaled to its own busiest decade
start, end = 1590, 2030
decades = list(range(start, end, 10))
tl_rows = []
for g in G:
    ys = st['years'].get(g['g'], {})
    if not ys:
        continue
    vals = {int(k): v for k, v in ys.items()}
    mx = max(vals.values())
    tot = sum(vals.values())
    cells = ''.join(
        f'<span class="tl-c" style="--h:{(100 * vals[d] / mx) if d in vals else 0:.1f}%;--c:{GC[g["g"]]}" '
        + (f'data-tip="{esc(g["label"])}, {d}s: {fmt(vals[d])} piece{"s" if vals[d] != 1 else ""}" tabindex="0"' if d in vals else '')
        + '></span>' for d in decades)
    tl_rows.append(f'<div class="tl-row"><span class="tl-label"><i class="sw" style="background:{GC[g["g"]]}"></i>{esc(g["label"])}<small>{fmt(tot)} dated</small></span><span class="tl-cells">{cells}</span></div>')
ticks = ''.join(f'<span style="left:{100 * (y - start) / (end - start):.2f}%">{y}</span>' for y in range(1600, 2030, 50))
timeline_html = '\n'.join(tl_rows) + f'<div class="tl-axis"><span class="tl-label"></span><span class="tl-ticks">{ticks}</span></div>'

# --- countries
cty = [c for c in st['countries'] if c[0] not in ('Germany / France',)][:10]
ctmx = cty[0][1]
country_html = hbars([(esc(n), v, 'var(--teal)', f'{n}: {fmt(v)} pieces', fmt(v)) for n, v in cty], ctmx)

# --- meters
mt = st['meters']
mtot = sum(v for _, v in mt)
meter_html = hbars([(f'<span class="meter">{m}</span>', v, 'var(--teal)', f'{m}: {fmt(v)} rhythms ({100 * v / mtot:.1f}%)', f'{100 * v / mtot:.1f}%') for m, v in mt], mt[0][1])

# --- difficulty: 100% stacked per genre, ordinal blue ramp
RAMP = ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281']
LEVELN = ['1 Beats', '2 Subdivided', '3 Syncopated', '4 Sixteenths', '5 Advanced']
lv_rows = []
for g in G:
    lv = g['levels'] or [0] * 5
    tot = sum(lv) or 1
    segs = ''.join(f'<span class="st-seg" style="flex:{v};background:{RAMP[i]}" data-tip="{esc(g["label"])}, level {LEVELN[i]}: {fmt(v)} rhythms ({100 * v / tot:.0f}%)" tabindex="0"></span>' for i, v in enumerate(lv) if v)
    lv_rows.append(f'<div class="st-row"><span class="st-label"><i class="sw" style="background:{GC[g["g"]]}"></i>{esc(g["label"])}</span><span class="st-bar">{segs}</span></div>')
legend = ''.join(f'<span><i class="sw" style="background:{RAMP[i]}"></i>{LEVELN[i]}</span>' for i in range(5))
level_html = f'<div class="legend">{legend}</div>' + '\n'.join(lv_rows)

# --- rhythm DNA heatmap
FEAT = [('sixteenths', 'Sixteenths or 32nds'), ('dotted', 'Dotted notes'), ('ties', 'Ties'), ('triplets', 'Triplets')]
SEQ = ['#f3f8fe', '#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b']
def seq(p):
    return SEQ[min(len(SEQ) - 1, int(p / 100 * len(SEQ)))]
hm = ['<div class="hm-head"><span></span>' + ''.join(f'<span>{n}</span>' for _, n in FEAT) + '</div>']
for g in G:
    f = g['feat']
    cells = ''
    for k, n in FEAT:
        p = 100 * f[k] / f['n'] if f['n'] else 0
        ink = '#ffffff' if p >= 50 else 'var(--ink)'
        cells += f'<span class="hm-c" style="background:{seq(p)};color:{ink}" data-tip="{esc(g["label"])}: {p:.0f}% of rhythms have {n.lower()}" tabindex="0">{p:.0f}%</span>'
    hm.append(f'<div class="hm-row"><span class="hm-label"><i class="sw" style="background:{GC[g["g"]]}"></i>{esc(g["label"])}</span>{cells}</div>')
dna_html = '\n'.join(hm)

# --- jazz tempos histogram
tempos = st['tempos']
BIN = 20
lo, hi = 40, 360
bins = [0] * ((hi - lo) // BIN)
for t in tempos:
    k = min(len(bins) - 1, max(0, int((t - lo) // BIN)))
    bins[k] += 1
bmx = max(bins)
hist = ''.join(f'<span class="hi-c" style="--h:{100 * v / bmx:.1f}%" data-tip="{lo + i * BIN}–{lo + (i + 1) * BIN - 1} BPM: {v} recording{"s" if v != 1 else ""}" tabindex="0"></span>' for i, v in enumerate(bins))
hticks = ''.join(f'<span style="left:{100 * (b - lo) / (hi - lo):.2f}%">{b}</span>' for b in range(60, hi + 1, 60))
med = sorted(tempos)[len(tempos) // 2]
tempo_html = f'<div class="hist">{hist}</div><div class="hist-axis">{hticks}</div>'

# --- most common rhythms
NAMES = ['Steady eighths', 'The 6/8 jig', 'Steady quarters', 'Steady eighths in 2/2', 'Running sixteenths', 'The jig with a long note']
top_html = ''.join(f'''<figure class="rh"><div class="rh-img">{svg(f"top{k}.svg")}</div>
<figcaption><b>{fmt(t['n'])} pieces</b><span>{t['m']} · {NAMES[k]}</span></figcaption></figure>''' for k, t in enumerate(st['top']))

page = f'''<title>Actual Rhythms in Numbers</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Libre+Caslon+Text:ital@0;1&family=Public+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap">
<style>
/* Layout: the site's own look (cream page, white sheets, deep teal) as a single scroll of infographic panels, one idea each. */
:root {{
  color-scheme: light;
  --page: #F6F5F1; --surface: #FFFFFF; --ink: #202622; --muted: #5C635F; --faint: #8A918C;
  --teal: #18665F; --teal-pale: #E4F0EB; --border: #D8DDD8; --grid: #ECEDE8;
  --serif: "Libre Caslon Text", "Iowan Old Style", Georgia, serif;
  --sans: "Public Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, Menlo, monospace;
}}
* {{ box-sizing: border-box; }}
body {{ margin: 0; background: var(--page); color: var(--ink); font: 400 16px/1.55 var(--sans); }}
.wrap {{ max-width: 1120px; margin: 0 auto; padding-block: 40px 72px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: grid; gap: 28px; }}
.brand {{ font: 400 20px/1 var(--serif); color: var(--ink); display: flex; align-items: center; gap: 10px; }}
.eyebrow {{ font: 600 12px/1.2 var(--sans); letter-spacing: .09em; text-transform: uppercase; color: var(--teal); margin: 0 0 8px; }}
h1 {{ font: 400 clamp(34px, 5.5vw, 56px)/1.06 var(--serif); margin: 0; letter-spacing: -.01em; text-wrap: balance; max-width: 18ch; }}
h2 {{ font: 400 clamp(24px, 3vw, 32px)/1.15 var(--serif); margin: 0; text-wrap: balance; }}
h3 {{ font: 600 15px/1.3 var(--sans); margin: 0; }}
.lede {{ color: var(--muted); font-size: clamp(17px, 2vw, 19px); max-width: 62ch; margin: 12px 0 0; }}
.tiles {{ display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); background: var(--surface); border: 1px solid var(--border); border-radius: 14px; }}
.tile {{ padding: 20px 22px; display: grid; gap: 2px; min-width: 0; }}
.tile + .tile {{ border-left: 1px solid var(--border); }}
.tile b {{ font: 400 clamp(30px, 4vw, 44px)/1.05 var(--serif); }}
.tile span {{ color: var(--muted); font-size: 14px; }}
section.card {{ background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 26px 26px 22px; display: grid; gap: 18px; min-width: 0; }}
.sec-head p {{ color: var(--muted); margin: 6px 0 0; max-width: 70ch; }}
.grid3 {{ display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 28px; }}
.grid2 {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px; }}
.panel {{ display: grid; gap: 8px; align-content: start; min-width: 0; }}
.panel-note {{ margin: -4px 0 4px; color: var(--muted); font-size: 13px; }}
.sw {{ display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 7px; vertical-align: 0; flex: none; }}
/* horizontal bars */
.hb {{ display: grid; grid-template-columns: minmax(0, 11em) minmax(0, 1fr) auto; align-items: center; gap: 10px; font-size: 14px; min-height: 24px; border-radius: 6px; outline-offset: 2px; }}
.hb-label {{ overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; }}
.hb-track {{ height: 14px; display: block; }}
.hb-bar {{ display: block; height: 100%; border-radius: 0 4px 4px 0; }}
.hb-val {{ font: 500 13px/1 var(--mono); color: var(--muted); font-variant-numeric: tabular-nums; min-width: 3.2em; text-align: right; }}
.hb:hover .hb-bar, .hb:focus-visible .hb-bar {{ filter: brightness(.88); }}
.meter {{ font: 600 14px var(--mono); }}
.wide-labels .hb {{ grid-template-columns: minmax(0, 17em) minmax(0, 1fr) auto; }}
.wide-labels .hb-label {{ white-space: normal; line-height: 1.25; }}
/* timeline */
.tl-row, .tl-axis {{ display: grid; grid-template-columns: 11em minmax(0, 1fr); gap: 10px; align-items: end; }}
.tl-label {{ font-size: 14px; display: flex; align-items: center; flex-wrap: wrap; padding-bottom: 2px; }}
.tl-label small {{ width: 100%; padding-left: 17px; color: var(--faint); font-size: 12px; }}
.tl-cells {{ display: grid; grid-template-columns: repeat({len(decades)}, minmax(0, 1fr)); gap: 1px; height: 44px; align-items: end; border-bottom: 1px solid var(--border); }}
.tl-c {{ display: block; height: var(--h); min-height: 0; background: var(--c); border-radius: 2px 2px 0 0; }}
.tl-c[data-tip] {{ min-height: 2px; }}
.tl-ticks, .hist-axis {{ position: relative; height: 18px; font: 500 11px/1 var(--mono); color: var(--faint); }}
.tl-ticks span, .hist-axis span {{ position: absolute; transform: translateX(-50%); top: 4px; }}
/* stacked levels */
.legend {{ display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 13px; color: var(--muted); }}
.legend span {{ display: inline-flex; align-items: center; }}
.st-row {{ display: grid; grid-template-columns: 11em minmax(0, 1fr); gap: 10px; align-items: center; font-size: 14px; }}
.st-label {{ display: flex; align-items: center; }}
.st-bar {{ display: flex; gap: 2px; height: 18px; }}
.st-seg {{ display: block; min-width: 2px; }}
.st-seg:first-child {{ border-radius: 4px 0 0 4px; }} .st-seg:last-child {{ border-radius: 0 4px 4px 0; }}
/* heatmap */
.hm-head, .hm-row {{ display: grid; grid-template-columns: 11em repeat(4, minmax(0, 1fr)); gap: 3px; align-items: stretch; }}
.hm-head span {{ font-size: 12px; color: var(--muted); padding: 0 4px 4px; line-height: 1.25; }}
.hm-label {{ display: flex; align-items: center; font-size: 14px; }}
.hm-c {{ display: grid; place-items: center; height: 38px; border-radius: 4px; font: 600 13px var(--mono); }}
/* tempo histogram */
.hist {{ display: grid; grid-template-columns: repeat({len(bins)}, minmax(0, 1fr)); gap: 2px; height: 150px; align-items: end; border-bottom: 1px solid var(--border); }}
.hi-c {{ display: block; height: var(--h); background: {GC['jazz']}; border-radius: 3px 3px 0 0; min-height: 1px; }}
/* notation figures */
.rhythms {{ display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }}
.rh {{ margin: 0; border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; display: grid; gap: 8px; }}
.rh-img {{ height: 64px; display: flex; align-items: center; overflow: hidden; }}
.notation {{ width: 100%; height: auto; max-height: 100%; }}
.rh figcaption {{ display: flex; justify-content: space-between; gap: 8px; font-size: 13px; color: var(--muted); border-top: 1px solid var(--border); padding-top: 8px; flex-wrap: wrap; }}
.rh figcaption b {{ color: var(--ink); font-weight: 600; }}
.hardest {{ display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 24px; align-items: center; }}
.hardest .rh-img {{ height: auto; }}
.callout {{ font: 400 22px/1.3 var(--serif); }}
.callout em {{ color: var(--muted); }}
.big {{ font: 400 clamp(40px, 6vw, 64px)/1 var(--serif); color: var(--teal); }}
.side {{ display: grid; gap: 6px; align-content: center; }}
.side p {{ margin: 0; color: var(--muted); }}
details {{ font-size: 14px; }}
summary {{ cursor: pointer; color: var(--teal); font-weight: 600; }}
.tbl-wrap {{ overflow-x: auto; margin-top: 10px; }}
table {{ border-collapse: collapse; width: 100%; min-width: 520px; font-variant-numeric: tabular-nums; }}
th, td {{ text-align: right; padding: 6px 10px; border-bottom: 1px solid var(--grid); }}
th:first-child, td:first-child {{ text-align: left; }}
thead th {{ font-size: 12px; color: var(--muted); font-weight: 600; }}
.foot {{ color: var(--muted); font-size: 13px; max-width: 80ch; }}
#tip {{ position: fixed; z-index: 20; pointer-events: none; background: var(--ink); color: #fff; font: 500 13px/1.35 var(--sans); padding: 7px 10px; border-radius: 8px; max-width: 260px; box-shadow: 0 4px 14px rgba(0,0,0,.18); }}
[data-tip] {{ cursor: default; }}
[data-tip]:focus-visible {{ outline: 2px solid var(--teal); outline-offset: 1px; }}
@media (max-width: 860px) {{
  .grid3, .grid2 {{ grid-template-columns: 1fr; }}
  .rhythms {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }}
  .hardest {{ grid-template-columns: 1fr; }}
  .tiles {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }}
  .tile:nth-child(3) {{ border-left: 0; }} .tile:nth-child(n+3) {{ border-top: 1px solid var(--border); }}
}}
@media (max-width: 520px) {{
  section.card {{ padding: 18px 14px; }}
  .hb, .wide-labels .hb {{ grid-template-columns: 8.5em minmax(0, 1fr) auto; }}
  .hb-label {{ white-space: normal; line-height: 1.25; }}
  .st-row, .tl-row, .tl-axis {{ grid-template-columns: 8.5em minmax(0, 1fr); }}
  .hm-head, .hm-row {{ grid-template-columns: 7.5em repeat(4, minmax(0, 1fr)); }}
  .hm-c {{ font-size: 11px; }}
  .rhythms {{ grid-template-columns: 1fr; }}
}}
</style>

<div class="wrap">
  <header>
    <div class="brand">Actual Rhythms</div>
  </header>

  <div>
    <p class="eyebrow">The corpus in numbers</p>
    <h1>{fmt(T['rhythms'])} rhythms, every one from real music.</h1>
    <p class="lede">What's inside Actual Rhythms: where the pieces come from, how old they are, which time signatures and figures they use, and how hard they get. Hover or tap any bar for its exact numbers.</p>
  </div>

  <div class="tiles" role="list">
    <div class="tile" role="listitem"><b>{fmt(T['rhythms'])}</b><span>different rhythms</span></div>
    <div class="tile" role="listitem"><b>{fmt(T['pieces'])}</b><span>pieces of music</span></div>
    <div class="tile" role="listitem"><b>{fmt(T['families'])}</b><span>rhythms written more than one way</span></div>
    <div class="tile" role="listitem"><b>{years_span}</b><span>years, {T['minY']} to {T['maxY']}</span></div>
  </div>

  <section class="card">
    <div class="sec-head"><p class="eyebrow">Genres</p><h2>Folk tunes are most of the pieces. Jazz and classical give the most rhythms.</h2>
      <p>A folk tune is short, so it gives a few rhythms. A string quartet movement or a recorded solo runs for hundreds of bars, and nearly every few bars is a new rhythm.</p></div>
    <div class="grid3">{genre_html}</div>
    <details><summary>Show the numbers</summary><div class="tbl-wrap"><table><thead><tr><th>Genre</th><th>Pieces</th><th>Rhythms</th><th>Rhythms per piece</th></tr></thead><tbody>
{''.join(f"<tr><td>{esc(g['label'])}</td><td>{fmt(g['pieces'])}</td><td>{fmt(g['rhythms'])}</td><td>{per_piece(g):.1f}</td></tr>" for g in G)}
    </tbody></table></div></details>
  </section>

  <section class="card">
    <div class="sec-head"><p class="eyebrow">Collections</p><h2>Where the pieces come from.</h2>
      <p>Every collection with nine pieces or more, colored by genre. The Essen collection alone holds {fmt(cols[0]['pieces'])} folk songs from Germany, China and across Europe.</p></div>
    <div class="panel wide-labels">{coll_html}</div>
  </section>

  <section class="card">
    <div class="sec-head"><p class="eyebrow">Four centuries</p><h2>From a 1592 madrigal to a 2023 record.</h2>
      <p>Dated pieces by decade, by the year they were composed, published or recorded. Each row is scaled to its own busiest decade. Folk tunes are dated by the collections that printed them, which is why they cluster.</p></div>
    <div class="panel">{timeline_html}</div>
  </section>

  <div class="grid2">
    <section class="card">
      <div class="sec-head"><p class="eyebrow">Places</p><h2>Germany, Ireland and China lead.</h2>
        <p>Pieces by country of origin, where the source names one.</p></div>
      <div class="panel">{country_html}</div>
    </section>
    <section class="card">
      <div class="sec-head"><p class="eyebrow">Time signatures</p><h2>Over half the rhythms are in 4/4.</h2>
        <p>Share of all rhythms by meter. {fmt(T['bars'].get('2', 0))} rhythms are two bars long and {fmt(T['bars'].get('4', 0))} are four.</p></div>
      <div class="panel">{meter_html}</div>
    </section>
  </div>

  <section class="card">
    <div class="sec-head"><p class="eyebrow">Difficulty</p><h2>Jazz reads hardest, Bach easiest.</h2>
      <p>Each genre's rhythms by level, from steady beats (1) to triplets, 32nds and sixteenth syncopation (5). Jazz is the hardest: 77% of its rhythms are level 5, then ragtime at 53%. Bach's chorales are the gentlest, half of them at level 2. Folk tunes sit at level 4, the sixteenths of reels and hornpipes.</p></div>
    <div class="panel">{level_html}</div>
  </section>

  <section class="card">
    <div class="sec-head"><p class="eyebrow">Rhythmic fingerprint</p><h2>What each genre asks you to read.</h2>
      <p>The share of each genre's rhythms that contain sixteenths or 32nds, dotted notes, ties, or triplets. Darker is more.</p></div>
    <div class="panel">{dna_html}</div>
  </section>

  <section class="card">
    <div class="sec-head"><p class="eyebrow">Tempo</p><h2>Jazz at the speed of the record.</h2>
      <p>{fmt(len(tempos))} jazz recordings have a known tempo, from a {min(tempos)} BPM ballad to a {max(tempos)} BPM burn. Half are faster than {med} BPM. The app's Original button plays each excerpt at its record's tempo.</p></div>
    {tempo_html}
  </section>

  <section class="card">
    <div class="sec-head"><p class="eyebrow">The most common rhythms</p><h2>The figures you'll meet most often.</h2>
      <p>The two-bar rhythms found in the most pieces. Common figures come up often in the app because they come up often in music.</p></div>
    <div class="rhythms">{top_html}</div>
  </section>

  <section class="card">
    <div class="sec-head"><p class="eyebrow">The hardest</p><h2>The most demanding two bars in the corpus.</h2></div>
    <div class="hardest">
      <div class="rh"><div class="rh-img">{svg('hardest.svg')}</div><figcaption><b>Body and Soul · Don Byas</b><span>Tenor sax solo, mm. 11–12 · recorded 1947</span></figcaption></div>
      <div class="side"><span class="big">Level 5</span><p>Sextuplets, 32nds, dotted sixteenths and ties across the beat, all in two bars of a ballad.</p></div>
    </div>
  </section>

  <p class="foot">Counted from the Actual Rhythms corpus: the music21 corpus, Craig Stuart Sapp's edition of Joplin's rags, OpenEWLD lead sheets, the Weimar Jazz Database, the Essen, O'Neill, Ryan and Aird collections, Michael Van Bebber's jazz and song transcriptions and <em>Charlie Parker 60 Melodies and Solos</em>, the African drum archives (IEMP Malian Jembe, Djembe Gorilla, Djembe-L, Djembe N E T), the IEMP candombe and Cuban son recordings, the Groove MIDI Dataset's Latin and African grooves, and African, Latin American and Caribbean songs from PDMX. A rhythm is two or four bars; the same rhythm in several pieces counts once. Notation drawn by the app.</p>
</div>
<div id="tip" hidden></div>
<script>
(() => {{
  const tip = document.getElementById('tip');
  const show = (el, x, y) => {{
    tip.textContent = el.dataset.tip; tip.hidden = false;
    const r = tip.getBoundingClientRect();
    tip.style.left = Math.min(window.innerWidth - r.width - 8, Math.max(8, x + 14)) + 'px';
    tip.style.top = Math.max(8, y - r.height - 12) + 'px';
  }};
  document.addEventListener('pointermove', (e) => {{
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (el) show(el, e.clientX, e.clientY); else tip.hidden = true;
  }});
  document.addEventListener('pointerdown', (e) => {{
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (el) show(el, e.clientX, e.clientY); else tip.hidden = true;
  }});
  document.addEventListener('focusin', (e) => {{
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (!el) {{ tip.hidden = true; return; }}
    const r = el.getBoundingClientRect(); show(el, r.left + r.width / 2, r.top);
  }});
  document.addEventListener('scroll', () => {{ tip.hidden = true; }}, {{ passive: true }});
}})();
</script>
'''
open(os.path.join(HERE, 'corpus.html'), 'w').write(page)
print('written', len(page))

# ---------- the same infographic as a landing page on actualrhythms.com (/numbers/) ----------
SITE = os.path.join(HERE, '..', '..')
style = page[page.index('<style>') + 7:page.index('</style>')]
body = page[page.index('<div class="wrap">'):page.index('<div id="tip"')]
script = page[page.index('<script>'):page.index('</script>') + 9]


def scope(css):
    """Prefix every selector with .viz so the page's rules can't touch the shared landing stylesheet."""
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    def prefix(sel):
        if sel == '*':
            return '.viz *'
        if sel.startswith(':root') or sel == 'body':
            return '.viz'
        return ', '.join(s if s.startswith('#tip') else f'.viz {s}' for s in (x.strip() for x in sel.split(',')))
    out, buf = [], ''
    for ch in css:
        if ch == '{':
            sel = buf.strip()
            out.append((sel if sel.startswith('@') else prefix(sel)) + ' {')
            buf = ''
        elif ch == '}':
            out.append(buf.strip() + ' }\n')
            buf = ''
        else:
            buf += ch
    return ''.join(out)


css = scope(style)
# the infographic's cards are divs here (landing sections get page padding and rules), and the site header replaces its own
body = body.replace('<section class="card">', '<div class="card">').replace('</section>', '</div>')
body = re.sub(r'\s*<header>\s*<div class="brand">Actual Rhythms</div>\s*</header>', '', body, count=1)
body = body.replace('<div class="wrap">', '<div class="wrap viz-wrap">', 1)
css = css.replace('.viz section.card', '.viz .card').replace('.viz .wrap {', '.viz .viz-wrap {')
why = open(f'{SITE}/why/index.html').read()
head_nav = why[why.index('<header class="site-head">'):why.index('</header>') + 9].replace(' aria-current="page"', '')
head_nav = head_nav.replace('<a href="/numbers/">In numbers</a>', '<a href="/numbers/" aria-current="page">In numbers</a>')
foot = why[why.index('<footer'):why.index('</footer>') + 9]
T = st['totals']
site = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Actual Rhythms in numbers: the corpus by genre, era and meter</title>
<meta name="description" content="An infographic of the Actual Rhythms corpus: {fmt(T['rhythms'])} rhythms from {fmt(T['pieces'])} pieces by genre, collection, country, century, meter and difficulty.">
<meta property="og:title" content="Actual Rhythms in numbers">
<meta property="og:description" content="{fmt(T['rhythms'])} rhythms from {fmt(T['pieces'])} real pieces, by genre, era, meter and difficulty.">
<link rel="canonical" href="https://actualrhythms.com/numbers/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Actual Rhythms">
<meta property="og:url" content="https://actualrhythms.com/numbers/">
<meta property="og:image" content="https://actualrhythms.com/landing/social/numbers.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Actual Rhythms in numbers: {fmt(T['rhythms'])} rhythms from {fmt(T['pieces'])} real pieces, with a bar chart of genres.">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#F6F5F1">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Libre+Caslon+Text:ital@0;1&family=Public+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap">
<link rel="stylesheet" href="/landing/landing.css">
<style>
{css}
.viz .viz-wrap {{ padding-block: 40px 72px; }}
</style>
</head>
<body>
{head_nav}

<main class="viz">
{body}
<div id="tip" hidden></div>
</main>

{foot}
{script}
</body>
</html>
'''
os.makedirs(f'{SITE}/numbers', exist_ok=True)
open(f'{SITE}/numbers/index.html', 'w').write(site)
# structured data and the sitemap date (tools/seo.py)
import subprocess, sys
subprocess.run([sys.executable, os.path.join(SITE, 'tools', 'seo.py')], check=True)
print('site page written', len(site))
