// Slide 4: the engine, as a replay on the field. A year counter runs from the first to the last year of the weather
// record; the field shows the crop of each year of the rotation and turns red in the drought years. First Mariusz's
// rotation, then the best one for the soil goal, each ending in its two scores. Only data/field.json is used: the
// drought flags per year, the rotations' crops and their scores. No per-year result of a rotation is drawn (the
// export has none). One key press plays the whole slide (stage.js).
import { cropName } from '../crops.js';

const YEAR_MS = 80;          // an ordinary year in the replay
const DRY_MS = 320;          // a drought year holds longer, so the red reads
const CSS = `
.s4 .replay { position: absolute; left: 1240px; top: 236px; width: 568px; }
.s4 .replay small, .s4 .res small { display: block; font-size: var(--fs-label); font-weight: 500; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
.s4 .year { font-size: 120px; font-weight: 600; letter-spacing: -0.03em; line-height: 1; margin-top: 10px; font-feature-settings: "tnum" 1; }
.s4 .crop { font-size: 34px; margin-top: 12px; min-height: 42px; }
.s4 .dry { font-size: 22px; margin-top: 8px; min-height: 28px; color: var(--risk); font-weight: 500; }
.s4 .res { position: absolute; left: 1240px; width: 568px; padding-top: 18px; border-top: 1px solid var(--hairline); opacity: 0; transform: translateY(12px);
  transition: opacity .5s ease, transform .5s ease; }
.s4 .res.on { opacity: 1; transform: none; }
.s4 .res .rot { font-size: 25px; margin-top: 6px; }
.s4 .res .nums { display: flex; gap: 40px; margin-top: 12px; align-items: baseline; }
.s4 .res .nums b { font-size: 56px; font-weight: 600; letter-spacing: -0.02em; font-feature-settings: "tnum" 1; }
.s4 .res .nums span { font-size: 19px; color: var(--muted); margin-left: 10px; }
.s4 .res.best small, .s4 .res.best .nums b { color: var(--field); }
.s4 .r1 { top: 560px; } .s4 .r2 { top: 760px; }
.s4 .foot { opacity: 0; transition: opacity .5s ease; }
.s4 .foot.on { opacity: 1; }
`;

const cropText = (c) => (c.coverCrop ? `${cropName(c.crop)} + ${cropName(c.coverCrop).toLowerCase()}` : cropName(c.crop));
const rotationText = (r) => r.crops.map(cropText).join(' → ');

/** Mariusz's rotation and the best other one for the soil goal (the app lists them best first). */
function pickRows(data) {
  const ids = data.shownByGoal?.keepSoil;
  if (!Array.isArray(ids) || ids.length === 0) throw new Error('04-engine: shownByGoal.keepSoil is missing');
  const rows = ids.map((id) => {
    const r = data.rotations.find((x) => x.id === id);
    if (!r) throw new Error(`04-engine: rotation "${id}" from shownByGoal.keepSoil is not in rotations`);
    for (const k of ['soilHealth', 'climateResilience']) {
      if (!Number.isFinite(r[k]?.value)) throw new Error(`04-engine: ${id} has no ${k} value`);
    }
    return r;
  });
  const current = rows.filter((r) => r.isCurrent);
  if (current.length !== 1) throw new Error('04-engine: expected exactly one current rotation for the soil goal');
  const best = rows.find((r) => !r.isCurrent);
  if (!best) throw new Error('04-engine: no rotation besides the current one for the soil goal');
  return [current[0], best];
}

