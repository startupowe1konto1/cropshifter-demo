// Slide 3: the data. Five translucent sheets in the parcel's shape fall onto the field, a numbered table with leader
// lines names them, the facts row counts up. Everything runs on elapsed time (spec section 9).

// Table rows. `ids` are dataset ids that must be in datasetsUsedForThisField.ids; if one is not, mount throws so a stale
// table cannot ship. The parcel outline comes through the map, not the analysis, so that row is checked by
// `field.source`, which names GUGiK whether or not the app registers the land register as a dataset.
const LAYERS = [
  { layer: (c) => `Weather, ${c.firstYear}–${c.lastYear}`, source: 'NASA POWER', ids: ['nasa-power-monthly'] },
  // Root-zone soil wetness (GWETROOT) is one of the POWER monthly parameters.
  { layer: () => 'Root-zone soil wetness', source: 'NASA POWER', ids: ['nasa-power-monthly'] },
  { layer: () => 'Slope', source: 'NASADEM', ids: ['nasadem'] },
  { layer: () => 'Soil', source: 'SoilGrids', ids: ['isric-soilgrids'] },
  { layer: () => 'Parcel boundary', source: 'GUGiK land register', parcelSource: /GUGiK/i },
];

const SHEET_FALL_S = 0.9, SHEET_GAP_S = 0.22, COUNT_S = 0.8, START_Y = 1.9;
const SHEET_LOW = 0.06, SHEET_STEP = 0.14;   // km above the field: bottom sheet and spacing
const LABEL_X = 1340;                        // stage px: left edge of the labels
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);

const CSS = `
/* The first line (number and name) is centred on the leader line; the source sits below it. */
/* The third title line is long; at the deck size it runs into the top data sheet. */
.slide[data-name="data"] .title { font-size: 62px; }
.slide[data-name="data"] .lbl { position: absolute; left: ${1340}px; width: 470px; transform: translateY(-18px); }
.slide[data-name="data"] .lbl .top { display: flex; align-items: center; height: 36px; }
.slide[data-name="data"] .lbl .n { flex: none; width: 40px; font-size: 19px; color: var(--muted); font-feature-settings: "tnum" 1; }
.slide[data-name="data"] .lbl b { font-size: 27px; font-weight: 500; line-height: 1; }
.slide[data-name="data"] .lbl i { display: block; margin-left: 40px; font-style: normal; font-size: 20px; color: var(--muted); margin-top: 2px; }
.slide[data-name="data"] .lbls { opacity: 0; transition: opacity .5s ease; }
.slide[data-name="data"] .lbls.on { opacity: 1; }
.slide[data-name="data"] .facts span { padding: 0 20px; }
.slide[data-name="data"] .facts span:first-child { padding-left: 0; }
.slide[data-name="data"] .facts small { white-space: normal; max-width: 170px; min-height: 2.6em; line-height: 1.3; }
.slide[data-name="data"] .facts b { font-weight: 600; font-size: 40px; letter-spacing: -0.02em; line-height: 1; }
.slide[data-name="data"] .facts b em { font-style: normal; font-weight: 400; font-size: 22px; color: var(--muted); letter-spacing: 0; margin-left: 6px; }
.slide[data-name="data"] svg.leaders { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; opacity: 0; transition: opacity .5s ease .2s; }
`;

