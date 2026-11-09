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
  const GENRES = { folk: 'Folk tunes', chorale: 'Bach chorales', classical: 'Classical', ragtime: 'Ragtime', jazz: 'Jazz solos' };
  const GRADE = { perfect: 0.035, good: 0.075 };
  const REPEATS = 2; // every excerpt is played through twice (written with a repeat sign)
  const WORSE = { perfect: 0, good: 1, off: 2, miss: 3 };

  // ---------- settings ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('rr.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('rr.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };
  const SETTINGS_VERSION = 2;
  const saved = store.get('settings', {});
  if (!(saved.v >= 2)) {
    // v2: the source is shown by default, and jazz solos joined the corpus
    delete saved.hideSource;
    if (Array.isArray(saved.genres) && !saved.genres.includes('jazz')) saved.genres.push('jazz');
  }
  const S = Object.assign({
    tempo: 80, levels: [1, 2], bars: 2, meters: ['2/4', '3/4', '4/4', '6/8'],
    genres: Object.keys(GENRES), metro: true, hideSource: false, latency: 0, tapSound: true, silentMode: true,
  }, saved, { v: SETTINGS_VERSION });
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
    piano.prepare(pianoPitches()).catch(() => {}); // fetch the samples this excerpt needs in the background
  }


  // ---------- notation ----------
  // Unscaled geometry of one notation row: staff line, then two feedback lanes (one per pass).
  const ROW_H = 112;
  const LINE_Y = 52;
  const LANE_Y = 27;
  const LANE_GAP = 19;
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
    const min = ms.map((m, i) => measureMinWidth(m) + (i === 0 ? 36 : 0) + (i === ms.length - 1 ? 16 : 0));
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
      ts.topLine -= 2; ts.bottomLine -= 2; // centre the digits on a one-line staff
      stave.addModifier(ts);
    }
    stave.setBegBarType(VF.Barline.type.NONE).setEndBarType(VF.Barline.type.NONE);
    stave.setContext(ctx).draw();
    // leave room after a barline so the first note (and any tie into it) doesn't crowd it
    if (mIdx > 0) stave.setNoteStartX(stave.getNoteStartX() + (k > 0 ? 14 : 6));
    // one-line staves have zero-height barlines, so draw our own
    const ly = stave.getYForLine(0);
    const last = mIdx === item.b - 1;
    ctx.save(); ctx.setLineWidth(1.2);
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
    const beams = VF.Beam.generateBeams(notes, { groups: VF.Beam.getDefaultBeamGroups(item.m), stem_direction: 1, beam_rests: false });
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
    let s = W >= 640 ? 1.2 : 1;
    let Wl = W / s;
    const plan = planRows(item, Wl - 8);
    // a single bar wider than the whole staff (very narrow screens): shrink this excerpt to fit, not below 75%
    const widest = Math.max(...plan.rows.map((idxs) => idxs.reduce((acc, k) => acc + plan.min[k], 0)));
    if (widest > Wl - 8) { s = Math.max(0.75, s * (Wl - 8) / widest); Wl = W / s; }
    // still too wide: let notes sit up to 20% closer than the comfortable estimate...
    const squeeze = widest > Wl - 8 ? Math.max(0.8, (Wl - 8) / widest) : 1;
    // ...and beyond that, draw at the needed width and let the score box scroll sideways (never clip)
    let canvasW = W;
    if (widest * squeeze > Wl - 8) { canvasW = Math.ceil((widest * squeeze + 8) * s); Wl = canvasW / s; }
    const H = plan.rows.length * ROW_H;
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
      const rowTop = r * ROW_H;
      const y = rowTop + LINE_Y - 40; // stave line sits 40px below the stave's y (4 spaces of headroom)
      const sum = idxs.reduce((acc, k) => acc + plan.min[k] * squeeze, 0);
      const spare = Math.max(0, Wl - 8 - sum);
      const rowInfo = { y: rowTop, top: rowTop + 14, height: 62, line: rowTop + LINE_Y, segs: [] };
      let x = 4;
      idxs.forEach((mIdx, k) => {
        rowOfMeasure[mIdx] = r;
        const w = plan.min[mIdx] * squeeze + spare * (plan.min[mIdx] * squeeze / sum);
        const { notes, evs, last, meas } = drawBar(ctx, item, mi, flat, mIdx, k, x, y, w, grades);

        // tick -> x map for the playhead and feedback marks
        const m0 = mIdx * mi.bar;
        const pts = meas.map((e, i) => [evs[i].pos, (notes[i].getNoteHeadBeginX() + notes[i].getNoteHeadEndX()) / 2]);
        pts.push([m0 + mi.bar, x + w - (last ? 18 : 6)]);
        rowInfo.segs.push({ t0: m0, t1: m0 + mi.bar, pts });
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
    layout = { rows: rowsInfo, svg, s, W };
    lastRenderW = W;
    if (lastResult) drawTapMarks();
  }

  function tickToXY(tick) {
    if (!layout) return null;
    const lastT = current.flat.total;
    for (const row of layout.rows) {
      for (const sg of row.segs) {
        // a bar owns [start, end); only the final barline owns its end tick
        if (tick >= sg.t0 && (tick < sg.t1 || (tick === sg.t1 && sg.t1 === lastT))) {
          const p = sg.pts;
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

  // dots under each note (one lane per pass, coloured by grade) and tick marks for each tap
  // Under the staff, one lane per pass: a gray tick where each note falls, and a dot where
  // each tap landed, centred on the tick's midline and coloured by its timing.
  const TICK_COLOR = '#9AA19C';
  const TAP_COLOR = { perfect: GRADE_COLOR.perfect, good: GRADE_COLOR.good, off: GRADE_COLOR.off, extra: GRADE_COLOR.miss };
  function drawTapMarks() {
    const NS = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(NS, 'g');
    const total = current.flat.total;
    const laneY = (row, pass) => row.line + LANE_Y + pass * LANE_GAP;
    lastResult.onsets.forEach((o) => {
      const p = tickToXY(o.tick - o.pass * total);
      if (!p) return;
      const y = laneY(p.row, o.pass);
      const l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', p.x); l.setAttribute('x2', p.x); l.setAttribute('y1', y - 6); l.setAttribute('y2', y + 6);
      l.setAttribute('stroke', TICK_COLOR); l.setAttribute('stroke-width', '2'); l.setAttribute('stroke-linecap', 'round');
      g.appendChild(l);
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
      ac.onstatechange = updateSoundStatus;
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
    updateSoundStatus();
  }
  ['touchend', 'click', 'keydown', 'mousedown'].forEach((t) => document.addEventListener(t, onActivation, { capture: true, passive: true }));

  function updateSoundStatus() {
    const el = document.getElementById('soundStatus');
    if (!el) return;
    const parts = [
      `Audio engine: ${ac ? ac.state : 'not started yet'}${ac ? ` (${ac.sampleRate} Hz)` : ''}`,
      ac ? `reported delay ${Math.round(((ac.baseLatency || 0) + (ac.outputLatency || 0)) * 1000)} ms` + (ac.outputLatency ? '' : ' (output part not reported)') : null,
      navigator.audioSession ? `iOS audio session: ${navigator.audioSession.type}` : null,
      IS_IOS ? `Silent-mode workaround: ${!S.silentMode ? 'switched off' : silentLoopPlaying ? 'on' : 'waiting for a tap'}` : null,
    ].filter(Boolean);
    el.textContent = parts.join(' · ');
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (silentLoop) silentLoop.pause(); return; } // don't hold the audio session in the background
    if (ac && ac.state !== 'running') ac.resume().catch(() => {});
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
  // sampled every minor third from A0 to C8, plus per-key release (damper) sounds.
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
      const key = Math.max(1, Math.min(88, midi - 20));
      return { note: `audio/piano/v${layerFor(vel)}/${s.name}.mp3`, rel: `audio/piano/release/rel${key}.mp3`, rate: s.rate };
    };
    // where each sample's sound starts and how loud it peaks (tools/piano_offsets.py)
    let OFF = {};
    const offsReady = fetch('audio/piano/offsets.json').then((r) => (r.ok ? r.json() : {})).then((j) => { OFF = j; }).catch(() => {});
    const offsetOf = (url) => OFF[url.replace('audio/piano/', '')] || [0, 0.33];
    function prepare(notes) {
      return Promise.all([offsReady, ...notes.flatMap(({ midi, vel }) => { const u = urls(midi, vel); return [load(u.note), load(u.rel)]; })]);
    }
    function play(t, dur, midi, vel) {
      const c = audio();
      if (!master) { master = c.createGain(); master.gain.value = 0.9; master.connect(c.destination); }
      const u = urls(midi, vel);
      const gen = audioGen;
      Promise.all([load(u.note), load(u.rel)]).then(([buf, rel]) => {
        if (gen !== audioGen || t < c.currentTime) return; // stopped meanwhile, or arrived too late // arrived too late (only if prepare() was skipped)
        const [noteStart, notePeak] = offsetOf(u.note);
        const [relStart, relPeak] = offsetOf(u.rel);
        const src = c.createBufferSource(); const g = c.createGain();
        src.buffer = buf; src.playbackRate.value = u.rate;
        const level = 0.75 + 0.35 * vel;
        const off = t + Math.max(0.06, dur);
        g.gain.setValueAtTime(level, t);
        g.gain.setValueAtTime(level, off);
        g.gain.setTargetAtTime(0, off, 0.07); // damper
        src.connect(g).connect(master);
        src.start(t, noteStart); // skip the sample's lead-in so the attack lands on the beat
        src.stop(off + 0.6);
        // key mechanism noise, struck with the note and kept well under it (about 18 dB below its peak)
        const rs = c.createBufferSource(); const rg = c.createGain();
        rs.buffer = rel;
        rg.gain.value = Math.min(1, (0.12 * notePeak * level) / Math.max(relPeak, 0.01));
        rs.connect(rg).connect(master);
        rs.start(t, relStart);
        scheduled.push(src, rs);
      }).catch(() => { /* a missing sample just stays silent */ });
    }
    return { prepare, play };
  })();

  // metric weight -> loudness. Each weight sits in the middle of one velocity layer
  // (downbeat, beat, half-beat, the rest), so the layer is fixed and can be preloaded;
  // humanize adds a little variation inside the layer.
  function velocityAt(pos, humanize) {
    const mi = current.mi;
    const base = pos % mi.bar === 0 ? 0.875 : pos % mi.beat === 0 ? 0.625 : pos % (mi.beat / 2) === 0 ? 0.375 : 0.125;
    return humanize ? base + (Math.random() - 0.5) * 0.12 : base;
  }
  const LISTEN_MIDI = 72; // fallback pitch (C5) for a note whose pitch is unknown
  function pianoPitches() {
    if (!current) return [];
    const out = [];
    soundingNotes().forEach((n) => {
      const vel = velocityAt(n.pos);
      out.push({ midi: n.midi || LISTEN_MIDI, vel });
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

  function secPerTick() { return 60 / S.tempo / current.mi.beat; }

  let loadingToken = 0;
  async function startRun(mode) {
    if (!current) return;
    stopRun(true);
    if (mode !== 'play') {
      const token = ++loadingToken;
      loadingMode = mode; setButtons();
      try { await piano.prepare(pianoPitches()); } catch (e) { /* play what loaded */ }
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
    const spt = secPerTick();
    const mi = current.mi;
    const beatSec = mi.beat * spt;
    const countBeats = mi.beatsPerBar;
    const start = c.currentTime + 0.25;
    const t0 = start + countBeats * beatSec;
    for (let b = 0; b < countBeats; b++) click(start + b * beatSec, b === 0);
    const total = current.flat.total;
    const nBeats = Math.round(total * REPEATS / mi.beat);
    const passes = (fn) => { for (let p = 0; p < REPEATS; p++) soundingNotes().forEach((n) => fn(n, t0 + (n.pos + p * total) * spt)); };
    if (mode === 'play' && S.metro) for (let b = 0; b < nBeats; b++) click(t0 + b * beatSec, (b * mi.beat) % mi.bar === 0, true);
    if (mode === 'listen') {
      if (S.metro) for (let b = 0; b < nBeats; b++) click(t0 + b * beatSec, (b * mi.beat) % mi.bar === 0, true);
      passes((n, t) => piano.play(t, n.len * spt, n.midi || LISTEN_MIDI, velocityAt(n.pos, true))); // the real melody
    }
    if (mode === 'melody') {
      passes((n, t) => { if (n.midi) piano.play(t, n.len * spt, n.midi, velocityAt(n.pos, true)); });
    }
    run = { mode, start, t0, spt, beatSec, countBeats, taps: [], endAt: t0 + total * REPEATS * spt + (mode === 'play' ? beatSec * 0.75 : 0.1) };
    phase = 'countin';
    if (mode === 'play' && lastResult) { lastResult = null; render(); renderOutcome(); }
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
      setPadStatus('countin', b >= 0 ? `Count-in ${b + 1} of ${run.countBeats}` : 'Get ready');
    } else {
      ci.hidden = true;
      phase = run.mode === 'play' ? 'playing' : 'listening';
      const total = current.flat.total;
      const tk = (now - run.t0) / run.spt;
      const pass = Math.min(REPEATS - 1, Math.floor(tk / total));
      if (run.mode === 'play') setPadStatus('playing', pass === 0 ? 'Tap each note · first time' : 'Tap each note · repeat');
      else setPadStatus('listening', 'Playing the melody · taps are not scored');
      const p = tickToXY(tk >= total * REPEATS ? total : tk % total);
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
    $('playhead').hidden = true; $('countin').hidden = true;
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
    if (run && run.mode === 'play') tapSound(); // first, before any other work
    const heard = eventAudioTime(ev);
    flashPad(ev && ev.currentTarget);
    if (phase === 'calibrating') { calib.taps.push(heard); return; }
    if (!run || run.mode !== 'play') {
      if (phase === 'idle' && current) startRun('play');
      return;
    }
    run.taps.push(heard - S.latency / 1000);
  }

  // ---------- scoring ----------
  function score(r) {
    const evs = current.flat.events;
    const onsets = [];
    const total = current.flat.total;
    for (let p = 0; p < REPEATS; p++) {
      evs.forEach((e, i) => {
        if (e.onset) { const tick = e.pos + p * total; onsets.push({ idx: i, pass: p, tick, t: r.t0 + tick * r.spt }); }
      });
    }
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
    const tapPass = {}; const tapOnset = {};
    pairs.forEach(([, i, j, d]) => { if (usedO.has(i) || usedT.has(j)) return; usedO.add(i); usedT.add(j); onsets[i].err = d; tapPass[j] = onsets[i].pass; tapOnset[j] = i; });
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
    // a note's colour on the staff is its worse result across the passes
    onsets.forEach((o) => { if (!byEvent[o.idx] || WORSE[o.grade] > WORSE[byEvent[o.idx].grade]) byEvent[o.idx] = o; });
    const tapTicks = taps.map((t, j) => {
      const tick = (t - r.t0) / r.spt;
      const pass = j in tapPass ? tapPass[j] : Math.max(0, Math.min(REPEATS - 1, Math.floor(tick / total)));
      return { tick, pass, extra: !usedT.has(j), grade: j in tapOnset ? onsets[tapOnset[j]].grade : 'extra' };
    });
    lastResult = { onsets, byEvent, tapTicks, cnt, extra, pct, mean, sd };
    history.push({ d: Date.now(), p: pct, l: current.item.l });
    while (history.length > 500) history.shift();
    store.set('history', history);
    updateSession();
  }

  // ---------- outcome: results + source ----------
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  const icon = (id, cls) => `<svg class="icon${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${id}"/></svg>`;

  // collections whose name adds nothing beyond the song's own origin
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
    const redundant = HIDE_COLLECTION.has(folder) || (surname && coll.includes(surname));
    const from = redundant ? '' : `, from ${esc(coll)}`;
    const others = item.o.filter((o) => o !== occ).slice(0, 4).map((o) => {
      const src = DATA.sources[o[0]];
      const place = src[3] || (HIDE_COLLECTION.has(src[2]) ? '' : DATA.collections[src[2]].label);
      return `<li>${esc(src[0])}${src[1] ? ' (' + esc(src[1]) + ')' : ''}${place ? ', ' + esc(place) : ''}${src[4] ? ', ' + esc(src[4].replace(/^(composed|published|recorded|harmonized) /, '')) : ''}</li>`;
    }).join('');
    const extra = item.n - item.o.length;
    const more = extra > 0 ? `<p>Plus ${extra} more occurrence${extra > 1 ? 's' : ''} across the corpus.</p>` : '';
    const occurs = item.n > 1 ? `This rhythm occurs ${item.n} times in the corpus.` : 'This rhythm is unique to one piece in the corpus.';
    return `<div class="source">
      <div class="eyebrow">Where this rhythm comes from</div>
      <h3>${esc(title)}${composer ? ` <em>${esc(composer)}</em>` : ''}</h3>
      ${where ? `<p class="where">${where}</p>` : ''}
      <p>${part}${bars}${from}${note ? ` · ${esc(note)}` : ''}</p>
      <p>${occurs}</p>
      ${others ? `<div class="eyebrow">Also found in</div><ul>${others}</ul>` : ''}${more}
    </div>`;
  }

  function resultHTML() {
    const R = lastResult;
    const ms = (x) => Math.round(x * 1000);
    let verdict;
    if (R.cnt.miss === R.onsets.length) verdict = 'No taps landed near the notes. Tap the pad or press Space on each attack.';
    else if (Math.abs(R.mean) > 0.03) verdict = `You were ${ms(Math.abs(R.mean))} ms ${R.mean < 0 ? 'early (rushing)' : 'late (dragging)'} on average. If that is steady across attempts, calibrate in Advanced settings.`;
    else verdict = `Centered on the beat; your spread was ±${ms(R.sd)} ms.`;
    return `<div class="card result">
      <div class="result-top"><div class="bigscore">${R.pct}<small>%</small></div><p class="verdict">${verdict}</p></div>
      <div class="counts">
        <span class="count" style="--c:var(--perfect)">${R.cnt.perfect} within 35 ms</span>
        <span class="count" style="--c:var(--good)">${R.cnt.good} within 75 ms</span>
        <span class="count" style="--c:var(--off)">${R.cnt.off} loose</span>
        <span class="count" style="--c:var(--miss)">${R.cnt.miss} missed</span>
        <span class="count" style="--c:var(--miss)">${R.extra} extra tap${R.extra === 1 ? '' : 's'}</span>
      </div>
      <p class="legend">Under the staff, gray marks show where each note falls (top row the first time through, bottom row the repeat). Dots are your taps: <span class="lg" style="--c:var(--perfect)">within 35 ms</span> <span class="lg" style="--c:var(--good)">within 75 ms</span> <span class="lg" style="--c:var(--off)">loose</span> <span class="lg" style="--c:var(--miss)">extra tap</span>. A mark with no dot is a missed note.</p>
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
    $('calibMsg').textContent = 'Listen for 4 clicks, then tap along with the next 12.';
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
        $('calibMsg').textContent = `Only ${errs.length} taps matched the clicks. Try again and tap with every click.`;
      } else {
        errs.sort((a, b) => a - b);
        const med = errs[Math.floor(errs.length / 2)];
        S.latency = Math.round(med * 1000 / 5) * 5;
        $('latency').value = S.latency; save();
        $('calibMsg').textContent = `Offset set to ${S.latency} ms from ${errs.length} taps.`;
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
      melody.querySelector('span').textContent = loadingMode === 'melody' ? 'Loading piano…' : 'Hear the melody';
      melody.disabled = phase === 'calibrating' || !!loadingMode;
    }
    $('tempo').value = S.tempo;
    const mi = current && current.mi;
    $('tempoBeat').textContent = mi && mi.compound ? (mi.den === 8 ? 'dotted-quarter beat' : 'dotted-half beat') : '';
    if (!running) {
      if (!current) setPadStatus('empty', 'No rhythms match these settings');
      else if (phase === 'calibrating') setPadStatus('calibrating', 'Calibrating: tap with the clicks');
      else if (loadingMode) setPadStatus('loading', 'Loading piano…');
      else setPadStatus(lastResult ? 'done' : 'ready', lastResult ? 'Tap or press Start to try again' : 'Press Start, or just start tapping');
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
    $('metaChips').innerHTML = `<span class="chip">${item.m}</span><span class="chip" title="${LEVELS[item.l][0]}: ${esc(LEVELS[item.l][1])}">Level ${item.l}</span><span class="chip">${item.b} bars</span>`;
  }

  // ---------- tempo ----------
  function setTempo(v) {
    const t = Math.max(40, Math.min(200, Math.round((Number(v) || S.tempo) / 2) * 2));
    S.tempo = t; save();
    $('tempo').value = t;
  }
  function stepper(btn, delta) {
    let hold = null; let rep = null;
    const stop = () => { clearTimeout(hold); clearInterval(rep); hold = rep = null; };
    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      setTempo(S.tempo + delta);
      hold = setTimeout(() => { rep = setInterval(() => setTempo(S.tempo + delta), 70); }, 400);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, stop));
    btn.addEventListener('click', (e) => { if (e.detail === 0) setTempo(S.tempo + delta); }); // keyboard activation
  }

  // ---------- settings component ----------
  const PRIMARY_METERS = ['2/4', '3/4', '4/4', '6/8'].filter((m) => METER_ORDER.includes(m));
  const MORE_METERS = METER_ORDER.filter((m) => !PRIMARY_METERS.includes(m));
  const GENRE_SHORT = { folk: 'Folk', chorale: 'Bach', classical: 'Classical', ragtime: 'Ragtime', jazz: 'Jazz' };

  function toggleGroup(el, entries, key, multi) {
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
          if (has && S[key].length === 1) return; // keep at least one selected
          S[key] = has ? S[key].filter((v) => v !== val) : S[key].concat([val]);
        } else S[key] = val;
        save();
        syncSettings();
        if (run) stopRun(true);
        pickNext();
        setButtons();
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
    const hiddenOn = MORE_METERS.filter((m) => S.meters.includes(m)).length;
    const more = $('btnMoreMeters');
    if (more) {
      more.querySelector('.badge').textContent = hiddenOn && $('metersMore').hidden ? `·${hiddenOn}` : '';
      more.setAttribute('aria-label', `More time signatures${hiddenOn ? `, ${hiddenOn} selected` : ''}`);
    }
    $('metro').setAttribute('aria-checked', String(!!S.metro));
    $('tapSoundSw').setAttribute('aria-checked', String(!!S.tapSound));
    $('silentSw').setAttribute('aria-checked', String(!!S.silentMode));
    $('hideSource').setAttribute('aria-checked', String(!!S.hideSource));
    $('latency').value = S.latency;
    const n = pool().length;
    const levels = S.levels.slice().sort().join(', ');
    const genres = Object.keys(GENRES).filter((g) => S.genres.includes(g)).map((g) => GENRE_SHORT[g]).join(', ');
    const meters = METER_ORDER.filter((m) => S.meters.includes(m)).join(', ');
    $('pool').innerHTML = `${n.toLocaleString()} of ${DATA.rhythms.length.toLocaleString()} real rhythms match: level ${levels}; ${meters}; ${genres}; ${S.bars} bars.<span class="browse">Browse every rhythm in the corpus</span>`;
    const note = $('poolNote');
    note.textContent = `${n.toLocaleString()} matching`;
    note.title = `Level ${levels} · ${meters} · ${genres}`;
    note.setAttribute('aria-label', `${n} matching rhythms. Filters: level ${levels}; ${meters}; ${genres}. Browse them.`);
  }

  function buildSettings() {
    toggleGroup($('levels'), Object.keys(LEVELS).map((k) => ({ val: Number(k), label: k, aria: `Level ${k}, ${LEVELS[k][0]}` })), 'levels', true);
    $('levelHelp').innerHTML = Object.entries(LEVELS).map(([k, v]) => `<dt>${k} ${esc(v[0])}</dt><dd>${esc(v[1])}</dd>`).join('');
    toggleGroup($('lengths'), [{ val: 2, label: '2 bars' }, { val: 4, label: '4 bars' }], 'bars', false);
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
    toggleGroup($('genres'), Object.keys(GENRES).map((g) => ({ val: g, label: GENRE_SHORT[g], aria: GENRES[g] })), 'genres', true);
    $('metro').addEventListener('click', () => { S.metro = !S.metro; save(); syncSettings(); });
    $('tapSoundSw').addEventListener('click', () => { S.tapSound = !S.tapSound; save(); syncSettings(); });
    $('silentSw').addEventListener('click', () => {
      S.silentMode = !S.silentMode; save(); syncSettings();
      if (S.silentMode) startSilentLoop(); else if (silentLoop) { silentLoop.pause(); silentLoopPlaying = false; }
      updateSoundStatus();
    });
    if (!IS_IOS) { $('silentRow').hidden = true; $('silentHelp').hidden = true; }
    $('hideSource').addEventListener('click', () => { S.hideSource = !S.hideSource; save(); syncSettings(); renderOutcome(); setButtons(); });
    $('latency').addEventListener('change', (e) => { S.latency = Math.max(-300, Math.min(300, Number(e.target.value) || 0)); save(); syncSettings(); });
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

  // ---------- corpus browser: every rhythm, searchable; tap one to practise it ----------
  const CORPUS_ROW = 112;
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
        return [src[0], src[1], src[3], src[4], src[5], DATA.collections[src[2]].label, o[1]].join(' ');
      }).join(' ').toLowerCase();
    }
    return item._hay;
  }

  // a one-row notation thumbnail, drawn with the same code as the score
  function thumbSVG(item, W) {
    const hit = thumbCache.get(item);
    if (hit && hit.W === W) return hit.svg;
    let svg = '';
    try {
      const host = document.createElement('div');
      const mi = meterInfo(item.m);
      const flat = flatten(item);
      const ms = measures(item);
      const s = 0.72; const Wl = W / s;
      const min = ms.map((m, i) => measureMinWidth(m) + (i === 0 ? 36 : 0) + (i === ms.length - 1 ? 16 : 0));
      const sum = min.reduce((acc, v) => acc + v, 0);
      const squeeze = Math.min(1, (Wl - 8) / sum);
      const spare = Math.max(0, Wl - 8 - sum * squeeze);
      const renderer = new VF.Renderer(host, VF.Renderer.Backends.SVG);
      renderer.resize(W, Math.ceil(72 * s));
      const ctx = renderer.getContext();
      ctx.scale(s, s); ctx.setFillStyle(INK); ctx.setStrokeStyle(INK);
      let x = 4;
      ms.forEach((m, i) => {
        const w = min[i] * squeeze + spare * (min[i] / sum);
        drawBar(ctx, item, mi, flat, i, i, x, 10, w, null);
        x += w;
      });
      flat.events.forEach((ev, i) => {
        if (!(ev.flags & FLAG.TIE) || i + 1 >= flat.events.length) return;
        new VF.StaveTie({ first_note: ev.vf, last_note: flat.events[i + 1].vf, first_indices: [0], last_indices: [0] }).setContext(ctx).draw();
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
    return `<div class="c-thumb">${thumbSVG(item, thumbW)}</div>
      <div class="c-meta">
        <span class="c-chips"><span class="chip">${item.m}</span><span class="chip">Level ${item.l}</span><span class="chip">${item.b} bars</span>${item.n > 1 ? `<span class="c-n">occurs ${item.n}×</span>` : ''}</span>
        <span class="c-src"><b>${esc(src[0])}</b>${src[1] ? ' · ' + esc(src[1]) : ''}${where ? ' · ' + esc(where) : ''}</span>
      </div>`;
  }

  function measureCorpus() {
    const sc = $('corpusScroll');
    const wide = sc.clientWidth >= 640;
    $('corpus').classList.toggle('wide-rows', wide);
    const w = Math.max(200, Math.floor(wide ? (sc.clientWidth - 32 - 16) * 0.56 : sc.clientWidth - 32));
    if (w !== thumbW) { thumbW = w; rowEls.forEach((el) => el.remove()); rowEls.clear(); }
  }

  function renderCorpusRows() {
    if (!corpusOpen) return;
    const sc = $('corpusScroll');
    const first = Math.max(0, Math.floor(sc.scrollTop / CORPUS_ROW) - 3);
    const last = Math.min(corpusList.length - 1, Math.ceil((sc.scrollTop + sc.clientHeight) / CORPUS_ROW) + 3);
    for (const [i, el] of rowEls) if (i < first || i > last) { el.remove(); rowEls.delete(i); }
    for (let i = first; i <= last; i++) {
      if (rowEls.has(i)) continue;
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'c-row'; el.dataset.i = i;
      el.style.top = (i * CORPUS_ROW) + 'px';
      el.innerHTML = corpusRowHTML(corpusList[i]);
      el.setAttribute('aria-label', `Practise: ${el.textContent.replace(/\s+/g, ' ').trim()}`);
      $('corpusSpacer').appendChild(el);
      rowEls.set(i, el);
    }
  }

  function refreshCorpus() {
    const q = $('corpusSearch').value.trim().toLowerCase();
    const only = $('corpusOnly').getAttribute('aria-checked') === 'true';
    let list = only ? pool() : DATA.rhythms.slice();
    if (q) { const terms = q.split(/\s+/); list = list.filter((it) => terms.every((t) => haystack(it).includes(t))); }
    const title = (it) => DATA.sources[it.o[0][0]][0];
    const cmp = {
      common: (x, y) => y.n - x.n || x.l - y.l,
      easy: (x, y) => x.l - y.l || y.n - x.n,
      hard: (x, y) => y.l - x.l || y.n - x.n,
      title: (x, y) => title(x).localeCompare(title(y)),
    }[$('corpusSort').value];
    list.sort(cmp);
    corpusList = list;
    const all = DATA.rhythms.length.toLocaleString();
    $('corpusCount').textContent = (!only && !q)
      ? `${all} rhythms in the corpus, each a real passage`
      : `${list.length.toLocaleString()} ${only ? 'matching ' : ''}rhythm${list.length === 1 ? '' : 's'}`
        + (q ? ` for “${$('corpusSearch').value.trim()}”` : '') + ` · ${all} in the whole corpus`;
    $('corpusSpacer').style.height = (list.length * CORPUS_ROW) + 'px';
    $('corpusSpacer').querySelectorAll('.c-empty').forEach((e) => e.remove());
    if (!list.length) $('corpusSpacer').insertAdjacentHTML('beforeend', '<p class="c-empty">No rhythms match. Try a different search, or switch off “Only rhythms matching my settings”.</p>');
    rowEls.forEach((el) => el.remove()); rowEls.clear();
    $('corpusScroll').scrollTop = 0;
    renderCorpusRows();
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
    $('corpus').hidden = true;
    document.querySelector('.app').inert = false;
    rowEls.forEach((el) => el.remove()); rowEls.clear();
    const back = corpusOpener && corpusOpener.isConnected && corpusOpener.getClientRects().length ? corpusOpener : $('btnPlay');
    back.focus({ preventScroll: true });
  }
  function practiseItem(item) {
    const occs = item.o.filter((o) => S.genres.includes(genreOf(o)));
    const occ = (occs.length ? occs : item.o)[0];
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
    $('corpus').addEventListener('click', (e) => { if (e.target === $('corpus')) closeCorpus(); }); // backdrop
    let raf = 0;
    $('corpusScroll').addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(renderCorpusRows); }, { passive: true });
    $('corpusSpacer').addEventListener('click', (e) => {
      const row = e.target.closest('.c-row');
      if (!row) return;
      const item = corpusList[Number(row.dataset.i)];
      closeCorpus();
      practiseItem(item);
      setButtons();
    });
    window.addEventListener('resize', () => { if (corpusOpen) { measureCorpus(); renderCorpusRows(); } });
    $('pool').addEventListener('click', () => openCorpus(false));
  }

  // ---------- wiring (runs once) ----------
  function setupUI() {
    buildSettings();
    $('tempo').value = S.tempo;
    $('tempo').addEventListener('change', (e) => setTempo(e.target.value));
    stepper($('tempoDown'), -2);
    stepper($('tempoUp'), 2);
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
      if (a.dataset.action === 'settings') openSettings();
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
      if (tgt.matches('input, select, textarea') || tgt.closest('#settings')) return;
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
  };

  setupUI();
  setupCorpus();
  updateSession();
  pickNext();
  setButtons();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (phase === 'idle') render(); });
})();