export default {
  // (1) replay of Mariusz's rotation, then its scores; (2) replay of the best one, then its scores; (3) the caption.
  steps: 3,
  _step: 0,
  get stepMs() { return this._step === 1 || this._step === 2 ? this.runMs + 700 : 700; },

  mount(ctx) {
    const { data } = ctx;
    const years = data.climate.yearly;
    if (years.length !== data.climate.years) throw new Error('04-engine: climate.yearly does not match climate.years');
    this.years = years;
    this.first = data.climate.firstYear; this.last = data.climate.lastYear;
    this.dryCount = years.filter((y) => y.drought).length;
    this.runMs = years.reduce((t, y) => t + (y.drought ? DRY_MS : YEAR_MS), 0);
    this.rows = pickRows(data);

    if (!document.getElementById('s4-css')) {
      const st = document.createElement('style'); st.id = 's4-css'; st.textContent = CSS; document.head.append(st);
    }
    ctx.el.classList.add('s4');
    const res = (r, i) => `
      <div class="res r${i + 1}${r.isCurrent ? '' : ' best'}">
        <small>${r.isCurrent ? 'Jan today' : 'Best for the soil goal'}</small>
        <div class="rot">${rotationText(r)}</div>
        <div class="nums"><div><b>${r.soilHealth.value}</b><span>soil health</span></div><div><b>${r.climateResilience.value}</b><span>climate resilience</span></div></div>
      </div>`;
    ctx.el.innerHTML = `
      <div class="copy">
        <div class="eyebrow">The engine</div>
        <div class="title">Every rotation is tested against ${data.climate.years} years</div>
      </div>
      <div class="replay">
        <small class="who"></small>
        <div class="year"></div>
        <div class="crop"></div>
        <div class="dry"></div>
      </div>
      ${this.rows.map(res).join('')}
      <div class="foot">Scores out of 100. Soil health and climate resilience come first. Income is a replay of past years at today's prices, not a forecast.</div>`;
    this.el = ctx.el;
    this.scene = ctx.scene;
    this.q = (s) => ctx.el.querySelector(s);
  },

  /** The replay block at the end of the record: the years and how many were dry. */
  showSummary() {
    this.q('.who').textContent = 'Weather replayed';
    this.q('.year').textContent = `${this.first}–${this.last}`;
    this.q('.year').style.fontSize = '84px';
    this.q('.crop').textContent = `${this.years.length} years`;
    this.q('.dry').textContent = `${this.dryCount} drought years`;
  },

  stopRun() { cancelAnimationFrame(this.raf); this.raf = 0; this.scene.fieldTint = null; this.scene.fieldFill = 0.16; },

  /** Replays the record with rotation r; calls done() at the end. Elapsed time, not frames. */
  run(r, done) {
    this.stopRun();
    const t0 = performance.now();
    this.q('.who').textContent = r.isCurrent ? 'Jan today' : 'Best for the soil goal';
    this.q('.year').style.fontSize = '';
    this.scene.fieldFill = 0.34;
    const risk = getComputedStyle(document.documentElement).getPropertyValue('--risk').trim();
    const tick = (now) => {
      let t = now - t0, i = 0;
      while (i < this.years.length - 1 && t >= (this.years[i].drought ? DRY_MS : YEAR_MS)) { t -= this.years[i].drought ? DRY_MS : YEAR_MS; i++; }
      const y = this.years[i];
      this.q('.year').textContent = String(y.year);
      this.q('.crop').textContent = cropText(r.crops[(y.year - this.first) % r.crops.length]);
      this.q('.dry').textContent = y.drought ? 'Drought year' : '';
      this.scene.fieldTint = y.drought ? risk : null;
      if (now - t0 < this.runMs) this.raf = requestAnimationFrame(tick);
      else { this.stopRun(); this.showSummary(); done(); }
    };
    this.raf = requestAnimationFrame(tick);
  },

  enter(step, ctx) {
    const prev = this._step;
    this._step = step;
    ctx.scene.goTo('field', { instant: ctx.instant });
    ctx.setWash(1, step >= 1 ? 0.75 : 0);
    const [r1, r2] = [this.q('.r1'), this.q('.r2')];
    const animate = !ctx.instant && step === prev + 1;
    this.stopRun();
    if (step === 0) { r1.classList.remove('on'); r2.classList.remove('on'); this.q('.replay').style.opacity = '0'; }
    else this.q('.replay').style.opacity = '1';
    if (step === 1) {
      r2.classList.remove('on');
      if (animate) { r1.classList.remove('on'); this.run(this.rows[0], () => r1.classList.add('on')); }
      else { this.showSummary(); r1.classList.add('on'); }
    }
    if (step >= 2) {
      r1.classList.add('on');
      if (step === 2 && animate) { r2.classList.remove('on'); this.run(this.rows[1], () => r2.classList.add('on')); }
      else { this.showSummary(); r2.classList.add('on'); }
    }
    this.q('.foot').classList.toggle('on', step >= 3);
  },

  final(ctx) { this.enter(this.steps, ctx); },
};
