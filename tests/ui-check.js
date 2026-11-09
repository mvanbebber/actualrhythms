// UI + behaviour check for Actual Rhythms. Run:  node tests/ui-check.js [screenshotDir]
// Needs Playwright (require('playwright')) with Chromium. Serves the repo itself on a free port.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = process.argv[2] || path.join(require('os').tmpdir(), 'actualrhythms-shots');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.mp3': 'audio/mpeg', '.json': 'application/json' };

const VIEWPORTS = [
  ['phone-390x844', 390, 844, 'phone', true],
  ['phone-430x932', 430, 932, 'phone', true],
  ['phone-320x568', 320, 568, 'phone', true],
  ['phone-land-844x390', 844, 390, 'phone-landscape', true],
  ['phone-land-932x430', 932, 430, 'phone-landscape', true],
  ['ipad-768x1024', 768, 1024, 'medium', true],
  ['ipad-834x1194', 834, 1194, 'medium', true],
  ['ipad-land-1024x768', 1024, 768, 'wide', true],
  ['ipad-land-1194x834', 1194, 834, 'wide', true],
  ['split-view-678x1024', 678, 1024, 'medium', true],
  ['split-view-507x1024', 507, 1024, 'phone', true],
  ['laptop-1440x900', 1440, 900, 'wide', false],
];

let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.log('  FAIL', msg); } return ok; };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      const f = path.join(ROOT, u === '/' ? 'index.html' : u);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    }).listen(0, () => resolve(srv));
  });
}

async function newPage(browser, base, w, h, touch, settings) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') p.errors.push(m.text()); });
  await p.addInitScript((s) => localStorage.setItem('rr.settings', JSON.stringify(s)), Object.assign({ v: 2 }, settings || {}));
  await p.goto(base);
  await p.waitForSelector('#score svg');
  await p.evaluate(() => document.fonts && document.fonts.ready);
  await p.waitForTimeout(300);
  return p;
}

const box = (p, sel) => p.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const overlap = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

// tap every onset of both passes through the pad (optionally skipping some), using the page's own audio clock
async function performTaps(p, { lateMs = 0, skipFirst = 0 } = {}) {
  return p.evaluate(async ({ lateMs, skipFirst }) => {
    const R = window.actualRhythms;
    while (!R.run) await new Promise((r) => setTimeout(r, 5));
    const run = R.run; const c = R.audio(); const total = R.current.flat.total;
    const on = R.current.flat.events.filter((e) => e.onset).map((e) => e.pos);
    const times = [...on.map((p) => run.t0 + p * run.spt), ...on.map((p) => run.t0 + (p + total) * run.spt)].slice(skipFirst);
    const ts = c.getOutputTimestamp();
    const pad = document.getElementById('pad');
    times.forEach((at) => setTimeout(() => {
      pad.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true, button: 0 }));
    }, ts.performanceTime + (at - ts.contextTime) * 1000 + lateMs - performance.now()));
    return times.length;
  }, { lateMs, skipFirst });
}

