// One renderer, one camera. Rest views: orbit, field, europe. Only this file moves the camera.
// Ported from prototype/orbit.html, now on the pitch field near Poznań: its centre, outline and neighbours come
// from data/field.json, the images from scripts/fetch-imagery.sh. All motion runs on elapsed time, never on frame counts.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const W = 1920, H = 1080;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeIn = (x) => Math.pow(clamp01(x), 2.4);
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const easeInOut = (x) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };

// The descent, as in the prototype: 1.7 s to the air, 2.6 s to the field (plus the tilt into the resting view).
const GLOBE_S = 1.7, GROUND_S = 2.6;
const DIVE_END = GLOBE_S + GROUND_S * 1.35;
const ASCENT_SPEED = 1.5;      // the way back up plays the same path faster
const MOVE_S = 2.2;            // camera move between rest views, exponential ease that lands exactly at this time
const MOVE_RATE = 2.4;
const HIGH = 400, LOW = 2.3;

// The Blue Marble box of assets/img/europe-wide.jpg (degrees). Must equal EU_BBOX in scripts/fetch-imagery.sh.
const EUROPE_BOX = { s: 36, w: -20, n: 66, e: 50 };

// Rest views of the ground scene (1 unit = 1 km). The field sits left of centre so the table has the right-hand side.
const VIEW = {
  field: { pos: new THREE.Vector3(1.3, 1.3, 1.62), look: new THREE.Vector3(0.24, 0.36, -0.2), dim: 0.36, grid: 0.13 },
  // Slide 3: lower and from the south-west, so the five sheets (140 m apart) read as separate plates, one above the
  // other, between the text block and their labels.
  data: { pos: new THREE.Vector3(-2.524, 1.092, 2.16), look: new THREE.Vector3(-0.3, 0.3, 0), dim: 0.36, grid: 0.13 },
  // Slide 4: the lower half of the screen is a panel, so the field moves up and right.
  engine: { pos: new THREE.Vector3(0.94, 2.06, 3.24), look: new THREE.Vector3(-0.12, 0.36, 1.42), dim: 0.3, grid: 0.1 },
  // About 1.9 km per pixel: every twin place and the field fit in the strip between the text block and the table.
  europe: { pos: new THREE.Vector3(-182, 3578, 758), look: new THREE.Vector3(-182, 0, 114), dim: 1.25, grid: 0 },
};
export const VIEWS = ['orbit', 'field', 'data', 'engine', 'europe'];

