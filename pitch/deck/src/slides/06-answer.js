// Slides "tool-1" and "tool-2": the app. Each shows two screenshots of the app side by side in plain browser frames that
// rise from the field, one after the other, on a single key press. tool-2 ends with the sentence about the farmer's judgment.
// Screenshots are taken later by a script (task P8). A file that is not there yet shows a plain label and one console.warn;
// ctx.el.dataset.missing holds the number of screenshots not (yet) loaded, so the PDF script can refuse to print.

// Stage px. Both frames on a slide share one height; each is as wide as its screenshot's shape needs (the crops in
// scripts/shoot-app.mjs keep each screen's own shape, so nothing is cut and no empty margin is added). If the pair
// would be wider than the text column, both shrink together. A missing screenshot counts as 16:10.
const BAR = 22, GAP = 64, MAX_W = 1696;

const CSS = `
.s-tool .copy { width: 1696px; }
.s-tool .title { font-size: 72px; }
.s-tool .pair { position: absolute; left: var(--margin); display: flex; gap: ${GAP}px; }
.s-tool .shotbox { flex: none; opacity: 0; transform: translateY(60px);
  transition: opacity .6s ease, transform .9s cubic-bezier(.2, .7, .2, 1); }
.s-tool .shotbox.on { opacity: 1; transform: none; }
.s-tool .frame { box-sizing: border-box; width: 100%; background: #0b0e16; border: 1px solid var(--hairline);
  border-radius: 10px; overflow: hidden; }
.s-tool .frame .bar { height: ${BAR}px; border-bottom: 1px solid var(--hairline); background: #121722; }
.s-tool .frame .view { position: relative; background: #0b0e16; }
.s-tool .frame img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.s-tool .frame .pending { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-size: 22px; color: var(--muted); }
.s-tool .cap { margin-top: 16px; font-size: 26px; font-weight: 500; }
.s-tool .cap i { font-style: normal; color: var(--muted); margin-right: 12px; font-feature-settings: "tnum" 1; }
.s-tool .rule { position: absolute; left: var(--margin); right: var(--margin); bottom: 100px; font-size: 32px; font-weight: 500;
  line-height: 1.25; opacity: 0; transition: opacity .6s ease .3s; }
.s-tool .rule.on { opacity: 1; }
`;

function toolSlide({ title, shots, rule, foot, top, viewH }) {
  return {
    // 0: the camera, 1: title, 2: left screenshot, 3: right screenshot, 4 (tool-2 only): the closing sentence.
    steps: rule ? 4 : 3,
    stepMs: 900,
    mount(ctx) {
      if (!document.getElementById('s-tool-css')) {
        const st = document.createElement('style'); st.id = 's-tool-css'; st.textContent = CSS; document.head.append(st);
      }
      ctx.el.classList.add('s-tool');
      ctx.el.innerHTML = `
        <div class="copy">
          <div class="eyebrow" data-from="1">The tool</div>
          <div class="title" data-from="1">${title}</div>
        </div>
        <div class="pair"></div>
        ${rule ? `<div class="rule">${rule}</div>` : ''}
        ${foot ? `<div class="foot" data-from="4">${foot}</div>` : ''}`;
      const pair = ctx.el.querySelector('.pair');
      pair.style.top = `${top}px`;
      this.aspects = shots.map(() => 1.6);
      let missing = shots.length;
      ctx.el.dataset.missing = String(missing);
      this.boxes = shots.map(({ file, n, caption }, i) => {
        const box = document.createElement('div');
        box.className = 'shotbox';
        box.innerHTML = `<div class="frame"><div class="bar"></div><div class="view"></div></div>
          <div class="cap"><i>${n}</i>${caption}</div>`;
        const view = box.querySelector('.view');
        const img = new Image();
        img.alt = ''; img.draggable = false;
        img.onload = () => { this.aspects[i] = img.naturalWidth / img.naturalHeight; this.layout(viewH); ctx.el.dataset.missing = String(--missing); };
        img.onerror = () => {
          console.warn(`Slide ${ctx.index + 1}: screenshot missing: assets/app/${file}`);
          img.remove();
          const label = document.createElement('div');
          label.className = 'pending'; label.textContent = `Screenshot pending: ${file}`;
          view.append(label);
        };
        img.src = `assets/app/${file}`;
        view.append(img);
        pair.append(box);
        return box;
      });
      this.rule = ctx.el.querySelector('.rule');
      this.layout(viewH);
    },
    /** Size both frames to one view height, from each screenshot's shape. */
    layout(want) {
      const sum = this.aspects.reduce((a, b) => a + b, 0);
      const h = Math.min(want, (MAX_W - GAP * (this.aspects.length - 1)) / sum);
      this.boxes.forEach((b, i) => {
        const w = Math.round(h * this.aspects[i]);
        b.style.width = `${w + 2}px`;   // + the frame's 1 px borders
        b.querySelector('.view').style.height = `${Math.round(h)}px`;
      });
    },
    enter(step, ctx) {
      ctx.scene.goTo('field', { instant: ctx.instant });
      ctx.setWash(step >= 1 ? 1 : 0, step >= 2 ? 0.6 : 0);
      this.boxes.forEach((b, i) => b.classList.toggle('on', step >= i + 2));
      this.rule?.classList.toggle('on', step >= 4);
    },
    final(ctx) { this.enter(this.steps, ctx); },
  };
}

export const toolStart = toolSlide({
  title: 'Jan picks his field and his past crops',
  top: 290, viewH: 640,
  shots: [
    { file: '01-field.png', n: '1', caption: 'Mark the field on the map' },
    { file: '02-history.png', n: '2', caption: 'Copy the notebook' },
  ],
});

export const toolResult = toolSlide({
  title: 'Then he picks a farming goal and gets recommendations from the analysis',
  top: 360, viewH: 520,
  shots: [
    { file: '03-goal.png', n: '3', caption: 'Pick a goal' },
    { file: '04-income.png', n: '4', caption: 'Compare with what he grows now' },
  ],
  rule: "The tool supports the farmer's judgment. It does not replace it.",
  foot: "Income: past years replayed at today's prices, not a forecast.",
});
