// Slide 5: similar regions. The camera rises to the Europe view; the field is a green dot with a slow ring, every case
// in twins.cases is an amber dot at its place, numbered in table order and joined to the field by a thin line.
// Steps: 0 the rise, 1 title, 2 the climate-twins row, 3 the CropShifter row, 4 dots and lines in order of similarity,
// 5 the table, 6 the footnote.
const NS = 'http://www.w3.org/2000/svg';
const WORDS = { 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine', 10: 'Ten', 11: 'Eleven', 12: 'Twelve' };
const STAGGER = 0.12; // seconds between dots at step 2
const LABEL_GAP = 15; // px from the dot centre to the number

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shortName = (r) => r.split('(')[0].trim();

const CSS = `
.slide[data-name="regions"] .map { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
.slide[data-name="regions"] .mark { opacity: 0; transition: opacity .5s ease; }
.slide[data-name="regions"] .mark.on { opacity: 1; }
.slide[data-name="regions"] .mark line { stroke: var(--twin); stroke-width: 1.5; stroke-opacity: .7; }
.slide[data-name="regions"] .mark circle { fill: var(--twin); }
.slide[data-name="regions"] .mark text { fill: var(--twin); font-size: 17px; font-weight: 600; text-anchor: middle; dominant-baseline: central; }
.slide[data-name="regions"] .home circle.dot { fill: var(--field); }
.slide[data-name="regions"] .home circle.ring { fill: none; stroke: var(--field); stroke-width: 2; transform-box: fill-box; transform-origin: center; }
.slide[data-name="regions"] .home.loop circle.ring { animation: regions-ring 3.2s ease-out infinite; }
@keyframes regions-ring { 0% { transform: scale(1); opacity: .8; } 100% { transform: scale(2.6); opacity: 0; } }
.slide[data-name="regions"] .foot { color: #b4bcc7; }
.slide[data-name="regions"] .lede { margin-top: 24px; }
.slide[data-name="regions"] .eq { margin-top: 34px; padding-top: 20px; border-top: 1px solid var(--hairline); display: grid; grid-template-columns: auto 1fr; column-gap: 24px; row-gap: 12px; align-items: baseline; font-size: 30px; line-height: 1.25; }
.slide[data-name="regions"] .eq small { font-size: var(--fs-label); font-weight: 500; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
.slide[data-name="regions"] .eq .was { color: var(--muted); }
.slide[data-name="regions"] .eq b { font-weight: 600; color: var(--twin); }
.slide[data-name="regions"] .twins { position: absolute; right: var(--margin); top: 196px; width: 572px; }
.slide[data-name="regions"] .twins .row { display: grid; grid-template-columns: 36px 1fr 100px 160px; column-gap: 8px; align-items: baseline; padding: 9px 0; border-top: 1px solid var(--hairline); font-size: 23px; line-height: 1.2; }
.slide[data-name="regions"] .twins .row.head { border-top: 0; padding: 0 0 12px; font-size: 16px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); align-items: end; }
.slide[data-name="regions"] .twins .num { text-align: right; }
.slide[data-name="regions"] .twins .idx { color: var(--twin); font-weight: 600; text-align: left; }
`;

function check(cases) {
  if (!Array.isArray(cases) || cases.length === 0) throw new Error('slide 5: twins.cases is empty');
  const word = WORDS[cases.length];
  if (!word) throw new Error(`slide 5: no word for ${cases.length} regions`);
  if (!cases.every((c) => /winter-rapeseed/.test(c.unit || ''))) throw new Error('slide 5: not every case unit is winter rapeseed');
  const years = new Set(cases.map((c) => c.years));
  if (years.size !== 1 || ![...years][0]) throw new Error('slide 5: cases have different or missing years');
  for (const c of cases) if (!c.place || !Number.isFinite(c.place.lat) || !Number.isFinite(c.place.lon) || !Number.isFinite(c.yieldTPerHa)) throw new Error(`slide 5: case ${c.region} lacks a place or a yield`);
  return { word, years: [...years][0] };
}

export default {
  steps: 6,
  stepMs: [700, 900, 900, 1100, 1900, 900, 700],   // per step; 4 is ten dots 0.12 s apart
  mount(ctx) {
    const cases = ctx.data.twins.cases;
    const { word, years } = check(cases);
    if (!document.getElementById('slide5-style')) {
      const st = document.createElement('style'); st.id = 'slide5-style'; st.textContent = CSS; document.head.append(st);
    }
    const rows = cases.map((c, i) => `
        <div class="row"><span class="idx">${i + 1}</span><span>${esc(shortName(c.region))}</span><span class="num">${esc(c.similarity)}</span><span class="num">${c.yieldTPerHa.toFixed(2)}</span></div>`).join('');
    ctx.el.innerHTML = `
      <svg class="map" viewBox="0 0 1920 1080" aria-hidden="true"></svg>
      <div class="copy">
        <div class="eyebrow" data-from="1">Similar regions</div>
        <div class="title lines" data-from="1">Fields like Jan's<br>across the globe<br>and their past yields</div>
        <div class="eq" data-from="2">
          <small data-from="2">Climate twins</small><span class="was" data-from="2">similar climate</span>
          <small data-from="3">CropShifter</small><span data-from="3">similar climate<br><b>+ same crop + recorded yields</b></span>
        </div>
      </div>
      <div class="twins" data-from="5">
        <div class="row head"><span>#</span><span>Region</span><span class="num">Similarity</span><span class="num">Winter rapeseed, t/ha</span></div>${rows}
      </div>
      <div class="foot" data-from="6">Similarity: our calculation on NASA POWER growing-season rain, root-zone soil moisture, frost days and the year's highest temperature, 2001–2025 (model estimates). Yields: Eurostat, mean of ${esc(years)}. Evidence, not a forecast.</div>`;

    const svg = ctx.el.querySelector('svg.map');
    const mk = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.append(e); return e; };
    const km = (lat, lon) => ctx.scene.toKm(lat, lon);
    const fieldC = ctx.data.field.centroid;
    const marks = cases.map((c) => {
      const g = mk('g', { class: 'mark' }, svg);
      const line = mk('line', {}, g);
      const dot = mk('circle', { r: 6.5 }, g);
      const txt = mk('text', {}, g);
      return { g, line, dot, txt, p: km(c.place.lat, c.place.lon) };
    });
    const home = mk('g', { class: 'home' }, svg);
    mk('circle', { class: 'ring', r: 9 }, home);
    mk('circle', { class: 'dot', r: 8 }, home);
    const homeP = km(fieldC.lat, fieldC.lon);
    this._s = { marks, home, homeP, ring: home.querySelector('.ring') };
    marks.forEach((m, i) => { m.txt.textContent = String(i + 1); });

    ctx.scene.onFrame(() => {
      if (!ctx.el.classList.contains('active')) return;
      const [hx, hy] = ctx.scene.project(homeP);
      home.setAttribute('transform', `translate(${hx.toFixed(1)} ${hy.toFixed(1)})`);
      for (const m of marks) {
        const [x, y] = ctx.scene.project(m.p);
        m.dot.setAttribute('cx', x.toFixed(1)); m.dot.setAttribute('cy', y.toFixed(1));
        m.line.setAttribute('x1', hx.toFixed(1)); m.line.setAttribute('y1', hy.toFixed(1));
        m.line.setAttribute('x2', x.toFixed(1)); m.line.setAttribute('y2', y.toFixed(1));
        // The number sits on the side facing away from the field, so it never lands on another line or on the table.
        const dx = x - hx, dy = y - hy, d = Math.hypot(dx, dy) || 1;
        m.txt.setAttribute('x', (x + (dx / d) * LABEL_GAP).toFixed(1)); m.txt.setAttribute('y', (y + (dy / d) * LABEL_GAP).toFixed(1));
      }
    });
  },
  enter(step, ctx) {
    const s = this._s;
    ctx.scene.goTo('europe', { instant: ctx.instant });
    ctx.setWash(step >= 1 ? 1 : 0, step >= 5 ? 1 : 0);
    s.home.classList.toggle('loop', !ctx.scene.still);
    s.marks.forEach((m, i) => {
      m.g.style.transitionDelay = step >= 4 && !ctx.instant ? `${(0.2 + i * STAGGER).toFixed(2)}s` : '0s';
      m.g.classList.toggle('on', step >= 4);
    });
  },
  final(ctx) { this.enter(this.steps, ctx); },
};
