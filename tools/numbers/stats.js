// Corpus statistics for the In numbers page (numbers/index.html). Usage: node tools/numbers/stats.js tools/numbers/stats.json
// then python3 tools/numbers/build.py. The notation in img/ is exported from the app (the most common rhythms and the hardest).
const fs = require('fs');
global.window = {};
require(require('path').join(__dirname, '..', '..', 'data', 'rhythms.js'));
require(require('path').join(__dirname, '..', '..', 'data', 'occurrences.js'));
const D = window.RHYTHM_DATA; const O = window.RHYTHM_OCC;
const GENRES = ['folk', 'chorale', 'classical', 'ragtime', 'jazz', 'popular', 'latin', 'african'];
const LABEL = { folk: 'Folk tunes', chorale: 'Bach chorales', classical: 'Classical', ragtime: 'Ragtime', jazz: 'Jazz', popular: 'Pop songs', latin: 'Latin patterns', african: 'African rhythms' };
const genreOfSrc = (i) => D.collections[D.sources[i][2]].genre;
const allOcc = (r, i) => r.o.concat((O.o[i] || []).map((o) => [o[0], O.parts[o[1]], o[2], o[3]].concat(o.slice(4))));

// pieces per genre, per collection
const pieces = {}; const coll = {};
D.sources.forEach((s, i) => {
  const g = genreOfSrc(i); pieces[g] = (pieces[g] || 0) + 1;
  const k = s[2]; coll[k] = coll[k] || { label: D.collections[k].label, genre: g, pieces: 0 }; coll[k].pieces++;
});
// rhythms per genre (a rhythm counts once in each genre it appears in), levels and features per genre
const rhythms = {}; const levels = {}; const feat = {}; const meters = {}; const bars = { 2: 0, 4: 0, 1: 0 };
const F = { triplets: /t/, sixteenths: /\b16|32/, ties: /~/, dotted: /d/ };
const tempos = []; const tempoByPiece = new Map();
D.rhythms.forEach((r, i) => {
  meters[r.m] = (meters[r.m] || 0) + 1;
  bars[r.b] = (bars[r.b] || 0) + 1;
  const occ = allOcc(r, i);
  const gs = new Set(occ.map((o) => genreOfSrc(o[0])));
  const text = r.r.join(' ');
  gs.forEach((g) => {
    rhythms[g] = (rhythms[g] || 0) + 1;
    levels[g] = levels[g] || [0, 0, 0, 0, 0]; levels[g][r.l - 1]++;
    feat[g] = feat[g] || { n: 0, triplets: 0, sixteenths: 0, ties: 0, dotted: 0 };
    feat[g].n++;
    for (const [k, re] of Object.entries(F)) if (re.test(text)) feat[g][k]++;
  });
  occ.forEach((o) => { if (o[4] && genreOfSrc(o[0]) === 'jazz' && !tempoByPiece.has(o[0])) tempoByPiece.set(o[0], o[4]); });
});
// years: one per dated piece
const years = {}; let minY = 9999, maxY = 0; let dated = 0;
D.sources.forEach((s, i) => {
  const m = (s[4] || '').match(/\b(1[5-9]\d\d|20[0-2]\d)\b/); if (!m) return;
  const y = +m[1]; const g = genreOfSrc(i); dated++;
  minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  const dec = Math.floor(y / 10) * 10; years[g] = years[g] || {}; years[g][dec] = (years[g][dec] || 0) + 1;
});
// countries (first word of the origin, before any region in parentheses)
const NORM = { 'USA': 'USA', 'Deutschland': 'Germany', 'Northern Germany': 'Germany', 'Tyrol': 'Austria (Tyrol)' };
const countries = {};
D.sources.forEach((s) => {
  let o = (s[3] || '').trim(); if (!o) return;
  o = o.replace(/\s*\(.*$/, '').replace(/,.*$/, '').trim();
  o = NORM[o] || o;
  if (/^China|^Taiwan/.test(o)) o = 'China';
  countries[o] = (countries[o] || 0) + 1;
});
// most common rhythms (2 bars), with their families
const top = D.rhythms.map((r, i) => ({ i, m: r.m, r: r.r, n: r.n, b: r.b, l: r.l })).filter((x) => x.b === 2).sort((a, b) => b.n - a.n).slice(0, 6);
const fam = new Map(); D.rhythms.forEach((r) => { if (r.g != null) fam.set(r.g, (fam.get(r.g) || 0) + 1); });
const tempoList = [...tempoByPiece.values()];
const out = {
  totals: { rhythms: D.rhythms.length, pieces: D.sources.length, families: fam.size, dated, minY, maxY, jazzPieces: pieces.jazz,
    soloists: new Set(D.sources.filter((s, i) => genreOfSrc(i) === 'jazz').map((s) => s[1])).size, bars },
  genres: GENRES.map((g) => ({ g, label: LABEL[g], pieces: pieces[g] || 0, rhythms: rhythms[g] || 0, levels: levels[g], feat: feat[g] })),
  collections: Object.entries(coll).map(([k, v]) => ({ k, ...v })).sort((a, b) => b.pieces - a.pieces),
  years, meters: Object.entries(meters).sort((a, b) => b[1] - a[1]),
  countries: Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 12),
  tempos: tempoList, top,
};
fs.writeFileSync(process.argv[2], JSON.stringify(out));
console.log(JSON.stringify(out.totals), '\n', out.genres.map((g) => `${g.g}: ${g.pieces} pieces, ${g.rhythms} rhythms`).join('\n '));
console.log('collections', out.collections.slice(0, 18).map((c) => `${c.label} (${c.genre}) ${c.pieces}`).join(' | '));
console.log('countries', JSON.stringify(out.countries));
console.log('meters', JSON.stringify(out.meters));
console.log('tempos', tempoList.length, Math.min(...tempoList), Math.max(...tempoList));
console.log('top', out.top.map((t) => `${t.m} ${t.r.join('|')} ${t.n}`).join('\n'));
console.log('years', JSON.stringify(Object.fromEntries(Object.entries(years).map(([g, v]) => [g, Object.keys(v).length + ' decades, ' + Object.values(v).reduce((a, b) => a + b, 0)]))));
