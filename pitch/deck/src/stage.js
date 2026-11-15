// The 1920 x 1080 stage: scaling, slide and step control, URL hash #<slide>.<step>, print and reduced-motion mode.
import { createScene } from './scene.js';
import * as constants from './constants.js';
import orbit from './slides/01-orbit.js';
import mariusz from './slides/02-mariusz.js';
import dataSlide from './slides/03-data.js';
import engine from './slides/04-engine.js';
import regions from './slides/05-regions.js';
import { toolStart, toolResult } from './slides/06-answer.js';
import close from './slides/07-close.js';

// Slide interface: { steps, mount(ctx), enter(step, ctx), final(ctx) }.
//  steps          how many steps the slide has after it appears (0 = none). One key press plays them all in a row
//                 (the pitch owner's rule: one press, one slide); a slide with `manual: true` takes one press per step.
//  manual         optional: true = one key press per step (no slide uses it now).
//  mount(ctx)     once, before the first show: build the DOM inside ctx.el.
//  enter(step)    leave the slide in the final state of `step` (0 is the slide appearing). Must be safe to call again
//                 for the same step, and from any earlier state: the stage calls it with ctx.instant = true to finish
//                 a step early, to go back, and to open the deck at a URL such as #4.2.
//  final(ctx)     the final state of the whole slide (print mode, reduced motion).
//  stepMs         optional: how long a step's own animation takes (default 700), one number for every step or a list
//                 with one entry per step (index = step). In a played sequence the next step starts when this time and
//                 the camera move are both over.
// Animation order, the same on every slide: step 0 moves the camera and shows no text; then the left text column
// appears block by block from the top (eyebrow and title first), then the right-hand panel, then the footnote.
// ctx: { scene, el, data, constants, stage, index, instant, setWash(left, right) }.
// Slide numbers (#n.step, data-slide, assets/stills/0n.png) follow this list, so they shift when a slide is left out.
// Scripts find a slide by its name (data-name) and read the count from #stage[data-count].
const NAMED = [['orbit', orbit], ['mariusz', mariusz], ['data', dataSlide], ['engine', engine],
  ['regions', regions], ['tool-1', toolStart], ['tool-2', toolResult], ['close', close]]
  .filter(([name]) => name !== 'engine' || constants.SHOW_ENGINE_SLIDE);
const SLIDES = NAMED.map(([, slide]) => slide);

const stageEl = document.getElementById('stage');
stageEl.dataset.count = String(SLIDES.length);
const params = new URLSearchParams(location.search);
const print = params.get('print') === '1';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const noMotion = print || reduced;

function fit() {
  const s = Math.min(innerWidth / 1920, innerHeight / 1080);
  stageEl.style.transform = `translate(${-960 * s}px, ${-540 * s}px) scale(${s})`;
}
addEventListener('resize', fit);
fit();

const loading = document.getElementById('loading');
const washEls = { left: stageEl.querySelector('.wash .left'), right: stageEl.querySelector('.wash .right') };
const slidesEl = stageEl.querySelector('.slides');

let scene;
try {
  scene = await createScene({ stage: stageEl, cloud: document.getElementById('cloud'), noWebGL: params.get('nowebgl') === '1' });
} catch (err) {
  console.error(err);
  loading.textContent = 'Source error: the deck could not load its data';
  throw err;
}
scene.still = noMotion;
if (print) stageEl.classList.add('print');

const ctxs = SLIDES.map((slide, index) => {
  const el = document.createElement('section');
  el.className = 'slide'; el.dataset.slide = String(index + 1); el.dataset.name = NAMED[index][0];
  slidesEl.append(el);
  const ctx = {
    scene, el, data: scene.data, constants, stage: stageEl, index, instant: false,
    setWash(left, right) { washEls.left.style.opacity = String(left); washEls.right.style.opacity = String(right); },
  };
  slide.mount(ctx);
  return ctx;
});

let pos = { slide: -1, step: 0 };
let busyUntil = 0;
let instantTimer = 0;
let playTimer = 0;      // the next step of a played sequence
let playing = false;

function reveal(ctx, step) {
  ctx.el.dataset.step = String(step);
  for (const e of ctx.el.querySelectorAll('[data-from]')) e.classList.toggle('on', Number(e.dataset.from) <= step);
}

