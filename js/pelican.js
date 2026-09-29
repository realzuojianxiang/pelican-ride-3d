import * as THREE from 'three';
import { tube, plate, shapeFromPoints } from './util.js';

/**
 * 程序化鹈鹕：椭球身体 + 分段颈部 + 巨喙与喉囊 + 可扇动羽翼 + 双骨 IK 蹼足（踩踏板）
 */
export class Pelican {
  constructor() {
    this.root = new THREE.Group();

    const white = new THREE.MeshStandardMaterial({ color: 0xf7f5ef, roughness: 0.72, metalness: 0.02 });
    const grey = new THREE.MeshStandardMaterial({ color: 0xd8d3c8, roughness: 0.8, metalness: 0.02 });
    const black = new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.55, metalness: 0.1 });
    const beakMat = new THREE.MeshStandardMaterial({ color: 0xffb43d, roughness: 0.42, metalness: 0.12 });
    const pouchMat = new THREE.MeshStandardMaterial({
      color: 0xf08a3c, roughness: 0.5, metalness: 0.05,
      transparent: true, opacity: 0.94, side: THREE.DoubleSide,
    });
    const legMat = new THREE.MeshStandardMaterial({ color: 0xe0913f, roughness: 0.6, metalness: 0.05 });
    const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xfdfdfd, roughness: 0.25 });
    const pupil = new THREE.MeshStandardMaterial({ color: 0x101215, roughness: 0.2 });
    this.mats = { white, grey, black, beakMat, pouchMat, legMat };

    // ---------- 身体 ----------
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.30, 28, 22), white);
    body.scale.set(1.05, 0.92, 0.86);
    body.position.set(0, 0, 0);
    body.castShadow = true;
    this.body = body;
    this.root.add(body);

    // 尾羽
    const tail = plate(shapeFromPoints([
      [-0.10, 0], [-0.34, 0.10], [-0.40, 0], [-0.34, -0.09],
    ]), 0.03, grey, 0.01);
    tail.rotation.y = Math.PI / 2;
    tail.position.set(-0.30, 0.02, 0);
    tail.rotation.z = -0.25;
    this.root.add(tail);
    this.tail = tail;

    // ---------- 颈部（分段球体链，可做 S 形弯曲）----------
    this.neck = new THREE.Group();
    this.neck.position.set(0.16, 0.20, 0);
    this.root.add(this.neck);
    this.neckSegs = [];
    let parent = this.neck;
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const r = 0.115 - i * 0.010;
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), white);
      m.scale.set(1, 1.05, 1);
      m.castShadow = true;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.95, r * 0.9, 0.115, 12), white);
      seg.position.y = 0.058;
      g.add(m, seg);
      g.position.y = i === 0 ? 0 : 0.105;
      parent.add(g);
      this.neckSegs.push(g);
      parent = g;
    }

    // ---------- 头部 ----------
    const head = new THREE.Group();
    head.position.y = 0.10;
    parent.add(head);
    this.head = head;

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.115, 20, 16), white);
    skull.scale.set(1.0, 0.95, 0.92);
    skull.castShadow = true;
    head.add(skull);
    // 头顶羽冠
    const crest = plate(shapeFromPoints([[-0.06, 0], [0, 0.09], [0.07, 0.02]]), 0.02, grey, 0.01);
    crest.rotation.y = Math.PI / 2;
    crest.position.set(-0.02, 0.10, 0);
    head.add(crest);

    // 喙：上喙（细长锥）+ 下喙 + 喉囊
    const beak = new THREE.Group();
    beak.position.set(0.10, 0.005, 0);
    beak.rotation.z = -0.12;
    head.add(beak);
    this.beak = beak;

    const upper = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.42, 14), beakMat);
    upper.rotation.z = -Math.PI / 2;
    upper.position.set(0.21, 0.012, 0);
    upper.scale.set(1, 1, 0.62);
    upper.castShadow = true;
    beak.add(upper);
    const nail = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 10), new THREE.MeshStandardMaterial({ color: 0xff8a3d, roughness: 0.35 }));
    nail.position.set(0.415, 0.008, 0);
    nail.scale.set(1.2, 0.8, 0.7);
    beak.add(nail);
    const lower = new THREE.Mesh(new THREE.ConeGeometry(0.048, 0.40, 12), beakMat);
    lower.rotation.z = -Math.PI / 2;
    lower.position.set(0.20, -0.028, 0);
    lower.scale.set(1, 1, 0.55);
    beak.add(lower);
    this.lowerBeak = lower;

    // 喉囊：可鼓起的半透明袋（用球缩放模拟）
    const pouch = new THREE.Mesh(new THREE.SphereGeometry(0.10, 18, 14), pouchMat);
    pouch.position.set(0.15, -0.05, 0);
    pouch.scale.set(1.35, 0.85, 0.9);
    pouch.castShadow = true;
    beak.add(pouch);
    this.pouch = pouch;

    // 眼睛
    this.eyes = [];
    for (const s of [-1, 1]) {
      const e = new THREE.Group();
      e.position.set(0.052, 0.045, s * 0.072);
      const w = new THREE.Mesh(new THREE.SphereGeometry(0.032, 14, 12), eyeWhite);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.017, 12, 10), pupil);
      p.position.set(0.018, 0, 0);
      e.add(w, p);
      head.add(e);
      this.eyes.push(e);
      // 眼睑（黑片，眨眼时下压）
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.034, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), grey);
      lid.position.copy(e.position);
      lid.rotation.z = Math.PI;
      lid.scale.y = 0.01;
      lid.visible = false;
      head.add(lid);
      e.userData.lid = lid;
    }

    // ---------- 翅膀（可扇动）----------
    this.wings = [];
    for (const s of [-1, 1]) {
      const w = new THREE.Group();
      w.position.set(-0.02, 0.13, s * 0.20);
      const inner = plate(shapeFromPoints([
        [0, 0], [0.16, 0.05], [0.34, 0.02], [0.46, -0.06], [0.40, -0.16], [0.16, -0.13],
      ]), 0.05, white, 0.015);
      inner.position.set(0.20, 0.02, 0);
      w.add(inner);
      // 初级飞羽
      for (let i = 0; i < 6; i++) {
        const a = -0.28 + i * 0.115;
        const f = plate(shapeFromPoints([
          [0, 0], [0.30, 0.035], [0.34, -0.005], [0.02, -0.03],
        ]), 0.012, i % 2 ? black : grey, 0.008);
        f.position.set(0.40, -0.05, 0.005 * i);
        f.rotation.z = a;
        f.rotation.y = s * 0.02;
        w.add(f);
      }
      w.rotation.x = s * 0.95;
      w.scale.z = s;
      this.root.add(w);
      this.wings.push({ group: w, side: s });
    }

    // ---------- 腿 + 蹼足（双骨 IK）----------
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(-0.06, -0.22, s * 0.13);
      this.root.add(hip);

      const thigh = new THREE.Group();
      hip.add(thigh);
      const thighMesh = tube(0, 0, 0, 0, -0.34, 0, 0.032, white, 8);
      thigh.add(thighMesh);

      const knee = new THREE.Group();
      knee.position.y = -0.34;
      thigh.add(knee);
      const shinMesh = tube(0, 0, 0, 0, -0.34, 0, 0.024, legMat, 8);
      knee.add(shinMesh);

      const foot = new THREE.Group();
      foot.position.y = -0.34;
      knee.add(foot);
      const web = plate(shapeFromPoints([
        [-0.07, -0.05], [0.11, -0.06], [0.15, 0], [0.05, 0.06], [-0.07, 0.05],
      ]), 0.016, legMat, 0.008);
      web.rotation.x = -Math.PI / 2;
      web.position.set(0.02, -0.015, 0);
      foot.add(web);
      for (let i = -1; i <= 1; i++) {
        const toe = tube(-0.05, -0.02, 0, 0.12, -0.02, i * 0.035, 0.008, legMat, 4);
        foot.add(toe);
      }

      this.root.add(hip);
      this.legs.push({ hip, thigh, knee, foot, side: s, thighLen: 0.34, shinLen: 0.34 });
    }

    // ---------- 骑行服细节：小背包 / 号码布 ----------
    const bib = new THREE.Mesh(new THREE.CircleGeometry(0.09, 20), new THREE.MeshStandardMaterial({ color: 0xff5a5f, roughness: 0.9 }));
    bib.position.set(0.10, -0.05, 0.245);
    bib.rotation.y = 0.35;
    this.root.add(bib);

    // 围巾（迎风飘动）
    this.scarf = [];
    const scarfMat = new THREE.MeshStandardMaterial({ color: 0x3ec8ff, roughness: 0.85, side: THREE.DoubleSide });
    let sp = this.neckSegs[0];
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.09), scarfMat);
      seg.castShadow = true;
      seg.position.set(-0.09, -0.02, 0);
      sp.add(seg);
      this.scarf.push(seg);
      sp = seg;
    }

    this.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }

  /** 双骨 IK：把脚放到 target（pelican.root 局部坐标），膝盖朝前（+X） */
  solveLeg(leg, target) {
    const hipPos = leg.hip.position;
    const v = target.clone().sub(hipPos);
    const L1 = leg.thighLen, L2 = leg.shinLen;
    const max = (L1 + L2) * 0.995;
    const dlen = v.length();

    // 髋→目标方向（thigh 局部以 -Y 为骨骼方向）
    const dir = (dlen > 1e-5 ? v.clone().divideScalar(dlen) : new THREE.Vector3(0, -1, 0));
    const pitch0 = Math.acos(THREE.MathUtils.clamp(-dir.y, -1, 1)); // 与 -Y 的夹角
    const yaw = Math.atan2(dir.z, dir.x);                            // 绕 Y 的偏摆
    const d = Math.min(dlen, max);

    // 余弦定理：thigh 相对 hip→target 直线的偏离角
    const cosA = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d);
    const A = Math.acos(THREE.MathUtils.clamp(cosA, -1, 1));

    const pitch = pitch0 + A;             // 在竖直平面内抬高，使膝盖前顶
    const cosB = (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2);
    const B = Math.acos(THREE.MathUtils.clamp(cosB, -1, 1)); // 膝关节内角

    leg.thigh.rotation.order = 'YXZ';
    leg.thigh.rotation.set(-pitch, yaw, 0);
    leg.knee.rotation.x = -(Math.PI - B);
    // 脚掌保持水平：抵消 thigh+knee 的累计俯仰
    leg.foot.rotation.x = -(-pitch - (Math.PI - B));
  }

  /** 在世界坐标下把脚放到目标（自动转到局部空间） */
  placeFootWorld(leg, worldTarget) {
    const local = this.root.worldToLocal(worldTarget.clone());
    this.solveLeg(leg, local);
  }
}
