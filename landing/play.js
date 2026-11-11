/* Play buttons for the landing pages' excerpts: each button carries its excerpt's notes (ticks, pitches)
   and plays them twice through, like the app, on the app's own samples: the grand piano, or bass,
   guitar and drums for those parts. */
(function () {
  'use strict';
  let ctx = null; let master = null; let playing = null; // {btn, srcs, timer}
  const cache = new Map();
  const OFF = {};
  const json = (u) => fetch(u).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  const offsReady = Promise.all([
    json('/audio/piano/offsets.json').then((j) => { OFF.piano = j; }),
    json('/audio/instruments/offsets.json').then((j) => { OFF.inst = j; }),
    json('/audio/drums/offsets.json').then((j) => { OFF.drums = j; }),
  ]);
  function load(url) {
    if (!cache.has(url)) {
      const p = fetch(url).then((r) => { if (!r.ok) throw new Error(url); return r.arrayBuffer(); })
        .then((b) => new Promise((res, rej) => ctx.decodeAudioData(b, res, rej)));
      p.catch(() => cache.delete(url));
      cache.set(url, p);
    }
    return cache.get(url);
  }
  // nearest sample every minor third, at most a semitone of shift
  function nearest(m, lo, hi, names) {
    m = Math.max(lo, Math.min(hi, m));
    for (let d = 0; d <= 2; d++) for (const c of [m - d, m + d]) if (c >= lo && c <= hi && (c % 12) in names) return { key: names[c % 12] + (Math.floor(c / 12) - 1), rate: Math.pow(2, (m - c) / 12) };
    return { key: names[0] + '4', rate: 1 };
  }
  const KIT = (m) => (!m ? 'snare' : m <= 61 ? 'kick' : m <= 63 ? 'hihat-foot' : m <= 67 ? 'kick' : m <= 70 ? 'tom-low' : m === 71 ? 'tom-low' : m <= 73 ? 'snare' : m <= 76 ? 'tom' : m <= 78 ? 'ride' : m <= 80 ? 'hihat' : 'crash');
  function sample(inst, midi) {
    if (inst === 'piano') {
      const s = nearest(midi, 21, 108, { 0: 'C', 3: 'Ds', 6: 'Fs', 9: 'A' });
      const o = (OFF.piano || {})[`v10/${s.key}.mp3`] || [0];
      return { url: `/audio/piano/v10/${s.key}.mp3`, rate: s.rate, start: o[0], gain: 1, ring: false };
    }
    if (inst === 'drums') {
      const k = KIT(midi); const o = (OFF.drums || {})[`${k}.mp3`] || [0, 0.05, 0.3];
      return { url: `/audio/drums/${k}.mp3`, rate: 1, start: o[0], gain: 0.6 / o[2], ring: true };
    }
    const bass = /bass/.test(inst); let m = midi || 48; const lo = bass ? 24 : 36; const hi = bass ? 72 : 96;
    while (m < lo) m += 12; while (m > hi) m -= 12;
    const s = nearest(m, lo, hi, { 0: 'C', 3: 'Eb', 6: 'Gb', 9: 'A' });
    const o = (OFF.inst || {})[`${inst}/${s.key}.mp3`] || [0, 0.05, 0.3];
    return { url: `/audio/instruments/${inst}/${s.key}.mp3`, rate: s.rate, start: o[0], gain: Math.min(0.16 / o[1], 0.8 / o[2]), ring: false };
  }
  function stop() {
    if (!playing) return;
    playing.srcs.forEach((s) => { try { s.stop(); } catch (e) { /* done */ } });
    clearTimeout(playing.timer);
    playing.btn.classList.remove('is-playing'); playing.btn.setAttribute('aria-label', 'Play');
    playing = null;
  }
  async function play(btn) {
    const was = playing && playing.btn; stop();
    if (was === btn) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctx) { ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.85; master.connect(ctx.destination); }
    if (ctx.state !== 'running') { try { await ctx.resume(); } catch (e) { /* ignore */ } }
    const d = JSON.parse(btn.dataset.play);
    const me = { btn, srcs: [], timer: 0 }; playing = me;
    btn.classList.add('is-playing', 'is-loading'); btn.setAttribute('aria-label', 'Stop');
    await offsReady;
    const hits = []; d.n.forEach(([pos, len, ms]) => ms.forEach((m) => hits.push({ pos, len, m, s: sample(d.inst, m), chord: ms.length })));
    await Promise.all(hits.map((h) => load(h.s.url).then((b) => { h.buf = b; }).catch(() => {})));
    btn.classList.remove('is-loading');
    if (playing !== me) return;
    const loop = d.total; // one pass: the whole excerpt, trailing rests included
    const t0 = ctx.currentTime + 0.12;
    for (let pass = 0; pass < 2; pass++) {
      hits.forEach((h) => {
        if (!h.buf) return;
        const t = t0 + (pass * loop + h.pos) * d.spt; const dur = Math.max(0.06, h.len * d.spt);
        const src = ctx.createBufferSource(); const g = ctx.createGain();
        src.buffer = h.buf; src.playbackRate.value = h.s.rate;
        const level = 0.96 * h.s.gain * (h.chord > 1 && d.inst !== 'drums' ? Math.max(0.55, 1 / Math.sqrt(h.chord)) : 1);
        g.gain.setValueAtTime(level, t);
        let end = t + h.buf.duration;
        if (!h.s.ring) { g.gain.setValueAtTime(level, t + dur); g.gain.setTargetAtTime(0, t + dur, 0.06); end = t + dur + 0.5; }
        src.connect(g).connect(master);
        src.start(t, h.s.start); src.stop(end);
        me.srcs.push(src);
      });
    }
    me.timer = setTimeout(() => { if (playing === me) stop(); }, (0.12 + 2 * loop * d.spt + 0.4) * 1000);
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('button.play[data-play]'); if (b) play(b); });
})();
