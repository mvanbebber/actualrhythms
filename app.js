/* Actual Rhythms: rhythm sight-reading with excerpts from real music. */
(function () {
  'use strict';
  const DATA = window.RHYTHM_DATA;
  const VF = window.Vex && window.Vex.Flow;
  const TPQ = DATA.tpq;
  const FLAG = { REST: 1, TIE: 2, TRIP: 4, TSTART: 8, TSTOP: 16 };
  const $ = (id) => document.getElementById(id);

  const LEVELS = {
    1: ['Beats', 'Whole, half and quarter values; every attack on a beat.'],
    2: ['Subdivided', 'Eighths in simple time; the basic eighth-note flow of 6/8.'],
    3: ['Syncopated', 'Dotted quarters, ties, off-beat entries after rests, syncopation.'],
    4: ['Sixteenths', 'Sixteenth-note grid, dotted eighth + sixteenth.'],
    5: ['Advanced', 'Triplets, 32nds, sixteenth syncopation.'],
  };
  const GENRES = { folk: 'Folk tunes', chorale: 'Bach chorales', classical: 'Classical', ragtime: 'Ragtime' };
  const GRADE = { perfect: 0.035, good: 0.075 };

  // ---------- settings ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('rr.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('rr.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };
  const S = Object.assign({
    tempo: 80, levels: [1, 2], bars: 2, meters: ['2/4', '3/4', '4/4', '6/8'],
    genres: ['folk', 'chorale', 'classical', 'ragtime'], metro: true, hideSource: true, latency: 0,
  }, store.get('settings', {}));
  const save = () => store.set('settings', S);

  const meterCounts = {};
  DATA.rhythms.forEach((r) => { meterCounts[r.m] = (meterCounts[r.m] || 0) + 1; });
  const METER_ORDER = ['2/4', '3/4', '4/4', '2/2', '3/8', '6/8', '9/8', '12/8', '3/2', '6/4'].filter((m) => meterCounts[m]);

  function genreOf(occ) { return DATA.collections[DATA.sources[occ[0]][2]].genre; }

  function pool() {
    return DATA.rhythms.filter((r) => r.b === S.bars && S.levels.includes(r.l) && S.meters.includes(r.m)
      && r.o.some((o) => S.genres.includes(genreOf(o))));
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
  function pitchesOf(occ) { return occ[3].map((s) => (s.match(/../g) || []).map((h) => parseInt(h, 16))).flat(); }

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
    if (!p.length) { current = null; render(); updatePool(0); return; }
    let cand;
    for (let tries = 0; tries < 30; tries++) {
      cand = p[Math.floor(Math.random() * p.length)];
      if (!recent.includes(cand) || p.length <= recent.length) break;
    }
    recent.push(cand); if (recent.length > 40) recent.shift();
    const occs = cand.o.filter((o) => S.genres.includes(genreOf(o)));
    const occ = occs[Math.floor(Math.random() * occs.length)];
    current = { item: cand, occ, flat: flatten(cand), mi: meterInfo(cand.m) };
    lastResult = null;
    $('result').hidden = true;
    $('legend').hidden = true;
    render();
    updatePool(p.length);
  }

  // ---------- notation ----------
  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

  function render() {
    const host = $('score');
    host.innerHTML = '';
    layout = null;
    if (!current) {
      host.innerHTML = '<div class="empty">No rhythms match these settings. Turn on another difficulty, time signature or repertoire group.</div>';
      $('metaChips').innerHTML = '';
      $('excerptNote').textContent = '';
      return;
    }
    const { item, mi, flat } = current;
    $('metaChips').innerHTML =
      `<span class="chip-static">${item.m}</span><span class="chip-static lvl">Level ${item.l} · ${LEVELS[item.l][0]}</span><span class="chip-static">${item.b} bars</span>`;
    $('excerptNote').textContent = item.n > 1 ? `This rhythm occurs ${item.n} times in the corpus` : 'Unique to one piece in the corpus';

    const ink = cssVar('--ink');
    const W = Math.max(280, host.clientWidth || 600);
    const densest = Math.max(...measures(item).map((m) => m.length));
    const minBar = Math.max(150, densest * 30 + 40);
    let perRow = Math.max(1, Math.min(item.b, Math.floor((W - 50) / minBar)));
    if (item.b === 4 && perRow === 3) perRow = 2;
    const rows = Math.ceil(item.b / perRow);
    const rowH = 110;
    const renderer = new VF.Renderer(host, VF.Renderer.Backends.SVG);
    renderer.resize(W, rows * rowH + 10);
    const ctx = renderer.getContext();
    ctx.setFillStyle(ink); ctx.setStrokeStyle(ink);
    const svg = host.querySelector('svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${rows * rowH + 10}`);
    svg.style.width = '100%';

    const grades = lastResult ? lastResult.byEvent : null;
    const noteObjs = [];
    const rowsInfo = [];
    const tsWidth = 34;
    const usable = W - 8;
    let evIdx = 0;
    for (let r = 0; r < rows; r++) {
      const y = 10 + r * rowH;
      const first = r * perRow;
      const count = Math.min(perRow, item.b - first);
      const extra = r === 0 ? tsWidth : 0;
      const bw = (usable - extra) / count;
      const rowInfo = { y, top: y + 18, height: 66, segs: [] };
      let x = 4;
      for (let k = 0; k < count; k++) {
        const mIdx = first + k;
        const w = bw + (k === 0 ? extra : 0);
        const stave = new VF.Stave(x, y, w, { num_lines: 1, spacing_between_lines_px: 10, space_above_staff_ln: 4 });
        if (r === 0 && k === 0) {
          const ts = new VF.TimeSignature(item.m);
          ts.topLine -= 2; ts.bottomLine -= 2; // centre the digits on a one-line staff
          stave.addModifier(ts);
        }
        stave.setBegBarType(VF.Barline.type.NONE).setEndBarType(VF.Barline.type.NONE);
        stave.setContext(ctx).draw();
        // leave room after a barline so the first note (and any tie into it) doesn't crowd it
        if (k > 0 || r > 0) stave.setNoteStartX(stave.getNoteStartX() + 14);
        // one-line staves have zero-height barlines, so draw our own
        const ly = stave.getYForLine(0);
        const last = mIdx === item.b - 1;
        ctx.save(); ctx.setLineWidth(1.2);
        ctx.beginPath(); ctx.moveTo(x + w - (last ? 5 : 0.5), ly - 15); ctx.lineTo(x + w - (last ? 5 : 0.5), ly + 15); ctx.stroke();
        if (last) ctx.fillRect(x + w - 3.5, ly - 15, 3.5, 30);
        ctx.restore();

        const meas = measures(item)[mIdx];
        const notes = meas.map((e) => {
          const ev = flat.events[evIdx++];
          const base = e[1].replace(/d/g, '');
          const dots = (e[1].match(/d/g) || []).length;
          const n = new VF.StaveNote({
            keys: [ev.rest ? (base === 'w' ? 'a/5' : 'f/5') : 'f/5'], duration: base + (ev.rest ? 'r' : ''), dots, stem_direction: 1,
            clef: 'percussion', auto_stem: false, align_center: ev.rest && meas.length === 1,
          });
          for (let d = 0; d < dots; d++) VF.Dot.buildAndAttach([n], { all: true });
          const g = grades && grades[ev.idx];
          if (g) { const c = cssVar('--' + g.grade); n.setStyle({ fillStyle: c, strokeStyle: c }); }
          ev.vf = n;
          noteObjs.push(n);
          return n;
        });
        // triplets
        const tuplets = [];
        let tStart = -1;
        meas.forEach((e, i) => {
          if (e[2] & FLAG.TSTART) tStart = i;
          if (e[2] & FLAG.TSTOP && tStart >= 0) {
            tuplets.push(new VF.Tuplet(notes.slice(tStart, i + 1), { num_notes: 3, notes_occupied: 2, ratioed: false }));
            tStart = -1;
          }
        });
        const voice = new VF.Voice({ num_beats: mi.num, beat_value: mi.den }).setMode(VF.Voice.Mode.SOFT);
        voice.addTickables(notes);
        const groups = VF.Beam.getDefaultBeamGroups(item.m);
        const beams = VF.Beam.generateBeams(notes, { groups, stem_direction: 1, beam_rests: false });
        new VF.Formatter().joinVoices([voice]).formatToStave([voice], stave);
        voice.draw(ctx, stave);
        beams.forEach((b) => b.setContext(ctx).draw());
        tuplets.forEach((t) => t.setContext(ctx).draw());

        // x map for this measure: (tick, x) points
        const m0 = mIdx * mi.bar;
        const pts = [];
        meas.forEach((e, i) => {
          const n = notes[i];
          const cx = (n.getNoteHeadBeginX() + n.getNoteHeadEndX()) / 2;
          const ev = flat.events.find((q) => q.mi === mIdx && q.ei === i);
          pts.push([ev.pos, cx]);
        });
        pts.push([m0 + mi.bar, x + w - 6]);
        rowInfo.segs.push({ t0: m0, t1: m0 + mi.bar, pts });
        x += w;
      }
      rowsInfo.push(rowInfo);
    }
    // ties (may cross rows)
    const rowOf = (ev) => Math.floor(ev.mi / perRow);
    flat.events.forEach((ev, i) => {
      if (!(ev.flags & FLAG.TIE) || i + 1 >= flat.events.length) return;
      const nx = flat.events[i + 1];
      const same = rowOf(ev) === rowOf(nx);
      const mk = (a, b) => new VF.StaveTie({ first_note: a, last_note: b, first_indices: [0], last_indices: [0] }).setContext(ctx).draw();
      if (same) mk(ev.vf, nx.vf); else { mk(ev.vf, null); mk(null, nx.vf); }
    });
    layout = { rows: rowsInfo, perRow, W, svg };
    if (lastResult) drawTapMarks();
  }

  function tickToXY(tick) {
    if (!layout) return null;
    for (const row of layout.rows) {
      for (const s of row.segs) {
        if (tick >= s.t0 && tick <= s.t1) {
          const p = s.pts;
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

  function drawTapMarks() {
    const NS = 'http://www.w3.org/2000/svg';
    const { svg } = layout;
    const g = document.createElementNS(NS, 'g');
    const soft = cssVar('--ink-soft');
    const total = current.flat.total;
    lastResult.tapTicks.forEach((tk) => {
      const t = Math.max(0, Math.min(total, tk.tick));
      const p = tickToXY(t);
      if (!p) return;
      const l = document.createElementNS(NS, 'line');
      const y = p.row.y + 86;
      l.setAttribute('x1', p.x); l.setAttribute('x2', p.x);
      l.setAttribute('y1', y); l.setAttribute('y2', y + 12);
      l.setAttribute('stroke', tk.extra ? cssVar('--miss') : soft);
      l.setAttribute('stroke-width', '2'); l.setAttribute('stroke-linecap', 'round');
      g.appendChild(l);
    });
    // expected onset dots
    lastResult.onsets.forEach((o) => {
      const p = tickToXY(o.tick);
      if (!p) return;
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', p.x); c.setAttribute('cy', p.row.y + 80); c.setAttribute('r', 3);
      c.setAttribute('fill', cssVar('--' + o.grade));
      g.appendChild(c);
    });
    svg.appendChild(g);
  }

  // ---------- audio ----------
  let ac = null;
  function audio() {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  let scheduled = [];
  function click(t, accent, quiet) {
    const c = audio();
    const o = c.createOscillator(); const g = c.createGain();
    o.type = 'square'; o.frequency.value = accent ? 1760 : 1180;
    const vol = (quiet ? 0.08 : 0.22) * (accent ? 1.2 : 1);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.001); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.05);
    scheduled.push(o);
  }
  function wood(t, dur) {
    const c = audio();
    const o = c.createOscillator(); const g = c.createGain(); const f = c.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = 620; f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 2;
    const len = Math.min(0.25, Math.max(0.06, dur * 0.8));
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(f).connect(g).connect(c.destination); o.start(t); o.stop(t + len + 0.02);
    scheduled.push(o);
  }
  function tone(t, dur, midi) {
    const c = audio();
    const o = c.createOscillator(); const g = c.createGain();
    o.type = 'triangle'; o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    const end = t + Math.max(0.05, dur * 0.95);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.25, t + 0.01);
    g.gain.setValueAtTime(0.25, Math.max(t + 0.01, end - 0.04)); g.gain.linearRampToValueAtTime(0, end);
    o.connect(g).connect(c.destination); o.start(t); o.stop(end + 0.02);
    scheduled.push(o);
  }
  function stopAudio() { scheduled.forEach((o) => { try { o.stop(); } catch (e) { /* done */ } }); scheduled = []; }

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

  function secPerTick() { return 60 / S.tempo / current.mi.beat; }

  function startRun(mode) {
    if (!current) return;
    stopRun(true);
    const c = audio();
    const spt = secPerTick();
    const mi = current.mi;
    const beatSec = mi.beat * spt;
    const countBeats = mi.beatsPerBar;
    const start = c.currentTime + 0.25;
    const t0 = start + countBeats * beatSec;
    for (let b = 0; b < countBeats; b++) click(start + b * beatSec, b === 0);
    const total = current.flat.total;
    const nBeats = Math.round(total / mi.beat);
    if (mode === 'play' && S.metro) for (let b = 0; b < nBeats; b++) click(t0 + b * beatSec, (b * mi.beat) % mi.bar === 0, true);
    if (mode === 'listen') {
      if (S.metro) for (let b = 0; b < nBeats; b++) click(t0 + b * beatSec, (b * mi.beat) % mi.bar === 0, true);
      soundingNotes().forEach((n) => wood(t0 + n.pos * spt, n.len * spt));
    }
    if (mode === 'melody') {
      soundingNotes().forEach((n) => { if (n.midi) tone(t0 + n.pos * spt, n.len * spt, n.midi); });
    }
    run = { mode, start, t0, spt, beatSec, countBeats, taps: [], endAt: t0 + total * spt + (mode === 'play' ? beatSec * 0.75 : 0.1) };
    phase = 'countin';
    $('result').hidden = mode === 'play' ? true : $('result').hidden;
    if (mode === 'play') { lastResult = null; $('legend').hidden = true; render(); }
    setButtons();
    tick();
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

  function tick() {
    if (!run) return;
    const c = audio();
    const now = c.currentTime - (c.outputLatency || 0);
    const ph = $('playhead'); const ci = $('countin');
    if (now < run.t0) {
      const b = Math.floor((now - run.start) / run.beatSec);
      ci.hidden = b < 0; ci.textContent = b >= 0 ? String(b + 1) : '';
      ph.hidden = true;
    } else {
      ci.hidden = true;
      phase = run.mode === 'play' ? 'playing' : 'listening';
      const tk = (now - run.t0) / run.spt;
      const p = tickToXY(Math.min(tk, current.flat.total));
      if (p) {
        ph.hidden = false;
        ph.style.left = (p.x / layout.W * 100) + '%';
        const scale = $('score').clientWidth / layout.W;
        ph.style.top = (p.row.top * scale) + 'px';
        ph.style.height = (p.row.height * scale) + 'px';
      }
    }
    if (c.currentTime >= run.endAt) { finishRun(); return; }
    run.raf = requestAnimationFrame(tick);
  }

  function stopRun(silent) {
    if (run && run.raf) cancelAnimationFrame(run.raf);
    stopAudio();
    run = null; phase = 'idle';
    $('playhead').hidden = true; $('countin').hidden = true;
    if (!silent) setButtons();
  }

  function finishRun() {
    const r = run;
    stopRun(true);
    if (r.mode === 'play') {
      score(r);
      render();
      showResult();
    }
    setButtons();
  }

  function onTap(ev) {
    flashPad();
    if (phase === 'calibrating') { calib.taps.push(eventAudioTime(ev)); return; }
    if (!run || run.mode !== 'play') {
      if (phase === 'idle' && current) startRun('play');
      return;
    }
    run.taps.push(eventAudioTime(ev) - S.latency / 1000);
  }

  // ---------- scoring ----------
  function score(r) {
    const evs = current.flat.events;
    const onsets = [];
    evs.forEach((e, i) => { if (e.onset) onsets.push({ idx: i, tick: e.pos, t: r.t0 + e.pos * r.spt }); });
    onsets.forEach((o, k) => {
      const prev = k ? o.t - onsets[k - 1].t : Infinity;
      const next = k < onsets.length - 1 ? onsets[k + 1].t - o.t : Infinity;
      o.win = Math.max(0.05, Math.min(0.2, prev / 2, next / 2));
    });
    const taps = r.taps.filter((t) => t > r.t0 - 0.25);
    const pairs = [];
    onsets.forEach((o, i) => taps.forEach((t, j) => { const d = t - o.t; if (Math.abs(d) <= o.win) pairs.push([Math.abs(d), i, j, d]); }));
    pairs.sort((a, b) => a[0] - b[0]);
    const usedO = new Set(); const usedT = new Set();
    pairs.forEach(([, i, j, d]) => { if (usedO.has(i) || usedT.has(j)) return; usedO.add(i); usedT.add(j); onsets[i].err = d; });
    let pts = 0; const cnt = { perfect: 0, good: 0, off: 0, miss: 0 };
    const errs = [];
    onsets.forEach((o) => {
      if (o.err === undefined) o.grade = 'miss';
      else {
        const a = Math.abs(o.err);
        o.grade = a <= GRADE.perfect ? 'perfect' : a <= GRADE.good ? 'good' : 'off';
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
    onsets.forEach((o) => { byEvent[o.idx] = o; });
    const tapTicks = taps.map((t, j) => ({ tick: (t - r.t0) / r.spt, extra: !usedT.has(j) }));
    lastResult = { onsets, byEvent, tapTicks, cnt, extra, pct, mean, sd };
    history.push({ d: Date.now(), p: pct, l: current.item.l });
    while (history.length > 500) history.shift();
    store.set('history', history);
    updateSession();
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function sourceHTML() {
    const { item, occ } = current;
    const [title, composer, folder] = DATA.sources[occ[0]];
    const coll = DATA.collections[folder].label;
    const bar = occ[2];
    const bars = bar != null ? `mm. ${bar}–${bar + item.b - 1}` : '';
    const part = occ[1] ? `${esc(occ[1])}, ` : '';
    const others = item.o.filter((o) => o !== occ).slice(0, 4).map((o) => {
      const s = DATA.sources[o[0]];
      return `<li>${esc(s[0])}${s[1] ? ' (' + esc(s[1]) + ')' : ''}, ${esc(DATA.collections[s[2]].label)}</li>`;
    }).join('');
    const more = item.n > item.o.length ? `<p>Plus ${item.n - item.o.length} more occurrence${item.n - item.o.length > 1 ? 's' : ''} across the corpus.</p>` : '';
    return `<div class="source">
      <div class="eyebrow">Where this rhythm comes from</div>
      <h3>${esc(title)}${composer ? ` <em>${esc(composer)}</em>` : ''}</h3>
      <p>${part}${bars}, from ${esc(coll)}</p>
      <div class="transport"><button class="btn" id="btnMelody" type="button">Hear the melody</button></div>
      ${others ? `<div class="eyebrow" style="margin-top:6px">Also found in</div><ul>${others}</ul>` : ''}${more}
    </div>`;
  }

  function showResult() {
    const R = lastResult;
    const ms = (x) => Math.round(x * 1000);
    let verdict;
    if (R.cnt.miss === R.onsets.length) verdict = 'No taps landed near the notes. Tap the pad or press Space on each attack.';
    else if (Math.abs(R.mean) > 0.03) verdict = `You were ${ms(Math.abs(R.mean))} ms ${R.mean < 0 ? 'early (rushing)' : 'late (dragging)'} on average. If that is steady across attempts, calibrate.`;
    else verdict = `Centered on the beat; your spread was ±${ms(R.sd)} ms.`;
    const box = $('result');
    box.innerHTML = `<div class="result-top">
        <div class="bigscore">${R.pct}<small>%</small></div>
        <div class="verdict">${verdict}</div>
      </div>
      <div class="counts">
        <span class="count" style="--c:var(--perfect)">${R.cnt.perfect} tight</span>
        <span class="count" style="--c:var(--good)">${R.cnt.good} close</span>
        <span class="count" style="--c:var(--off)">${R.cnt.off} loose</span>
        <span class="count" style="--c:var(--miss)">${R.cnt.miss} missed</span>
        <span class="count" style="--c:var(--ink-soft)">${R.extra} extra taps</span>
      </div>
      ${sourceHTML()}`;
    box.hidden = false;
    $('legend').hidden = false;
    $('btnMelody').onclick = () => startRun('melody');
  }

  function showSourceOnly() {
    const box = $('result');
    box.innerHTML = sourceHTML();
    box.hidden = false;
    $('btnMelody').onclick = () => startRun('melody');
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
    $('calibMsg').textContent = 'Listen for 4 clicks, then tap along with the next 12.';
    setButtons();
    setTimeout(() => {
      phase = 'idle';
      const errs = [];
      calib.clicks.slice(4).forEach((ct) => {
        let best = null;
        calib.taps.forEach((tp) => { const d = tp - ct; if (Math.abs(d) < beat / 2 && (best === null || Math.abs(d) < Math.abs(best))) best = d; });
        if (best !== null) errs.push(best);
      });
      if (errs.length < 6) {
        $('calibMsg').textContent = `Only ${errs.length} taps matched the clicks. Try again and tap with every click.`;
      } else {
        errs.sort((a, b) => a - b);
        const med = errs[Math.floor(errs.length / 2)];
        S.latency = Math.round(med * 1000 / 5) * 5;
        $('latency').value = S.latency; save();
        $('calibMsg').textContent = `Offset set to ${S.latency} ms from ${errs.length} taps.`;
      }
      setButtons();
    }, (0.4 + 16 * beat + 0.5) * 1000);
  }

  // ---------- UI ----------
  function flashPad() { const p = $('pad'); p.classList.add('flash'); setTimeout(() => p.classList.remove('flash'), 90); }

  function setButtons() {
    const busy = phase !== 'idle';
    $('btnPlay').innerHTML = busy && run ? 'Stop <kbd>Esc</kbd>' : (lastResult ? 'Try again <kbd>Enter</kbd>' : 'Start <kbd>Enter</kbd>');
    $('btnListen').disabled = busy || !current;
    $('btnNext').disabled = busy;
    $('btnCalib').disabled = busy;
    $('padTitle').textContent = phase === 'calibrating' ? 'Tap with the clicks' : run && run.mode === 'play' ? 'Tap!' : 'Tap here, or press Space';
    $('padSub').textContent = phase === 'idle'
      ? 'Start gives you one bar of count-in clicks. Tap each note\'s attack; hold nothing, skip rests.'
      : run && run.mode !== 'play' ? 'Playback only, taps are not scored.' : '';
    $('tempoInline').textContent = current ? `♩ = ${S.tempo}${current.mi.compound ? ' (dotted)' : ''}` : '';
  }

  function chipGroup(el, entries, key, multi) {
    el.innerHTML = '';
    entries.forEach(([val, label, sub]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip';
      b.innerHTML = esc(label) + (sub ? `<small>${sub}</small>` : '');
      const on = () => (multi ? S[key].includes(val) : S[key] === val);
      b.setAttribute('aria-pressed', on());
      b.onclick = () => {
        if (multi) {
          const has = S[key].includes(val);
          if (has && S[key].length === 1) return;
          S[key] = has ? S[key].filter((v) => v !== val) : S[key].concat([val]);
        } else S[key] = val;
        save();
        [...el.children].forEach((c, i) => c.setAttribute('aria-pressed', multi ? S[key].includes(entries[i][0]) : S[key] === entries[i][0]));
        pickNext();
        setButtons();
      };
      el.appendChild(b);
    });
  }

  function updatePool(n) { $('pool').textContent = `${n.toLocaleString()} real rhythms match · ${DATA.rhythms.length.toLocaleString()} in the corpus`; }

  function updateSession() {
    const today = new Date().toDateString();
    const t = history.filter((h) => new Date(h.d).toDateString() === today);
    $('session').textContent = t.length
      ? `Today: ${t.length} rhythm${t.length > 1 ? 's' : ''} · average ${Math.round(t.reduce((a, h) => a + h.p, 0) / t.length)}%`
      : 'No attempts yet today';
  }

  function setupUI() {
    chipGroup($('levels'), Object.entries(LEVELS).map(([k, v]) => [Number(k), `${k} ${v[0]}`]), 'levels', true);
    $('levelHelp').innerHTML = Object.entries(LEVELS).map(([k, v]) => `<b>${k}</b> ${esc(v[1])}`).join('<br>');
    chipGroup($('lengths'), [[2, '2 bars'], [4, '4 bars']], 'bars', false);
    chipGroup($('meters'), METER_ORDER.map((m) => [m, m]), 'meters', true);
    chipGroup($('genres'), Object.entries(GENRES), 'genres', true);
    const tempo = $('tempo');
    tempo.value = S.tempo; $('tempoOut').textContent = S.tempo;
    tempo.oninput = () => { S.tempo = Number(tempo.value); $('tempoOut').textContent = S.tempo; save(); setButtons(); };
    $('metro').checked = S.metro; $('metro').onchange = (e) => { S.metro = e.target.checked; save(); };
    $('hideSource').checked = S.hideSource; $('hideSource').onchange = (e) => { S.hideSource = e.target.checked; save(); if (!S.hideSource && !lastResult && current) showSourceOnly(); };
    $('latency').value = S.latency; $('latency').onchange = (e) => { S.latency = Number(e.target.value) || 0; save(); };
    $('btnCalib').onclick = calibrate;
    $('btnPlay').onclick = () => (run ? stopRun() : startRun('play'));
    $('btnListen').onclick = () => startRun('listen');
    $('btnNext').onclick = () => { pickNext(); if (!S.hideSource) showSourceOnly(); setButtons(); };
    const pad = $('pad');
    pad.addEventListener('pointerdown', (e) => { e.preventDefault(); onTap(e); });
    document.addEventListener('keydown', (e) => {
      const tgt = e.target instanceof Element ? e.target : document.body;
      if (tgt.matches('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.repeat) { if (e.code === 'Space') e.preventDefault(); return; }
      if (e.code === 'Space' || e.code === 'KeyF' || e.code === 'KeyJ') {
        if (tgt.closest('button') && phase === 'idle') return;
        e.preventDefault(); onTap(e);
      } else if (e.key === 'Enter') {
        if (tgt.closest('button')) return;
        e.preventDefault(); run ? stopRun() : startRun('play');
      } else if (e.key === 'Escape') stopRun();
      else if (phase === 'idle' && e.code === 'KeyN') { pickNext(); if (!S.hideSource) showSourceOnly(); setButtons(); }
      else if (phase === 'idle' && e.code === 'KeyL') startRun('listen');
    });
    let rt;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (phase === 'idle') render(); }, 150); });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', () => phase === 'idle' && render());
    new MutationObserver(() => phase === 'idle' && render()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  // read-only handle for automated tests
  window.actualRhythms = { get current() { return current; }, get run() { return run; }, get result() { return lastResult; }, audio };

  setupUI();
  updateSession();
  pickNext();
  if (!S.hideSource && current) showSourceOnly();
  setButtons();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => phase === 'idle' && render());
})();
