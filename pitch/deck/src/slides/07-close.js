// Slide 7: back to orbit. Built on open data: who we are on the left, every dataset used for this field on the right.
// NASA-ness comes from the `nasa` flag of datasets.list, never from a name list. Every id appears exactly once.
// Steps: 0 the zoom out to orbit (no text), 1 title, 2 team and challenge, 3 NASA datasets, 4 the other sources and
// credits, 5 the QR code.
const CSS = `
.slide[data-name="close"] .who { margin-top: 22px; padding-top: 16px; border-top: 1px solid var(--hairline); font-size: 22px; line-height: 1.4; }
.slide[data-name="close"] .who small { display: block; margin: 14px 0 4px; font-size: var(--fs-label); font-weight: 500; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
.slide[data-name="close"] .who .two { display: grid; grid-template-columns: 200px 1fr; column-gap: 24px; }
.slide[data-name="close"] .who .two small { margin-top: 0; }
.slide[data-name="close"] .scrim { position: absolute; right: 0; top: 0; bottom: 0; width: 960px; pointer-events: none;
  background: linear-gradient(270deg, rgba(5, 7, 13, .92) 0%, rgba(5, 7, 13, .9) 66%, rgba(5, 7, 13, 0) 100%); }
.slide[data-name="close"] .panel { z-index: 1; }
.slide[data-name="close"] .who div { white-space: nowrap; }
.slide[data-name="close"] .who .ai { margin-top: 16px; font-size: 20px; color: #d5dbe3; white-space: normal; }
.slide[data-name="close"] .panel { top: 104px; }
.slide[data-name="close"] .grp { margin: 0 0 14px; }
.slide[data-name="close"] .grp h3 { margin: 0 0 6px; font-size: 18px; }
.slide[data-name="close"] .ds { padding: 5px 0; border-top: 1px solid var(--hairline); }
.slide[data-name="close"] .ds:last-child { border-bottom: 1px solid var(--hairline); }
.slide[data-name="close"] .ds b { display: block; font-weight: 500; font-size: 20px; line-height: 1.28; }
.slide[data-name="close"] .ds i { display: block; font-style: normal; font-size: 16px; line-height: 1.3; color: var(--muted); margin-top: 2px; }
.slide[data-name="close"] .ds.nasa b { color: var(--text); }
.slide[data-name="close"] .qr { position: absolute; left: calc(var(--margin) - 16px); bottom: 48px; display: flex; align-items: center; gap: 22px; z-index: 1;
  padding: 16px 28px 16px 16px; border-radius: 10px; background: rgba(5, 7, 13, .9); }
.slide[data-name="close"] .qr img { width: 168px; height: 168px; display: block; background: #fff; padding: 10px; border-radius: 6px; image-rendering: pixelated; }
.slide[data-name="close"] .qr b { display: block; font-size: 26px; font-weight: 600; line-height: 1.25; }
.slide[data-name="close"] .qr span { display: block; margin-top: 6px; font-size: 18px; color: var(--muted); }
.slide[data-name="close"] .credits { margin-top: 4px; font-size: 16px; line-height: 1.45; color: #b4bdc9; }
`;

// Short display forms, derived from the data text: drop a trailing parenthesis or clause.
const short = (s) => s.split(/ \(|, /)[0];

function groups(data) {
  const used = data.datasetsUsedForThisField.ids;
  const byId = new Map(data.datasets.list.map((d) => [d.id, d]));
  const rows = used.map((id) => {
    const d = byId.get(id);
    if (!d) throw new Error(`Slide 7: dataset "${id}" is in datasetsUsedForThisField but not in datasets.list`);
    return d;
  });
  if (new Set(used).size !== used.length) throw new Error('Slide 7: duplicate dataset id in datasetsUsedForThisField');
  // The parcel outline comes from the land register through the map, not through the analysis, so it may have no
  // dataset id in the export. Then it is named from field.source ("GUGiK ULDK (land register parcel)"). Once the app
  // registers it as a dataset, it arrives in `rows` and this adds nothing.
  const src = data.field?.source ?? '';
  const m = /^(\S+)\s+(\S+)\s*\((.+)\)$/.exec(src);
  if (!m) throw new Error(`Slide 7: cannot read the parcel source from field.source "${src}"`);
  if (!rows.some((d) => short(d.provider) === m[1] || d.provider.includes(m[1]))) {
    rows.push({ id: 'field.source', provider: m[1], name: `${m[2]} ${m[3]}`, nasa: false });
  }
  const nasa = rows.filter((d) => d.nasa === true);
  const providers = new Map();
  for (const d of rows.filter((x) => x.nasa !== true)) {
    const p = short(d.provider);
    if (!providers.has(p)) providers.set(p, []);
    providers.get(p).push(d);
  }
  return { nasa, providers };
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export default {
  steps: 5,
  stepMs: [700, 900, 900, 800, 900, 900],
  mount(ctx) {
    const { EVENT, CHALLENGE, PROJECT_NAME, TEAM, MEMBERS, APP_URL } = ctx.constants;
    const { nasa, providers } = groups(ctx.data);
    if (!document.getElementById('slide7-css')) {
      const st = document.createElement('style'); st.id = 'slide7-css'; st.textContent = CSS; document.head.append(st);
    }
    // The QR code sits bottom-left with the invitation in English like the rest of the deck; the URL is printed under it.
    const qr = APP_URL ? `<div class="qr" data-from="5"><img src="assets/img/qr-app.png" alt="QR code: ${esc(APP_URL)}">
      <div><b>Scan to try CropShifter</b><span>${esc(APP_URL.replace(/^https:\/\//, ''))}</span></div></div>` : '';
    const nasaHtml = nasa.map((d) => `<div class="ds nasa" data-id="${d.id}"><b>${esc(short(d.name))}</b></div>`).join('');
    const otherHtml = [...providers].map(([p, list]) =>
      `<div class="ds" data-id="${list.map((d) => d.id).join(' ')}"><i style="margin:0 0 3px">${esc(p)}</i>${
        list.map((d) => `<b>${esc(short(d.name))}</b>`).join('')}</div>`).join('');
    ctx.el.innerHTML = `
      <div class="copy">
        <div class="eyebrow" data-from="1">Built on open data</div>
        <div class="title" data-from="1">${esc(PROJECT_NAME)}</div>
        <div class="who" data-from="2">
          <div class="two"><div><small>Team</small><div>${esc(TEAM)}</div></div>
          <div><small>Members</small>${MEMBERS.map((m) => `<div>${esc(m)}</div>`).join('')}</div></div>
          <small>Challenge</small><div>${esc(EVENT)}</div><div>${esc(CHALLENGE)}</div>
          <div class="ai">Built with AI assistance; details on the project page.</div>
        </div>
      </div>
      ${qr}
      <div class="scrim" data-from="3"></div>
      <div class="panel">
        <div class="grp" data-from="3"><h3>NASA</h3>${nasaHtml}</div>
        <div class="grp" data-from="4"><h3>Partners and others</h3>${otherHtml}</div>
        <div class="credits" data-from="4">Imagery in this deck: NASA GIBS (Blue Marble, MODIS Terra, HLS). Spacecraft model: Landsat 8, NASA 3D Resources. Typeface: Inter and Caveat, SIL Open Font License 1.1.</div>
      </div>`;
  },
  enter(step, ctx) {
    ctx.scene.goTo('orbit', { instant: ctx.instant });
    ctx.setWash(step >= 1 ? 1 : 0, step >= 3 ? 1 : 0);
  },
  final(ctx) { this.enter(this.steps, ctx); },
};