/** Show a slide at a step. `instant` skips every animation and lands on the final state of that step. */
function show(slide, step, { instant = false, final = false } = {}) {
  instant = instant || noMotion;
  const mod = SLIDES[slide], ctx = ctxs[slide];
  if (instant) { stageEl.classList.add('instant'); cancelAnimationFrame(instantTimer); }
  if (slide !== pos.slide) {
    if (pos.slide >= 0) ctxs[pos.slide].el.classList.remove('active');
    ctx.el.classList.add('active');
    scene.setSlide(slide + 1);
  }
  ctx.instant = instant;
  if (final) { step = mod.steps; mod.final(ctx); } else mod.enter(step, ctx);
  reveal(ctx, step);
  pos = { slide, step };
  stageEl.dataset.slide = String(slide + 1); stageEl.dataset.step = String(step);
  history.replaceState(null, '', `${location.pathname}${location.search}#${slide + 1}.${step}`);
  if (instant) {
    scene.finish();
    busyUntil = 0;
    // Transitions come back after two frames, once the final state has been painted.
    instantTimer = requestAnimationFrame(() => { instantTimer = requestAnimationFrame(() => stageEl.classList.remove('instant')); });
  } else {
    busyUntil = performance.now() + Math.max(scene.eta() * 1000, stepMsOf(mod, step));
  }
}

/** A step's own animation time: `stepMs` is one number for every step or a list indexed by step. */
function stepMsOf(mod, step) {
  const ms = Array.isArray(mod.stepMs) ? mod.stepMs[step] : mod.stepMs;
  return ms ?? 700;
}

// For the export, recording and walk scripts: true while a slide's sequence or its last animation is still running.
window.deckBusy = () => playing || performance.now() < busyUntil;

function stopPlay() { clearTimeout(playTimer); playTimer = 0; playing = false; }

/** Wait until the current step's own animation and the camera have finished. */
function stepWaitMs(mod) { return Math.max(scene.eta() * 1000 + 150, stepMsOf(mod, pos.step)); }

/** Plays a slide from its first step to its last, one after another, on a single key press. */
function play(slide) {
  stopPlay();
  show(slide, 0);
  const mod = SLIDES[slide];
  if (mod.manual || mod.steps === 0 || noMotion) return;
  playing = true;
  const next = () => {
    if (pos.slide !== slide || pos.step >= mod.steps) { stopPlay(); return; }
    show(slide, pos.step + 1);
    if (pos.step >= mod.steps) { playing = false; busyUntil = performance.now() + stepWaitMs(mod); return; }
    playTimer = setTimeout(next, stepWaitMs(mod));
  };
  playTimer = setTimeout(next, stepWaitMs(mod));
}

function advance(dir) {
  const mod = SLIDES[pos.slide];
  if (playing || performance.now() < busyUntil) {  // a key press during an animation finishes it
    stopPlay();
    show(pos.slide, mod.manual ? pos.step : mod.steps, { instant: true });
    return;
  }
  if (dir > 0) {
    if (pos.step < mod.steps) {
      if (mod.manual) show(pos.slide, pos.step + 1);
      else show(pos.slide, mod.steps, { instant: true });   // opened mid-slide by URL: finish it
    } else if (pos.slide < SLIDES.length - 1) play(pos.slide + 1);
  } else if (mod.manual && pos.step > 0) show(pos.slide, pos.step - 1, { instant: true });
  else if (pos.slide > 0) show(pos.slide - 1, SLIDES[pos.slide - 1].steps, { instant: true });
  else if (pos.step > 0) show(0, 0, { instant: true });
}

function parseHash() {
  const m = /^#(\d+)(?:\.(\d+))?$/.exec(location.hash);
  const slide = Math.min(SLIDES.length, Math.max(1, m ? Number(m[1]) : 1)) - 1;
  const step = Math.min(SLIDES[slide].steps, Math.max(0, m && m[2] ? Number(m[2]) : 0));
  return { slide, step };
}

addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); advance(1); }
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); advance(-1); }
});
addEventListener('hashchange', () => {
  const { slide, step } = parseHash();
  if (slide !== pos.slide || step !== pos.step) { stopPlay(); show(slide, step, { instant: true }); }
});

const start = parseHash();
show(start.slide, start.step, { instant: true, final: noMotion });
loading.classList.add('gone');