function checkIds(data) {
  const used = data.datasetsUsedForThisField?.ids;
  if (!Array.isArray(used)) throw new Error('Slide 3: datasetsUsedForThisField.ids is missing from field.json');
  for (const row of LAYERS) {
    for (const id of row.ids ?? []) {
      if (!used.includes(id)) throw new Error(`Slide 3: table row "${row.source}" needs dataset "${id}", which is not in datasetsUsedForThisField.ids`);
    }
    if (row.parcelSource && !row.parcelSource.test(data.field?.source ?? '')) {
      throw new Error(`Slide 3: parcel boundary row needs field.source to name GUGiK, got "${data.field?.source}"`);
    }
  }
  // NASA count: the used ids joined with datasets.list, provider flag `nasa`.
  const byId = new Map(data.datasets.list.map((d) => [d.id, d]));
  let nasa = 0;
  for (const id of used) {
    const d = byId.get(id);
    if (!d) throw new Error(`Slide 3: dataset "${id}" is in datasetsUsedForThisField.ids but not in datasets.list`);
    if (d.nasa) nasa++;
  }
  if (used.length !== data.datasetsUsedForThisField.total || nasa !== data.datasetsUsedForThisField.nasa) {
    throw new Error(`Slide 3: derived counts (${used.length} datasets, ${nasa} NASA) disagree with datasetsUsedForThisField (${data.datasetsUsedForThisField.total}, ${data.datasetsUsedForThisField.nasa})`);
  }
  return { total: used.length, nasa };
}

