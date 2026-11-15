// Slide 2: Jan. Step 0 the descent, then one block per step: title, facts row, farm count, the notebook (its rows one
// after another), the open 2027 row (one pulse).
import { cropName } from '../crops.js';

const CSS = `
.s-mariusz .nb { position: absolute; left: 1240px; top: 250px; width: 560px; height: 600px; padding: 30px 36px 0 84px;
  background-color: #f3eee1; color: #1f2a44; border-radius: 3px; box-shadow: 0 14px 34px rgba(0, 0, 0, .35);
  background-image: linear-gradient(90deg, transparent 62px, rgba(200, 70, 70, .6) 62px, rgba(200, 70, 70, .6) 64px, transparent 64px),
    repeating-linear-gradient(180deg, transparent 0, transparent 77px, rgba(90, 130, 190, .35) 77px, rgba(90, 130, 190, .35) 78px);
  background-position: 0 0, 0 24px; transform: translateX(80px); }
.s-mariusz .nb[data-from].on { transform: none; }
.s-mariusz .nb .r { display: flex; align-items: baseline; height: 78px; padding-bottom: 6px; font-family: var(--hand); font-weight: 500;
  font-size: 50px; line-height: 1; white-space: nowrap; align-items: flex-end; }
.s-mariusz .nb .r b { font-weight: 500; width: 128px; flex: none; }
.s-mariusz .nb .r.open { color: #b3361f; }
/* Caveat's "?" draws about 11 px past its own box on the right. During the pulse Chrome puts it on a GPU layer cut to
   that box, which hid the right half; the padding makes the box hold the whole glyph, the margin keeps the layout. */
.s-mariusz .nb .r.open i { font-style: normal; font-size: 64px; display: inline-block; padding: 0 16px 6px 0; margin: 0 -16px -6px 0;
  transform-origin: 50% 70%; }
.s-mariusz .nb .r.open.pulse i { animation: s-mariusz-pulse .9s ease-in-out .6s 1; }
@keyframes s-mariusz-pulse { 0%, 100% { transform: scale(1); } 40% { transform: scale(1.45); } }
.s-mariusz .nb .r[data-from] { transition: opacity .5s ease; transform: none; }
/* The notebook rows are written one after another once the card is in. */
.s-mariusz .nb .r.past[data-from].on { transition-delay: calc(.5s + var(--i) * .3s); }
.s-mariusz .scale { margin-top: 30px; font-size: 30px; line-height: 1.3; color: #d5dbe3; }
.s-mariusz .scale b { font-weight: 600; color: var(--text); }
.s-mariusz .scale small { display: block; margin-top: 6px; font-size: var(--fs-foot); color: var(--muted); }
`;

const fmtCoord = (v, pos, neg) => `${(Math.round(Math.abs(v) * 1e4 + 1e-6) / 1e4).toFixed(4)}° ${v >= 0 ? pos : neg}`;

export default {
  // One key press: the descent lands on the parcel (0), then title (1), facts (2), farm count (3), notebook with its
  // rows (4), the open 2027 row (5). The stage plays the steps in a row.
  steps: 5,
  stepMs: [700, 900, 700, 1000, 2400, 1500],   // per step; 4 is the card plus five rows 0.3 s apart
  mount(ctx) {
    if (!document.getElementById('s-mariusz-css')) {
      const st = document.createElement('style'); st.id = 's-mariusz-css'; st.textContent = CSS; document.head.append(st);
    }
    const { field, notebook } = ctx.data;
    const { FARMS_WORLD } = ctx.constants;
    ctx.el.classList.add('s-mariusz');
    const rows = notebook.map((n, i) => `<div class="r past" data-from="4" style="--i:${i}"><b>${n.year}</b>${cropName(n.crop)}</div>`).join('');
    ctx.el.innerHTML = `
      <div class="copy">
        <div class="eyebrow" data-from="1">The problem</div>
        <div class="title lines" data-from="1">Originally,<br>Jan has no data<br>to back his decisions</div>
        <div class="facts" data-from="2">
          <span><small>Location</small>Uzarzewo, near Poznań</span>
          <span><small>Coordinates</small>${fmtCoord(field.centroid.lat, 'N', 'S')}, ${fmtCoord(field.centroid.lon, 'E', 'W')}</span>
          <span><small>Area</small>${field.areaHa.toFixed(1)} ha</span>
        </div>
        <div class="scale" data-from="3"><b>${FARMS_WORLD.lead}</b> ${FARMS_WORLD.rest}<small>Source: ${FARMS_WORLD.source}</small></div>
      </div>
      <div class="nb" data-from="4">
        ${rows}
        <div class="r open" data-from="5"><b>${notebook[notebook.length - 1].year + 1}</b><i>?</i></div>
      </div>`;
    this.open = ctx.el.querySelector('.r.open');
  },
  enter(step, ctx) {
    ctx.scene.goTo('field', { instant: ctx.instant });
    ctx.setWash(step >= 1 ? 1 : 0, step >= 4 ? 0.6 : 0);
    const o = this.open;
    o.classList.remove('pulse');
    if (step >= 5 && !ctx.instant) { void o.offsetWidth; o.classList.add('pulse'); }
  },
  final(ctx) { this.enter(this.steps, ctx); },
};
