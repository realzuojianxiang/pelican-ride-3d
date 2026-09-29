import * as THREE from 'three';

/**
 * 视觉特效：后轮尘土、冲刺拖尾光带、速度线、铃声波纹
 * 全部基于 Points + 自定义着色器，零外部资源。
 */
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;

    /* ---------- 尘土粒子池 ---------- */
    this.N = 420;
    const pos = new Float32Array(this.N * 3);
    const seed = new Float32Array(this.N);
    const life = new Float32Array(this.N);
    const size = new Float32Array(this.N);
    for (let i = 0; i < this.N; i++) {
      life[i] = Math.random();                 // 0..1 初始相位错开
      seed[i] = Math.random() * 100;
      size[i] = 0.10 + Math.random() * 0.30;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.setAttribute('aLife', new THREE.BufferAttribute(life, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.NormalBlending,
      uniforms: { uTime: { value: 0 }, uPix: { value: Math.min(devicePixelRatio, 2) } },
      vertexShader: `
        attribute float aSeed; attribute float aLife; attribute float aSize;
        uniform float uTime; uniform float uPix;
        varying float vA;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * 260.0 * uPix / max(-mv.z, 0.5);
          vA = clamp(aLife, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        varying float vA;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if(d > 0.5) discard;
          float a = smoothstep(0.5, 0.05, d) * vA * 0.42;
          vec3 col = mix(vec3(0.86,0.76,0.58), vec3(0.72,0.62,0.46), vA);
          gl_FragColor = vec4(col, a);
        }
      `,
    });
    this.dust = new THREE.Points(geo, mat);
    this.dust.frustumCulled = false;
    scene.add(this.dust);
    this.dustMat = mat;
    this.dustPos = pos;
    this.dustLife = life;
    this.dustCursor = 0;

    /* ---------- 冲刺拖尾光带 ---------- */
    this.trailLen = 90;
    const tp = new Float32Array(this.trailLen * 3);
    const ta = new Float32Array(this.trailLen);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(tp, 3));
    tg.setAttribute('aA', new THREE.BufferAttribute(ta, 1));
    tg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const tmat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(0x8ef0ff) } },
      vertexShader: `
        attribute float aA; varying float vA;
        void main(){
          vA = aA;
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (12.0 + aA * 26.0) * ${Math.min(devicePixelRatio, 2).toFixed(1)} / max(-mv.z, 0.5) * 6.0;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor; varying float vA;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if(d>0.5) discard;
          float a = smoothstep(0.5, 0.0, d) * vA * 0.55;
          gl_FragColor = vec4(uColor, a);
        }
      `,
    });
    this.trail = new THREE.Points(tg, tmat);
    this.trail.frustumCulled = false;
    scene.add(this.trail);
    this.trailPos = tp;
    this.trailA = ta;
    this.trailCursor = 0;
    this.trailCount = 0;

    /* ---------- 速度线 ---------- */
    this.lineCount = 60;
    const lp = new Float32Array(this.lineCount * 6);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(lp, 3));
    lg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const lmat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.speedLines = new THREE.LineSegments(lg, lmat);
    this.speedLines.frustumCulled = false;
    scene.add(this.speedLines);
    this.linePos = lp;
    this.lineSeeds = [];
    for (let i = 0; i < this.lineCount; i++) {
      this.lineSeeds.push({
        a: Math.random() * Math.PI * 2,
        r: 1.6 + Math.random() * 3.4,
        z: 2 + Math.random() * 10,
        len: 1.2 + Math.random() * 2.6,
        sp: 0.8 + Math.random() * 1.4,
      });
    }

    /* ---------- 铃声波纹 ---------- */
    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.3, 0.34, 48);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: 0xffd977, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      m.visible = false;
      scene.add(m);
      this.rings.push({ mesh: m, life: 0 });
    }
  }

  ring(pos) {
    const r = this.rings.find((x) => x.life <= 0) || this.rings[0];
    r.life = 1;
    r.mesh.visible = true;
    r.mesh.position.copy(pos);
    r.mesh.scale.setScalar(0.4);
  }

  update(dt, t, rigPos, speed, boost, wheelR, lean) {
    this.time = t;

    /* --- 尘土：从后轮触地点抛出 --- */
    const emit = Math.max(0, speed / 12) * (boost ? 2.2 : 1) * 90 * dt;
    const nEmit = Math.floor(emit) + (Math.random() < emit % 1 ? 1 : 0);
    for (let i = 0; i < nEmit; i++) {
      const idx = this.dustCursor % this.N;
      const z = rigPos.z + 0.53 + Math.random() * 0.25;
      this.dustPos[idx * 3 + 0] = rigPos.x + (Math.random() - 0.5) * 0.36 - lean * 0.3;
      this.dustPos[idx * 3 + 1] = 0.02 + Math.random() * 0.12;
      this.dustPos[idx * 3 + 2] = z;
      this.dustLife[idx] = 1;
      this.dustCursor++;
    }
    // 老化 + 上升 + 向后飘
    for (let i = 0; i < this.N; i++) {
      if (this.dustLife[i] <= 0) continue;
      this.dustLife[i] -= dt * 0.85;
      if (this.dustLife[i] < 0) this.dustLife[i] = 0;
      this.dustPos[i * 3 + 1] += dt * (0.30 + (1 - this.dustLife[i]) * 0.5);
      this.dustPos[i * 3 + 2] += dt * (1.2 + speed * 0.35);
      this.dustPos[i * 3 + 0] += dt * 0.25;
    }
    this.dust.geometry.attributes.position.needsUpdate = true;
    this.dust.geometry.attributes.aLife.needsUpdate = true;
    this.dustMat.uniforms.uTime.value = t;

    /* --- 冲刺拖尾 --- */
    if (boost && speed > 3) {
      const idx = this.trailCursor % this.trailLen;
      this.trailPos[idx * 3 + 0] = rigPos.x + 0.55 + (Math.random() - 0.5) * 0.2;
      this.trailPos[idx * 3 + 1] = 0.55 + Math.random() * 0.12;
      this.trailPos[idx * 3 + 2] = rigPos.z + 0.4;
      this.trailA[idx] = 1;
      this.trailCursor++;
      this.trailCount = Math.min(this.trailCount + 1, this.trailLen);
    }
    for (let i = 0; i < this.trailLen; i++) {
      if (this.trailA[i] > 0) this.trailA[i] = Math.max(0, this.trailA[i] - dt * 0.9);
    }
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.geometry.attributes.aA.needsUpdate = true;

    /* --- 速度线：仅在高速时出现 --- */
    const k = Math.max(0, (speed - 7.5) / 8);
    this.speedLines.material.opacity = Math.min(k, 1) * 0.5;
    if (k > 0.01) {
      for (let i = 0; i < this.lineCount; i++) {
        const s = this.lineSeeds[i];
        s.z -= dt * (30 + speed * 4) * s.sp * 0.5;
        if (s.z < -6) {
          s.z = 6 + Math.random() * 14;
          s.a = Math.random() * Math.PI * 2;
          s.r = 1.6 + Math.random() * 3.4;
        }
        const L = s.len * (0.4 + k);
        const x0 = rigPos.x + Math.cos(s.a) * s.r;
        const y0 = 0.9 + Math.sin(s.a) * s.r * 0.55;
        const z0 = rigPos.z - 1.5 - (s.z - 10) * -1;
        this.linePos[i * 6 + 0] = x0;
        this.linePos[i * 6 + 1] = y0;
        this.linePos[i * 6 + 2] = z0;
        this.linePos[i * 6 + 3] = x0;
        this.linePos[i * 6 + 4] = y0;
        this.linePos[i * 6 + 5] = z0 + L;
      }
      this.speedLines.geometry.attributes.position.needsUpdate = true;
    }

    /* --- 铃声波纹扩散 --- */
    for (const r of this.rings) {
      if (r.life <= 0) { r.mesh.visible = false; continue; }
      r.life -= dt * 1.3;
      const s = 0.4 + (1 - r.life) * 4.5;
      r.mesh.scale.setScalar(s);
      r.mesh.material.opacity = Math.max(0, r.life) * 0.55;
      r.mesh.rotation.y = -this.time * 0.6;
      r.mesh.rotation.x = Math.PI / 2;
    }
  }
}
