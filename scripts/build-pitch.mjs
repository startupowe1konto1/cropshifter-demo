// Copies the pitch deck and its PDF into dist/pitch/ after `vite build`, so the app's Vercel deployment also serves
// the deck at /pitch/ and the PDF at /pitch/deck.pdf. The deck's own dependencies (three.js and two fonts) must be
// installed first: npm ci --prefix pitch/deck --omit=dev --ignore-scripts
// Only the files the deck loads are copied. A missing file stops the build, so a broken deck is never deployed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DECK = path.join(ROOT, 'pitch/deck');
const OUT = path.join(ROOT, 'dist/pitch');

if (!fs.existsSync(path.join(ROOT, 'dist/index.html'))) throw new Error('dist/index.html is missing: run vite build first');

/** Files and folders under pitch/deck, copied with the same relative path. */
const FROM_DECK = [
  'index.html',
  'src',
  'data/field.json',
  'assets/app',
  'assets/glb',
  'assets/img',
  // three.js 0.180: three.module.js imports three.core.js; the addons are the three the deck imports, plus
  // BufferGeometryUtils (GLTFLoader imports it) and the Draco decoder the GLTF loader fetches at run time.
  'node_modules/three/build/three.module.js',
  'node_modules/three/build/three.core.js',
  'node_modules/three/examples/jsm/loaders/GLTFLoader.js',
  'node_modules/three/examples/jsm/loaders/DRACOLoader.js',
  'node_modules/three/examples/jsm/environments/RoomEnvironment.js',
  'node_modules/three/examples/jsm/utils/BufferGeometryUtils.js',
  'node_modules/three/examples/jsm/libs/draco/gltf/draco_decoder.js',
  'node_modules/three/examples/jsm/libs/draco/gltf/draco_decoder.wasm',
  'node_modules/three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js',
  // The fonts src/tokens.css loads.
  'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  'node_modules/@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2',
  'node_modules/@fontsource/caveat/files/caveat-latin-500-normal.woff2',
];

// node_modules/ is copied as vendor/ (hosts may skip folders named node_modules), and the deck's references to it
// in index.html and src/ are rewritten to match.
const served = (rel) => rel.replace(/^node_modules\//, 'vendor/');

fs.rmSync(OUT, { recursive: true, force: true });
for (const rel of FROM_DECK) {
  const src = path.join(DECK, rel);
  if (!fs.existsSync(src)) throw new Error(`pitch deck file missing: pitch/deck/${rel}`);
  fs.cpSync(src, path.join(OUT, served(rel)), { recursive: true });
}

let rewritten = 0;
(function rewrite(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (p !== path.join(OUT, 'vendor')) rewrite(p); continue; }
    if (!/\.(html|js|css)$/.test(e.name)) continue;
    const text = fs.readFileSync(p, 'utf8');
    if (!text.includes('node_modules/')) continue;
    fs.writeFileSync(p, text.replaceAll('node_modules/', 'vendor/'));
    rewritten++;
  }
})(OUT);
if (rewritten === 0) throw new Error('no node_modules/ reference rewritten: the deck changed, check this script');

const pdf = path.join(ROOT, 'pitch/out/deck.pdf');
if (!fs.existsSync(pdf)) throw new Error('pitch/out/deck.pdf is missing');
fs.copyFileSync(pdf, path.join(OUT, 'deck.pdf'));

let files = 0, bytes = 0;
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p); else { files++; bytes += fs.statSync(p).size; }
  }
})(OUT);
console.log(`dist/pitch: ${files} files, ${(bytes / 1e6).toFixed(1)} MB (deck at /pitch/, PDF at /pitch/deck.pdf)`);
