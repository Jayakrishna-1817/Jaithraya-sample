// Jaithraya login — Mixamo character player (three.js + FBXLoader).
// Plays the intro: walk in → set the briefcase down → look around → snap → jump (form pops out) → lean/idle,
// then reacts to the form (looks at fields, looks away / covers eyes for the password, shakes head, cheers).
// Files live next to this script; see README.md for what to download from mixamo.com.
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const BASE = new URL('./', import.meta.url).href;
export const FILES = {
  character: 'character.fbx',   // required — the character "With Skin" (a web-optimised character.glb is preferred if present)
  walk: 'walking.fbx',          // required — "Walking", In Place ticked
  idle: 'idle.fbx',             // required — final pose: "Leaning" / "Standing Arms Crossed" / any idle
  throw: 'throw.fbx',           // optional — "Throw": he throws the case; the form bursts out where it lands
  putdown: 'put_down.fbx',      // optional — "Picking Up Object" / "Put Down" (used when there is no throw clip)
  look: 'looking_around.fbx',   // optional — "Looking Around"
  snap: 'snap.fbx',             // optional — "Snap Fingers" / "Thinking"
  jump: 'jump.fbx',             // optional — "Jump"
  no: 'shaking_head_no.fbx',    // optional — "Shaking Head No"
  cheer: 'cheering.fbx',        // optional — "Cheering"
  cover: 'cover_eyes.fbx',      // optional — anything with hands over the face
};
const REQUIRED = ['character', 'walk', 'idle'];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const easeOut = (u) => 1 - Math.pow(1 - u, 3);

function loadFBX(loader, file) {
  return new Promise((resolve) => loader.load(BASE + file, resolve, undefined, () => resolve(null)));
}

// keep clips in place (we move the character ourselves) — zero the hips' horizontal travel
function makeInPlace(clip) {
  for (const tr of clip.tracks) {
    if (!/Hips\.position$/.test(tr.name)) continue;
    const v = tr.values, x0 = v[0], z0 = v[2];
    for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
  }
  return clip;
}

// Mixamo exports can give every clothing piece its own copy of the skeleton (same bone names).
// Animations bind to the first bone with a name, so rebind every skinned mesh to ONE shared skeleton.
export function unifySkeletons(model) {
  const clean = (n) => n.replace(/_\d+$/, '');
  let primary = null;
  model.traverse((o) => { if (o.isSkinnedMesh && (!primary || o.skeleton.bones.length > primary.skeleton.bones.length)) primary = o; });
  if (!primary) return 0;
  const byName = new Map(primary.skeleton.bones.map((b) => [clean(b.name), b]));
  let rebound = 0;
  model.traverse((o) => {
    if (!o.isSkinnedMesh || o === primary) return;
    const bones = o.skeleton.bones.map((b) => byName.get(clean(b.name)) || b);
    if (bones.some((b, i) => b !== o.skeleton.bones[i])) { o.bind(new THREE.Skeleton(bones, o.skeleton.boneInverses), o.bindMatrix); rebound++; }
  });
  return rebound;
}

