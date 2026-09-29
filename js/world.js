import * as THREE from 'three';
import { tube, plate, shapeFromPoints } from './util.js';

export const ROAD_LEN = 260;
export const ROAD_HALF = 7.2;

/**
 * 无尽公路：路面 + 车道虚线 + 护栏 + 里程牌 + 棕榈树 + 沙丘 + 云 + 远山
 */
export class World {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.fog = new THREE.Fog(0xbcd8ea, 26, 150);
    scene.fog = this.fog;

    this.buildSky();
    this.buildLights(scene);
    this.buildGround();
    this.buildRoad();
    this.buildProps();
    this.buildClouds();
    this.buildBirds();
    this.buildButterflies();
  }

  /* ---------- 天空：渐变穹顶 + 太阳 ---------- */
  buildSky() {
    const geo = new THREE.SphereGeometry(400, 32, 20);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x2b6fc4) },
        mid: { value: new THREE.Color(0x8fc4e8) },
        bot: { value: new THREE.Color(0xf6d9a8) },
        sunDir: { value: new THREE.Vector3(0.45, 0.32, -1).normalize() },
        sunColor: { value: new THREE.Color(0xfff0c2) },
      },
      vertexShader: `
        varying vec3 vPos;
        void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: `
        uniform vec3 top, mid, bot, sunColor; uniform vec3 sunDir;
        varying vec3 vPos;
        void main(){
          vec3 d = normalize(vPos);
          float h = clamp(d.y*1.15 + 0.08, -1.0, 1.0);
          vec3 c = mix(bot, mid, smoothstep(-0.15, 0.28, h));
          c = mix(c, top, smoothstep(0.25, 0.85, h));
          float s = max(dot(d, normalize(sunDir)), 0.0);
          c += sunColor * (pow(s, 64.0) * 1.6 + pow(s, 8.0) * 0.28);
          gl_FragColor = vec4(c, 1.0);
        }
      `,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.frustumCulled = false;
    this.group.add(this.sky);
    this.skyMat = mat;
  }

  buildLights(scene) {
    const hemi = new THREE.HemisphereLight(0xbcdcff, 0xd9a066, 0.85);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1d0, 2.6);
    sun.position.set(14, 22, -20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 90;
    const d = 16;
    sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
    sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;
    this.hemi = hemi;
  }

  buildGround() {
    const sandMat = new THREE.MeshStandardMaterial({ color: 0xe0b878, roughness: 0.98, metalness: 0 });
    const g = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_LEN * 2.4, ROAD_LEN * 2.4, 1, 1), sandMat);
    g.rotation.x = -Math.PI / 2;
    g.position.y = -0.02;
    g.receiveShadow = true;
    this.group.add(g);

    // 远景沙丘（几块扁平球）
    const duneMat = new THREE.MeshStandardMaterial({ color: 0xd7ab6d, roughness: 1 });
    for (let i = 0; i < 14; i++) {
      const s = 12 + Math.random() * 26;
      const m = new THREE.Mesh(new THREE.SphereGeometry(s, 16, 10), duneMat);
      m.scale.set(1 + Math.random(), 0.16 + Math.random() * 0.16, 1 + Math.random());
      const side = i % 2 ? 1 : -1;
      m.position.set(side * (26 + Math.random() * 60), -1.2, -30 - Math.random() * 190);
      m.receiveShadow = true;
      this.group.add(m);
    }

    // 海水（远处一条蓝带）
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 300),
      new THREE.MeshStandardMaterial({ color: 0x2f86b8, roughness: 0.25, metalness: 0.55 })
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, -0.35, -230);
    this.group.add(sea);
    this.sea = sea;

    // 远山
    const mtMat = new THREE.MeshStandardMaterial({ color: 0x9a8fb5, roughness: 1, transparent: true, opacity: 0.7 });
    for (let i = 0; i < 9; i++) {
      const h = 16 + Math.random() * 30;
      const m = new THREE.Mesh(new THREE.ConeGeometry(24 + Math.random() * 20, h, 5), mtMat);
      m.position.set(-180 + i * 45 + Math.random() * 20, h / 2 - 2, -260 - Math.random() * 40);
      this.group.add(m);
    }
  }

  buildRoad() {
    const asphalt = new THREE.MeshStandardMaterial({ color: 0x33383f, roughness: 0.92, metalness: 0.05 });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, ROAD_LEN), asphalt);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.005, -ROAD_LEN / 2 + 40);
    road.receiveShadow = true;
    this.group.add(road);
    this.road = road;

    // 路肩白线
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.7, emissive: 0x111111 });
    for (const s of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(0.14, ROAD_LEN), lineMat);
      l.rotation.x = -Math.PI / 2;
      l.position.set(s * (ROAD_HALF - 0.35), 0.012, -ROAD_LEN / 2 + 40);
      this.group.add(l);
    }

    // 中央虚线（用 InstancedMesh 复制，随距离滚动）
    const dashGeo = new THREE.PlaneGeometry(0.18, 1.5);
    const dashMat = new THREE.MeshStandardMaterial({ color: 0xffe9a8, roughness: 0.65, emissive: 0x2a2000 });
    const N = 90;
    const dashes = new THREE.InstancedMesh(dashGeo, dashMat, N);
    dashes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < N; i++) {
      dummy.position.set(0, 0.012, -i * (ROAD_LEN / N));
      dummy.rotation.x = -Math.PI / 2;
      dummy.updateMatrix();
      dashes.setMatrixAt(i, dummy.matrix);
    }
    dashes.frustumCulled = false;
    this.group.add(dashes);
    this.dashes = dashes;
    this.dashCount = N;
    this.dashSpacing = ROAD_LEN / N;
    this.dummy = dummy;

    // 护栏
    const railMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.8, roughness: 0.4 });
    for (const s of [-1, 1]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, ROAD_LEN), railMat);
      beam.position.set(s * (ROAD_HALF + 0.28), 0.62, -ROAD_LEN / 2 + 40);
      beam.castShadow = true;
      this.group.add(beam);
      for (let i = 0; i < 44; i++) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.72, 8), railMat);
        post.position.set(s * (ROAD_HALF + 0.28), 0.32, 40 - i * (ROAD_LEN / 44));
        post.castShadow = true;
        this.group.add(post);
      }
    }
  }

  /** 路旁道具：棕榈树、里程牌、路标、仙人掌 —— 循环复用 */
  buildProps() {
    this.props = [];
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6438, roughness: 0.95 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f8f4a, roughness: 0.8, side: THREE.DoubleSide });
    const signMat = new THREE.MeshStandardMaterial({ color: 0x2f7d4f, roughness: 0.7 });

    const palmShape = shapeFromPoints([
      [-0.05, 0], [0.55, 0.16], [1.05, -0.06], [0.6, -0.20], [0, -0.12],
    ]);
    const cactusMat = new THREE.MeshStandardMaterial({ color: 0x4a8f56, roughness: 0.9 });

    for (let i = 0; i < 30; i++) {
      const side = i % 2 ? 1 : -1;
      const z = 20 - i * (ROAD_LEN / 30);
      const g = new THREE.Group();
      g.position.set(side * (ROAD_HALF + 1.4 + Math.random() * 3.2), 0, z + Math.random() * 4);

      const kind = Math.random();
      if (kind < 0.55) {
        // 棕榈树
        const h = 3.4 + Math.random() * 2.4;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.17, h, 10), trunkMat);
        trunk.position.y = h / 2;
        trunk.rotation.z = side * 0.06;
        trunk.castShadow = true;
        g.add(trunk);
        const crown = new THREE.Group();
        crown.position.y = h;
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * Math.PI * 2;
          const leaf = plate(palmShape, 0.03, leafMat, 0.01);
          leaf.position.set(Math.cos(a) * 0.55, 0.05, Math.sin(a) * 0.55);
          leaf.rotation.y = -a + Math.PI / 2;
          leaf.rotation.z = -0.36 - Math.random() * 0.2;
          leaf.castShadow = true;
          crown.add(leaf);
        }
        g.add(crown);
        g.userData.sway = crown;
        // 椰子
        for (let k = 0; k < 3; k++) {
          const c = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.9 }));
          c.position.set((Math.random() - 0.5) * 0.3, -0.10, (Math.random() - 0.5) * 0.3);
          crown.add(c);
        }
      } else if (kind < 0.78) {
        // 仙人掌
        const h = 1.6 + Math.random() * 1.2;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, h, 12), cactusMat);
        trunk.position.y = h / 2;
        trunk.castShadow = true;
        g.add(trunk);
        for (const s of [-1, 1]) {
          if (Math.random() < 0.7) {
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.7, 10), cactusMat);
            arm.position.set(s * 0.30, h * (0.55 + Math.random() * 0.2), 0);
            arm.rotation.z = s * -0.5;
            arm.castShadow = true;
            g.add(arm);
          }
        }
      } else {
        // 路牌
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8), new THREE.MeshStandardMaterial({ color: 0x8b8f95, metalness: 0.6, roughness: 0.5 }));
        post.position.y = 1.1;
        post.castShadow = true;
        g.add(post);
        const board = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.85, 0.06), signMat);
        board.position.set(0, 2.0, 0);
        board.rotation.y = side * 0.25;
        board.castShadow = true;
        g.add(board);
        const inner = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.65), new THREE.MeshBasicMaterial({ color: 0xf4f7e8 }));
        inner.position.set(0, 2.0, side * -0.04);
        inner.rotation.y = board.rotation.y + Math.PI / 2 * (side < 0 ? 1 : -1);
        g.add(inner);
        g.userData.sway = board;
      }
      this.group.add(g);
      this.props.push(g);
    }

    // 里程牌（公里数，随距离更新文字纹理）
    this.mileMarkers = [];
    for (let i = 0; i < 8; i++) {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 128;
      const tex = new THREE.CanvasTexture(c);
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.45),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true })
      );
      m.position.set(ROAD_HALF + 0.6, 1.15, 10 - i * 40);
      m.rotation.y = -0.3;
      this.group.add(m);
      this.mileMarkers.push({ mesh: m, canvas: c, tex, z: m.position.z });
    }
  }

  buildClouds() {
    this.clouds = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.92 });
    for (let i = 0; i < 16; i++) {
      const g = new THREE.Group();
      const n = 3 + Math.floor(Math.random() * 4);
      for (let k = 0; k < n; k++) {
        const s = 1.6 + Math.random() * 3.2;
        const m = new THREE.Mesh(new THREE.SphereGeometry(s, 12, 8), mat);
        m.position.set((k - n / 2) * s * 0.9, Math.random() * s * 0.4, Math.random() * s * 0.5);
        m.scale.y = 0.6;
        g.add(m);
      }
      g.position.set((Math.random() - 0.5) * 150, 16 + Math.random() * 22, -40 - Math.random() * 260);
      g.userData.speed = 0.4 + Math.random() * 1.2;
      this.clouds.add(g);
    }
    this.group.add(this.clouds);
  }

  buildBirds() {
    // 远处 V 字飞鸟（扁平片，扇翅膀）
    this.birds = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0x2c3540, side: THREE.DoubleSide, transparent: true, opacity: 0.75 });
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Group();
      const l = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.16), mat);
      l.position.x = -0.55;
      const r = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.16), mat);
      r.position.x = 0.55;
      b.add(l, r);
      b.userData = { l, r, ph: Math.random() * 6.28, sp: 0.3 + Math.random() * 0.5 };
      b.position.set((Math.random() - 0.5) * 90, 12 + Math.random() * 16, -60 - Math.random() * 160);
      b.scale.setScalar(0.8 + Math.random());
      this.birds.add(b);
    }
    this.group.add(this.birds);
  }

  buildButterflies() {
    // 近景蝴蝶（跟随车队飞舞，做视觉点缀）
    this.bflies = new THREE.Group();
    const matA = new THREE.MeshStandardMaterial({ color: 0xffd166, side: THREE.DoubleSide, roughness: 0.6 });
    const matB = new THREE.MeshStandardMaterial({ color: 0xef476f, side: THREE.DoubleSide, roughness: 0.6 });
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Group();
      for (const s of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.CircleGeometry(0.09, 10, 0, Math.PI), s < 0 ? matA : matB);
        w.position.x = s * 0.04;
        w.scale.set(1, 1.5, 1);
        w.rotation.y = s * 0.2;
        b.add(w);
      }
      b.userData = { ph: Math.random() * 6.28, r: 1.2 + Math.random() * 1.4, y: 0.9 + Math.random() * 1.4, sp: 0.6 + Math.random() };
      this.bflies.add(b);
    }
    this.group.add(this.bflies);
  }

  /** 每帧滚动：路面虚线、道具循环、云、鸟、蝴蝶 */
  update(dt, t, travel, rigPos, speed) {
    // 虚线滚动
    const off = travel % this.dashSpacing;
    for (let i = 0; i < this.dashCount; i++) {
      this.dummy.position.set(0, 0.012, 40 - i * this.dashSpacing - off);
      this.dummy.rotation.x = -Math.PI / 2;
      this.dummy.updateMatrix();
      this.dashes.setMatrixAt(i, this.dummy.matrix);
    }
    this.dashes.instanceMatrix.needsUpdate = true;

    // 道具循环：超出后方则前移 ROAD_LEN
    const span = ROAD_LEN;
    for (const p of this.props) {
      if (p.position.z > rigPos.z + 40) p.position.z -= span;
      if (p.userData.sway) {
        p.userData.sway.rotation.z = Math.sin(t * 1.1 + p.position.x) * 0.06 * (1 + speed * 0.12);
      }
    }

    // 里程牌
    for (const mm of this.mileMarkers) {
      mm.mesh.position.z = mm.z - (travel % 40);
      const km = Math.max(0, Math.floor(travel / 1000) + Math.floor((mm.z + 40) / 40));
      if (mm.lastKm !== km) {
        mm.lastKm = km;
        const c = mm.canvas.getContext('2d');
        c.clearRect(0, 0, 256, 128);
        c.fillStyle = '#2f7d4f'; c.fillRect(0, 0, 256, 128);
        c.fillStyle = '#f4f7e8'; c.fillRect(8, 8, 240, 112);
        c.fillStyle = '#1d3b2a';
        c.font = 'bold 62px system-ui, sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(`${km} km`, 128, 60);
        c.font = '22px system-ui, sans-serif';
        c.fillText('鹈鹕环岛赛', 128, 100);
        mm.tex.needsUpdate = true;
      }
    }

    // 云漂移
    for (const c of this.clouds.children) {
      c.position.x += c.userData.speed * dt * 0.6;
      if (c.position.x > 120) c.position.x = -120;
    }

    // 飞鸟扇翅
    for (const b of this.birds.children) {
      const { l, r, ph, sp } = b.userData;
      const a = Math.sin(t * 4 * sp + ph) * 0.5;
      l.rotation.z = a; r.rotation.z = -a;
      b.position.x += dt * 1.6 * sp;
      if (b.position.x > 70) b.position.x = -70;
    }

    // 蝴蝶绕车飞舞
    for (let i = 0; i < this.bflies.children.length; i++) {
      const b = this.bflies.children[i];
      const u = b.userData;
      const a = t * u.sp + u.ph;
      b.position.set(
        rigPos.x - 1.2 + Math.cos(a) * u.r,
        u.y + Math.sin(a * 1.7) * 0.35,
        rigPos.z - 1.0 + Math.sin(a) * u.r * 0.8
      );
      b.rotation.y = -a;
      b.children[0].rotation.y = Math.sin(t * 22 + u.ph) * 0.9;
      b.children[1].rotation.y = -Math.sin(t * 22 + u.ph) * 0.9;
    }

    // 天空中太阳方向保持相对场景（穹顶跟随相机）
    if (this.sky) this.sky.position.z = rigPos.z;
  }

  setShadows(on) {
    this.sun.castShadow = on;
  }
}