const cssColor = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function hasWebGL(force) {
  if (force) return false;
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

export async function createScene({ stage, cloud, noWebGL = false }) {
  const data = await fetch('data/field.json').then((r) => { if (!r.ok) throw new Error(`data/field.json: ${r.status}`); return r.json(); });
  const webgl = hasWebGL(noWebGL);
  const FIELD = { lat: data.field.centroid.lat, lon: data.field.centroid.lon };

  const api = {
    data, FIELD, THREE, available: webgl, view: 'orbit', still: false, fieldFill: 0.16,
    fieldTint: null,       // a CSS colour for the field's fill instead of the field colour (slide 4: drought years)
    toKm: null, project: null, ground: null, camera: null, scene: null,
    fieldRing: null,       // the parcel outline in ground units (km, x east, z south), closed: last point = first
    neighbourRings: null,  // the neighbouring parcels' outlines, same units
  };
  const frameHooks = new Set();
  api.onFrame = (fn) => { frameHooks.add(fn); return () => frameHooks.delete(fn); };

  if (new URLSearchParams(location.search).has('debug')) { window.__scene = api; api.VIEW = VIEW; }
  if (!webgl) return withoutWebGL(api, stage);

  const KM_LAT = 111.32, KM_LON = 111.32 * Math.cos(THREE.MathUtils.degToRad(FIELD.lat));
  api.toKm = (lat, lon) => new THREE.Vector3((lon - FIELD.lon) * KM_LON, 0, -(lat - FIELD.lat) * KM_LAT); // x east, z south
  const ringKm = (ring) => ring.map(([lon, lat]) => api.toKm(lat, lon));
  api.fieldRing = ringKm(data.field.ring);
  api.neighbourRings = data.neighbours.map((nb) => ringKm(nb.ring));
  const C = { field: cssColor('--field'), twin: cssColor('--twin'), data: cssColor('--data') };

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  stage.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#05070d');
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture; // soft reflections for the spacecraft
  const camera = new THREE.PerspectiveCamera(32, W / H, 0.02, 9000);
  api.camera = camera; api.scene = scene;

  const textures = new THREE.TextureLoader();
  const load = (url) => textures.loadAsync(url).then((t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t; });
  const draco = new DRACOLoader().setDecoderPath('node_modules/three/examples/jsm/libs/draco/gltf/');
  const [earthMap, regionMap, localMap, wideMap, craft] = await Promise.all([
    load('assets/img/earth.jpg'), load('assets/img/poznan-region.jpg'), load('assets/img/poznan-local.png'), load('assets/img/europe-wide.jpg'),
    new GLTFLoader().setDRACOLoader(draco).loadAsync('assets/glb/landsat8.glb'),
  ]);

  // ---------- orbit ----------
  const R = 10;
  const orbit = new THREE.Group();
  scene.add(orbit);
  function onGlobe(lat, lon, r = R) {
    const phi = THREE.MathUtils.degToRad(lon + 180), theta = THREE.MathUtils.degToRad(90 - lat);
    return new THREE.Vector3(-r * Math.cos(phi) * Math.sin(theta), r * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta));
  }
  const n = onGlobe(FIELD.lat, FIELD.lon, 1);
  const east = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), n).normalize();
  const north = new THREE.Vector3().crossVectors(n, east).normalize();

  orbit.add(new THREE.Mesh(new THREE.SphereGeometry(R, 160, 120), new THREE.MeshStandardMaterial({ map: earthMap, roughness: 1, metalness: 0, envMapIntensity: 0 })));
  orbit.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.03, 96, 64), new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vN; void main(){ float i = pow(0.76 - dot(vN, vec3(0.0, 0.0, 1.0)), 2.8); gl_FragColor = vec4(0.32, 0.6, 1.0, 1.0) * i; }',
  })));
  const sun = new THREE.DirectionalLight('#fff6e8', 3.2);
  sun.position.copy(n.clone().addScaledVector(east, -0.75).addScaledVector(north, 0.45).multiplyScalar(100));
  orbit.add(sun, new THREE.AmbientLight('#9db4ff', 0.06));

  const starPos = new Float32Array(3500 * 3);
  for (let i = 0; i < 3500; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(900 + Math.random() * 600); starPos.set([v.x, v.y, v.z], i * 3); }
  const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  orbit.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#e8eefc', size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.8 })));

  const C0 = n.clone().addScaledVector(east, 0.62).addScaledVector(north, 0.18).normalize().multiplyScalar(R * 2.85);
  const T0 = n.clone().multiplyScalar(R * 0.25).addScaledVector(east, -R * 0.95).addScaledVector(north, R * 0.1);
  const fwd = T0.clone().sub(C0).normalize();
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, fwd);

  const SAT_ROLL = Number(new URLSearchParams(location.search).get('roll') ?? 2.3);
  // Spacecraft: the NASA Landsat 8 model, scaled to the scene and given metal and glass that catch the light.
  const sat = new THREE.Group();
  const model = craft.scene;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  model.position.sub(box.getCenter(new THREE.Vector3()));
  model.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [o.material].flat()) {
      const name = m.name.toLowerCase();
      if (/solarpanel-(face|\d)/.test(name)) { m.color.set('#16234f'); m.metalness = 0.9; m.roughness = 0.18; m.envMapIntensity = 1.7; }       // cells
      else if (/gold|bronze|mainpanels|mainsections/.test(name)) { m.color.offsetHSL(0, 0.12, -0.06); m.metalness = 0.95; m.roughness = 0.3; m.envMapIntensity = 1.35; } // foil
      else if (/black|thruster|back/.test(name)) { m.color.set('#1b1e24'); m.metalness = 0.6; m.roughness = 0.5; }
      else { m.metalness = 0.75; m.roughness = 0.34; m.envMapIntensity = 1.2; }                                                                 // structure
    }
  });
  const fitted = new THREE.Group(); fitted.add(model); fitted.scale.setScalar(3.6 / Math.max(size.x, size.y, size.z));
  sat.add(fitted);
  const satHome = C0.clone().addScaledVector(fwd, 7.4).addScaledVector(right, -1.15).addScaledVector(up, -1.26); // below the text column on slides 1 and 7
  sat.position.copy(satHome);
  const sx = right.clone().addScaledVector(fwd, 0.5).addScaledVector(up, 0.18).normalize();
  const sy0 = up.clone().addScaledVector(fwd, -0.35).normalize();
  const sz = new THREE.Vector3().crossVectors(sx, sy0).normalize();
  sat.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(sx, new THREE.Vector3().crossVectors(sz, sx), sz));
  sat.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(fwd, SAT_ROLL)); // turn the solar array up and towards the planet
  const satBase = sat.quaternion.clone();
  const key = new THREE.PointLight('#ffffff', 9, 14); key.position.copy(satHome).addScaledVector(right, -1.6).addScaledVector(up, 2.2).addScaledVector(fwd, -3);
  const rim = new THREE.PointLight('#7fb4ff', 7, 12); rim.position.copy(satHome).addScaledVector(right, 2.4).addScaledVector(up, -0.6).addScaledVector(fwd, 1.5);
  orbit.add(sat, key, rim);

  // ---------- ground (1 unit = 1 km) ----------
  const ground = new THREE.Group(); ground.visible = false; scene.add(ground);
  api.ground = ground;
  // Each image is an EPSG:4326 box; toKm is linear in degrees, so the box maps to a rectangle and the dots placed
  // with toKm land on the right pixels.
  const flat = (map, box, order) => {
    const a = api.toKm(box.s, box.w), b = api.toKm(box.n, box.e);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(b.x - a.x, a.z - b.z), new THREE.MeshBasicMaterial({ map, transparent: true, depthTest: false, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2); m.renderOrder = order; ground.add(m); return m;
  };
  const wide = flat(wideMap, EUROPE_BOX, -1);                                        // Blue Marble, cloud-free, for the similar regions
  const region = flat(regionMap, { s: 50.4593, w: 13.8378, n: 54.4593, e: 20.3992 }, 0); // MODIS, 445 km
  const local = flat(localMap, { s: 52.3995, w: 17.0205, n: 52.5190, e: 17.2166 }, 1);   // HLS, 13.3 km
  const grid = new THREE.GridHelper(13.3, 133, '#ffffff', '#ffffff');
  grid.material.transparent = true; grid.material.opacity = 0; grid.material.depthTest = false; grid.renderOrder = 2; ground.add(grid);

  // Neighbouring parcels: thin white lines. The sharpness at field level comes from these vectors, not from pixels.
  const nbPts = [];
  for (const ring of api.neighbourRings) for (let i = 1; i < ring.length; i++) nbPts.push(ring[i - 1], ring[i]);
  const nbMat = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthTest: false });
  const nbLines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(nbPts), nbMat);
  nbLines.position.y = 0.001; nbLines.renderOrder = 3; ground.add(nbLines);

  // The field: its real outline from the land register, a faint fill and a 10 m wide edge.
  const shape = new THREE.Shape(api.fieldRing.map((p) => new THREE.Vector2(p.x, -p.z)));
  const fill = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: C.field, transparent: true, opacity: 0, depthTest: false }));
  fill.rotation.x = -Math.PI / 2; fill.renderOrder = 3; ground.add(fill);
  const edgeMat = new THREE.MeshBasicMaterial({ color: C.field, transparent: true, opacity: 0, depthTest: false });
  for (let i = 1; i < api.fieldRing.length; i++) {
    const a = api.fieldRing[i - 1], b = api.fieldRing[i];
    const len = a.distanceTo(b);
    if (len < 1e-4) continue;
    const e = new THREE.Mesh(new THREE.BoxGeometry(len + 0.01, 0.003, 0.01), edgeMat);
    e.position.set((a.x + b.x) / 2, 0.002, (a.z + b.z) / 2);
    e.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    e.renderOrder = 4; ground.add(e);
  }

  // ---------- camera state ----------
  // dive: seconds along the descent timeline. 0 is orbit, DIVE_END is resting on the ground. It moves towards diveTo
  // at diveSpeed seconds per real second.
  let dive = 0, diveTo = 0, diveSpeed = 1;
  const cur = { pos: VIEW.field.pos.clone(), look: VIEW.field.look.clone(), dim: 1, grid: 0 };
  let restTarget = 'field';
  let move = null; // { from, t0, to }
  const look = new THREE.Vector3(), v = new THREE.Vector3();
  const copyView = (dst, src) => { dst.pos.copy(src.pos); dst.look.copy(src.look); dst.dim = src.dim; dst.grid = src.grid; };

  api.goTo = (view, { instant = false } = {}) => {
    if (!VIEWS.includes(view)) throw new Error(`scene.goTo: unknown view "${view}"`);
    if (!instant && view === api.view) return; // already there, or already on the way
    api.view = view;
    if (view === 'orbit') {
      if (instant) { dive = diveTo = 0; move = null; return; }
      if (dive === 0) return;
      if (dive >= DIVE_END && restTarget !== 'field') copyView(cur, VIEW.field); // the way up starts from the field view
      move = null; diveTo = 0; diveSpeed = ASCENT_SPEED; return;
    }
    restTarget = view;
    if (dive < DIVE_END || diveTo < DIVE_END) {
      if (instant) { dive = diveTo = DIVE_END; copyView(cur, VIEW[view]); move = null; return; }
      diveTo = DIVE_END; diveSpeed = 1; return; // arrives at the field view, then eases to `view` if it differs
    }
    if (instant) { copyView(cur, VIEW[view]); move = null; return; }
    move = { from: { pos: cur.pos.clone(), look: cur.look.clone(), dim: cur.dim, grid: cur.grid }, t0: performance.now(), to: view };
  };
  /** Snap whatever is moving to its end. */
  api.finish = () => {
    dive = diveTo;
    if (dive >= DIVE_END) { move = null; copyView(cur, VIEW[restTarget]); }
  };
  api.moving = () => dive !== diveTo || move !== null;
  /** Seconds until the current camera move ends. */
  api.eta = () => {
    let s = 0;
    if (dive !== diveTo) s += Math.abs(diveTo - dive) / diveSpeed;
    if (move) s = Math.max(s, MOVE_S - (performance.now() - move.t0) / 1000);
    else if (dive !== diveTo && diveTo >= DIVE_END && restTarget !== 'field') s += MOVE_S;
    return Math.max(0, s);
  };
  api.setSlide = () => {};

  /** Stage pixel position of a point in the ground scene. */
  api.project = (p) => { v.copy(p).project(camera); return [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H]; };

  // ---------- frame ----------
  const born = performance.now();
  let last = born, frames = 0;
  function frame(now) {
    const dtReal = Math.max(0, (now - last) / 1000); last = now;
    const dt = Math.min(dtReal, 0.05);
    const t = (now - born) / 1000;
    const tm = api.still ? 0 : t;   // drift time: frozen in print and reduced-motion mode

    if (dive !== diveTo) {
      const stepBy = diveSpeed * dtReal;
      dive = diveTo > dive ? Math.min(diveTo, dive + stepBy) : Math.max(diveTo, dive - stepBy);
      if (dive >= DIVE_END && diveTo >= DIVE_END && restTarget !== 'field') {
        copyView(cur, VIEW.field);
        move = { from: { pos: cur.pos.clone(), look: cur.look.clone(), dim: cur.dim, grid: cur.grid }, t0: now, to: restTarget };
      }
    }
    const onGround = dive >= GLOBE_S;
    orbit.visible = !onGround; ground.visible = onGround;

    let flash = 0;
    if (!onGround) {
      sat.quaternion.copy(satBase).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(tm * 0.12) * 0.22));
      sat.position.copy(satHome).addScaledVector(up, Math.sin(tm * 0.4) * 0.06);
      const p = easeIn(dive / GLOBE_S);
      const drift = Math.sin(tm * 0.2) * 0.45 * (1 - p);
      camera.position.lerpVectors(C0, n.clone().multiplyScalar(R + 0.62), p).addScaledVector(right, drift).addScaledVector(up, Math.cos(tm * 0.16) * 0.22 * (1 - p));
      look.lerpVectors(T0, n.clone().multiplyScalar(R), easeOut(p * 1.6));
      camera.fov = 32 + 26 * p; camera.updateProjectionMatrix(); camera.lookAt(look);
      flash = clamp01((dive - (GLOBE_S - 0.38)) / 0.38);
    } else {
      const g = dive - GLOBE_S;
      const flying = dive < DIVE_END;
      let fade = 1;
      if (flying) {
        // The fall: region, neighbourhood, field, then the tilt into the resting view.
        const p = easeInOut(g / GROUND_S);
        const h = HIGH * Math.pow(LOW / HIGH, p);
        const tilt = easeInOut((g - GROUND_S * 0.78) / (GROUND_S * 0.55));
        cur.pos.lerpVectors(v.set(0.03 * h, h, 0.16 * h), VIEW.field.pos, tilt);
        cur.look.lerpVectors(v.set(0, 0, 0), VIEW.field.look, tilt);
        cur.dim = 1 - (1 - VIEW.field.dim) * tilt; cur.grid = VIEW.field.grid * tilt;
        camera.fov = 58 - 26 * clamp01(g / (GROUND_S * 0.6));
        local.material.opacity = clamp01((70 - h) / 50);
        flash = 1 - clamp01(g / 0.55);
        fade = clamp01((g - GROUND_S) / 0.5);
      } else {
        if (move) {
          // Exponential ease on elapsed time that lands exactly at MOVE_S, so a slow machine still arrives on time.
          const s = (now - move.t0) / 1000;
          const e = clamp01((1 - Math.exp(-MOVE_RATE * s)) / (1 - Math.exp(-MOVE_RATE * MOVE_S)));
          const to = VIEW[move.to];
          cur.pos.lerpVectors(move.from.pos, to.pos, e); cur.look.lerpVectors(move.from.look, to.look, e);
          cur.dim = move.from.dim + (to.dim - move.from.dim) * e; cur.grid = move.from.grid + (to.grid - move.from.grid) * e;
          if (s >= MOVE_S) { move = null; copyView(cur, to); }
        }
        camera.fov = 32;
      }
      camera.updateProjectionMatrix();
      camera.position.copy(cur.pos).add(v.set(Math.sin(tm * 0.3), 0, Math.cos(tm * 0.24)).multiplyScalar(0.012 * cur.pos.y));
      camera.lookAt(cur.look);
      region.material.color.setRGB(cur.dim * 0.86, cur.dim * 0.93, cur.dim); local.material.color.copy(region.material.color); wide.material.color.copy(region.material.color);
      if (!flying) { const high = clamp01((cur.pos.y - 40) / 160); region.material.opacity = 1 - high; local.material.opacity = 1 - high; } else region.material.opacity = 1;
      grid.material.opacity = cur.grid;

      const near = clamp01(1 - (cur.pos.y - 1.3) / 40);              // 1 at the field, 0 high above it
      edgeMat.opacity = near * fade;
      nbMat.opacity = 0.28 * near * fade;
      fill.material.opacity = near * api.fieldFill * fade;
      fill.material.color.set(api.fieldTint || C.field);
    }
    cloud.style.opacity = String(flash);
    for (const fn of frameHooks) fn({ t: tm, dt, dtReal, now, dive, onGround, cur, camera });
    renderer.render(scene, camera);
    if (++frames === 2) { stage.dataset.ready = '1'; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return api;
}

// Without WebGL the page shows the PDF page image of the current slide (assets/stills/NN.png) instead of the scene.
// If the file is missing, the slide text stays over the plain background and nothing throws.
function withoutWebGL(api, stage) {
  const img = document.createElement('img');
  img.className = 'still'; img.alt = '';
  img.onload = () => stage.classList.add('has-still');
  img.onerror = () => stage.classList.remove('has-still');
  stage.prepend(img);
  api.goTo = (view) => { api.view = view; };
  api.finish = () => {};
  api.moving = () => false;
  api.eta = () => 0;
  api.project = () => [0, 0];
  api.setSlide = (n) => { stage.classList.remove('has-still'); img.src = `assets/stills/${String(n).padStart(2, '0')}.png`; };
  stage.dataset.ready = '1';
  return api;
}