export async function start({ stage, card, skipBtn }) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const loader = new FBXLoader();

  // ── load everything (required files must exist). The character prefers the optimised .glb. ──
  const loadGLB = (file) => new Promise((resolve) => new GLTFLoader().load(BASE + file, (g) => resolve(g.scene), undefined, () => resolve(null)));
  const entries = await Promise.all(Object.entries(FILES).map(async ([k, f]) => {
    if (k === 'character') return [k, (await loadGLB('character.glb')) || (await loadFBX(loader, f))];
    return [k, await loadFBX(loader, f)];
  }));
  const fbx = Object.fromEntries(entries);
  if (REQUIRED.some((k) => !fbx[k])) throw new Error('Mixamo files missing: ' + REQUIRED.filter((k) => !fbx[k]).join(', '));
  if (window.__jtMixamoCancelled) return false;

  const model = fbx.character;
  const clips = {};
  for (const [k, obj] of Object.entries(fbx)) {
    if (k === 'character' || !obj || !obj.animations?.length) continue;
    clips[k] = makeInPlace(obj.animations[0].clone());
    clips[k].name = k;
  }

  // ── renderer / scene ──
  const canvas = document.createElement('canvas');
  canvas.id = 'scene3d'; canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', zIndex: '3', pointerEvents: 'none', display: 'block' });
  stage.prepend(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.set(0, 3.2, 20); camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8cdbf, 1.25));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 6; key.shadow.bias = -0.0006;
  Object.assign(key.shadow.camera, { left: -2.5, right: 2.5, top: 3, bottom: -1, near: 0.5, far: 30 });
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xffe2d1, 0.55); rim.position.set(-5, 3, -4); scene.add(rim);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 8), new THREE.ShadowMaterial({ opacity: 0.16 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  // ── character: normalise size (Mixamo is in cm) and stand on y = 0 ──
  const root = new THREE.Group(); scene.add(root);
  model.traverse((o) => {
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = true; o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => { if (m.map) m.map.colorSpace = THREE.SRGBColorSpace; if ('shininess' in m) m.shininess = Math.min(m.shininess, 20); });
    }
  });
  root.add(model);
  unifySkeletons(model);
  const box = new THREE.Box3().setFromObject(model);
  const h = box.max.y - box.min.y || 180;
  const k = 2.0 / h;
  model.scale.setScalar(k);
  model.position.y = -box.min.y * k;

  const bone = (re) => { let b = null; model.traverse((o) => { if (!b && o.isBone && re.test(o.name)) b = o; }); return b; };
  const B = { hand: bone(/RightHand$/i), head: bone(/Head$/i), neck: bone(/Neck$/i) };

  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const [k2, c] of Object.entries(clips)) actions[k2] = mixer.clipAction(c);
  const SPEED = 1.15;
  Object.values(actions).forEach((a) => { a.timeScale = SPEED; });
  let current = null;
  const play = (name, { loop = false, fade = 0.3 } = {}) => {
    const a = actions[name]; if (!a) return 0;
    a.reset(); a.enabled = true; a.setEffectiveWeight(1);
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1); a.clampWhenFinished = !loop;
    if (current && current !== a) a.crossFadeFrom(current, fade, true); else a.fadeIn(fade);
    a.play(); current = a;
    return a.getClip().duration / SPEED;
  };

  // ── briefcase ──
  const M = (hex, r = 0.5) => new THREE.MeshStandardMaterial({ color: hex, roughness: r });
  const bcase = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.38, 0.25, 0.11, 4, 0.025), M(0x8B4527)); body.castShadow = true; bcase.add(body);
  const lid = new THREE.Group(); lid.position.set(0, 0.125, -0.055); bcase.add(lid);
  const lidMesh = new THREE.Mesh(new RoundedBoxGeometry(0.385, 0.04, 0.114, 3, 0.016), M(0x6A321B)); lidMesh.position.set(0, 0, 0.056); lid.add(lidMesh);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.013, 10, 22, Math.PI), M(0x5A2A15)); handle.position.set(0, 0.022, 0.056); lid.add(handle);
  const clasp = new THREE.Mesh(new RoundedBoxGeometry(0.055, 0.032, 0.014, 2, 0.006), new THREE.MeshStandardMaterial({ color: 0xE2B048, roughness: 0.3, metalness: 0.7 })); clasp.position.set(0, -0.012, 0.058); lid.add(clasp);
  const CASE_HALF = 0.135;
  scene.add(bcase);
  let caseMode = B.hand ? 'carried' : 'ground';
  const handWorld = new THREE.Vector3();

  // snap sparks
  const sparks = new THREE.Group(); sparks.visible = false; scene.add(sparks);
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xEC5E27, transparent: true });
  const bits = Array.from({ length: 7 }, () => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.06, 4, 8), sparkMat); sparks.add(m); return m; });

  // ── layout: card on screen → world positions ──
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit = new THREE.Vector3();
  let W = 1, H = 1, S = 200, mobile = false;
  const L = { groundY: 0, x0: -6, xStop: -2, leanX: -1 };
  const worldAt = (px, py) => { ndc.set((px / W) * 2 - 1, -(py / H) * 2 + 1); ray.setFromCamera(ndc, camera); return ray.ray.intersectPlane(planeZ, hit) ? hit.clone() : new THREE.Vector3(); };
  const screenOf = (v) => { const p = v.clone().project(camera); return { x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H }; };
  function layout() {
    W = stage.clientWidth; H = stage.clientHeight; renderer.setSize(W, H, false);
    mobile = window.innerWidth < 900;
    const cr = { left: card.offsetLeft, top: card.offsetTop, w: card.offsetWidth, h: card.offsetHeight };
    S = mobile ? clamp(W * 0.44, 150, 200) / 2.05 : clamp(cr.h * 0.95, 300, 640) / 2.05;
    camera.left = -W / 2 / S; camera.right = W / 2 / S; camera.top = H / 2 / S; camera.bottom = -H / 2 / S;
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    const groundPx = mobile ? cr.top - 2 : cr.top + cr.h - 6;
    L.groundY = worldAt(W / 2, groundPx).y;
    const cardLeftX = worldAt(cr.left, groundPx).x;
    if (mobile) { L.xStop = cardLeftX + 0.5; L.leanX = L.xStop; }
    else { L.leanX = cardLeftX - 0.42; L.xStop = L.leanX - 0.8; }
    L.x0 = Math.min(worldAt(0, groundPx).x - 0.7, L.xStop - 1.8);
    L.landX = worldAt(cr.left + cr.w / 2, groundPx).x;
    ground.position.y = L.groundY;
  }
  layout();

  // ── state ──
  let phase = 'intro', cardShown = false, ry = Math.PI / 2, ryTarget = ry, x = L.x0, mode = 'idle';
  let headYaw = 0, headPitch = 0, shakeT = -9, nodT = -9, cheerT = -9, sparkT = -1, walkTo = null;
  const pointer = { x: null, y: null };
  const clock = new THREE.Clock();
  let t = 0;

  function caseTo(modeName) {
    if (modeName === 'ground') {
      const p = bcase.position; p.y = L.groundY + CASE_HALF; p.z = 0.15; bcase.rotation.set(0, 0.15, 0);
    }
    caseMode = modeName;
  }
  function showCard(fast) {
    if (cardShown) return; cardShown = true; if (skipBtn) skipBtn.hidden = true;
    const Mo = window.Motion, cr = card.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    let dx = 0, dy = 0;
    if (bcase.visible) { const s = screenOf(bcase.getWorldPosition(new THREE.Vector3())); dx = s.x + sr.left - (cr.left + cr.width / 2); dy = s.y + sr.top - (cr.top + cr.height / 2); }
    card.classList.add('is-shown');
    if (fast || reduced || !Mo?.animate) { card.style.transform = ''; card.style.opacity = ''; return; }
    Mo.animate(card, { opacity: [0, 1], scale: [0.06, 1], x: [dx, 0], y: [dy, 0], rotate: [-6, 0] }, { type: 'spring', stiffness: 170, damping: 17, mass: 0.9 });
  }
  const focusEmail = () => { const a = document.activeElement; if (!a || a === document.body) document.getElementById('email')?.focus({ preventScroll: true }); };
  const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
  let skipped = false;

  function toIdle(fast) {
    phase = 'live'; walkTo = null; x = L.leanX; ryTarget = mobile ? 0.2 : 0.12; if (fast) ry = ryTarget;
    caseMode = 'gone'; bcase.visible = false;
    play('idle', { loop: true, fade: fast ? 0.01 : 0.45 });
    showCard(fast); focusEmail();
  }
  function finishIntro() { if (phase !== 'intro') return; skipped = true; toIdle(true); }

  async function intro() {
    if (reduced) { toIdle(true); return; }
    if (skipBtn) skipBtn.hidden = false;
    // walk in
    play('walk', { loop: true, fade: 0.01 });
    walkTo = { x: L.xStop, speed: 1.55 };
    while (walkTo && !skipped) await wait(0.05);
    if (skipped) return;
    // premium path: throw the case — it flies in a spinning arc, lands, bursts open and the form springs out
    if (actions.throw) {
      ryTarget = 1.15;
      const dThrow = play('throw', { fade: 0.2 });
      await wait(dThrow * 0.42); if (skipped) return;
      B.hand?.getWorldPosition(handWorld);
      const Tf = 0.75, g = -14;
      flight = { t0: t, Tf, g, x0: handWorld.x, y0: handWorld.y - 0.2, z0: handWorld.z,
        tx: L.landX, ty: L.groundY + CASE_HALF };
      flight.vx = (flight.tx - flight.x0) / Tf; flight.vy = (flight.ty - flight.y0 - 0.5 * g * Tf * Tf) / Tf;
      caseMode = 'flying';
      await wait(Tf); if (skipped) return;
      caseMode = 'ground'; landT = t; bcase.position.set(flight.tx, flight.ty, 0.15); bcase.rotation.set(0, 0.15, 0);
      ryTarget = 0.25; play('idle', { loop: true, fade: 0.4 });
      await wait(0.25); if (skipped) return;
      popT = t; showCard(false);
      sparkT = t; sparks.position.copy(bcase.position).add(new THREE.Vector3(0, 0.15, 0.1)); sparks.visible = true;
      if (actions.cheer) { play('cheer', { fade: 0.2 }); await wait(Math.min(1.2, actions.cheer.getClip().duration / SPEED)); }
      else await wait(0.6);
      if (skipped) return;
      if (Math.abs(L.leanX - x) > 0.08) { ryTarget = Math.PI / 2; play('walk', { loop: true, fade: 0.25 }); walkTo = { x: L.leanX, speed: 1.4 }; while (walkTo && !skipped) await wait(0.05); if (skipped) return; }
      toIdle(false);
      return;
    }
    // set the briefcase down (in front of him, still facing right)
    const dPut = play('putdown', { fade: 0.25 });
    if (dPut) { await wait(dPut * 0.5); if (skipped) return; caseTo('ground'); await wait(dPut * 0.42); }
    else { caseTo('ground'); await wait(0.2); }
    if (skipped) return;
    // turn to us, look around
    ryTarget = 0.25;
    const dLook = play('look', { fade: 0.3 });
    if (!dLook) play('idle', { loop: true, fade: 0.3 });
    await wait(dLook ? Math.min(dLook, 2.2) * 0.85 : 0.6); if (skipped) return;
    // snap
    const dSnap = play('snap', { fade: 0.25 });
    await wait(dSnap ? dSnap * 0.55 : 0.2); if (skipped) return;
    sparkT = t; B.hand?.getWorldPosition(handWorld); sparks.position.copy(handWorld).add(new THREE.Vector3(0.05, 0.08, 0.15)); sparks.visible = true;
    if (dSnap) await wait(dSnap * 0.3); if (skipped) return;
    // jump — the form pops out of the briefcase on landing
    const dJump = play('jump', { fade: 0.2 });
    await wait(dJump ? dJump * 0.68 : 0.15); if (skipped) return;
    popT = t; showCard(false);
    await wait(dJump ? dJump * 0.3 : 0.3); if (skipped) return;
    // step over to the card and settle into the final pose
    if (Math.abs(L.leanX - x) > 0.08) {
      ryTarget = Math.PI / 2; play('walk', { loop: true, fade: 0.25 });
      walkTo = { x: L.leanX, speed: 1.4 };
      while (walkTo && !skipped) await wait(0.05);
      if (skipped) return;
    }
    toIdle(false);
  }
  let popT = -1, flight = null, landT = -1;

  window.__jtScene = {
    mode(m) {
      if (phase === 'intro' && !cardShown) finishIntro();
      const prev = mode; mode = m;
      if (phase !== 'live') return;
      if ((m === 'cover' || m === 'peek') && actions.cover && prev !== 'cover' && prev !== 'peek') play('cover', { loop: false, fade: 0.25 });
      if ((m === 'email' || m === 'idle') && (prev === 'cover' || prev === 'peek') && actions.cover) play('idle', { loop: true, fade: 0.3 });
    },
    nod() { nodT = t; },
    shake() { shakeT = t; if (phase === 'live' && actions.no) { play('no', { fade: 0.2 }); setTimeout(() => phase === 'live' && play('idle', { loop: true, fade: 0.35 }), (actions.no.getClip().duration / SPEED) * 900); } },
    cheer() { cheerT = t; mode = 'cheer'; if (phase === 'live' && actions.cheer) play('cheer', { loop: true, fade: 0.2 }); },
  };
  skipBtn?.addEventListener('click', finishIntro);
  window.addEventListener('keydown', (e) => { if (phase === 'intro' && e.key !== 'Tab') finishIntro(); }, { passive: true });
  stage.addEventListener('pointerdown', () => { if (phase === 'intro' && t > 0.6) finishIntro(); });
  window.addEventListener('pointermove', (e) => { const sr = stage.getBoundingClientRect(); pointer.x = e.clientX - sr.left; pointer.y = e.clientY - sr.top; }, { passive: true });
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { layout(); if (phase === 'live') x = L.leanX; }, 120); });

  const headW = new THREE.Vector3();
  function lookTarget() {
    let px = null, py = null;
    if (mode === 'email') { const r = document.getElementById('email').getBoundingClientRect(), sr = stage.getBoundingClientRect(); px = r.left - sr.left + r.width * 0.55; py = r.top - sr.top + r.height / 2; }
    else if (mode === 'idle' && pointer.x != null) { px = pointer.x; py = pointer.y; }
    if (px == null || !B.head) return [0, 0];
    B.head.getWorldPosition(headW); const hs = screenOf(headW);
    return [clamp((px - hs.x) / (W * 0.35), -1, 1) * 0.7 - ry * 0.5, clamp((py - hs.y) / (H * 0.6), -1, 1) * 0.4];
  }

  function frame() {
    const dt = Math.min(0.05, clock.getDelta()); t += dt;
    // walking: move along x, face the direction of travel
    if (walkTo) {
      const dir = Math.sign(walkTo.x - x), step = walkTo.speed * dt;
      if (Math.abs(walkTo.x - x) <= step) { x = walkTo.x; walkTo = null; } else x += dir * step;
    }
    ry += (ryTarget - ry) * (1 - Math.exp(-dt * 6));
    root.position.set(x, L.groundY, 0); root.rotation.y = ry;
    const cheerLift = mode === 'cheer' && !actions.cheer ? Math.max(0, Math.sin((t - cheerT) * 7)) * 0.12 : 0;
    root.position.y += cheerLift;
    mixer.update(dt);

    // head: look at the field / pointer, look away for the password if there's no cover clip, shake, nod
    let [yaw, pitch] = phase === 'live' ? lookTarget() : [0, 0];
    if (phase === 'live' && (mode === 'cover' || mode === 'peek') && !actions.cover) { yaw = mode === 'cover' ? -0.95 : -0.45; pitch = 0.15; }
    const ds = t - shakeT; if (ds < 0.7 && !actions.no) yaw += Math.sin(ds * 26) * 0.45 * (1 - ds / 0.7);
    const dn = t - nodT; if (dn < 0.25) pitch += Math.sin((dn / 0.25) * Math.PI) * 0.12;
    headYaw += (yaw - headYaw) * (1 - Math.exp(-dt * 8)); headPitch += (pitch - headPitch) * (1 - Math.exp(-dt * 8));
    if (B.head) { B.head.rotation.y += headYaw * 0.7; B.head.rotation.x += headPitch * 0.7; }
    if (B.neck) { B.neck.rotation.y += headYaw * 0.3; }

    // briefcase follows the hand until it is set down; opens and shrinks when the form pops out
    if (caseMode === 'carried' && B.hand) {
      model.updateMatrixWorld(true); B.hand.getWorldPosition(handWorld);
      bcase.position.set(handWorld.x, handWorld.y - 0.2, handWorld.z); bcase.rotation.set(0, 0, 0);
    }
    if (caseMode === 'flying' && flight) {
      const k = clamp(t - flight.t0, 0, flight.Tf);
      bcase.position.set(flight.x0 + flight.vx * k, flight.y0 + flight.vy * k + 0.5 * flight.g * k * k, flight.z0);
      bcase.rotation.set(0, 0.15, -Math.PI * 2 * (k / flight.Tf));           // one full spin, lands upright
    } else if (caseMode === 'ground' && landT >= 0 && popT < 0) {
      const u = clamp((t - landT) / 0.2, 0, 1);
      bcase.position.y = L.groundY + CASE_HALF + Math.sin(u * Math.PI) * 0.06 * (1 - u * 0.4);
      bcase.rotation.z = Math.sin(u * Math.PI * 2) * 0.1 * (1 - u);
    }
    if (popT >= 0 && bcase.visible) {
      const u = t - popT;
      lid.rotation.x = -1.5 * easeOut(clamp(u / 0.18, 0, 1));
      const s = 1 - easeOut(clamp((u - 0.05) / 0.25, 0, 1)); bcase.scale.setScalar(Math.max(0.001, s)); if (s <= 0.002) bcase.visible = false;
    }
    if (sparkT >= 0) {
      const u = (t - sparkT) / 0.4;
      if (u >= 1) { sparks.visible = false; sparkT = -1; }
      else bits.forEach((b, i) => { const a = (i / bits.length) * Math.PI * 2, r = 0.05 + u * 0.22; b.position.set(Math.cos(a) * r, Math.sin(a) * r, 0); b.rotation.z = a + Math.PI / 2; b.scale.setScalar(1 - u * 0.6); sparkMat.opacity = 1 - u; });
    }
    key.position.set(x + 1.1, L.groundY + 8, 3.5); key.target.position.set(x, L.groundY + 1, 0);
    renderer.render(scene, camera);
    if (!document.hidden) raf = requestAnimationFrame(frame);
  }
  let raf = requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { clock.getDelta(); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); } });
  intro();
  return true;
}