export default {
  // One key press plays them all: (0) the camera, (1) title, (2) lede, (3) the sheets fall, (4) their labels appear,
  // (5) the facts count up.
  steps: 5,
  stepMs: [700, 900, 700, 1900, 900, 1000],   // per step; 3 is the fall of five sheets: 0.9 s + 4 x 0.22 s
  mount(ctx) {
    const { data, scene } = ctx;
    const clim = data.climate;
    const counts = checkIds(data);
    const facts = [
      { label: 'Datasets for this field', value: counts.total, unit: '' },
      { label: 'From NASA', value: counts.nasa, unit: '' },
      { label: 'Weather record', value: clim.years, unit: 'years' },
    ];

    if (!document.getElementById('slide3-css')) {
      const s = document.createElement('style'); s.id = 'slide3-css'; s.textContent = CSS; document.head.append(s);
    }
    ctx.el.innerHTML = `
      <div class="copy">
        <div class="eyebrow" data-from="1">The data</div>
        <div class="title lines" data-from="1">Several datasets,<br>cross-analyzed for<br>the best recommendation</div>
        <div class="lede" data-from="2">Open data, read for this exact place.</div>
        <div class="facts" data-from="5">${facts.map((f) => `<span><small>${f.label}</small><b></b></span>`).join('')}</div>
      </div>
      <svg class="leaders" viewBox="0 0 1920 1080" aria-hidden="true"></svg>
      <div class="lbls">
        ${LAYERS.map((r, i) => `<div class="lbl"><div class="top"><span class="n">${String(i + 1).padStart(2, '0')}</span><b>${r.layer(clim)}</b></div><i>${r.source}</i></div>`).join('')}
      </div>`;

    const leaders = ctx.el.querySelector('svg.leaders');
    const lblBox = ctx.el.querySelector('.lbls');
    const lbls = [...lblBox.querySelectorAll('.lbl')];
    // Without WebGL the labels stand as a plain list on the right.
    lbls.forEach((l, i) => { l.style.top = `${300 + i * 120}px`; });
    const factEls = [...ctx.el.querySelectorAll('.facts b')];
    const setFacts = (p) => factEls.forEach((b, i) => {
      b.textContent = String(Math.round(facts[i].value * p));
      if (facts[i].unit) b.insertAdjacentHTML('beforeend', `<em>${facts[i].unit}</em>`);
    });
    setFacts(0);

    // State, all on elapsed time. fallAt / countAt are performance.now() stamps (-1e9 = long finished).
    const st = this.st = { step: 0, fallAt: null, countAt: null, raf: 0 };
    const countLoop = () => {
      st.raf = 0;
      if (st.countAt === null) return;
      const p = clamp01((performance.now() - st.countAt) / (COUNT_S * 1000));
      setFacts(easeOut(p));
      if (p < 1) st.raf = requestAnimationFrame(countLoop);
    };
    st.startCount = (instant) => {
      if (instant) { st.countAt = -1e9; cancelAnimationFrame(st.raf); st.raf = 0; setFacts(1); return; }
      if (st.countAt !== null) return;            // idempotent: already counting or done
      st.countAt = performance.now();
      st.raf = requestAnimationFrame(countLoop);
    };
    st.resetCount = () => { st.countAt = null; cancelAnimationFrame(st.raf); st.raf = 0; setFacts(0); };

    if (!scene.available) { leaders.style.display = 'none'; return; }

    // Sheets: the parcel's own shape, hovering as a stack.
    const { THREE } = scene;
    const color = getComputedStyle(document.documentElement).getPropertyValue('--data').trim();
    const shapeGeo = new THREE.ShapeGeometry(new THREE.Shape(scene.fieldRing.map((p) => new THREE.Vector2(p.x, -p.z))));
    const edgeGeo = new THREE.BufferGeometry().setFromPoints(scene.fieldRing.map((p) => new THREE.Vector3(p.x, 0, p.z)));
    const sheets = LAYERS.map((_, i) => {
      const group = new THREE.Group();
      const fillMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const fill = new THREE.Mesh(shapeGeo, fillMat);
      fill.rotation.x = -Math.PI / 2;
      const edgeMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false });
      const edge = new THREE.Line(edgeGeo, edgeMat);
      fill.renderOrder = edge.renderOrder = 10 - i;
      group.add(fill, edge);
      group.visible = false;
      scene.ground.add(group);
      return { group, fillMat, edgeMat, rest: SHEET_LOW + (LAYERS.length - 1 - i) * SHEET_STEP, y: START_Y };
    });
    const FILL_OPACITY = 0.26;
    const v = new THREE.Vector3();

    scene.onFrame(({ now }) => {
      // Visible only while this slide is active and its first step is reached. stage.js puts `.active` on ctx.el
      // before it calls enter(), so this is the slide's own state: no frame counts, no view check.
      const live = ctx.el.classList.contains('active') && st.step >= 3 && st.fallAt !== null;
      const el = live ? (now - st.fallAt) / 1000 : 0;
      sheets.forEach((s, i) => {
        const q = live ? easeOut((el - i * SHEET_GAP_S) / SHEET_FALL_S) : 0;   // top sheet (01) first
        s.y = START_Y + (s.rest - START_Y) * q;
        s.group.position.y = s.y;
        s.fillMat.opacity = FILL_OPACITY * q; s.edgeMat.opacity = q;
        s.group.visible = q > 0.001;
      });

      // Each label stands at the height of its sheet's middle, with a short horizontal leader from the sheet's right
      // edge. The sheets do not overlap on screen, so neither do the labels or the lines.
      if (!live) { leaders.innerHTML = ''; return; }
      let out = '';
      sheets.forEach((s, i) => {
        let rx = -Infinity, sy = 0;
        for (const p of scene.fieldRing) { const [x, y] = scene.project(v.set(p.x, s.y, p.z)); if (x > rx) rx = x; sy += y; }
        const y = sy / scene.fieldRing.length;
        lbls[i].style.top = `${y.toFixed(1)}px`;
        out += `<line x1="${(rx + 14).toFixed(1)}" y1="${y.toFixed(1)}" x2="${LABEL_X - 18}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,.45)" stroke-width="1.5"/>`;
      });
      leaders.innerHTML = out;
    });
  },
  enter(step, ctx) {
    const st = this.st;
    ctx.scene.goTo('data', { instant: ctx.instant });
    ctx.setWash(step >= 1 ? 1 : 0, step >= 4 ? 1 : 0);
    st.step = step;
    if (step >= 3) {
      if (ctx.instant) st.fallAt = -1e9;                      // jump to the end of the fall
      else if (st.fallAt === null) st.fallAt = performance.now();
    } else st.fallAt = null;
    ctx.el.querySelector('svg.leaders').style.opacity = ctx.scene.available && step >= 4 ? '1' : '0';
    ctx.el.querySelector('.lbls').classList.toggle('on', step >= 4);
    if (step >= 5) st.startCount(ctx.instant); else st.resetCount();
  },
  final(ctx) { this.enter(this.steps, ctx); },
};