(async () => {
  const srv = await serve();
  const base = `http://localhost:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

  // 1. layout, overflow, clipping, overlap, touch targets — at every viewport
  for (const [name, w, h, expect, touch] of VIEWPORTS) {
    console.log(name);
    const p = await newPage(browser, base, w, h, touch, { levels: [2, 3], bars: 2 });
    const info = await p.evaluate(() => ({
      layout: document.documentElement.dataset.layout,
      sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
    }));
    check(info.layout === expect, `layout ${info.layout}, expected ${expect}`);
    check(info.sw <= info.cw, `horizontal overflow ${info.sw} > ${info.cw}`);
    for (const sel of ['.sheet', '#btnPlay', '#btnListen', '#btnNext', '#tempoDown', '#tempoUp', '#pad']) {
      const b = await box(p, sel);
      check(b.x >= 0 && b.x + b.w <= w + 0.5, `${sel} clipped horizontally (${Math.round(b.x)}..${Math.round(b.x + b.w)})`);
      if (touch && sel.startsWith('#') && sel !== '#pad') check(b.h >= 44 && b.w >= 44, `${sel} touch target ${Math.round(b.w)}x${Math.round(b.h)}`);
    }
    const sheet = await box(p, '.sheet'); const pad = await box(p, '#pad'); const ctl = await box(p, '.controls');
    check(!overlap(sheet, pad) && !overlap(ctl, pad) && !overlap(sheet, ctl), 'score, controls and pad overlap');
    if (expect === 'phone-landscape') {
      check(pad.x > sheet.x + sheet.w, 'landscape: pad is not to the right of the score');
      check(pad.y + Math.min(pad.h, 160) <= h && ctl.y + ctl.h <= h, 'landscape: controls or pad below the fold');
      check(await p.$eval('.pad-label .short', (e) => getComputedStyle(e).display !== 'none'), 'landscape pad label should read "Tap"');
      const up = await box(p, '#tempoUp');
      check(up.x + up.w <= pad.x - 4, `landscape: tempo controls run under the Tap pad (${Math.round(up.x + up.w)} > ${Math.round(pad.x)})`);
    } else check(await p.$eval('.pad-label .long', (e) => getComputedStyle(e).display !== 'none'), 'pad label should read "Tap the rhythm"');
    const svgW = await p.$eval('#score svg', (s) => s.getBoundingClientRect().width);
    const hostW = await p.$eval('#score', (s) => s.clientWidth);
    check(Math.abs(svgW - hostW) <= 1, `score svg ${svgW} not rendered at its container width ${hostW}`);
    check(p.errors.length === 0, 'page errors: ' + p.errors.join(' | '));
    await p.screenshot({ path: path.join(OUT, name + '.png') });
    await p.context().close();
  }

  // 2. dense advanced 4-bar excerpts stay readable on a phone: wrap at barlines, minimum width per note
  {
    console.log('dense 4-bar on phone');
    const p = await newPage(browser, base, 390, 844, true, { levels: [5], bars: 4 });
    let worst = Infinity;
    for (let i = 0; i < 40; i++) {
      const r = await p.evaluate(() => {
        const L = window.actualRhythms.layout; const ms = window.actualRhythms.current.item.r;
        let min = Infinity;
        L.rows.forEach((row) => row.segs.forEach((sg, k) => {
          const n = sg.pts.length - 1; const width = (sg.pts[n][1] - sg.pts[0][1]) * L.s;
          if (n > 1) min = Math.min(min, width / (n - 1));
        }));
        return { min, rows: L.rows.length, bars: ms.length };
      });
      worst = Math.min(worst, r.min);
      await p.keyboard.press('ArrowRight');
    }
    check(worst >= 14, `notes closer than 14px on a phone (${worst.toFixed(1)})`);
    console.log(`  closest note spacing over 40 dense excerpts: ${worst.toFixed(1)}px`);
    await p.screenshot({ path: path.join(OUT, 'dense-4bar-phone.png'), fullPage: true });
    await p.context().close();
  }

  // 2b. nothing is drawn outside the score's own width, even at 320px with every level and both lengths
  {
    console.log('notation fits at 320px');
    const p = await newPage(browser, base, 320, 640, true, { levels: [1, 2, 3, 4, 5], bars: 2 });
    let bad = 0; let scrolled = 0;
    for (const bars of [2, 4]) {
      if (bars === 4) await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('rr.settings')); s.bars = 4; localStorage.setItem('rr.settings', JSON.stringify(s)); });
      if (bars === 4) { await p.reload(); await p.waitForSelector('#score svg'); }
      for (let i = 0; i < 30; i++) {
        const r = await p.evaluate(() => {
          const svg = document.querySelector('#score svg'); const vb = svg.viewBox.baseVal; const bb = svg.getBBox();
          return { over: bb.x + bb.width - (vb && vb.width ? vb.width : svg.width.baseVal.value), left: bb.x };
        });
        if (r.over > 1 || r.left < -1) bad++;
        if (await p.$eval('.score-wrap', (e) => e.scrollWidth > e.clientWidth + 1)) scrolled++;
        await p.keyboard.press('ArrowRight');
      }
    }
    check(bad === 0, `${bad} excerpts drew outside the score at 320px`);
    console.log(`  ${scrolled} of 60 needed a sideways-scrolling score; the page itself never scrolls sideways`);
    check(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'page overflow at 320px');
    await p.context().close();
  }

  // 3. attempt, scoring, stability, rotation, resize-during-run
  {
    console.log('attempt + rotation (phone portrait -> landscape)');
    const p = await newPage(browser, base, 390, 844, true, { levels: [2], bars: 2, tempo: 90 });
    const id = () => p.evaluate(() => window.actualRhythms.current.item.r.join('|'));
    const before = { sheet: await box(p, '.sheet'), pad: await box(p, '#pad') };
    await p.click('#btnPlay');
    const svgBefore = await p.evaluate(() => { window.__svg = document.querySelector('#score svg'); return true; });
    const n = await performTaps(p, { lateMs: 10 });
    // resize mid-attempt: the score must not re-render under the running audio clock
    await p.waitForTimeout(400);
    await p.setViewportSize({ width: 430, height: 932 });
    await p.waitForTimeout(300);
    check(await p.evaluate(() => document.querySelector('#score svg') === window.__svg), 'score re-rendered during an attempt');
    await p.setViewportSize({ width: 390, height: 844 });
    await p.waitForFunction(() => window.actualRhythms.result, null, { timeout: 30000 });
    const res = await p.evaluate(() => ({ pct: window.actualRhythms.result.pct, cnt: window.actualRhythms.result.cnt, extra: window.actualRhythms.result.extra, onsets: window.actualRhythms.result.onsets.length }));
    console.log(`  ${n} taps -> ${JSON.stringify(res)}`);
    check(res.pct >= 90 && res.cnt.miss === 0 && res.extra === 0, 'perfect-ish taps should score >= 90% with no misses or extras');
    check(res.onsets === n, `expected ${n} onsets across two passes, got ${res.onsets}`);
    const after = { sheet: await box(p, '.sheet'), pad: await box(p, '#pad') };
    check(Math.abs(after.pad.y - before.pad.y) < 1 && Math.abs(after.sheet.h - before.sheet.h) < 1, 'score or pad moved when results appeared');
    check(await p.isVisible('.result .bigscore'), 'result not shown');
    const ex = await id();
    await p.setViewportSize({ width: 844, height: 390 });
    await p.waitForTimeout(400);
    check(await p.evaluate(() => document.documentElement.dataset.layout) === 'phone-landscape', 'rotation did not switch layout');
    check(await id() === ex, 'rotation changed the excerpt');
    check(await p.evaluate(() => !!window.actualRhythms.result), 'rotation lost the result');
    check(await p.$$eval('#score svg circle', (c) => c.length) === n, 'tap dots missing after rotation');
    check(await p.$$eval('#score svg g:last-child line', (l) => l.length) === res.onsets, 'note tick marks missing after rotation');
    await p.screenshot({ path: path.join(OUT, 'result-phone-landscape.png') });
    // one tap = one recorded tap (no duplicated listeners after layout changes)
    await p.click('#btnPlay');
    await p.waitForFunction(() => window.actualRhythms.run);
    await p.locator('#pad').dispatchEvent('pointerdown', { pointerType: 'touch', button: 0 });
    check(await p.evaluate(() => window.actualRhythms.run.taps.length) === 1, 'a single tap was recorded more than once');
    await p.keyboard.press('Escape');
    check(p.errors.length === 0, 'page errors: ' + p.errors.join(' | '));
    await p.context().close();
  }

  // 4. settings: dialog semantics, focus trap, Escape, focus restore — phone sheet and iPad slide-over; sidebar on wide
  for (const [w, h, label] of [[390, 844, 'bottom sheet'], [844, 390, 'full-screen'], [834, 1194, 'slide-over']]) {
    console.log('settings ' + label);
    const p = await newPage(browser, base, w, h, true, {});
    await p.focus('#btnSettings');
    await p.keyboard.press('Enter');
    await p.waitForTimeout(300);
    check(await p.$eval('#settings', (e) => e.getAttribute('role') === 'dialog' && e.getAttribute('aria-modal') === 'true'), 'settings is not a modal dialog');
    check(await p.evaluate(() => document.activeElement.id) === 'btnCloseSettings', 'focus did not move into the dialog');
    check(await p.$eval('.practice', (e) => e.inert), 'background not inert while dialog is open');
    const sb = await box(p, '#settings');
    check(sb.y >= -1 && sb.y + sb.h <= h + 1 && sb.x >= -1 && sb.x + sb.w <= w + 1, 'settings panel off screen');
    let inside = true;
    for (let i = 0; i < 40; i++) { await p.keyboard.press('Tab'); inside = inside && await p.evaluate(() => !!document.activeElement.closest('#settings')); }
    check(inside, 'focus escaped the settings dialog');
    // multiselect survives: turn on level 3 too
    const before = await p.evaluate(() => JSON.parse(localStorage.getItem('rr.settings')).levels || [1, 2]);
    await p.click('#levels button:nth-child(3)');
    const levels = await p.evaluate(() => JSON.parse(localStorage.getItem('rr.settings')).levels);
    check(levels.length === before.length + 1, `difficulty should stay multi-select (${JSON.stringify(levels)})`);
    await p.click('#btnMoreMeters');
    check(await p.isVisible('#metersMore'), 'More time signatures did not open');
    check(await p.$$eval('#settings [data-key="meters"]', (b) => b.length) === 10, 'all ten time signatures should be available');
    const body = await p.$eval('.settings-body', (e) => ({ sh: e.scrollHeight, ch: e.clientHeight, oy: getComputedStyle(e).overflowY }));
    check(body.oy === 'auto', 'settings body cannot scroll');
    await p.screenshot({ path: path.join(OUT, `settings-${label.replace(/ /g, '-')}.png`) });
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
    check(await p.$eval('#settings', (e) => !e.classList.contains('open') && getComputedStyle(e).visibility === 'hidden'), 'Escape did not close settings');
    check(await p.evaluate(() => document.activeElement.id) === 'btnSettings', 'focus not restored to the Settings button');
    check(p.errors.length === 0, 'page errors: ' + p.errors.join(' | '));
    await p.context().close();
  }
  {
    console.log('settings sidebar (wide)');
    const p = await newPage(browser, base, 1194, 834, true, {});
    check(await p.isHidden('#btnSettings'), 'Settings button should be hidden with a sidebar');
    check(await p.$eval('#settings', (e) => !e.getAttribute('role') && getComputedStyle(e).visibility === 'visible'), 'sidebar should be visible and not a dialog');
    // shortcuts must not fire from inside settings
    const ex = await p.evaluate(() => window.actualRhythms.current.item.r.join('|'));
    await p.focus('#levels button:nth-child(1)');
    await p.keyboard.press('ArrowRight');
    check(await p.evaluate(() => window.actualRhythms.current.item.r.join('|')) === ex, 'arrow shortcut fired inside settings');
    await p.context().close();
  }

  // 5. Listen (piano samples), Next/previous, tempo stepper, source visibility, calibration
  {
    console.log('listen, navigation, tempo, source, calibration');
    const p = await newPage(browser, base, 1440, 900, false, { tempo: 120 });
    await p.click('#btnListen');
    await p.waitForFunction(() => window.actualRhythms.phase === 'listening', null, { timeout: 30000 });
    check(true, '');
    await p.keyboard.press('Escape');
    const a = await p.evaluate(() => window.actualRhythms.current.item.r.join('|'));
    await p.keyboard.press('ArrowRight'); const b = await p.evaluate(() => window.actualRhythms.current.item.r.join('|'));
    await p.keyboard.press('ArrowLeft'); const a2 = await p.evaluate(() => window.actualRhythms.current.item.r.join('|'));
    check(a !== b && a === a2, 'arrow keys do not step forward and back');
    await p.click('#tempoUp'); await p.click('#tempoUp');
    check(await p.inputValue('#tempo') === '124', 'tempo stepper');
    await p.fill('#tempo', '73'); await p.press('#tempo', 'Enter'); await p.click('.wordmark');
    check(await p.inputValue('#tempo') === '74', 'typed tempo should round to the 2-BPM grid');
    check(await p.isVisible('#outcome .source h3'), 'source should be visible by default');
    await p.click('#advanced summary');
    await p.click('#hideSource');
    check(await p.isVisible('#outcome .locked summary') && !(await p.isVisible('#outcome .source h3')), 'hidden source should show "Play to discover the music"');
    await p.click('#hideSource');
    // calibration with taps on the calibration pad, 20 ms late
    await p.click('#btnCalib');
    check(await p.isVisible('#calibPad'), 'calibration tap target missing');
    await p.evaluate(() => {
      const c = window.actualRhythms.audio(); const ts = c.getOutputTimestamp(); const beat = 60 / 90;
      const t0 = c.currentTime + 0.4 - 0.02;
      for (let i = 4; i < 16; i++) setTimeout(() => document.getElementById('calibPad').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })),
        ts.performanceTime + (t0 + i * beat + 0.02 - ts.contextTime) * 1000 - performance.now());
    });
    await p.waitForFunction(() => /Offset set to|Only/.test(document.getElementById('calibMsg').textContent), null, { timeout: 20000 });
    console.log('  ' + await p.textContent('#calibMsg'));
    check(/Offset set to/.test(await p.textContent('#calibMsg')), 'calibration did not measure an offset');
    check(p.errors.length === 0, 'page errors: ' + p.errors.join(' | '));
    await p.screenshot({ path: path.join(OUT, 'laptop-advanced.png') });
    await p.context().close();
  }

  // 5b. corpus browser: opens from the settings summary, lists every rhythm, search/sort/filter, tap to practise
  for (const [w, h, touch, label] of [[1440, 900, false, 'laptop'], [390, 844, true, 'phone']]) {
    console.log('corpus browser ' + label);
    const p = await newPage(browser, base, w, h, touch, { levels: [2], bars: 2 });
    if (label === 'phone') { await p.click('#btnSettings'); await p.waitForTimeout(300); }
    await p.click('#pool');
    await p.waitForSelector('#corpus:not([hidden]) .c-row');
    const total = await p.evaluate(() => window.RHYTHM_DATA.rhythms.length);
    const count = await p.textContent('#corpusCount');
    check(count.startsWith(total.toLocaleString('en-US') + ' rhythms in the corpus'), `corpus should list all ${total} rhythms: "${count}"`);
    const rows = await p.$$eval('.c-row', (r) => r.length);
    check(rows > 3 && rows < 60, `only visible rows should be in the DOM (${rows})`);
    check(await p.$$eval('.c-row .c-thumb svg', (s) => s.length) === rows, 'every row needs a notation thumbnail');
    check(await p.evaluate(() => document.querySelector('.app').inert), 'page behind the corpus should be inert');
    await p.$eval('#corpusScroll', (e) => { e.scrollTop = 112 * 5000; });
    await p.waitForTimeout(200);
    check(await p.$eval('.c-row', (r) => Number(r.dataset.i) > 4000), 'scrolling deep should render deep rows');
    await p.fill('#corpusSearch', 'rollins');
    await p.waitForTimeout(400);
    const hits = await p.textContent('#corpusCount');
    check(/^[\d,]+ rhythms? for/.test(hits) && !hits.startsWith('0 '), `search should find Sonny Rollins solos: "${hits}"`);
    await p.click('#corpusOnly');
    await p.waitForTimeout(300);
    check(/matching/.test(await p.textContent('#corpusCount')), 'matching-only switch');
    await p.fill('#corpusSearch', '');
    await p.click('#corpusOnly');
    await p.selectOption('#corpusSort', 'hard');
    await p.waitForTimeout(300);
    check(await p.$eval('.c-row .chip:nth-child(2)', (c) => c.textContent) === 'Level 5', 'hardest-first sort');
    await p.screenshot({ path: path.join(OUT, `corpus-${label}.png`) });
    const pick = await p.$eval('.c-row', (r) => r.textContent.replace(/\s+/g, ' '));
    await p.click('.c-row');
    await p.waitForTimeout(300);
    check(await p.isHidden('#corpus'), 'choosing a rhythm should close the corpus');
    check(await p.evaluate(() => window.actualRhythms.current.item.l) === 5, 'the chosen rhythm should load for practice');
    await p.click('#poolNote');
    await p.waitForSelector('#corpus:not([hidden])');
    check(/matching/.test(await p.textContent('#corpusCount')), 'the matching note should open the corpus filtered to matching rhythms');
    await p.keyboard.press('Escape');
    check(await p.isHidden('#corpus'), 'Escape should close the corpus');
    check(await p.evaluate(() => document.activeElement.id) === 'poolNote', 'focus should return to what opened the corpus');
    check(p.errors.length === 0, 'page errors: ' + p.errors.join(' | '));
    await p.context().close();
  }

  // 6. touch devices: the page is locked to the screen (nothing to scroll); inner panels scroll instead
  for (const dev of ['iPhone 15 Pro', 'iPhone 15 Pro landscape', 'iPad Pro 11', 'iPad Pro 11 landscape']) {
    for (const bars of [2, 4]) {
      console.log(`locked: ${dev}, ${bars} bars`);
      const { devices } = require('playwright');
      const ctx = await browser.newContext(devices[dev]);
      const p = await ctx.newPage();
      const errs = []; p.on('pageerror', (e) => errs.push(e.message));
      await p.addInitScript((b) => localStorage.setItem('rr.settings', JSON.stringify({ v: 2, levels: b === 4 ? [5] : [2, 3], bars: b })), bars);
      await p.goto(base); await p.waitForSelector('#score svg'); await p.waitForTimeout(300);
      const vh = await p.evaluate(() => window.innerHeight);
      const m = await p.evaluate(() => ({ sh: document.scrollingElement.scrollHeight, ch: document.scrollingElement.clientHeight }));
      check(m.sh <= m.ch + 1, `page can scroll (${m.sh} > ${m.ch})`);
      for (const sel of ['.sheet', '.controls', '#pad']) {
        const b = await box(p, sel);
        check(b.y >= 0 && b.y + Math.min(b.h, 200) <= vh + 1, `${sel} not on screen (top ${Math.round(b.y)}, height ${Math.round(b.h)}, viewport ${vh})`);
      }
      if (dev.includes('iPhone') && dev.includes('landscape')) {
        const up = await box(p, '#tempoUp'); const pd = await box(p, '#pad');
        check(up.x + up.w <= pd.x - 4, `tempo controls run under the Tap pad (${Math.round(up.x + up.w)} > ${Math.round(pd.x)})`);
      }
      const out = await box(p, '#outcome');
      check(out.h >= 40 && out.y + 40 <= vh, `results/source area not visible (height ${Math.round(out.h)})`);
      if (bars === 4 && dev === 'iPhone 15 Pro') {
        const s = await p.$eval('.sheet', (e) => ({ sh: e.scrollHeight, ch: e.clientHeight }));
        console.log(`  dense 4 bars: score box ${s.ch}px showing ${s.sh}px of notation${s.sh > s.ch ? ' (scrolls inside)' : ''}`);
      }
      if (bars === 2 && dev === 'iPhone 15 Pro landscape') {
        await p.click('#btnPlay');
        await performTaps(p);
        await p.waitForFunction(() => window.actualRhythms.result, null, { timeout: 30000 });
        await p.waitForTimeout(200);
        check(await p.evaluate(() => document.scrollingElement.scrollHeight <= document.scrollingElement.clientHeight + 1), 'page scrolls after results');
        check(await p.isVisible('.result .bigscore'), 'score not visible in landscape results');
        await p.screenshot({ path: path.join(OUT, 'locked-iphone-landscape-result.png') });
      }
      await p.screenshot({ path: path.join(OUT, `locked-${dev.replace(/ /g, '-')}-${bars}bars.png`) });
      check(errs.length === 0, 'page errors: ' + errs.join(' | '));
      await ctx.close();
    }
  }

  await browser.close();
  srv.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed', `\nscreenshots: ${OUT}`);
  process.exit(failures ? 1 : 0);
})();
