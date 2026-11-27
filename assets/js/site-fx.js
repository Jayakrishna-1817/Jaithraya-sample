/* Jaithraya site effects — shared by pages outside index.html (login).
   1. Ribbon field: the same drifting topological rings + floating capsules as the home page.
   2. Paint cursor: the same Lusion-style paint trail as the home page (copied verbatim).
   Needs: <canvas id="lusionRibbonCanvas"> and <canvas id="paintCursor" class="paint-cursor"> in the page. */

(function setupRibbonField() {
  const canvas = document.getElementById('lusionRibbonCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, time = 0, mouseX = innerWidth / 2, mouseY = innerHeight / 2, raf = 0;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const resize = () => { W = innerWidth; H = innerHeight; canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  resize(); addEventListener('resize', () => { resize(); if (calm) draw(); });
  addEventListener('pointermove', (e) => { mouseX = e.clientX; mouseY = e.clientY; }, { passive: true });
  const capsules = Array.from({ length: 14 }, (_, i) => ({ angle: (i / 14) * Math.PI * 2, radius: 180 + (i % 3) * 110, size: 9 + (i % 3) * 3, speed: 0.0025 + (i % 4) * 0.0008, type: i % 2 === 0 ? 'capsule' : 'shield' }));
  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (!calm) time += 0.011;
    const cx = W * 0.5 + (mouseX - W * 0.5) * 0.08, cy = H * 0.48 + (mouseY - H * 0.5) * 0.08;
    for (let ring = 0; ring < 22; ring++) {
      const progress = ring / 22, base = Math.min(W, H) * (0.16 + progress * 0.28);
      ctx.beginPath();
      for (let s = 0; s <= 68; s++) {
        const th = (s / 68) * Math.PI * 2;
        const r = base + Math.sin(th * 3 + time + ring * 0.22) * 26 + Math.cos(th * 2 - time * 0.8 + ring * 0.15) * 18;
        const px = cx + Math.cos(th) * r, py = cy + Math.sin(th) * r * 0.68 + Math.sin(time + ring * 0.18) * 14;
        s ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = ring % 3 === 0 ? `rgba(200, 130, 89, ${0.095 - progress * 0.055})` : `rgba(42, 107, 92, ${0.11 - progress * 0.06})`;
      ctx.lineWidth = 1.25; ctx.stroke();
    }
    capsules.forEach((c, i) => {
      if (!calm) c.angle += c.speed;
      const x = cx + Math.cos(c.angle + i) * (c.radius + Math.sin(time + i) * 25), y = cy + Math.sin(c.angle + i) * (c.radius * 0.62);
      ctx.save(); ctx.translate(x, y); ctx.rotate(c.angle * 0.5);
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(42, 107, 92, 0.26)' : 'rgba(200, 130, 89, 0.28)';
      ctx.fillStyle = 'rgba(244, 243, 239, 0.78)'; ctx.lineWidth = 1.3; ctx.beginPath();
      if (c.type === 'capsule') ctx.roundRect(-c.size * 1.2, -c.size * 0.55, c.size * 2.4, c.size * 1.1, c.size * 0.55);
      else ctx.arc(0, 0, c.size * 0.65, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke(); ctx.restore();
    });
    if (!calm && !document.hidden) raf = requestAnimationFrame(draw); else raf = 0;
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !raf && !calm) raf = requestAnimationFrame(draw); });
  draw();
})();

  (function setupPaintCursor() {
    const CONFIG = {
      // painting (lusion.co home defaults)
      minRadius: 0, maxRadius: 100, radiusDistanceRange: 100,   // px; trail width grows with mouse speed
      pushStrength: 25,                                         // how far the trail drifts along its own flow
      accelerationDissipation: 0.8,
      velocityDissipation: 0.975, weight1Dissipation: 0.95, weight2Dissipation: 0.8,
      curlScale: 0.02, curlStrength: 3,                         // wispy curl noise in the flow
      // look
      rgbShift: 0.5,                                            // spread of the iridescent hues
      colorMultiplier: 10, shade: 1.25,
      opacity: 0.35,                                            // strength of the colour shift (0–1)
      light: 5,                                                 // glassy highlight/shadow on the trail
      maxAlpha: 1,
    };

    const canvas = document.getElementById('paintCursor');
    const fine = window.matchMedia('(pointer: fine)').matches;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!canvas || !fine || calm) { canvas?.remove(); return; }
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
    if (!gl || !gl.getExtension('EXT_color_buffer_float')) { canvas.remove(); return; }

    // ── shaders ────────────────────────────────────────────────────
    const VERT = `#version 300 es
      in vec2 aPos; out vec2 vUv;
      void main(){ vUv = aPos * .5 + .5; gl_Position = vec4(aPos, 0., 1.); }`;
    const HEAD = `#version 300 es
      precision highp float; in vec2 vUv; out vec4 outColor;`;
    const SRC = {
      // one simulation step of the paint field: rg = velocity (0.5 = still), b/a = two fading weights
      paint: HEAD + `
        uniform sampler2D uPrev, uLow; uniform vec2 uTexel, uScroll, uVel;
        uniform vec4 uFrom, uTo;            // xy = paint px, z = radius px, w = weight
        uniform float uPush, uCurlScale, uCurlStrength; uniform vec3 uFade;
        vec2 hash2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453) * 2. - 1.; }
        float gnoise(vec2 p){ vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
          return mix(mix(dot(hash2(i), f), dot(hash2(i + vec2(1, 0)), f - vec2(1, 0)), u.x),
                     mix(dot(hash2(i + vec2(0, 1)), f - vec2(0, 1)), dot(hash2(i + vec2(1)), f - vec2(1)), u.x), u.y); }
        vec2 curl(vec2 p){ float e = .5;     // divergence-free swirl from noise gradient
          return vec2(gnoise(p + vec2(0, e)) - gnoise(p - vec2(0, e)), gnoise(p - vec2(e, 0)) - gnoise(p + vec2(e, 0))) / (2. * e); }
        void main(){
          vec2 px = gl_FragCoord.xy;
          vec2 ab = uTo.xy - uFrom.xy; float t = clamp(dot(px - uFrom.xy, ab) / max(dot(ab, ab), 1e-4), 0., 1.);
          float dist = length(px - uFrom.xy - ab * t);
          vec2 rw = mix(uFrom.zw, uTo.zw, t);
          float stamp = 1. - smoothstep(-.01, rw.x, dist);
          vec4 low = texture(uLow, vUv - uScroll);
          vec2 back = (.5 - low.xy) * uPush + curl(px * uCurlScale * (1. + low.xy)) * (low.z + low.w) * uCurlStrength;
          vec4 d = texture(uPrev, vUv - uScroll + back * uTexel);
          d.xy -= .5;
          vec4 change = (vec4(uFade.xx, uFade.yz) - 1.) * d + vec4(uVel * stamp, rw.yy * stamp);
          change.zw = sign(change.zw) * max(vec2(.004), abs(change.zw));
          d += change; d.xy += .5;
          outColor = clamp(d, 0., 1.);
        }`,
      copy: HEAD + `uniform sampler2D uTex; void main(){ outColor = texture(uTex, vUv); }`,
      blur: HEAD + `uniform sampler2D uTex; uniform vec2 uDir;
        void main(){ vec4 c = texture(uTex, vUv) * .227;
          c += (texture(uTex, vUv + uDir * 1.385) + texture(uTex, vUv - uDir * 1.385)) * .316;
          c += (texture(uTex, vUv + uDir * 3.231) + texture(uTex, vUv - uDir * 3.231)) * .07;
          outColor = c; }`,
      clear: HEAD + `void main(){ outColor = vec4(.5, .5, 0., 0.); }`,
      // what you see: an iridescent fringe where the trail moves and thins out
      show: HEAD + `uniform sampler2D uPaint; uniform vec2 uTexel; uniform float uRgbShift, uColorMul, uShade, uOpacity, uMaxAlpha, uLight;
        float wt(vec2 uv){ vec4 q = texture(uPaint, uv); return (q.z + q.w) * .5; }
        vec2 vl(vec2 uv){ vec4 q = texture(uPaint, uv); return (.5 - q.xy - .001) * 2. * (q.z + q.w) * .5; }
        void main(){
          vec4 d = texture(uPaint, vUv);
          float w = (d.z + d.w) * .5;
          // slope of the trail → a raised, glassy ribbon (highlight on one side, soft shadow on the other)
          vec2 e = uTexel * 1.5;
          vec2 grad = vec2(wt(vUv + vec2(e.x, 0.)) - wt(vUv - vec2(e.x, 0.)), wt(vUv + vec2(0., e.y)) - wt(vUv - vec2(0., e.y)));
          float lit = dot(grad, normalize(vec2(-.55, .85))) * uLight;
          vec2 v = (.5 - d.xy - .001) * 2. * w;
          float m = max(abs(v.x), abs(v.y));
          // iridescent colour (phase from motion direction), strongest at the trail's edges and tail
          // average the motion over neighbours so the colour bands stay smooth (no speckle at the trail head)
          vec2 vs = (v + vl(vUv + vec2(e.x, 0.)) + vl(vUv - vec2(e.x, 0.)) + vl(vUv + vec2(0., e.y)) + vl(vUv - vec2(0., e.y))) * .2;
          vec3 rainbow = sin(vec3(vs.x + vs.y) * 40. + vec3(0., 2., 4.) * uRgbShift) * smoothstep(1.2, .3, max(abs(vs.x), abs(vs.y)));
          float fringe = smoothstep(.4, -.9, w) * uShade * m * uColorMul * .35 + length(grad) * 2.2;
          vec3 shift = vec3(lit) + rainbow * fringe;
          vec3 col = clamp(.5 + .5 * shift * uOpacity, 0., 1.);  // 0.5 = leaves the page untouched
          float a = clamp(w * 4. + m * 6., 0., uMaxAlpha);
          outColor = vec4(col * a, a);
        }`,
    };
    const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o);
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    let P;
    try {
      const vs = sh(gl.VERTEX_SHADER, VERT);
      P = Object.fromEntries(Object.entries(SRC).map(([k, f]) => {
        const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, f));
        gl.bindAttribLocation(pr, 0, 'aPos'); gl.linkProgram(pr);
        if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
        const u = {}; for (let i = 0, n = gl.getProgramParameter(pr, gl.ACTIVE_UNIFORMS); i < n; i++) { const nm = gl.getActiveUniform(pr, i).name; u[nm] = gl.getUniformLocation(pr, nm); }
        return [k, { use: () => gl.useProgram(pr), u }];
      }));
    } catch (e) { canvas.remove(); return; }

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.enableVertexAttribArray(0);
    gl.disable(gl.BLEND);

    const target = (w, h) => {
      const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      return { tex, fb, w, h };
    };
    const draw = (t) => {
      if (t) { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb); gl.viewport(0, 0, t.w, t.h); }
      else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height); }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    const bind = (unit, t) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t.tex); return unit; };

    let W = 0, H = 0, prev, curr, low, lowTmp;
    function clearAll() { P.clear.use(); [prev, curr, low, lowTmp].forEach(draw); }
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
      const pw = Math.max(1, W >> 2), ph = Math.max(1, H >> 2);           // paint ¼ res
      prev = target(pw, ph); curr = target(pw, ph);
      low = target(Math.max(1, W >> 3), Math.max(1, H >> 3)); lowTmp = target(low.w, low.h);   // ⅛ res
      clearAll();
    }
    resize();
    window.addEventListener('resize', resize);

    // ── input ──────────────────────────────────────────────────────
    const m = { x: 0, y: 0, px: 0, py: 0, has: false };
    let from = [0, 0, 0, 0], to = [0, 0, 0, 0], vel = [0, 0];
    let lastY = window.scrollY, lastActive = 0, running = false, last = 0;
    const wake = () => { lastActive = performance.now(); if (!running && !document.hidden) { running = true; canvas.classList.add('is-live'); last = performance.now(); lastY = window.scrollY; requestAnimationFrame(frame); } };
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      if (!m.has) { m.px = e.clientX; m.py = e.clientY; m.has = true; }
      m.x = e.clientX; m.y = e.clientY; wake();
    }, { passive: true });
    // click: a quick swirl of paint around the click point
    const swirl = { left: 0, cx: 0, cy: 0, a: 0 };
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      if (!m.has) { m.x = m.px = e.clientX; m.y = m.py = e.clientY; m.has = true; }
      Object.assign(swirl, { left: 14, cx: e.clientX, cy: e.clientY, a: Math.random() * Math.PI * 2 });
      wake();
    }, { passive: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && m.has) wake(); });

    function frame(now) {
      const dt = Math.min((now - last) / 1000, 1 / 30); last = now;
      const pw = curr.w, ph = curr.h;
      // page scroll carries the paint with the content
      const sy = window.scrollY, scrollDy = sy - lastY; lastY = sy;
      const scrollUv = scrollDy / H;
      // trail width comes only from mouse movement (scrolling never paints)
      let px = m.x, py = m.y, moved = Math.hypot(m.x - m.px, m.y - m.py);
      if (swirl.left > 0) {                        // click swirl: trace a small spiral round the click point
        swirl.left--; swirl.a += 0.75;
        const rad = 18 + (14 - swirl.left) * 3;
        px = swirl.cx + Math.cos(swirl.a) * rad; py = swirl.cy + Math.sin(swirl.a) * rad;
        moved = 70;
      }
      let r = CONFIG.minRadius + (CONFIG.maxRadius - CONFIG.minRadius) * Math.min(1, moved / CONFIG.radiusDistanceRange);
      if (!m.has || moved === 0) r = 0;
      r = r / H * ph;
      from = to.slice();
      to = [px / W * pw, (1 - py / H) * ph, r, 1];
      if (swirl.left === 13) from = to.slice();   // don't streak from the old mouse spot into the swirl
      if (from[3] === 0) from = to.slice();
      vel = [vel[0] * CONFIG.accelerationDissipation + (to[0] - from[0]) * dt * 0.8,
             vel[1] * CONFIG.accelerationDissipation + (to[1] - from[1]) * dt * 0.8];
      m.px = m.x; m.py = m.y;

      // simulate
      [prev, curr] = [curr, prev];
      P.paint.use();
      gl.uniform1i(P.paint.u.uPrev, bind(0, prev)); gl.uniform1i(P.paint.u.uLow, bind(1, low));
      gl.uniform2f(P.paint.u.uTexel, 1 / pw, 1 / ph); gl.uniform2f(P.paint.u.uScroll, 0, -scrollUv);
      gl.uniform4f(P.paint.u.uFrom, ...from); gl.uniform4f(P.paint.u.uTo, ...to);
      gl.uniform2f(P.paint.u.uVel, vel[0], vel[1]);
      gl.uniform1f(P.paint.u.uPush, CONFIG.pushStrength);
      gl.uniform1f(P.paint.u.uCurlScale, CONFIG.curlScale); gl.uniform1f(P.paint.u.uCurlStrength, CONFIG.curlStrength);
      gl.uniform3f(P.paint.u.uFade, CONFIG.velocityDissipation, CONFIG.weight1Dissipation, CONFIG.weight2Dissipation);
      draw(curr);
      // blurred low-res copy that drives the flow next frame
      P.copy.use(); gl.uniform1i(P.copy.u.uTex, bind(0, curr)); draw(low);
      P.blur.use();
      gl.uniform1i(P.blur.u.uTex, bind(0, low)); gl.uniform2f(P.blur.u.uDir, 1 / low.w, 0); draw(lowTmp);
      gl.uniform1i(P.blur.u.uTex, bind(0, lowTmp)); gl.uniform2f(P.blur.u.uDir, 0, 1 / low.h); draw(low);
      // show
      P.show.use();
      gl.uniform1i(P.show.u.uPaint, bind(0, curr)); gl.uniform2f(P.show.u.uTexel, 1 / pw, 1 / ph); gl.uniform1f(P.show.u.uLight, CONFIG.light);
      gl.uniform1f(P.show.u.uRgbShift, CONFIG.rgbShift); gl.uniform1f(P.show.u.uColorMul, CONFIG.colorMultiplier);
      gl.uniform1f(P.show.u.uShade, CONFIG.shade); gl.uniform1f(P.show.u.uOpacity, CONFIG.opacity);
      gl.uniform1f(P.show.u.uMaxAlpha, CONFIG.maxAlpha);
      draw(null);

      // sleep ~2.5s after the last mouse move / scroll (the trail has faded by then)
      if (document.hidden || now - lastActive > 2500) {
        running = false; canvas.classList.remove('is-live'); clearAll();
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        to[3] = 0; vel = [0, 0];
        return;
      }
      requestAnimationFrame(frame);
    }
  })();
