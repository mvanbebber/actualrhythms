/* Actual Rhythms: rhythm sight-reading with excerpts from real music. */
(function () {
  'use strict';
  const DATA = window.RHYTHM_DATA;
  const VF = window.Vex && window.Vex.Flow;
  const TPQ = DATA.tpq;
  const FLAG = { REST: 1, TIE: 2, TRIP: 4, TSTART: 8, TSTOP: 16 };
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;

  const LEVELS = {
    1: ['Beats', 'Whole, half and quarter values; every attack on a beat.'],
    2: ['Subdivided', 'Eighths in simple time; the basic eighth-note flow of 6/8.'],
    3: ['Syncopated', 'Dotted quarters, ties, off-beat entries after rests, syncopation.'],
    4: ['Sixteenths', 'Sixteenth-note grid, dotted eighth + sixteenth.'],
    5: ['Advanced', 'Triplets, 32nds, sixteenth syncopation.'],
  };
  const GENRES = { folk: 'Folk tunes', chorale: 'Bach chorales', classical: 'Classical', ragtime: 'Ragtime', jazz: 'Jazz solos', popular: 'Pop songs', latin: 'Latin rhythms', african: 'African rhythms' };
  // Accuracy modes: 'perfect' earns full credit, 'good' 75%, anything else inside the matching window 40%.
  const ACCURACY = {
    easy: { label: 'Easy', perfect: 0.110, good: 0.160, cap: 0.25 },
    normal: { label: 'Normal', perfect: 0.075, good: 0.110, cap: 0.2 },
    pro: { label: 'Pro', perfect: 0.035, good: 0.075, cap: 0.2 },
  };
  // every excerpt is played through more than once (written with a repeat sign): twice, or four
  // times for a one-bar pattern so there's time to settle into it
  const repeatsFor = (item) => (item && item.b === 1 ? 4 : 2);
  const reps = () => repeatsFor(current && current.item);
  const WORSE = { perfect: 0, good: 1, off: 2, miss: 3 };

  // ---------- settings ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('rr.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('rr.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };
  const SETTINGS_VERSION = 3;
  const saved = store.get('settings', {});
  if (!(saved.v >= 2)) {
    // v2: the source is shown by default, and jazz solos joined the corpus
    delete saved.hideSource;
    if (Array.isArray(saved.genres) && !saved.genres.includes('jazz')) saved.genres.push('jazz');
  }
  if (!(saved.v >= 3)) {
    // v3: new defaults: level 1, 2 and 4 bars, all repertoire
    delete saved.levels; delete saved.bars; delete saved.genres;
  }
  const S = Object.assign({
    tempo: 80, levels: [1], bars: [2, 4], meters: ['2/4', '3/4', '4/4', '6/8'],
    genres: Object.keys(GENRES), useOriginal: false, metro: true, hideSource: false, latency: 0, tapSound: true, silentMode: true, lowLatency: true,
  }, saved, { v: SETTINGS_VERSION });
  // separate saved timing offsets per output: Bluetooth headphones add 150-250 ms
  if (!S.offsets || typeof S.offsets !== 'object') {
    const old = Number(S.latency) || 0;
    S.offsets = { speaker: 0, bluetooth: 0 };
    if (old >= 80) { S.offsets.bluetooth = old; S.output = 'bluetooth'; } else { S.offsets.speaker = old; S.output = S.output || 'speaker'; }
  }
  if (S.output !== 'speaker' && S.output !== 'bluetooth') S.output = 'speaker';
  delete S.latency;
  const latencyMs = () => Number(S.offsets[S.output]) || 0;
  // Was each offset measured with tap clicks on? It matters: with clicks on you line up your
  // (delayed) click with the (equally delayed) metronome; with them off you line up your touch.
  // Calibrations before this existed never played tap clicks.
  if (!S.calibClick || typeof S.calibClick !== 'object') S.calibClick = { speaker: false, bluetooth: false };
  // Tap click is remembered per output; off for Bluetooth, whose delay makes your own click arrive late.
  if (!S.tapSoundBy || typeof S.tapSoundBy !== 'object') S.tapSoundBy = { speaker: true, bluetooth: false };
  S.tapSound = !!S.tapSoundBy[S.output];
  const calibStale = () => latencyMs() !== 0 && S.calibClick[S.output] !== !!S.tapSound;
  const OUTPUT_NAME = { speaker: 'speaker', bluetooth: 'Bluetooth' };
  // repertoire groups added since the settings were saved start switched on
  if (!Array.isArray(S.knownGenres)) S.knownGenres = ['folk', 'chorale', 'classical', 'ragtime', 'jazz'];
  Object.keys(GENRES).forEach((g) => {
    if (!S.knownGenres.includes(g)) { S.knownGenres.push(g); if (Array.isArray(S.genres) && !S.genres.includes(g)) S.genres.push(g); }
  });
  if (!Array.isArray(S.bars)) S.bars = [Number(S.bars) || 2];
  S.genres = S.genres.filter((g) => GENRES[g]);
  if (!S.genres.length) S.genres = Object.keys(GENRES);
  if (!ACCURACY[S.accuracy]) S.accuracy = 'normal';
  const acc = () => ACCURACY[S.accuracy];
  const save = () => store.set('settings', S);

  const meterCounts = {};
  DATA.rhythms.forEach((r) => { meterCounts[r.m] = (meterCounts[r.m] || 0) + 1; });
  const METER_ORDER = ['2/4', '3/4', '4/4', '2/2', '3/8', '6/8', '9/8', '12/8', '3/2', '6/4'].filter((m) => meterCounts[m]);

  function genreOf(occ) { return DATA.collections[DATA.sources[occ[0]][2]].genre; }

  function pool() {
    // Latin patterns have a fixed, natural length (1 or 2 bars) and show whatever Length is set to
    return DATA.rhythms.filter((r) => S.levels.includes(r.l) && S.meters.includes(r.m)
      && (r.f ? S.genres.includes(genreOf(r.o[0])) : S.bars.includes(r.b) && r.o.some((o) => S.genres.includes(genreOf(o)))));
  }

  // ---------- meter helpers ----------
  function meterInfo(m) {
    const [num, den] = m.split('/').map(Number);
    const unit = TPQ * 4 / den;
    const compound = num % 3 === 0 && num > 3;
    const beat = compound ? unit * 3 : unit;
    return { num, den, unit, compound, beat, bar: unit * num, beatsPerBar: (unit * num) / beat };
  }

  // decode the compact measure strings ("8 8~ 8t[ 8t 8t] qr") into [ticks, code, flags]
  const BASE_TICKS = { w: 96, h: 48, q: 24, 8: 12, 16: 6, 32: 3 };
  const MARK = { r: FLAG.REST, '~': FLAG.TIE, t: FLAG.TRIP, '[': FLAG.TSTART, ']': FLAG.TSTOP };
  function measures(item) {
    if (!item._r) {
      item._r = item.r.map((s) => s.split(' ').map((tok) => {
        let flags = 0;
        const code = tok.replace(/[r~t\[\]]/g, (c) => { flags |= MARK[c]; return ''; });
        const base = code.replace(/d/g, '');
        const dots = code.length - base.length;
        let ticks = BASE_TICKS[base] * (dots === 2 ? 1.75 : dots === 1 ? 1.5 : 1);
        if (flags & FLAG.TRIP) ticks = ticks * 2 / 3;
        return [Math.round(ticks), code, flags];
      }));
    }
    return item._r;
  }
  // one entry per event: a MIDI number, or an array of them for a chord ('3c(3c4043)' -> [60, [60, 64, 67]])
  function pitchesOf(occ) {
    return occ[3].map((s) => (s.match(/\([0-9a-f]+\)|[0-9a-f]{2}/g) || []).map((h) => (h[0] === '('
      ? h.slice(1, -1).match(/../g).map((x) => parseInt(x, 16)) : parseInt(h, 16)))).flat();
  }
  const notesOf = (midi) => (Array.isArray(midi) ? midi : midi ? [midi] : []);

  // flatten an item into events with absolute tick positions
  function flatten(item) {
    const out = [];
    let pos = 0;
    measures(item).forEach((meas, mi) => {
      meas.forEach((e, ei) => {
        out.push({ ticks: e[0], code: e[1], flags: e[2], pos, mi, ei });
        pos += e[0];
      });
    });
    out.forEach((e, i) => {
      e.idx = i;
      e.rest = !!(e.flags & FLAG.REST);
      e.tiedIn = i > 0 && !!(out[i - 1].flags & FLAG.TIE);
      e.onset = !e.rest && !e.tiedIn;
    });
    return { events: out, total: pos };
  }

  // ---------- state ----------
  let current = null;      // {item, occ, flat, mi}
  let recent = [];
  let lastResult = null;   // {grades per onset, taps}
  let phase = 'idle';      // idle | countin | playing | listening | calibrating
  let layout = null;       // rows & x-maps from the last render
  const history = store.get('history', []);

  function pickNext() {
    const p = pool();
    if (!p.length) { current = null; lastResult = null; render(); renderOutcome(); syncSettings(); setButtons(); return; }
    let cand;
    for (let tries = 0; tries < 30; tries++) {
      cand = p[Math.floor(Math.random() * p.length)];
      if (!recent.includes(cand) || p.length <= recent.length) break;
    }
    recent.push(cand); if (recent.length > 40) recent.shift();
    const occs = cand.o.filter((o) => S.genres.includes(genreOf(o)));
    const occ = occs[Math.floor(Math.random() * occs.length)];
    seen.splice(seenPos + 1); // picking a new one drops anything "forward" of where you were
    seen.push({ item: cand, occ }); if (seen.length > 200) seen.shift();
    seenPos = seen.length - 1;
    show(cand, occ);
  }

  // excerpts already shown this session, for the Left/Right arrow keys
  const seen = [];
  let seenPos = -1;
  function stepHistory(dir) {
    if (dir < 0 && seenPos <= 0) return;
    if (dir > 0 && seenPos >= seen.length - 1) { pickNext(); return; }
    seenPos += dir;
    show(seen[seenPos].item, seen[seenPos].occ);
  }

  function show(cand, occ) {
    current = { item: cand, occ, flat: flatten(cand), mi: meterInfo(cand.m) };
    lastResult = null;
    render();
    renderOutcome();
    syncSettings();
    setButtons();
    prepareSound().catch(() => {}); // fetch the samples this excerpt needs in the background
  }


  // ---------- notation ----------
  // Unscaled geometry of one notation row: staff line, then two feedback lanes (one per pass).
  // Phones and tablets (touch) use a tighter row so staff lines sit closer together; there is still
  // room for the feedback lanes, so nothing moves when results appear.
  const COMPACT = document.documentElement.hasAttribute('data-touch');
  const ROW_H = COMPACT ? 94 : 112;    // row height for two passes
  const LINE_Y = COMPACT ? 48 : 52;    // staff line, from the row's top (stems, beams, triplet numbers above)
  const LANE_Y = 27;                   // first feedback lane, below the staff line (clear of the time signature)
  const LANE_GAP = COMPACT ? 13 : 19;  // between lanes
  // room under the staff for one feedback lane per time through
  const rowHeight = () => ROW_H + (reps() - 2) * LANE_GAP;
  // a row's geometry; 'tight' brings the staves closer together (phones, long excerpts) by taking room from
  // above the staff line; the feedback lanes keep their place below it (clear of the time signature) and
  // their spacing (the two passes' ticks stay apart)
  function rowGeometry(tight) {
    if (!tight) return { ROW: rowHeight(), LINE: LINE_Y, LANE: LANE_Y, GAP: LANE_GAP };
    return { ROW: rowHeight() - 6, LINE: LINE_Y - 6, LANE: LANE_Y, GAP: LANE_GAP };
  }
  // vertical padding and border of the score box
  const sheetChrome = (sheet) => {
    const cs = getComputedStyle(sheet);
    return ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth'].reduce((a, k) => a + (parseFloat(cs[k]) || 0), 0);
  };
  // phones (touch): the height the score may take so that everything from the score to the tap pad shows,
  // with a strip of the source card below; 0 elsewhere
  function phoneScoreRoom(peek) {
    const sheet = $('score').closest('.sheet');
    if (!COMPACT || root.dataset.layout !== 'phone') { sheet.style.maxHeight = ''; return 0; }
    const sr = sheet.getBoundingClientRect();
    const pr = $('pad').getBoundingClientRect();
    if (!sr.height || !pr.height) return 0;
    const appPad = parseFloat(getComputedStyle(document.querySelector('.app')).paddingBottom) || 0;
    const PEEK = peek ? 64 : 8; // the source card's title line and star, and the gap above it
    return Math.max(200, Math.floor(window.innerHeight - sr.top - (pr.bottom - sr.bottom) - PEEK - appPad - sheetChrome(sheet)));
  }
  const INK = '#202622';
  const GRADE_COLOR = { perfect: '#1E7A4C', good: '#2563A8', off: '#B5600B', miss: '#B42318' };
  let lastRenderW = 0;
  let pendingRender = false;

  // Rough minimum width a measure needs to stay readable (unscaled px).
  function measureMinWidth(meas) {
    let w = 44;
    meas.forEach((e) => {
      const code = e[1];
      w += 27 + (code.match(/d/g) || []).length * 7 + (/^32/.test(code) ? 10 : /^16/.test(code) ? 5 : 0) + (e[2] & FLAG.TRIP ? 4 : 0);
    });
    return w;
  }

  // Break measures into rows (only at barlines) so no measure is squeezed below its minimum.
  function planRows(item, avail) {
    const ms = measures(item);
    const min = ms.map((m, i) => measureMinWidth(m) + (i === 0 ? 66 : 0) + (i === ms.length - 1 ? 16 : 0));
    const options = [item.b, 2, 1].filter((p, i, a) => p <= item.b && item.b % p === 0 && a.indexOf(p) === i);
    for (const per of options) {
      const rows = [];
      let fits = true;
      for (let i = 0; i < item.b; i += per) {
        const idx = []; for (let k = i; k < i + per; k++) idx.push(k);
        if (idx.reduce((a, k) => a + min[k], 0) > avail) fits = false;
        rows.push(idx);
      }
      if (fits || per === 1) return { rows, min };
    }
    return null;
  }

  function scheduleRender() {
    if (phase !== 'idle') { pendingRender = true; return; } // never reflow under a running attempt
    requestAnimationFrame(() => { if (phase === 'idle') render(); else pendingRender = true; });
  }

  // Draw one bar (stave, barline or end-repeat, notes, beams, triplets) on a one-line staff.
  // k is the bar's position within its row. Used by the score and the corpus thumbnails.
  function drawBar(ctx, item, mi, flat, mIdx, k, x, y, w, grades) {
    const stave = new VF.Stave(x, y, w, { num_lines: 1, spacing_between_lines_px: 10, space_above_staff_ln: 4 });
    if (mIdx === 0) {
      const ts = new VF.TimeSignature(item.m);
      ts.topLine -= 2; ts.bottomLine -= 2; // center the digits on a one-line staff
      stave.addModifier(ts);
    }
    stave.setBegBarType(VF.Barline.type.NONE).setEndBarType(VF.Barline.type.NONE);
    stave.setContext(ctx).draw();
    // leave room after a barline so the first note (and any tie into it) doesn't crowd it
    // (a row's first bar also leaves room for the "Pass 1" labels of the feedback lanes)
    if (mIdx > 0) stave.setNoteStartX(stave.getNoteStartX() + (k > 0 ? 14 : 26));
    // one-line staves have zero-height barlines, so draw our own
    const ly = stave.getYForLine(0);
    const last = mIdx === item.b - 1;
    ctx.save(); ctx.setLineWidth(1.2);
    if (mIdx === 0) {
      // start-repeat sign after the time signature: thick line, thin line, dots
      const nx = stave.getNoteStartX();
      ctx.fillRect(nx + 7, ly - 15, 4, 30);
      ctx.beginPath(); ctx.moveTo(nx + 14.5, ly - 15); ctx.lineTo(nx + 14.5, ly + 15); ctx.stroke();
      [-6, 6].forEach((dy) => { ctx.beginPath(); ctx.arc(nx + 19.5, ly + dy, 2, 0, Math.PI * 2); ctx.fill(); });
      stave.setNoteStartX(nx + 30);
    }
    if (last) {
      // end-repeat sign: dots, thin line, thick line
      ctx.beginPath(); ctx.moveTo(x + w - 8, ly - 15); ctx.lineTo(x + w - 8, ly + 15); ctx.stroke();
      ctx.fillRect(x + w - 4.5, ly - 15, 4, 30);
      [-6, 6].forEach((dy) => { ctx.beginPath(); ctx.arc(x + w - 13, ly + dy, 2, 0, Math.PI * 2); ctx.fill(); });
    } else {
      ctx.beginPath(); ctx.moveTo(x + w - 0.5, ly - 15); ctx.lineTo(x + w - 0.5, ly + 15); ctx.stroke();
    }
    ctx.restore();

    const meas = measures(item)[mIdx];
    const evs = flat.events.filter((q) => q.mi === mIdx);
    const notes = meas.map((e, i) => {
      const ev = evs[i];
      const base = e[1].replace(/d/g, '');
      const dots = (e[1].match(/d/g) || []).length;
      const n = new VF.StaveNote({
        keys: [ev.rest ? (base === 'w' ? 'a/5' : 'f/5') : 'f/5'], duration: base + (ev.rest ? 'r' : ''), dots, stem_direction: 1,
        clef: 'percussion', auto_stem: false, align_center: ev.rest && meas.length === 1,
      });
      for (let d = 0; d < dots; d++) VF.Dot.buildAndAttach([n], { all: true });
      const g = grades && grades[ev.idx];
      if (g) { const c = GRADE_COLOR[g.grade]; n.setStyle({ fillStyle: c, strokeStyle: c }); }
      ev.vf = n;
      return n;
    });
    const voice = new VF.Voice({ num_beats: mi.num, beat_value: mi.den }).setMode(VF.Voice.Mode.SOFT);
    voice.addTickables(notes);
    // beam each beat's eighths and shorter on our own tick grid (VexFlow's auto-beamer loses the beat
    // after a triplet quarter and beams across beats); rests and longer notes break a beam
    const beams = [];
    let grp = [], pos = 0, grpBeat = -1;
    const flush = () => { if (grp.length > 1) beams.push(new VF.Beam(grp)); grp = []; };
    meas.forEach((e, i) => {
      const b = Math.floor(pos / mi.beat);
      const beamable = !(e[2] & FLAG.REST) && /^(8|16|32)/.test(e[1]) && Math.floor((pos + e[0] - 1) / mi.beat) === b;
      if (!beamable || b !== grpBeat) flush();
      if (beamable) { grp.push(notes[i]); grpBeat = b; }
      pos += e[0];
    });
    flush();
    // tuplets after beams, so a beamed triplet gets a plain 3 and an unbeamed one a bracket
    const tuplets = [];
    let tStart = -1;
    meas.forEach((e, i) => {
      if (e[2] & FLAG.TSTART) tStart = i;
      if (e[2] & FLAG.TSTOP && tStart >= 0) {
        tuplets.push(new VF.Tuplet(notes.slice(tStart, i + 1), { num_notes: 3, notes_occupied: 2, ratioed: false }));
        tStart = -1;
      }
    });
    new VF.Formatter().joinVoices([voice]).formatToStave([voice], stave);
    voice.draw(ctx, stave);
    beams.forEach((b) => b.setContext(ctx).draw());
    tuplets.forEach((t) => t.setContext(ctx).draw());
    return { notes, evs, last, meas };
  }

  function render() {
    const host = $('score');
    host.innerHTML = '';
    layout = null;
    pendingRender = false;
    renderMeta();
    if (!current) {
      host.innerHTML = `<div class="empty"><p>No rhythms match these settings. Turn on another difficulty, time signature or repertoire group.</p>${
        root.dataset.layout !== 'wide' ? '<button class="btn" type="button" data-action="settings">Open settings</button>' : ''}</div>`;
      lastRenderW = host.clientWidth;
      return;
    }
    const { item, mi, flat } = current;
    const W = Math.max(240, Math.floor(host.parentElement.clientWidth || 600));
    const fit = (scale) => {
      let s = scale;
      let Wl = W / s;
      const plan = planRows(item, Wl - 8);
      // a single bar wider than the whole staff (very narrow screens): let notes sit up to 20% closer than the
      // comfortable estimate (25% on phones), then shrink the excerpt to fit, not below 75% (55% on phones,
      // where a bar of sixteenths or thirty-seconds would otherwise run off the screen)
      const widest = Math.max(...plan.rows.map((idxs) => idxs.reduce((acc, k) => acc + plan.min[k], 0)));
      const phone = COMPACT && root.dataset.layout === 'phone';
      if (widest > Wl - 8) {
        s = phone ? Math.max(0.55, Math.min(s, W / (widest * 0.75 + 8))) : Math.max(0.75, s * (Wl - 8) / widest);
        Wl = W / s;
      }
      const squeeze = widest > Wl - 8 ? Math.max(phone ? 0.75 : 0.8, (Wl - 8) / widest) : 1;
      // ...and beyond that, draw at the needed width and let the score box scroll sideways (never clip)
      let canvasW = W;
      if (widest * squeeze > Wl - 8) { canvasW = Math.ceil((widest * squeeze + 8) * s); Wl = canvasW / s; }
      return { s, Wl, plan, squeeze, canvasW };
    };
    const TOP_PAD = COMPACT ? 6 : 0; // the first line has nothing above it to borrow room from
    const base = W >= 640 ? 1.2 : 1;
    let f = fit(base);
    let geo = rowGeometry(false);
    // Phones: the whole excerpt shows without scrolling. The score box grows into the source card's room
    // (the card keeps a strip and scrolls); if that isn't enough, the staves move closer together, and
    // then the notation shrinks a little (to 80%), which can also fit two bars on a line.
    const tall = (ff, g) => (ff.plan.rows.length * g.ROW + TOP_PAD) * ff.s;
    let room = phoneScoreRoom(true);
    if (room) {
      // smaller and smaller, in 5% steps, until it fits (a smaller scale can also put two bars on a line)
      const shrinkTo = (r, lowest) => {
        if (tall(f, geo) > r) geo = rowGeometry(true);
        for (let k = 1; tall(f, geo) > r && base * (1 - 0.05 * k) >= lowest - 1e-9; k++) {
          const smaller = fit(Math.min(f.s, base * (1 - 0.05 * k)));
          if (tall(smaller, geo) < tall(f, geo)) f = smaller;
        }
      };
      shrinkTo(room, 0.8);
      // a small phone: the source card's strip gives way too, and the notation may go down to 70%
      if (tall(f, geo) > room) { room = phoneScoreRoom(false); shrinkTo(room, 0.7); }
      const sheet = host.closest('.sheet');
      sheet.style.maxHeight = Math.max(244, Math.min(room, Math.ceil(tall(f, geo))) + sheetChrome(sheet)) + 'px';
    }
    let { s, Wl } = f;
    const { plan, squeeze, canvasW } = f;
    const rowH = geo.ROW;
    const H = plan.rows.length * rowH + TOP_PAD;
    const renderer = new VF.Renderer(host, VF.Renderer.Backends.SVG);
    renderer.resize(canvasW, Math.ceil(H * s));
    const ctx = renderer.getContext();
    ctx.scale(s, s); // uniform scale via viewBox; nothing is stretched
    ctx.setFillStyle(INK); ctx.setStrokeStyle(INK);
    const svg = host.querySelector('svg');
    svg.setAttribute('aria-hidden', 'true');

    const grades = lastResult ? lastResult.byEvent : null;
    const rowsInfo = [];
    const rowOfMeasure = [];
    plan.rows.forEach((idxs, r) => {
      const rowTop = r * rowH + TOP_PAD;
      const y = rowTop + geo.LINE - 40; // stave line sits 40px below the stave's y (4 spaces of headroom)
      const sum = idxs.reduce((acc, k) => acc + plan.min[k] * squeeze, 0);
      const spare = Math.max(0, Wl - 8 - sum);
      const rowInfo = { y: rowTop, top: rowTop + geo.LINE - 34, height: rowH - 32, line: rowTop + geo.LINE, segs: [] };
      let x = 4;
      idxs.forEach((mIdx, k) => {
        rowOfMeasure[mIdx] = r;
        const w = plan.min[mIdx] * squeeze + spare * (plan.min[mIdx] * squeeze / sum);
        const { notes, evs, last, meas } = drawBar(ctx, item, mi, flat, mIdx, k, x, y, w, grades);

        // tick -> x map for the playhead and feedback marks
        const m0 = mIdx * mi.bar;
        const pts = meas.map((e, i) => [evs[i].pos, (notes[i].getNoteHeadBeginX() + notes[i].getNoteHeadEndX()) / 2]);
        pts.push([m0 + mi.bar, x + w - (last ? 18 : 6)]);
        // the playhead's own map: it moves in time with the music, reaching the barline exactly on the
        // next downbeat (never sliding across it early), and a whole-bar rest drawn in the middle of
        // the bar counts from the bar's start
        const startX = notes[0].getStave().getNoteStartX();
        const ppts = meas.map((e, i) => [evs[i].pos, evs[i].rest && meas.length === 1 ? startX : pts[i][1]]);
        ppts.push([m0 + mi.bar, x + w - (last ? 8 : 0.5)]);
        rowInfo.segs.push({ t0: m0, t1: m0 + mi.bar, pts, ppts });
        x += w;
      });
      // within a row, a bar's end point leads into the next bar's first note (not the barline),
      // so a tap a hair before a downbeat is drawn next to that note
      for (let k = 0; k + 1 < rowInfo.segs.length; k++) {
        const end = rowInfo.segs[k].pts[rowInfo.segs[k].pts.length - 1];
        end[1] = rowInfo.segs[k + 1].pts[0][1];
      }
      rowsInfo.push(rowInfo);
    });
    // ties (may cross rows)
    flat.events.forEach((ev, i) => {
      if (!(ev.flags & FLAG.TIE) || i + 1 >= flat.events.length) return;
      const nx = flat.events[i + 1];
      const mk = (a, b) => new VF.StaveTie({ first_note: a, last_note: b, first_indices: [0], last_indices: [0] }).setContext(ctx).draw();
      if (rowOfMeasure[ev.mi] === rowOfMeasure[nx.mi]) mk(ev.vf, nx.vf); else { mk(ev.vf, null); mk(null, nx.vf); }
    });
    layout = { rows: rowsInfo, svg, s, W, geo };
    lastRenderW = W;
    if (lastResult) drawTapMarks();
  }

  function tickToXY(tick, playhead) {
    if (!layout) return null;
    const lastT = current.flat.total;
    for (const row of layout.rows) {
      for (const sg of row.segs) {
        // a bar owns [start, end); only the final barline owns its end tick
        if (tick >= sg.t0 && (tick < sg.t1 || (tick === sg.t1 && sg.t1 === lastT))) {
          const p = playhead ? sg.ppts : sg.pts;
          for (let i = 0; i < p.length - 1; i++) {
            if (tick >= p[i][0] && tick <= p[i + 1][0]) {
              const f = p[i + 1][0] === p[i][0] ? 0 : (tick - p[i][0]) / (p[i + 1][0] - p[i][0]);
              return { x: p[i][1] + f * (p[i + 1][1] - p[i][1]), row };
            }
          }
        }
      }
    }
    return null;
  }

  // dots under each note (one lane per pass, colored by grade) and tick marks for each tap
  // Under the staff, one lane per pass: a gray tick where each note falls, and a dot where
  // each tap landed, centered on the tick's midline and colored by its timing.
  const TICK_COLOR = '#9AA19C';
  const TAP_COLOR = { perfect: GRADE_COLOR.perfect, good: GRADE_COLOR.good, off: GRADE_COLOR.off, extra: GRADE_COLOR.miss };
  function drawTapMarks() {
    const NS = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(NS, 'g');
    const total = current.flat.total;
    const laneY = (row, pass) => row.line + layout.geo.LANE + pass * layout.geo.GAP;
    lastResult.onsets.forEach((o) => {
      const p = tickToXY(o.tick - o.pass * total);
      if (!p) return;
      const y = laneY(p.row, o.pass);
      const l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', p.x); l.setAttribute('x2', p.x); l.setAttribute('y1', y - 6); l.setAttribute('y2', y + 6);
      l.setAttribute('stroke', TICK_COLOR); l.setAttribute('stroke-width', '2'); l.setAttribute('stroke-linecap', 'round');
      g.appendChild(l);
    });
    // label each lane at the left edge of every row (not on phones, where the space is too tight for them)
    if (!/^phone/.test(root.dataset.layout)) layout.rows.forEach((row) => {
      for (let pass = 0; pass < reps(); pass++) {
        const t = document.createElementNS(NS, 'text');
        t.setAttribute('x', 3); t.setAttribute('y', laneY(row, pass) + 3.5);
        t.setAttribute('font-size', '9.5'); t.setAttribute('font-family', 'system-ui, -apple-system, sans-serif');
        t.setAttribute('fill', '#6B736E'); t.setAttribute('class', 'pass-label');
        t.textContent = `Pass ${pass + 1}`;
        g.appendChild(t);
      }
    });
    lastResult.tapTicks.forEach((tk) => {
      const p = tickToXY(Math.max(0, Math.min(total, tk.tick - tk.pass * total)));
      if (!p) return;
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', p.x); c.setAttribute('cy', laneY(p.row, tk.pass)); c.setAttribute('r', 3.5);
      c.setAttribute('fill', TAP_COLOR[tk.grade]); c.setAttribute('stroke', '#FFFFFF'); c.setAttribute('stroke-width', '1');
      g.appendChild(c);
    });
    layout.svg.appendChild(g);
  }

  // ---------- audio ----------
  let ac = null;
  // iOS: web audio is muted by the Silent switch unless the page declares itself a media player.
  // iOS 17+ has navigator.audioSession for that; older iOS needs an <audio> element playing.
  function preferPlaybackSession() {
    try { if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback'; } catch (e) { /* not supported */ }
  }
  preferPlaybackSession();
  function audio() {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      ac.onstatechange = () => { updateSoundStatus(); if (ac.state === 'running') setTimeout(detectOutput, 400); };
    }
    // 'suspended' before the first tap; 'interrupted' on iOS after a call, Siri or backgrounding
    if (ac.state !== 'running' && ac.state !== 'closed') ac.resume().catch(() => {});
    return ac;
  }
  // Resolve true once the context is actually producing sound (iOS only lets it start from a
  // completed tap, which can arrive a moment after the touch that started an attempt).
  function ensureRunning(timeoutMs = 2000) {
    const c = audio();
    if (c.state === 'running') return Promise.resolve(true);
    return new Promise((res) => {
      const t0 = performance.now();
      const poll = () => {
        if (c.state === 'running') return res(true);
        if (performance.now() - t0 > timeoutMs) return res(false);
        c.resume().catch(() => {});
        setTimeout(poll, 40);
      };
      poll();
    });
  }
  // A silent, looping <audio> element puts iOS into its media-playback audio session, which is
  // what lets Web Audio sound while the phone is in Silent mode. iOS only allows play() from a
  // completed tap or click, so it is (re)tried on those until it is really playing.
  const IS_IOS = /iP(hone|ad|od)/.test(navigator.platform) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let silentLoop = null;
  let silentLoopPlaying = false;
  function silentWavDataURI() {
    const rate = 44100; const n = rate / 4; // a quarter second of 16-bit mono silence
    const bytes = new Uint8Array(44 + n * 2); const v = new DataView(bytes.buffer);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, n * 2, true);
    let bin = ''; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return 'data:audio/wav;base64,' + btoa(bin);
  }
  function startSilentLoop() {
    if (!IS_IOS || !S.silentMode || silentLoopPlaying || document.hidden) return;
    if (!silentLoop) {
      silentLoop = document.createElement('audio');
      silentLoop.src = silentWavDataURI();
      silentLoop.loop = true;
      silentLoop.preload = 'auto';
      silentLoop.setAttribute('playsinline', '');
      silentLoop.setAttribute('webkit-playsinline', '');
      silentLoop.setAttribute('x-webkit-airplay', 'deny');
      silentLoop.addEventListener('pause', () => { silentLoopPlaying = false; updateSoundStatus(); });
      silentLoop.addEventListener('playing', () => {
        const first = !silentLoopPlaying && !silentLoop.bounced;
        silentLoopPlaying = true; updateSoundStatus();
        // An engine that started before the loop may still be in iOS's 'ambient' session (muted by
        // Silent mode). Restart it once, while idle, so it re-attaches in the playback session.
        if (first && ac && ac.state === 'running' && !run) {
          silentLoop.bounced = true;
          ac.suspend().then(() => ac.resume()).catch(() => {}).then(updateSoundStatus);
        }
      });
      document.body.appendChild(silentLoop);
    }
    try {
      const pr = silentLoop.play();
      if (pr && pr.catch) pr.catch(() => { silentLoopPlaying = false; updateSoundStatus(); });
    } catch (e) { /* ignore */ }
  }
  // Activation events only: iOS grants audio permission on touchend / click / keydown (not touch-down).
  let primed = false;
  function onActivation() {
    preferPlaybackSession();
    startSilentLoop(); // before the context starts, so it starts in the playback session
    const c = audio();
    if (!primed) {
      primed = true;
      try { // a one-sample silent buffer started within the gesture (older iOS unlock)
        const src = c.createBufferSource(); src.buffer = c.createBuffer(1, 1, 22050); src.connect(c.destination); src.start(0);
      } catch (err) { /* ignore */ }
    }
    if (c.state === 'running') startKeepAlive(); else ensureRunning().then((ok) => ok && startKeepAlive());
    updateSoundStatus();
  }
  ['touchend', 'click', 'keydown', 'mousedown'].forEach((t) => document.addEventListener(t, onActivation, { capture: true, passive: true }));

  // Keep the audio engine 'playing' (an inaudible -120 dB constant) while the page is open.
  // Safari drops to a large power-saving audio buffer whenever a page goes quiet, so the first
  // sound after silence (every tap click) comes out late; a continuously playing engine keeps
  // the small, low-latency buffer.
  let keepAlive = null;
  function startKeepAlive() {
    if (keepAlive || !S.lowLatency || !ac || ac.state !== 'running' || document.hidden || !ac.createConstantSource) return;
    try {
      const src = ac.createConstantSource();
      src.offset.value = 1e-6;
      src.connect(ac.destination);
      src.start();
      keepAlive = src;
    } catch (e) { keepAlive = null; }
  }
  function stopKeepAlive() {
    if (!keepAlive) return;
    try { keepAlive.stop(); keepAlive.disconnect(); } catch (e) { /* already stopped */ }
    keepAlive = null;
  }

  // Pick Speaker or Bluetooth from the output delay the browser reports (Chrome and Android report it;
  // Bluetooth adds 100-250 ms). Only a change in what's detected switches the setting, so a manual
  // choice sticks until the output actually changes. Browsers that don't report it (Safari) keep the
  // manual choice.
  let detectedOutput = null;
  function detectOutput() {
    const el = $('outputAuto');
    if (!ac || !(ac.outputLatency > 0)) {
      if (el) el.textContent = '';
      return;
    }
    const ms = Math.round((ac.outputLatency + (ac.baseLatency || 0)) * 1000);
    const guess = ms >= 90 ? 'bluetooth' : 'speaker';
    if (el) el.textContent = `Auto-detected (${ms} ms delay)`;
    if (guess === detectedOutput) return;
    detectedOutput = guess;
    if (S.output !== guess && phase === 'idle') setOutput(guess);
  }
  function setOutput(val) {
    S.output = val;
    S.tapSound = !!S.tapSoundBy[S.output]; // each output keeps its own tap-click setting
    save(); syncSettings(); if (lastResult) renderOutcome();
  }
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', () => setTimeout(detectOutput, 600));
  }

  function updateSoundStatus() {
    const el = document.getElementById('soundStatus');
    if (!el) return;
    const parts = [
      `Audio engine: ${ac ? ac.state : 'not started yet'}${ac ? ` (${ac.sampleRate} Hz)` : ''}`,
      ac ? `reported delay ${Math.round(((ac.baseLatency || 0) + (ac.outputLatency || 0)) * 1000)} ms` + (ac.outputLatency ? '' : ' (output part not reported)') : null,
      navigator.audioSession ? `iOS audio session: ${navigator.audioSession.type}` : null,
      IS_IOS ? `Silent-mode workaround: ${!S.silentMode ? 'switched off' : silentLoopPlaying ? 'on' : 'waiting for a tap'}` : null,
      `Low-latency mode: ${!S.lowLatency ? 'off' : keepAlive ? 'on' : 'waiting for a tap'}`,
    ].filter(Boolean);
    el.textContent = parts.join(' · ');
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (silentLoop) silentLoop.pause(); stopKeepAlive(); return; } // don't hold audio in the background
    if (ac && ac.state !== 'running') ac.resume().then(startKeepAlive).catch(() => {});
    else startKeepAlive();
  });
  let scheduled = [];
  let audioGen = 0; // bumped on stop so late-loading notes don't sound
  function click(t, accent, quiet) {
    const c = audio();
    const o = c.createOscillator(); const g = c.createGain();
    o.type = 'square'; o.frequency.value = accent ? 1760 : 1180;
    const vol = (quiet ? 0.08 : 0.22) * (accent ? 1.2 : 1);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.001); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.05);
    scheduled.push(o);
  }
  // instant feedback for each tap: a short, dry woodblock-like tick, lower than the metronome
  let tapBuf = null;
  function tapBuffer() {
    if (tapBuf && tapBuf.sampleRate === ac.sampleRate) return tapBuf;
    const sr = ac.sampleRate; const n = Math.round(sr * 0.045);
    tapBuf = ac.createBuffer(1, n, sr);
    const d = tapBuf.getChannelData(0);
    for (let i = 0; i < n; i++) { // woodblock-like tick: falling tone with a fast decay, peak at sample 0
      const t = i / sr;
      const f = 520 + 380 * Math.exp(-t / 0.01);
      d[i] = 0.55 * Math.sin(2 * Math.PI * f * t + Math.PI / 2) * Math.exp(-t / 0.009);
    }
    return tapBuf;
  }
  function tapSound() {
    if (!S.tapSound || !ac || ac.state !== 'running') return;
    const src = ac.createBufferSource();
    src.buffer = tapBuffer();
    src.connect(ac.destination);
    src.start(0); // as soon as possible
  }
  // Salamander Grand Piano V3 (Alexander Holm, CC BY 3.0): 4 of its 16 velocity layers,
  // sampled every minor third from A0 to C8 (the set's release noises are not used).
  const piano = (() => {
    const LAYERS = [6, 8, 10, 13];
    const NAMES = { 0: 'C', 3: 'Ds', 6: 'Fs', 9: 'A' };
    const cache = new Map();
    // Decode with an offline context so preloading never creates the real AudioContext:
    // on iOS that must first happen inside a tap, after the page has switched to media playback.
    let dctx = null;
    const decoder = () => {
      if (!dctx) {
        const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        dctx = Off ? new Off(2, 1, 44100) : audio();
      }
      return dctx;
    };
    let master = null;
    const out = () => {
      if (!master) { const c = audio(); master = c.createGain(); master.gain.value = 0.9; master.connect(c.destination); }
      return master;
    };
    const sampleFor = (midi) => {
      const m = Math.max(21, Math.min(108, midi));
      // nearest sampled key (samples are 3 semitones apart, so at most 1 semitone of shift)
      let best = null;
      for (let d = 0; d <= 2; d++) for (const c of [m - d, m + d]) if (best === null && c >= 21 && c <= 108 && (c % 12) in NAMES) best = c;
      return { name: NAMES[best % 12] + (Math.floor(best / 12) - 1), rate: Math.pow(2, (m - best) / 12) };
    };
    const layerFor = (vel) => LAYERS[Math.min(LAYERS.length - 1, Math.max(0, Math.floor(vel * LAYERS.length)))];
    function load(url) {
      if (!cache.has(url)) {
        const p = fetch(url).then((r) => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.arrayBuffer(); })
          .then((buf) => new Promise((res, rej) => decoder().decodeAudioData(buf, res, rej)));
        p.catch(() => cache.delete(url));
        cache.set(url, p);
      }
      return cache.get(url);
    }
    const urls = (midi, vel) => {
      const s = sampleFor(midi);
      return { note: `audio/piano/v${layerFor(vel)}/${s.name}.mp3`, rate: s.rate };
    };
    // where each sample's sound starts and how loud it peaks (tools/piano_offsets.py)
    let OFF = {};
    const offsReady = fetch('audio/piano/offsets.json').then((r) => (r.ok ? r.json() : {})).then((j) => { OFF = j; }).catch(() => {});
    const offsetOf = (url) => OFF[url.replace('audio/piano/', '')] || [0, 0.33];
    function prepare(notes) {
      return Promise.all([offsReady, ...notes.map(({ midi, vel }) => load(urls(midi, vel).note))]);
    }
    function play(t, dur, midi, vel, gain = 1) {
      const c = audio();
      out();
      const u = urls(midi, vel);
      const gen = audioGen;
      load(u.note).then((buf) => {
        if (gen !== audioGen || t < c.currentTime) return; // stopped meanwhile, or arrived too late (only if prepare() was skipped)
        const [noteStart] = offsetOf(u.note);
        const src = c.createBufferSource(); const g = c.createGain();
        src.buffer = buf; src.playbackRate.value = u.rate;
        const level = (0.75 + 0.35 * vel) * gain;
        const off = t + Math.max(0.06, dur);
        g.gain.setValueAtTime(level, t);
        g.gain.setValueAtTime(level, off);
        g.gain.setTargetAtTime(0, off, 0.07); // damper
        src.connect(g).connect(master);
        src.start(t, noteStart); // skip the sample's lead-in so the attack lands on the beat
        src.stop(off + 0.6);
        // (the set's key-release noises aren't played: they aren't timed to the strike, and with chords
        // several of them sounded as a late, loud thud)
        scheduled.push(src);
      }).catch(() => { /* a missing sample just stays silent */ });
    }
    return { prepare, play, load, out };
  })();

  // Bass, guitar and drum parts play on their own instrument; every other part plays on the piano.
  // Bass and guitar: FluidR3 GM (Frank Wen, CC BY 3.0), sampled every minor third. Drums: the
  // Salamander Drumkit (Alexander Holm, CC BY-SA 3.0), one hit per kit piece.
  const BASS_DIRS = { synth: 'synth_bass_1', electric: 'electric_bass_finger', acoustic: 'acoustic_bass' };
  function instrumentOf(occ) {
    if (!occ) return null;
    const part = occ[1] || '';
    const genre = genreOf(occ);
    if (/bass drum|surdo/i.test(part)) return { kind: 'drums', kickOnly: true };
    if (/drum/i.test(part)) return { kind: 'drums' };
    // sung and orchestral bass lines (chorales, madrigals, classical) stay on the piano
    if (/\bbass\b/i.test(part) && !/clarinet|drum/i.test(part) && genre !== 'chorale' && genre !== 'classical') {
      const type = /synth/i.test(part) ? 'synth' : /electric/i.test(part) ? 'electric'
        : /upright|acoustic|string/i.test(part) || genre === 'jazz' || genre === 'latin' ? 'acoustic' : 'electric';
      return { kind: 'pitched', dir: BASS_DIRS[type], lo: 24, hi: 72 };
    }
    if (/guitar/i.test(part)) return { kind: 'pitched', dir: /acoustic/i.test(part) ? 'acoustic_guitar_steel' : 'electric_guitar_clean', lo: 36, hi: 96 };
    return null;
  }
  const instruments = (() => {
    const NAMES = { 0: 'C', 3: 'Eb', 6: 'Gb', 9: 'A' };
    // a drum part's note -> kit piece, by its position on the percussion staff (standard drum-set
    // notation: hi-hat pedal below the staff, kick in the bottom space, floor tom on the second space,
    // medium tom on the middle line, snare on the third space, high toms above it, ride on the top line,
    // hi-hat above the staff, crash on the first ledger line)
    const kitPiece = (m) => (!m ? 'snare' : m <= 61 ? 'kick' : m <= 63 ? 'hihat-foot' : m <= 67 ? 'kick' : m <= 70 ? 'tom-low'
      : m === 71 ? 'tom-mid' : m <= 73 ? 'snare' : m <= 76 ? 'tom' : m <= 78 ? 'ride' : m <= 80 ? 'hihat' : 'crash');
    // the kit has two toms; the medium tom is the low one tuned up a minor third
    const KIT_FILE = { 'tom-mid': ['tom-low', Math.pow(2, 3 / 12)] };
    const KIT_MIX = { kick: 1, snare: 0.9, 'tom-low': 0.85, 'tom-mid': 0.85, tom: 0.85, ride: 0.8, hihat: 0.55, 'hihat-open': 0.55, 'hihat-foot': 0.45, crash: 0.6 };
    let OFF = { instruments: {}, drums: {} };
    const ready = Promise.all(['instruments', 'drums'].map((k) => fetch(`audio/${k}/offsets.json`)
      .then((r) => (r.ok ? r.json() : {})).then((j) => { OFF[k] = j; }).catch(() => {})));
    function sample(inst, midi) {
      if (inst.kind === 'drums') {
        const piece = inst.kickOnly ? 'kick' : kitPiece(midi);
        const [file, rate] = KIT_FILE[piece] || [piece, 1];
        const o = OFF.drums[`${file}.mp3`] || [0, 0.05, 0.3];
        return { url: `audio/drums/${file}.mp3`, rate, start: o[0], gain: (KIT_MIX[piece] * 0.6) / o[2] };
      }
      let m = midi || 48;
      while (m < inst.lo) m += 12; // written outside the sampled range: move by octaves
      while (m > inst.hi) m -= 12;
      let best = m;
      for (let d = 0; d <= 2; d++) { if ((m - d) % 12 in NAMES && m - d >= inst.lo) { best = m - d; break; } if ((m + d) % 12 in NAMES && m + d <= inst.hi) { best = m + d; break; } }
      const key = `${inst.dir}/${NAMES[best % 12]}${Math.floor(best / 12) - 1}.mp3`;
      const o = OFF.instruments[key] || [0, 0.05, 0.3];
      // about the piano's loudness, but never letting a peak clip
      return { url: `audio/instruments/${key}`, rate: Math.pow(2, (m - best) / 12), start: o[0], gain: Math.min(0.16 / o[1], 0.8 / o[2]) };
    }
    async function prepare(inst, midis) {
      await ready;
      return Promise.all(midis.map((m) => piano.load(sample(inst, m).url)));
    }
    function play(inst, t, dur, midi, vel, gain = 1) {
      const c = audio();
      const dest = piano.out();
      const gen = audioGen;
      ready.then(() => {
        const s = sample(inst, midi);
        return piano.load(s.url).then((buf) => {
          if (gen !== audioGen || t < c.currentTime) return;
          const src = c.createBufferSource(); const g = c.createGain();
          src.buffer = buf; src.playbackRate.value = s.rate;
          const level = (0.75 + 0.35 * vel) * gain * s.gain;
          g.gain.setValueAtTime(level, t);
          let end = t + buf.duration; // a drum rings out
          if (inst.kind !== 'drums') {
            const off = t + Math.max(0.06, dur);
            g.gain.setValueAtTime(level, off);
            g.gain.setTargetAtTime(0, off, 0.05); // the string is damped at the note's end
            end = off + 0.5;
          }
          src.connect(g).connect(dest);
          src.start(t, s.start); // skip the sample's lead-in so the attack lands on the beat
          src.stop(end); // (only after start: stopping first throws)
          scheduled.push(src);
        });
      }).catch(() => { /* a missing sample just stays silent */ });
    }
    return { prepare, play };
  })();
  // the excerpt's notes, on its own instrument when it has one
  function prepareSound() {
    const inst = current && instrumentOf(current.occ);
    if (!inst) return piano.prepare(pianoPitches());
    return instruments.prepare(inst, pianoPitches().map((n) => n.midi));
  }

  // metric weight -> loudness. Each weight sits in the middle of one velocity layer
  // (downbeat, beat, half-beat, the rest), so the layer is fixed and can be preloaded;
  // humanize adds a little variation inside the layer.
  // Every note at the same moderate strength (no built-in accents on downbeats or beats), with a
  // touch of variation when humanized so a run doesn't sound mechanical. The value picks one sample
  // layer for all notes, so the tone stays the same throughout.
  const PLAY_VEL = 0.6;
  function velocityAt(pos, humanize) {
    return humanize ? PLAY_VEL + (Math.random() - 0.5) * 0.06 : PLAY_VEL;
  }
  const LISTEN_MIDI = 72; // fallback pitch (C5) for a note whose pitch is unknown
  function pianoPitches() {
    if (!current) return [];
    const out = [];
    soundingNotes().forEach((n) => {
      const vel = velocityAt(n.pos);
      const ms = notesOf(n.midi);
      (ms.length ? ms : [LISTEN_MIDI]).forEach((midi) => out.push({ midi, vel }));
    });
    return out;
  }

  function stopAudio() { audioGen++; scheduled.forEach((o) => { try { o.stop(); } catch (e) { /* done */ } }); scheduled = []; }

  // audio-clock time at which a DOM event was heard (corrected for output latency)
  function eventAudioTime(ev) {
    const c = audio();
    const nowPerf = performance.now();
    const evPerf = ev && ev.timeStamp && ev.timeStamp > 0 && ev.timeStamp <= nowPerf + 5 ? ev.timeStamp : nowPerf;
    if (c.getOutputTimestamp) {
      const ts = c.getOutputTimestamp();
      if (ts.contextTime > 0 && ts.performanceTime > 0) return ts.contextTime + (evPerf - ts.performanceTime) / 1000;
    }
    return c.currentTime - (c.outputLatency || c.baseLatency || 0) - (nowPerf - evPerf) / 1000;
  }

  // ---------- run an excerpt ----------
  let run = null; // {t0, secPerTick, taps, mode, raf, endAt}

  // The excerpt's own tempo, in the app's beats (the meter's beat), when the source gives one: the
  // metronome mark in the score, or the recording's average tempo (jazz solos).
  function originalTempo() {
    if (!current || !current.occ[4]) return null;
    return Math.round(current.occ[4] * TPQ / current.mi.beat);
  }
  // Original on and known: play at it; otherwise the slider's tempo.
  const tempoNow = () => (S.useOriginal && originalTempo()) || S.tempo;
  function secPerTick() { return 60 / tempoNow() / current.mi.beat; }

  let loadingToken = 0;
  async function startRun(mode) {
    if (!current) return;
    stopRun(true);
    if (mode !== 'play') {
      const token = ++loadingToken;
      loadingMode = mode; setButtons();
      try { await prepareSound(); } catch (e) { /* play what loaded */ }
      if (token !== loadingToken) return;
      loadingMode = null;
      if (run || phase !== 'idle') { setButtons(); return; }
    } else { loadingToken++; loadingMode = null; }
    const token = loadingToken;
    if (!(await ensureRunning())) {
      if (token === loadingToken) setPadStatus('blocked', 'Sound is blocked by the browser. Tap Start again.');
      updateSoundStatus();
      return;
    }
    if (token !== loadingToken || run) return;
    const c = audio();
    if (mode !== 'calib') detectOutput();
    const spt = secPerTick();
    const mi = current.mi;
    const beatSec = mi.beat * spt;
    const countBeats = mi.beatsPerBar;
    const start = c.currentTime + 0.25;
    const t0 = start + countBeats * beatSec;
    for (let b = 0; b < countBeats; b++) click(start + b * beatSec, b === 0);
    const total = current.flat.total;
    const R = reps();
    const nBeats = Math.round(total * R / mi.beat);
    const passes = (fn) => { for (let p = 0; p < R; p++) soundingNotes().forEach((n) => fn(n, t0 + (n.pos + p * total) * spt)); };
    if (mode === 'play' && S.metro) for (let b = 0; b < nBeats; b++) click(t0 + b * beatSec, (b * mi.beat) % mi.bar === 0, true);
    if (mode === 'listen') {
      if (S.metro) for (let b = 0; b < nBeats; b++) click(t0 + b * beatSec, (b * mi.beat) % mi.bar === 0, true);
      passes((n, t) => playChord(t, n.len * spt, n.midi, velocityAt(n.pos, true), LISTEN_MIDI)); // the real part, chords and all
    }
    if (mode === 'melody') {
      passes((n, t) => playChord(t, n.len * spt, n.midi, velocityAt(n.pos, true), 0));
    }
    run = { mode, start, t0, spt, beatSec, countBeats, taps: [], endAt: t0 + total * R * spt + (mode === 'play' ? beatSec * 0.75 : 0.1) };
    phase = 'countin';
    if (mode === 'play' && lastResult) { lastResult = null; render(); renderOutcome(); }
    setButtons();
    tick();
  }

  // every note of a chord, each a little quieter (same sample layer, so the same tone) so a full
  // voicing isn't louder than a single line
  const chordGain = (n) => (n > 1 ? Math.max(0.55, 1 / Math.sqrt(n)) : 1);
  function playChord(t, dur, midi, vel, fallback) {
    const inst = instrumentOf(current.occ);
    const note = (m, g) => (inst ? instruments.play(inst, t, dur, m, vel, g) : piano.play(t, dur, m, vel, g));
    const ms = notesOf(midi);
    if (!ms.length) { // no pitch known: a drum hit still sounds (as snare), anything else only on fallback
      if (inst && inst.kind === 'drums') note(0, 1); else if (fallback) note(fallback, 1);
      return;
    }
    // drum hits together (kick and cymbal) each sound at full strength
    ms.forEach((m) => note(m, inst && inst.kind === 'drums' ? 1 : chordGain(ms.length)));
  }

  function soundingNotes() {
    const ev = current.flat.events;
    const pitches = pitchesOf(current.occ);
    const out = [];
    ev.forEach((e, i) => {
      if (!e.onset) return;
      let len = e.ticks; let j = i;
      while (ev[j].flags & FLAG.TIE && j + 1 < ev.length) { j++; len += ev[j].ticks; }
      out.push({ pos: e.pos, len, midi: pitches[i] });
    });
    return out;
  }

  // The audio time being heard right now. The audio clock moves in coarse steps in some browsers,
  // which made the playhead jump; the output timestamp ties it to the display clock instead.
  function heardTime(c) {
    let t = c.currentTime - (c.outputLatency || 0);
    if (c.getOutputTimestamp) {
      const ts = c.getOutputTimestamp();
      const age = performance.now() - ts.performanceTime;
      // the same clock taps are timed by (eventAudioTime); a stale timestamp is ignored
      if (ts.contextTime > 0 && ts.performanceTime > 0 && age >= 0 && age < 500) t = ts.contextTime + age / 1000;
    }
    if (run.lastHeard != null && t < run.lastHeard) t = run.lastHeard; // never step backward
    run.lastHeard = t;
    return t;
  }

  function tick() {
    if (!run) return;
    const c = audio();
    const now = heardTime(c);
    const ph = $('playhead'); const ci = $('countin');
    if (now < run.t0) {
      const b = Math.floor((now - run.start) / run.beatSec);
      ci.hidden = b < 0;
      if (ci.dataset.b !== String(b)) { ci.dataset.b = String(b); ci.innerHTML = b >= 0 ? `${b + 1}<small>then ${reps()}× through</small>` : ''; }
      ph.hidden = true;
      setPadStatus('countin', b >= 0 ? `Count-in ${b + 1} of ${run.countBeats} · then ${reps()}× through` : `Get ready · plays ${reps()}×`);
    } else {
      ci.hidden = true;
      phase = run.mode === 'play' ? 'playing' : 'listening';
      const total = current.flat.total;
      const tk = (now - run.t0) / run.spt;
      const R = reps();
      const pass = Math.min(R - 1, Math.floor(tk / total));
      if (run.mode === 'play') setPadStatus('playing', R === 2 ? (pass === 0 ? 'Tap each note · first time' : 'Tap each note · repeat') : `Tap each note · ${pass + 1} of ${R}`);
      else setPadStatus('listening', 'Playing the melody · taps are not scored');
      const p = tickToXY(tk >= total * R ? total : tk % total, true);
      if (p && layout) {
        ph.hidden = false;
        ph.style.left = (p.x * layout.s) + 'px';
        ph.style.top = (p.row.top * layout.s) + 'px';
        ph.style.height = (p.row.height * layout.s) + 'px';
        // a tall score scrolls inside its box (locked touch layout): keep the playing row in view
        if (run.row !== p.row) {
          run.row = p.row;
          const sheet = ph.closest('.sheet');
          if (sheet.scrollHeight > sheet.clientHeight + 1) {
            const r = ph.getBoundingClientRect(); const b = sheet.getBoundingClientRect();
            if (r.top < b.top || r.bottom > b.bottom) sheet.scrollTop += r.top - b.top - 8;
          }
        }
      }
    }
    if (c.currentTime >= run.endAt) { finishRun(); return; }
    run.raf = requestAnimationFrame(tick);
  }

  function stopRun(silent) {
    if (run && run.raf) cancelAnimationFrame(run.raf);
    stopAudio();
    run = null; phase = 'idle';
    $('playhead').hidden = true; $('countin').hidden = true; $('countin').dataset.b = '';
    if (pendingRender) render(); // a resize happened during the attempt
    if (!silent) setButtons();
  }

  function finishRun() {
    const r = run;
    stopRun(true);
    if (r.mode === 'play') {
      score(r);
      render();
      renderOutcome();
    }
    setButtons();
  }

  function onTap(ev) {
    if ((run && run.mode === 'play') || phase === 'calibrating') tapSound(); // first, before any other work
    const heard = eventAudioTime(ev);
    flashPad(ev && ev.currentTarget);
    if (phase === 'calibrating') { calib.taps.push(heard); return; }
    if (!run || run.mode !== 'play') {
      if (phase === 'idle' && current) startRun('play');
      return;
    }
    run.taps.push(heard - latencyMs() / 1000);
  }

  // ---------- scoring ----------
  function score(r, record = true) {
    const A = acc();
    const evs = current.flat.events;
    const onsets = [];
    const total = current.flat.total;
    const R = reps();
    for (let p = 0; p < R; p++) {
      evs.forEach((e, i) => {
        if (e.onset) { const tick = e.pos + p * total; onsets.push({ idx: i, pass: p, tick, t: r.t0 + tick * r.spt }); }
      });
    }
    onsets.forEach((o, k) => {
      const prev = k ? o.t - onsets[k - 1].t : Infinity;
      const next = k < onsets.length - 1 ? onsets[k + 1].t - o.t : Infinity;
      o.win = Math.max(0.05, Math.min(A.cap, prev / 2, next / 2));
    });
    const taps = r.taps.filter((t) => t > r.t0 - 0.25);
    const pairs = [];
    onsets.forEach((o, i) => taps.forEach((t, j) => { const d = t - o.t; if (Math.abs(d) <= o.win) pairs.push([Math.abs(d), i, j, d]); }));
    pairs.sort((a, b) => a[0] - b[0]);
    const usedO = new Set(); const usedT = new Set();
    const tapPass = {}; const tapOnset = {};
    pairs.forEach(([, i, j, d]) => { if (usedO.has(i) || usedT.has(j)) return; usedO.add(i); usedT.add(j); onsets[i].err = d; tapPass[j] = onsets[i].pass; tapOnset[j] = i; });
    let pts = 0; const cnt = { perfect: 0, good: 0, off: 0, miss: 0 };
    const errs = [];
    onsets.forEach((o) => {
      if (o.err === undefined) o.grade = 'miss';
      else {
        const a = Math.abs(o.err);
        o.grade = a <= A.perfect ? 'perfect' : a <= A.good ? 'good' : 'off';
        errs.push(o.err);
      }
      cnt[o.grade]++;
      pts += { perfect: 1, good: 0.75, off: 0.4, miss: 0 }[o.grade];
    });
    const extra = taps.length - usedT.size;
    const pct = Math.max(0, Math.round(100 * (pts - 0.5 * extra) / onsets.length));
    const mean = errs.length ? errs.reduce((a, b) => a + b, 0) / errs.length : 0;
    const sd = errs.length > 1 ? Math.sqrt(errs.reduce((a, b) => a + (b - mean) ** 2, 0) / (errs.length - 1)) : 0;
    const byEvent = {};
    // a note's color on the staff is its worse result across the passes
    onsets.forEach((o) => { if (!byEvent[o.idx] || WORSE[o.grade] > WORSE[byEvent[o.idx].grade]) byEvent[o.idx] = o; });
    const tapTicks = taps.map((t, j) => {
      const tick = (t - r.t0) / r.spt;
      const pass = j in tapPass ? tapPass[j] : Math.max(0, Math.min(R - 1, Math.floor(tick / total)));
      return { tick, pass, extra: !usedT.has(j), grade: j in tapOnset ? onsets[tapOnset[j]].grade : 'extra' };
    });
    const histEntry = record ? { d: Date.now(), p: pct, l: current.item.l } : (lastResult && lastResult.histEntry);
    lastResult = { onsets, byEvent, tapTicks, cnt, extra, pct, mean, sd, run: { t0: r.t0, spt: r.spt, taps: r.taps }, histEntry, mode: S.accuracy };
    if (record) history.push(histEntry);
    else if (histEntry) histEntry.p = pct; // re-scored in another accuracy mode
    while (history.length > 500) history.shift();
    store.set('history', history);
    updateSession();
  }

  // ---------- outcome: results + source ----------
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  const icon = (id, cls) => `<svg class="icon${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${id}"/></svg>`;

  // collections whose name adds nothing beyond the song's own origin
  // ---------- favorites: excerpts starred to play or practice later (kept in this browser) ----------
  // Each is saved by piece, part, first bar and rhythm, not by its place in the data, so a favorite
  // survives a rebuild of the corpus. Newest first.
  let favorites = store.get('favorites', []).filter((f) => f && f.r);
  const rhythmKey = (item) => `${item.m}|${item.r.join(' / ')}`;
  function favOf(item, occ) {
    const s = DATA.sources[occ[0]];
    return { t: s[0], c: s[1] || '', f: s[2], p: occ[1] || '', b: occ[2] == null ? null : occ[2], r: rhythmKey(item) };
  }
  const sameFav = (a, b) => a.r === b.r && a.t === b.t && a.c === b.c && a.f === b.f && a.p === b.p && a.b === b.b;
  const isFavorite = (item, occ) => { const k = favOf(item, occ); return favorites.some((f) => sameFav(f, k)); };
  function toggleFavorite() {
    if (!current) return;
    const k = favOf(current.item, current.occ);
    const had = favorites.some((f) => sameFav(f, k));
    favorites = had ? favorites.filter((f) => !sameFav(f, k)) : [{ ...k, at: Date.now() }, ...favorites];
    store.set('favorites', favorites);
    renderOutcome();
    const star = document.querySelector('#outcome .star');
    if (star) star.focus({ preventScroll: true });
  }
  // the favorites as corpus rows ({item, occ}), newest first; one that is no longer in the corpus is skipped
  function favoriteRows() {
    const byRhythm = new Map();
    favorites.forEach((f, i) => { if (!byRhythm.has(f.r)) byRhythm.set(f.r, []); byRhythm.get(f.r).push([f, i]); });
    const rows = [];
    DATA.rhythms.forEach((item) => {
      const want = byRhythm.get(rhythmKey(item));
      if (!want) return;
      allOccurrences(item).forEach((occ) => {
        const k = favOf(item, occ);
        const hit = want.find(([f]) => sameFav(f, k));
        if (hit && !rows.some((r) => r.i === hit[1])) rows.push({ item, occ, i: hit[1] });
      });
    });
    return rows.sort((a, b) => a.i - b.i);
  }

  const HIDE_COLLECTION = new Set(['essenFolksong']);
  function sourceInner() {
    const { item, occ } = current;
    const [title, composer, folder, origin, date, note] = DATA.sources[occ[0]];
    const coll = DATA.collections[folder].label;
    const bar = occ[2];
    const bars = bar != null ? `mm. ${bar}–${bar + item.b - 1}` : '';
    const generic = /^(musicxml part|part\s*\d*|p\d+|instrument\s*\d*)$/i.test((occ[1] || '').trim());
    const part = occ[1] && !generic ? `${esc(occ[1])}, ` : '';
    const where = [origin, date].filter(Boolean).map(esc).join(' · ');
    // skip the collection when it adds nothing: Essen (origin says more) or a single-composer folder ('Beethoven')
    const surname = (composer || '').trim().split(/\s+/).pop();
    // (a collection that credits someone, like a transcriber, always shows)
    const redundant = !['parkerbook', 'mvbjazz', 'mvbsongs'].includes(folder) && (HIDE_COLLECTION.has(folder) || (surname && coll.includes(surname)));
    const cinfo = DATA.collections[folder];
    const collName = cinfo.url ? `<a href="${esc(cinfo.url)}" target="_blank" rel="noopener"><em>${esc(coll)}</em></a>` : esc(coll);
    const from = redundant ? '' : `, from ${collName}${cinfo.credit ? `, ${esc(cinfo.credit)}` : ''}`;
    const others = item.o.filter((o) => o[0] !== occ[0]).slice(0, 4).map((o) => {
      const src = DATA.sources[o[0]];
      const place = src[3] || (HIDE_COLLECTION.has(src[2]) ? '' : DATA.collections[src[2]].label);
      return `<li>${esc(src[0])}${src[1] ? ' (' + esc(src[1]) + ')' : ''}${place ? ', ' + esc(place) : ''}${src[4] ? ', ' + esc(src[4].replace(/^(composed|published|recorded|harmonized) /, '')) : ''}</li>`;
    }).join('');
    const alt = otherSpellings(item);
    const altMeters = [...new Set(alt.others.map((r) => r.m))].join(', ');
    const seeAll = (text) => `<button type="button" class="link-btn inline" data-action="family">${text}</button>`;
    const q = occ[4];
    const tempoLine = q ? `<p>Tempo: ${originalTempo()} BPM${current.mi.compound ? ` (dotted-${current.mi.den === 8 ? 'quarter' : 'half'} beat)` : ''}, ${
      folder === 'wjd' ? 'the average tempo of the recording' : 'from the metronome mark in the score'}.</p>` : '';
    // one link to the full list: this spelling's count, plus the same proportions written other ways
    const altText = alt.n ? `, and in ${alt.n} more written another way (${esc(altMeters)}) with the same proportions` : '';
    const occurs = item.n > 1 || alt.n
      ? seeAll(`This rhythm is in ${item.n} piece${item.n === 1 ? '' : 's'} in the corpus${altText}. See them all`)
      : 'This rhythm is unique to one piece in the corpus.';
    const fav = isFavorite(item, occ);
    const star = `<button type="button" class="star" data-action="favorite" aria-pressed="${fav}" aria-label="${fav ? 'Remove from favorites' : 'Save to favorites'}" title="${fav ? 'Remove from favorites' : 'Save to favorites, to play or practice later'}">${icon(fav ? 'star-fill' : 'star')}</button>`;
    return `<div class="source">
      <div class="source-top"><div class="eyebrow">Where this rhythm comes from</div>${star}</div>
      <h3>${esc(title)}${composer ? ` <em>${esc(composer)}</em>` : ''}</h3>
      ${where ? `<p class="where">${where}</p>` : ''}
      <p>${[part.replace(/, $/, ''), bars].filter(Boolean).join(', ')}${from}${note ? ` · ${esc(note)}` : ''}</p>
      ${tempoLine}<p>${occurs}</p>
      ${others ? `<div class="eyebrow">Also found in</div><ul>${others}</ul>` : ''}
      <button type="button" class="link-btn" data-action="corpus">Browse every rhythm in the corpus</button>
      ${favorites.length ? `<button type="button" class="link-btn" data-action="favorites">Your favorites (${favorites.length})</button>` : ''}
    </div>`;
  }

  function resultHTML() {
    const R = lastResult;
    const ms = (x) => Math.round(x * 1000);
    let verdict;
    if (R.cnt.miss === R.onsets.length) verdict = 'No taps landed near the notes. Tap the pad or press Space on each attack.';
    else if (Math.abs(R.mean) > 0.03) {
      verdict = `You were ${ms(Math.abs(R.mean))} ms ${R.mean < 0 ? 'early (rushing)' : 'late (dragging)'} on average. `
        + (calibStale()
          ? `Your ${OUTPUT_NAME[S.output]} offset was measured with tap click ${S.tapSound ? 'off' : 'on'}: recalibrate in Settings, under Listening on.`
          : 'If that is steady, recalibrate in Settings, under Listening on.');
    }
    else verdict = `Centered on the beat; your spread was ±${ms(R.sd)} ms.`;
    return `<div class="card result">
      <div class="result-top"><div class="bigscore">${R.pct}<small>%</small></div><p class="verdict">${verdict}</p></div>
      <div class="counts">
        <span class="count" style="--c:var(--perfect)">${R.cnt.perfect} within ${ms(acc().perfect)} ms</span>
        <span class="count" style="--c:var(--good)">${R.cnt.good} within ${ms(acc().good)} ms</span>
        <span class="count" style="--c:var(--off)">${R.cnt.off} loose</span>
        <span class="count" style="--c:var(--miss)">${R.cnt.miss} missed</span>
        <span class="count" style="--c:var(--miss)">${R.extra} extra tap${R.extra === 1 ? '' : 's'}</span>
      </div>
      <p class="legend">Under the staff, gray marks show where each note falls, one row for each time through. Dots are your taps (${acc().label} accuracy): <span class="lg" style="--c:var(--perfect)">within ${ms(acc().perfect)} ms, full credit</span> <span class="lg" style="--c:var(--good)">within ${ms(acc().good)} ms</span> <span class="lg" style="--c:var(--off)">loose</span> <span class="lg" style="--c:var(--miss)">extra tap</span>. A mark with no dot is a missed note.</p>
    </div>`;
  }

  function renderOutcome() {
    const box = $('outcome');
    if (!current) { box.innerHTML = ''; return; }
    let html = lastResult ? resultHTML() : '';
    if (S.hideSource && !lastResult) {
      html += `<details class="locked"><summary>${icon('lock')}<span class="grow">Play to discover the music</span>${icon('chevron', 'chev')}</summary>${sourceInner()}</details>`;
    } else {
      html += `<div class="card">${sourceInner()}</div>`;
    }
    box.innerHTML = html;
  }

  // ---------- calibration ----------
  const calib = { taps: [], clicks: [] };
  function calibrate() {
    stopRun(true);
    const c = audio();
    const beat = 60 / 90;
    const t = c.currentTime + 0.4;
    calib.taps = []; calib.clicks = [];
    for (let i = 0; i < 16; i++) { click(t + i * beat, i % 4 === 0); calib.clicks.push(t + i * beat); }
    phase = 'calibrating';
    $('calibMsg').textContent = 'Listen for 4 clicks, then tap along.';
    $('calibPad').hidden = false;
    setButtons();
    setTimeout(() => {
      phase = 'idle';
      $('calibPad').hidden = true;
      const errs = [];
      calib.clicks.slice(4).forEach((ct) => {
        let best = null;
        calib.taps.forEach((tp) => { const d = tp - ct; if (Math.abs(d) < beat / 2 && (best === null || Math.abs(d) < Math.abs(best))) best = d; });
        if (best !== null) errs.push(best);
      });
      if (errs.length < 6) {
        $('calibMsg').textContent = `Only ${errs.length} taps matched. Try again.`;
      } else {
        errs.sort((a, b) => a - b);
        const med = errs[Math.floor(errs.length / 2)];
        S.offsets[S.output] = Math.round(med * 1000 / 5) * 5;
        S.calibClick[S.output] = !!S.tapSound;
        $('latency').value = latencyMs(); save(); syncSettings();
        $('calibMsg').textContent = `Offset for ${OUTPUT_NAME[S.output]} set to ${latencyMs()} ms.`;
      }
      setButtons();
      if (pendingRender) render();
    }, (0.4 + 16 * beat + 0.5) * 1000);
  }

  // ---------- transport, pad, header ----------
  function flashPad(el) {
    const p = el && el.id === 'calibPad' ? el : $('pad');
    p.classList.add('flash'); setTimeout(() => p.classList.remove('flash'), 90);
  }

  function setBtn(btn, iconId, label, key, iconAfter) {
    const ic = iconId ? icon(iconId) : '';
    btn.innerHTML = (iconAfter ? '' : ic) + `<span>${label}</span>` + (iconAfter ? ic : '') + (key ? `<kbd>${key}</kbd>` : '');
  }

  let loadingMode = null;
  let padStatusText = '';
  function setPadStatus(state, text) {
    const pad = $('pad');
    if (pad.dataset.state !== state) pad.dataset.state = state;
    if (text !== padStatusText) { $('padStatus').textContent = text; padStatusText = text; }
  }

  function setButtons() {
    const running = !!run;
    if (running) setBtn($('btnPlay'), 'stop', 'Stop', 'Esc');
    else setBtn($('btnPlay'), 'play', lastResult ? 'Try again' : 'Start', 'Enter');
    $('btnPlay').disabled = !current || phase === 'calibrating';
    setBtn($('btnListen'), 'speaker', loadingMode ? 'Loading…' : 'Listen', 'L');
    $('btnListen').disabled = phase !== 'idle' || !current || !!loadingMode;
    setBtn($('btnNext'), 'next', 'Next', '→', true);
    $('btnNext').disabled = phase === 'calibrating';
    $('btnCalib').disabled = phase !== 'idle';
    const melody = $('btnMelody');
    if (melody) {
      melody.querySelector('span').textContent = loadingMode === 'melody' ? 'Loading sound…' : 'Hear the melody';
      melody.disabled = phase === 'calibrating' || !!loadingMode;
    }
    showTempo();
    const mi = current && current.mi;
    $('tempoBeat').textContent = mi && mi.compound ? (mi.den === 8 ? 'dotted-quarter beat' : 'dotted-half beat') : '';
    if (!running) {
      if (!current) setPadStatus('empty', 'No rhythms match these settings');
      else if (phase === 'calibrating') setPadStatus('calibrating', 'Calibrating: tap with the clicks');
      else if (loadingMode) setPadStatus('loading', 'Loading sound…');
      else setPadStatus(lastResult ? 'done' : 'ready', lastResult ? `Tap or press Start to try again · plays ${reps()}×` : `Press Start, or just start tapping · plays ${reps()}×`);
    }
  }

  function updateSession() {
    const today = new Date().toDateString();
    const t = history.filter((h) => new Date(h.d).toDateString() === today);
    $('session').textContent = t.length
      ? `${t.length} practiced today · ${Math.round(t.reduce((a, h) => a + h.p, 0) / t.length)}% average`
      : 'Nothing practiced yet today';
  }

  function renderMeta() {
    if (!current) { $('metaChips').innerHTML = ''; return; }
    const { item } = current;
    const [title, composer] = DATA.sources[current.occ[0]];
    const name = S.hideSource && !lastResult ? '' : `<span class="meta-source" title="${esc(title)}${composer ? ' · ' + esc(composer) : ''}">${esc(title)}${composer ? ` <em>${esc(composer)}</em>` : ''}</span>`;
    const scoreChip = lastResult ? `<span class="chip score-chip" title="Score for your last attempt">${lastResult.pct}%</span>` : '';
    $('metaChips').innerHTML = `<span class="chip">${item.m}</span><span class="chip" title="${LEVELS[item.l][0]}: ${esc(LEVELS[item.l][1])}">Level ${item.l}</span><span class="chip">${item.b} bar${item.b > 1 ? 's' : ''}</span>${scoreChip}${name}`;
  }

  // ---------- tempo ----------
  // ---------- tempo: a slider, plus the number itself, which opens exact entry ----------
  const TEMPO_MIN = 40; const TEMPO_MAX = 200; const TEMPO_STEP = 2;
  const clampTempo = (v) => Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, Math.round((Number(v) || S.tempo) / TEMPO_STEP) * TEMPO_STEP));
  // user's own tempo (slider or typed): it also switches Original off
  function setTempo(v, fromUser = true) {
    const t = clampTempo(v);
    if (t !== S.tempo) { S.tempo = t; save(); }
    if (fromUser && S.useOriginal) { S.useOriginal = false; save(); }
    showTempo();
  }
  function showTempo() {
    const orig = originalTempo();
    const on = !!(S.useOriginal && orig);
    const t = tempoNow();
    $('tempoSlider').value = Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, t));
    $('tempoSlider').setAttribute('aria-valuetext', `${t} beats per minute${on ? ', the original tempo' : ''}`);
    $('tempoNum').textContent = t;
    $('tempo').value = t;
    const b = $('btnOrig');
    b.setAttribute('aria-pressed', String(!!S.useOriginal));
    b.classList.toggle('na', !orig);
    const what = current && DATA.sources[current.occ[0]][2] === 'wjd' ? "the recording's average tempo" : 'the metronome mark in the score';
    const tip = !orig ? `Original tempo: not known for this excerpt${S.useOriginal ? `, so it plays at your ${S.tempo} BPM` : ''}`
      : `Original tempo: ${orig} BPM, ${what}${on ? '' : ' (off: playing at your slider tempo)'}`;
    b.title = tip;
    b.setAttribute('aria-label', tip);
    $('tempoGroup').classList.toggle('orig-on', on);
  }
  function openTempoInput() {
    $('tempoValue').hidden = true;
    const inp = $('tempo');
    inp.hidden = false;
    inp.value = tempoNow();
    inp.focus();
    inp.select();
  }
  function closeTempoInput(commit) {
    const inp = $('tempo');
    if (inp.hidden) return;
    if (commit) setTempo(inp.value);
    inp.hidden = true;
    $('tempoValue').hidden = false;
    $('tempoValue').focus({ preventScroll: true });
  }
  function setupTempo() {
    $('tempoSlider').addEventListener('input', (e) => setTempo(e.target.value));
    $('tempoValue').addEventListener('click', openTempoInput);
    const inp = $('tempo');
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); closeTempoInput(true); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeTempoInput(false); }
    });
    inp.addEventListener('blur', () => closeTempoInput(true));
    $('btnOrig').addEventListener('click', () => {
      S.useOriginal = !S.useOriginal;
      save();
      if (run) stopRun(true);
      showTempo();
      setButtons();
    });
    showTempo();
  }

  // ---------- settings component ----------
  const PRIMARY_METERS = ['2/4', '3/4', '4/4', '6/8'].filter((m) => METER_ORDER.includes(m));
  const MORE_METERS = METER_ORDER.filter((m) => !PRIMARY_METERS.includes(m));
  const GENRE_SHORT = { folk: 'Folk', chorale: 'Bach', classical: 'Classical', ragtime: 'Ragtime', jazz: 'Jazz', popular: 'Pop', latin: 'Latin', african: 'African' };

  function toggleGroup(el, entries, key, multi, repick = true, withAll = false) {
    const changed = () => {
      save();
      syncSettings();
      if (!repick) return; // e.g. switching headphones keeps the current rhythm
      if (run) stopRun(true);
      pickNext();
      setButtons();
    };
    const all = entries.map((e) => e.val);
    if (withAll) {
      // "All" turns every option on; with everything on, clicking one option picks just that one
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'All';
      b.dataset.all = key;
      b.dataset.vals = JSON.stringify(all);
      b.addEventListener('click', () => { S[key] = all.slice(); changed(); });
      el.appendChild(b);
    }
    entries.forEach(({ val, label, aria }) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      if (aria) b.setAttribute('aria-label', aria);
      b.dataset.key = key;
      b.dataset.val = JSON.stringify(val);
      b.addEventListener('click', () => {
        if (multi) {
          const has = S[key].includes(val);
          if (withAll && all.every((v) => S[key].includes(v))) S[key] = [val];
          else if (has && S[key].length === 1) return; // keep at least one selected
          else S[key] = has ? S[key].filter((v) => v !== val) : S[key].concat([val]);
        } else S[key] = val;
        changed();
      });
      el.appendChild(b);
    });
  }

  function syncSettings() {
    document.querySelectorAll('#settings [data-key]').forEach((b) => {
      const v = JSON.parse(b.dataset.val);
      const cur = S[b.dataset.key];
      b.setAttribute('aria-pressed', Array.isArray(cur) ? cur.includes(v) : cur === v);
    });
    document.querySelectorAll('#settings [data-all]').forEach((b) => {
      const cur = S[b.dataset.all];
      b.setAttribute('aria-pressed', JSON.parse(b.dataset.vals).every((v) => cur.includes(v)));
    });
    const hiddenOn = MORE_METERS.filter((m) => S.meters.includes(m)).length;
    const more = $('btnMoreMeters');
    if (more) {
      more.querySelector('.badge').textContent = hiddenOn && $('metersMore').hidden ? `·${hiddenOn}` : '';
      more.setAttribute('aria-label', `More time signatures${hiddenOn ? `, ${hiddenOn} selected` : ''}`);
    }
    $('metro').setAttribute('aria-checked', String(!!S.metro));
    $('tapSoundSw').setAttribute('aria-checked', String(!!S.tapSound));
    const A = acc();
    $('accuracyHelp').textContent = `Full credit ±${Math.round(A.perfect * 1000)} ms · 75% ±${Math.round(A.good * 1000)} ms`;
    $('lowLatencySw').setAttribute('aria-checked', String(!!S.lowLatency));
    $('silentSw').setAttribute('aria-checked', String(!!S.silentMode));
    $('hideSource').setAttribute('aria-checked', String(!!S.hideSource));
    $('latency').value = latencyMs();
    $('latencyFor').textContent = `for ${OUTPUT_NAME[S.output]}`;
    $('calibWarn').textContent = calibStale()
      ? `Measured with tap click ${S.tapSound ? 'off' : 'on'}: calibrate again.` : '';
    const n = pool().length;
    const levels = S.levels.slice().sort().join(', ');
    const genres = Object.keys(GENRES).filter((g) => S.genres.includes(g)).map((g) => GENRE_SHORT[g]).join(', ');
    const meters = METER_ORDER.filter((m) => S.meters.includes(m)).join(', ');
    $('pool').innerHTML = `${n.toLocaleString()} of ${DATA.rhythms.length.toLocaleString()} rhythms match<span class="browse">Browse every rhythm in the corpus</span>`;
    const note = $('poolNote');
    note.textContent = `${n.toLocaleString()} matching`;
    note.title = `Level ${levels} · ${meters} · ${genres}`;
    note.setAttribute('aria-label', `${n} matching rhythms. Filters: level ${levels}; ${meters}; ${genres}. Browse them.`);
  }

  function buildSettings() {
    toggleGroup($('levels'), Object.keys(LEVELS).map((k) => ({ val: Number(k), label: k, aria: `Level ${k}, ${LEVELS[k][0]}` })), 'levels', true, true, true);
    $('levelHelp').innerHTML = Object.entries(LEVELS).map(([k, v]) => `<dt>${k} ${esc(v[0])}</dt><dd>${esc(v[1])}</dd>`).join('');
    toggleGroup($('lengths'), [{ val: 2, label: '2 bars' }, { val: 4, label: '4 bars' }], 'bars', true);
    toggleGroup($('accuracy'), Object.entries(ACCURACY).map(([k, v]) => ({ val: k, label: v.label })), 'accuracy', false, false);
    $('accuracy').addEventListener('click', () => {
      // re-score the last attempt so the modes can be compared on the same playing
      if (lastResult && lastResult.run && lastResult.mode !== S.accuracy) { score(lastResult.run, false); render(); renderOutcome(); }
    });
    toggleGroup($('meters'), PRIMARY_METERS.map((m) => ({ val: m, label: m })), 'meters', true);
    toggleGroup($('metersMore'), MORE_METERS.map((m) => ({ val: m, label: m })), 'meters', true);
    if (MORE_METERS.length) {
      const more = document.createElement('button');
      more.type = 'button'; more.className = 'more'; more.id = 'btnMoreMeters';
      more.setAttribute('aria-expanded', 'false'); more.setAttribute('aria-controls', 'metersMore');
      more.innerHTML = `More <span class="badge"></span>${icon('chevron')}`;
      more.addEventListener('click', () => {
        const open = $('metersMore').hidden;
        $('metersMore').hidden = !open;
        more.setAttribute('aria-expanded', String(open));
        syncSettings();
      });
      $('meters').appendChild(more);
      if (MORE_METERS.some((m) => S.meters.includes(m))) { /* stays collapsed; the badge says how many are on */ }
    }
    toggleGroup($('genres'), Object.keys(GENRES).map((g) => ({ val: g, label: GENRE_SHORT[g], aria: GENRES[g] })), 'genres', true, true, true);
    $('metro').addEventListener('click', () => { S.metro = !S.metro; save(); syncSettings(); });
    $('tapSoundSw').addEventListener('click', () => {
      S.tapSound = !S.tapSound; S.tapSoundBy[S.output] = S.tapSound;
      save(); syncSettings(); if (lastResult) renderOutcome();
    });
    $('lowLatencySw').addEventListener('click', () => {
      S.lowLatency = !S.lowLatency; save(); syncSettings();
      if (S.lowLatency) startKeepAlive(); else stopKeepAlive();
      updateSoundStatus();
    });
    $('silentSw').addEventListener('click', () => {
      S.silentMode = !S.silentMode; save(); syncSettings();
      if (S.silentMode) startSilentLoop(); else if (silentLoop) { silentLoop.pause(); silentLoopPlaying = false; }
      updateSoundStatus();
    });
    if (!IS_IOS) { $('silentRow').hidden = true; $('silentHelp').hidden = true; }
    $('hideSource').addEventListener('click', () => { S.hideSource = !S.hideSource; save(); syncSettings(); renderOutcome(); renderMeta(); setButtons(); });
    $('latency').addEventListener('change', (e) => { S.offsets[S.output] = Math.max(-300, Math.min(500, Number(e.target.value) || 0)); save(); syncSettings(); });
    toggleGroup($('outputs'), [{ val: 'speaker', label: 'Speaker / wired' }, { val: 'bluetooth', label: 'Bluetooth' }], 'output', false, false);
    // runs after the button's own handler has set S.output: bring that output's tap-click setting with it
    $('outputs').addEventListener('click', () => setOutput(S.output));
    $('btnCalib').addEventListener('click', calibrate);
    $('btnTestSound').addEventListener('click', async () => {
      const ok = await ensureRunning();
      updateSoundStatus();
      if (!ok) { $('soundStatus').textContent += ' · could not start audio'; return; }
      const c = audio();
      click(c.currentTime + 0.05, true);
      try { await piano.prepare([{ midi: 72, vel: 0.625 }]); piano.play(audio().currentTime + 0.35, 0.8, 72, 0.625); } catch (e) { /* ignore */ }
    });
    updateSoundStatus();
    $('calibPad').addEventListener('pointerdown', (e) => { e.preventDefault(); onTap(e); });
    syncSettings();
  }

  // presentation: persistent sidebar (wide) or a modal overlay (slide-over / bottom sheet / full screen)
  let settingsOpen = false;
  let lastFocus = null;
  const isOverlay = () => root.dataset.layout !== 'wide';
  function setBackgroundInert(on) {
    document.querySelectorAll('.topbar, .practice, .credits').forEach((el) => { el.inert = on; });
  }
  function openSettings() {
    if (!isOverlay() || settingsOpen) return;
    lastFocus = document.activeElement;
    settingsOpen = true;
    const panel = $('settings');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.classList.add('open');
    $('scrim').hidden = false;
    $('btnSettings').setAttribute('aria-expanded', 'true');
    setBackgroundInert(true);
    requestAnimationFrame(() => $('btnCloseSettings').focus());
  }
  function closeSettings(restoreFocus = true) {
    if (!settingsOpen) return;
    settingsOpen = false;
    const panel = $('settings');
    panel.classList.remove('open');
    panel.removeAttribute('role');
    panel.removeAttribute('aria-modal');
    $('scrim').hidden = true;
    $('btnSettings').setAttribute('aria-expanded', 'false');
    setBackgroundInert(false);
    if (restoreFocus && lastFocus && lastFocus.isConnected && !lastFocus.closest('#settings')) lastFocus.focus();
    else if (restoreFocus) $('btnSettings').focus();
  }
  function trapFocus(e, box = $('settings')) {
    const items = [...box.querySelectorAll('button:not([disabled]), input:not([disabled]), select, summary')]
      .filter((el) => {
        if (!el.getClientRects().length || el.closest('[hidden]')) return false;
        // content of a closed <details> can still have boxes (content-visibility), but can't take focus
        const scope = el.tagName === 'SUMMARY' ? el.parentElement.parentElement : el;
        return !(scope && scope.closest('details:not([open])'));
      });
    if (!items.length) return;
    const first = items[0]; const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function applyLayout() {
    const l = window.computeLayout();
    if (root.dataset.layout === l) return;
    const focusInPanel = document.activeElement && document.activeElement.closest && document.activeElement.closest('#settings');
    root.dataset.layout = l;
    if (l === 'wide') closeSettings(false);
    else if (!settingsOpen && focusInPanel) $('btnSettings').focus(); // the sidebar just became a closed overlay
    syncSettings();
    if (!current) render();
  }

  // ---------- corpus browser: every rhythm, searchable; tap one to practice it ----------
  const CORPUS_ROW = 112; // a row whose thumbnail is one staff line; each extra line adds THUMB_LINE
  let corpusTops = [0]; // top of each row, plus the total height at the end
  let corpusOpen = false;
  let corpusList = [];
  let corpusOpener = null;
  let thumbW = 0;
  const rowEls = new Map();
  const thumbCache = new Map();

  function haystack(item) {
    if (!item._hay) {
      item._hay = item.o.map((o) => {
        const src = DATA.sources[o[0]];
        return [src[0], src[1], src[3], src[4], src[5], DATA.collections[src[2]].label, DATA.collections[src[2]].credit || '', o[1]].join(' ');
      }).join(' ').toLowerCase();
    }
    return item._hay;
  }

  // Notation thumbnails, drawn with the same code as the score, at 72%. A crowded excerpt wraps onto more
  // staff lines (breaking only at barlines, like the score) instead of squeezing its notes together.
  const THUMB_S = 0.72;
  const THUMB_LINE = Math.round(72 * THUMB_S); // one staff line of a thumbnail, in px
  function thumbMins(item) {
    if (!item._mw) {
      const ms = measures(item);
      item._mw = ms.map((m, i) => measureMinWidth(m) + (i === 0 ? 66 : 0) + (i === ms.length - 1 ? 16 : 0));
    }
    return item._mw;
  }
  function thumbRows(item, W) {
    if (item._tr && item._tr.W === W) return item._tr.rows;
    const min = thumbMins(item);
    const avail = (W / THUMB_S - 8) / 0.9; // up to 10% tighter than the comfortable width
    const b = min.length;
    let rows = null;
    for (const per of [b, 2, 1]) {
      if (per > b || b % per) continue;
      const cand = [];
      for (let i = 0; i < b; i += per) cand.push(Array.from({ length: per }, (_, k) => i + k));
      // a row that starts mid-excerpt also needs room before its first note
      const fits = cand.every((idxs, r) => idxs.reduce((a, k) => a + min[k], 0) + (r ? 20 : 0) <= avail);
      rows = cand;
      if (fits) break;
    }
    item._tr = { W, rows };
    return rows;
  }
  const thumbHeight = (item, W) => thumbRows(item, W).length * THUMB_LINE;

  function thumbSVG(item, W) {
    const hit = thumbCache.get(item);
    if (hit && hit.W === W) return hit.svg;
    let svg = '';
    try {
      const host = document.createElement('div');
      const mi = meterInfo(item.m);
      const flat = flatten(item);
      const min = thumbMins(item);
      const rows = thumbRows(item, W);
      const s = THUMB_S; const Wl = W / s;
      const renderer = new VF.Renderer(host, VF.Renderer.Backends.SVG);
      renderer.resize(W, Math.ceil(72 * s * rows.length));
      const ctx = renderer.getContext();
      ctx.scale(s, s); ctx.setFillStyle(INK); ctx.setStrokeStyle(INK);
      const rowOf = [];
      rows.forEach((idxs, r) => {
        const sum = idxs.reduce((a, k) => a + min[k], 0) + (r ? 20 : 0);
        const squeeze = Math.min(1, (Wl - 8) / sum);
        const spare = Math.max(0, Wl - 8 - sum * squeeze);
        let x = 4;
        idxs.forEach((mIdx, k) => {
          rowOf[mIdx] = r;
          const base = min[mIdx] + (r && k === 0 ? 20 : 0);
          const w = base * squeeze + spare * (base / sum);
          drawBar(ctx, item, mi, flat, mIdx, k, x, 10 + r * 72, w, null);
          x += w;
        });
      });
      flat.events.forEach((ev, i) => {
        if (!(ev.flags & FLAG.TIE) || i + 1 >= flat.events.length) return;
        const nx = flat.events[i + 1];
        const mk = (a, b) => new VF.StaveTie({ first_note: a, last_note: b, first_indices: [0], last_indices: [0] }).setContext(ctx).draw();
        if (rowOf[ev.mi] === rowOf[nx.mi]) mk(ev.vf, nx.vf); else { mk(ev.vf, null); mk(null, nx.vf); }
      });
      host.querySelector('svg').setAttribute('aria-hidden', 'true');
      svg = host.innerHTML;
    } catch (e) { svg = ''; }
    thumbCache.set(item, { W, svg });
    if (thumbCache.size > 600) thumbCache.delete(thumbCache.keys().next().value);
    return svg;
  }

  function corpusRowHTML(item) {
    const src = DATA.sources[item.o[0][0]];
    const where = [src[3], src[4]].filter(Boolean).join(' · ');
    return `<div class="c-thumb" style="height:${thumbHeight(item, thumbW)}px">${thumbSVG(item, thumbW)}</div>
      <div class="c-meta">
        <span class="c-chips"><span class="chip">${item.m}</span><span class="chip">Level ${item.l}</span><span class="chip">${item.b} bar${item.b > 1 ? 's' : ''}</span>${item.n > 1 ? `<span class="c-n">in ${item.n} pieces</span>` : ''}</span>
        <span class="c-src"><b>${esc(src[0])}</b>${src[1] ? ' · ' + esc(src[1]) : ''}${where ? ' · ' + esc(where) : ''}</span>
      </div>`;
  }

  function favRowHTML({ item, occ }) {
    const src = DATA.sources[occ[0]];
    const where = [src[3], src[4]].filter(Boolean).join(' · ');
    const bars = occ[2] != null ? `mm. ${occ[2]}–${occ[2] + item.b - 1}` : '';
    const part = occ[1] && !/^(musicxml part|part\s*\d*|p\d+|instrument\s*\d*)$/i.test(occ[1].trim()) ? occ[1] : '';
    return `<div class="c-thumb" style="height:${thumbHeight(item, thumbW)}px">${thumbSVG(item, thumbW)}</div>
      <div class="c-meta">
        <span class="c-chips"><span class="chip">${item.m}</span><span class="chip">Level ${item.l}</span><span class="chip">${item.b} bar${item.b > 1 ? 's' : ''}</span><span class="c-n c-fav">${icon('star-fill')}Favorite</span></span>
        <span class="c-src"><b>${esc(src[0])}</b>${src[1] ? ' · ' + esc(src[1]) : ''}${part ? ' · ' + esc(part) : ''}${bars ? ' · ' + bars : ''}${where ? ' · ' + esc(where) : ''}</span>
      </div>`;
  }

  function familyRowHTML({ item, occ }) {
    const src = DATA.sources[occ[0]];
    const where = [src[3], src[4]].filter(Boolean).join(' · ');
    const bars = occ[2] != null ? `mm. ${occ[2]}–${occ[2] + item.b - 1}` : '';
    const same = item === corpusFamily;
    return `<div class="c-thumb" style="height:${thumbHeight(item, thumbW)}px">${thumbSVG(item, thumbW)}</div>
      <div class="c-meta">
        <span class="c-chips"><span class="chip">${item.m}</span><span class="chip">Level ${item.l}</span><span class="chip">${item.b} bar${item.b > 1 ? 's' : ''}</span><span class="c-n">${same ? 'as shown' : 'written another way'}</span></span>
        <span class="c-src"><b>${esc(src[0])}</b>${src[1] ? ' · ' + esc(src[1]) : ''}${where ? ' · ' + esc(where) : ''}${bars ? ' · ' + bars : ''}</span>
      </div>`;
  }

  function measureCorpus() {
    const sc = $('corpusScroll');
    const wide = sc.clientWidth >= 640;
    $('corpus').classList.toggle('wide-rows', wide);
    const w = Math.max(200, Math.floor(wide ? (sc.clientWidth - 32 - 16) * 0.56 : sc.clientWidth - 32));
    if (w !== thumbW) { thumbW = w; rowEls.forEach((el) => el.remove()); rowEls.clear(); if (corpusList.length) layoutCorpus(); }
  }

  function refreshFamily() {
    const item = corpusFamily;
    const q = $('corpusSearch').value.trim().toLowerCase();
    let rows = familyRows(item);
    const total = rows.length;
    if (q) {
      const terms = q.split(/\s+/);
      rows = rows.filter((r) => {
        const src = DATA.sources[r.occ[0]];
        const hay = [src[0], src[1], src[3], src[4], src[5], DATA.collections[src[2]].label, r.occ[1], r.item.m].join(' ').toLowerCase();
        return terms.every((t) => hay.includes(t));
      });
    }
    corpusList = rows;
    const songs = new Set(rows.map((r) => r.occ[0])).size;
    const spellings = familyOf(item).length;
    $('corpusFamilyBar').hidden = false;
    $('corpusFamilyText').textContent = `Every piece with this rhythm: ${total.toLocaleString()}`
      + (spellings > 1 ? `, written ${spellings} ways with the same proportions` : '');
    $('corpusCount').textContent = `${songs.toLocaleString()} piece${songs === 1 ? '' : 's'}`
      + (q ? ` for “${$('corpusSearch').value.trim()}”` : '');
    layoutCorpus();
    $('corpusSpacer').querySelectorAll('.c-empty').forEach((e) => e.remove());
    if (!rows.length) $('corpusSpacer').insertAdjacentHTML('beforeend', '<p class="c-empty">No passages match that search.</p>');
    rowEls.forEach((el) => el.remove()); rowEls.clear();
    $('corpusScroll').scrollTop = 0;
    renderCorpusRows();
  }

  const rowItem = (entry) => (entry && entry.item ? entry.item : entry);
  function layoutCorpus() {
    corpusTops = [0];
    for (const entry of corpusList) {
      const lines = thumbRows(rowItem(entry), thumbW).length;
      corpusTops.push(corpusTops[corpusTops.length - 1] + CORPUS_ROW + (lines - 1) * THUMB_LINE);
    }
    $('corpusSpacer').style.height = corpusTops[corpusTops.length - 1] + 'px';
  }
  // index of the row at height y
  function rowAt(y) {
    let lo = 0, hi = corpusList.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (corpusTops[mid] <= y) lo = mid; else hi = mid - 1; }
    return Math.max(0, lo);
  }

  function renderCorpusRows() {
    if (!corpusOpen) return;
    const sc = $('corpusScroll');
    const first = Math.max(0, rowAt(sc.scrollTop) - 3);
    const last = Math.min(corpusList.length - 1, rowAt(sc.scrollTop + sc.clientHeight) + 3);
    for (const [i, el] of rowEls) if (i < first || i > last) { el.remove(); rowEls.delete(i); }
    for (let i = first; i <= last; i++) {
      if (rowEls.has(i)) continue;
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'c-row'; el.dataset.i = i;
      el.style.top = corpusTops[i] + 'px';
      el.style.height = (corpusTops[i + 1] - corpusTops[i]) + 'px';
      el.innerHTML = corpusFamily ? familyRowHTML(corpusList[i]) : corpusFavs ? favRowHTML(corpusList[i]) : corpusRowHTML(corpusList[i]);
      el.setAttribute('aria-label', `Practice: ${el.textContent.replace(/\s+/g, ' ').trim()}`);
      $('corpusSpacer').appendChild(el);
      rowEls.set(i, el);
    }
  }

  function refreshFavorites() {
    const q = $('corpusSearch').value.trim().toLowerCase();
    let rows = favoriteRows();
    if (q) {
      const terms = q.split(/\s+/);
      rows = rows.filter((r) => {
        const src = DATA.sources[r.occ[0]];
        const hay = [src[0], src[1], src[3], src[4], src[5], DATA.collections[src[2]].label, r.occ[1], r.item.m].join(' ').toLowerCase();
        return terms.every((t) => hay.includes(t));
      });
    }
    corpusList = rows;
    $('corpusCount').textContent = `${rows.length.toLocaleString()} favorite${rows.length === 1 ? '' : 's'}`
      + (q ? ` for “${$('corpusSearch').value.trim()}”` : '') + ' · tap one to play or practice it';
    layoutCorpus();
    $('corpusSpacer').querySelectorAll('.c-empty').forEach((e) => e.remove());
    if (!rows.length) {
      $('corpusSpacer').insertAdjacentHTML('beforeend', favorites.length && q
        ? '<p class="c-empty">No favorites match that search.</p>'
        : '<p class="c-empty">No favorites yet. Tap the star on a rhythm\'s source card to save it here, then come back to play or practice it.</p>');
    }
    rowEls.forEach((el) => el.remove()); rowEls.clear();
    $('corpusScroll').scrollTop = 0;
    renderCorpusRows();
  }

  function refreshCorpus() {
    $('corpus').classList.toggle('family-mode', !!corpusFamily);
    $('corpus').classList.toggle('fav-mode', corpusFavs && !corpusFamily);
    $('corpusFav').setAttribute('aria-pressed', String(corpusFavs && !corpusFamily));
    $('corpusTitle').textContent = corpusFavs && !corpusFamily ? 'Your favorites' : 'The corpus';
    $('corpusFav').innerHTML = `${icon(corpusFavs && !corpusFamily ? 'star-fill' : 'star')}Favorites${favorites.length ? ` (${favorites.length})` : ''}`;
    if (corpusFamily) return refreshFamily();
    if (corpusFavs) { $('corpusFamilyBar').hidden = true; return refreshFavorites(); }
    $('corpusFamilyBar').hidden = true;
    const q = $('corpusSearch').value.trim().toLowerCase();
    const only = $('corpusOnly').getAttribute('aria-checked') === 'true';
    let list = only ? pool() : DATA.rhythms.slice();
    if (q) { const terms = q.split(/\s+/); list = list.filter((it) => terms.every((t) => haystack(it).includes(t))); }
    const title = (it) => DATA.sources[it.o[0][0]][0];
    const cmp = {
      common: (x, y) => y.n - x.n || x.l - y.l,
      easy: (x, y) => x.l - y.l || (x.d || 0) - (y.d || 0) || y.n - x.n,
      hard: (x, y) => (y.d || 0) - (x.d || 0) || y.l - x.l || y.n - x.n,
      title: (x, y) => title(x).localeCompare(title(y)),
    }[$('corpusSort').value];
    list.sort(cmp);
    corpusList = list;
    const all = DATA.rhythms.length.toLocaleString();
    $('corpusCount').textContent = (!only && !q)
      ? `${all} rhythms in the corpus, each a real passage`
      : `${list.length.toLocaleString()} ${only ? 'matching ' : ''}rhythm${list.length === 1 ? '' : 's'}`
        + (q ? ` for “${$('corpusSearch').value.trim()}”` : '') + ` · ${all} in the whole corpus`;
    layoutCorpus();
    $('corpusSpacer').querySelectorAll('.c-empty').forEach((e) => e.remove());
    if (!list.length) $('corpusSpacer').insertAdjacentHTML('beforeend', '<p class="c-empty">No rhythms match. Try a different search, or switch off “Only rhythms matching my settings”.</p>');
    rowEls.forEach((el) => el.remove()); rowEls.clear();
    $('corpusScroll').scrollTop = 0;
    renderCorpusRows();
  }

  // ---------- every occurrence of a rhythm, and the same rhythm written other ways ----------
  // rhythms.js keeps a few sources per rhythm; data/occurrences.js (loaded on request) has the rest.
  let families = null;
  function familyOf(item) {
    if (item.g == null) return [item];
    if (!families) {
      families = new Map();
      DATA.rhythms.forEach((r) => { if (r.g != null) { if (!families.has(r.g)) families.set(r.g, []); families.get(r.g).push(r); } });
    }
    return families.get(item.g);
  }
  // other ways this rhythm is written, and how often they occur
  function otherSpellings(item) {
    const others = familyOf(item).filter((r) => r !== item);
    // pieces that use it only in another spelling (a piece is counted once, whichever way it writes it)
    return { others, n: item.gn != null ? Math.max(0, item.gn - item.n) : 0 };
  }
  let occPromise = null;
  function loadOccurrences() {
    if (window.RHYTHM_OCC) return Promise.resolve(window.RHYTHM_OCC);
    if (!occPromise) {
      occPromise = new Promise((res, rej) => {
        const sc = document.createElement('script');
        sc.src = DATA.occurrences || 'data/occurrences.js';
        sc.onload = () => (window.RHYTHM_OCC ? res(window.RHYTHM_OCC) : rej(new Error('no data')));
        sc.onerror = () => { occPromise = null; sc.remove(); rej(new Error('load failed')); };
        document.head.appendChild(sc);
      });
    }
    return occPromise;
  }
  const rhythmIndex = new Map(DATA.rhythms.map((r, i) => [r, i]));
  // all occurrences of one rhythm, in rhythms.js's format [source, part, bar, pitches, tempo?]
  function allOccurrences(item) {
    const O = window.RHYTHM_OCC;
    const extra = O ? (O.o[rhythmIndex.get(item)] || []).map((o) => [o[0], O.parts[o[1]], o[2], o[3]].concat(o.slice(4))) : [];
    return item.o.concat(extra);
  }

  // the corpus browser showing one rhythm family: a row for every passage, the asked-for spelling first
  let corpusFamily = null;
  let corpusFavs = false; // the corpus browser showing the favorites
  async function openFavorites() {
    const opener = document.activeElement;
    try { await loadOccurrences(); } catch (e) { /* show the favorites we can find */ }
    corpusFamily = null; corpusFavs = true;
    $('corpusSearch').value = '';
    if (corpusOpen) refreshCorpus(); else { openCorpus(false); corpusOpener = opener; }
  }
  async function openFamily(item) {
    const opener = document.activeElement;
    try { await loadOccurrences(); } catch (e) { /* show the sources we have */ }
    corpusFamily = item; corpusFavs = false;
    openCorpus(false);
    corpusOpener = opener;
  }
  function familyRows(item) {
    const fam = familyOf(item).slice().sort((a, b) => (a === item ? -1 : b === item ? 1 : b.n - a.n));
    const rows = [];
    const pieces = new Set(); // one row per piece, in the first spelling it uses
    fam.forEach((it) => allOccurrences(it).forEach((occ) => {
      if (pieces.has(occ[0])) return;
      pieces.add(occ[0]);
      rows.push({ item: it, occ });
    }));
    return rows;
  }

  function openCorpus(onlyMatching) {
    if (corpusOpen) return;
    corpusOpener = document.activeElement;
    if (settingsOpen) closeSettings(false);
    if (run) stopRun();
    corpusOpen = true;
    $('corpusOnly').setAttribute('aria-checked', String(!!onlyMatching));
    $('corpus').hidden = false;
    document.querySelector('.app').inert = true;
    measureCorpus();
    refreshCorpus();
    requestAnimationFrame(() => $('corpusSearch').focus({ preventScroll: true }));
  }
  function closeCorpus() {
    if (!corpusOpen) return;
    corpusOpen = false;
    corpusFamily = null;
    corpusFavs = false;
    $('corpus').hidden = true;
    document.querySelector('.app').inert = false;
    rowEls.forEach((el) => el.remove()); rowEls.clear();
    const back = corpusOpener && corpusOpener.isConnected && corpusOpener.getClientRects().length ? corpusOpener : $('btnPlay');
    back.focus({ preventScroll: true });
  }
  function practiceItem(item, chosen) {
    const occs = item.o.filter((o) => S.genres.includes(genreOf(o)));
    const occ = chosen || (occs.length ? occs : item.o)[0];
    if (run) stopRun(true);
    seen.splice(seenPos + 1);
    seen.push({ item, occ }); if (seen.length > 200) seen.shift();
    seenPos = seen.length - 1;
    show(item, occ);
  }

  function setupCorpus() {
    let t = null;
    $('corpusSearch').addEventListener('input', () => { clearTimeout(t); t = setTimeout(refreshCorpus, 150); });
    $('corpusSort').addEventListener('change', refreshCorpus);
    $('corpusOnly').addEventListener('click', () => {
      $('corpusOnly').setAttribute('aria-checked', String($('corpusOnly').getAttribute('aria-checked') !== 'true'));
      refreshCorpus();
    });
    $('corpusClose').addEventListener('click', closeCorpus);
    $('corpusWhole').addEventListener('click', () => { corpusFamily = null; $('corpusSearch').value = ''; refreshCorpus(); $('corpusSearch').focus(); });
    $('corpusFav').addEventListener('click', async () => {
      if (corpusFavs && !corpusFamily) { corpusFavs = false; refreshCorpus(); return; }
      try { await loadOccurrences(); } catch (e) { /* show the favorites we can find */ }
      corpusFamily = null; corpusFavs = true; refreshCorpus();
    });
    $('corpus').addEventListener('click', (e) => { if (e.target === $('corpus')) closeCorpus(); }); // backdrop
    let raf = 0;
    $('corpusScroll').addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(renderCorpusRows); }, { passive: true });
    $('corpusSpacer').addEventListener('click', (e) => {
      const row = e.target.closest('.c-row');
      if (!row) return;
      const entry = corpusList[Number(row.dataset.i)];
      closeCorpus();
      if (entry.item) practiceItem(entry.item, entry.occ); else practiceItem(entry);
      setButtons();
    });
    window.addEventListener('resize', () => { if (corpusOpen) { measureCorpus(); renderCorpusRows(); } });
    $('pool').addEventListener('click', () => openCorpus(false));
  }

  // ---------- wiring (runs once) ----------
  function setupUI() {
    buildSettings();
    setupTempo();
    $('btnPlay').addEventListener('click', () => (run ? stopRun() : startRun('play')));
    $('btnListen').addEventListener('click', () => startRun('listen'));
    $('btnNext').addEventListener('click', () => { if (run) stopRun(true); stepHistory(1); setButtons(); });
    $('btnSettings').addEventListener('click', openSettings);
    $('btnCloseSettings').addEventListener('click', () => closeSettings());
    $('scrim').addEventListener('click', () => closeSettings());
    $('poolNote').addEventListener('click', () => openCorpus(true));
    // single input path for taps: pointerdown (touch, pen, mouse) plus the keyboard handler below
    $('pad').addEventListener('pointerdown', (e) => { if (e.button > 0) return; e.preventDefault(); onTap(e); });
    $('pad').addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('[data-action]');
      if (!a) return;
      if (a.dataset.action === 'melody') startRun('melody');
      if (a.dataset.action === 'favorite') toggleFavorite();
      if (a.dataset.action === 'favorites') openFavorites();
      if (a.dataset.action === 'settings') openSettings();
      if (a.dataset.action === 'corpus') openCorpus(false);
      if (a.dataset.action === 'family' && current) openFamily(current.item);
    });
    document.addEventListener('keydown', (e) => {
      const tapKey = e.code === 'Space' || e.code === 'KeyF' || e.code === 'KeyJ';
      const tgt = e.target instanceof Element ? e.target : document.body;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (phase === 'calibrating' && tapKey && !tgt.matches('input')) {
        e.preventDefault(); if (!e.repeat) onTap(e); return;
      }
      if (corpusOpen) {
        if (e.key === 'Escape') { e.preventDefault(); closeCorpus(); } else if (e.key === 'Tab') trapFocus(e, $('corpus'));
        return; // no practice shortcuts while browsing
      }
      if (settingsOpen) {
        if (e.key === 'Escape') { e.preventDefault(); closeSettings(); } else if (e.key === 'Tab') trapFocus(e);
        return; // no practice shortcuts while the settings dialog is open
      }
      if (tgt.matches('input, select, textarea') || tgt.closest('#settings') || tgt.closest('.tempo-wheel')) return;
      if (e.repeat) { if (tapKey) e.preventDefault(); return; }
      if (tapKey) {
        if (tgt.closest('button, summary') && phase === 'idle') return; // let Space press the focused control
        e.preventDefault(); onTap(e);
      } else if (e.key === 'Enter') {
        if (tgt.closest('button, summary')) return;
        e.preventDefault(); run ? stopRun() : startRun('play');
      } else if (e.key === 'Escape') { if (run) stopRun(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || (e.code === 'KeyN' && phase === 'idle')) {
        if (phase === 'calibrating') return;
        e.preventDefault();
        if (run) stopRun(true);
        stepHistory(e.key === 'ArrowLeft' ? -1 : 1);
        setButtons();
      } else if (phase === 'idle' && e.code === 'KeyL') startRun('listen');
    });
    window.addEventListener('resize', applyLayout);
    window.addEventListener('orientationchange', applyLayout);
    // re-render the score whenever its width changes (rotation, sidebar, split view, zoom)
    if (window.ResizeObserver) {
      new ResizeObserver(() => {
        const w = Math.floor($('score').parentElement.clientWidth);
        if (Math.abs(w - lastRenderW) >= 2) scheduleRender();
      }).observe($('score').parentElement);
    } else {
      window.addEventListener('resize', scheduleRender);
    }
  }

  // read-only handle for automated tests
  window.actualRhythms = {
    get current() { return current; }, get run() { return run; }, get result() { return lastResult; },
    get phase() { return phase; }, get layout() { return layout; }, audio, piano, pianoPitches,
    show: (i, o = 0) => show(DATA.rhythms[i], DATA.rhythms[i].o[o]),
  };

  setupUI();
  setupCorpus();
  updateSession();
  pickNext();
  setButtons();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (phase === 'idle') render(); });
})();
