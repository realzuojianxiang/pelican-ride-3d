import * as THREE from 'three';
import { tube, plate, shapeFromPoints } from './util.js';

/**
 * 程序化自行车：钢管车架 + 辐条轮 + 链条传动 + 车把 + 鞍座 + 车灯 + 车筐（装鱼）
 * 全部由基础几何体拼装，无任何外部资源依赖。
 */
export class Bicycle {
  constructor() {
    this.group = new THREE.Group();

    const paint = new THREE.MeshStandardMaterial({ color: 0x2f7de0, metalness: 0.55, roughness: 0.32 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xc9d2dc, metalness: 0.92, roughness: 0.22 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b1f26, metalness: 0.4, roughness: 0.6 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x14161a, metalness: 0.05, roughness: 0.92 });
    const leather = new THREE.MeshStandardMaterial({ color: 0x6b3a22, metalness: 0.1, roughness: 0.75 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc94d, metalness: 0.95, roughness: 0.18 });
    this.mats = { paint, steel, dark, rubber, leather, gold };

    const R = 0.335;              // 车轮半径
    const L = 1.06;               // 轴距
    this.wheelRadius = R;
    this.gearRatio = 44 / 16;     // 牙盘/飞轮 传动比
    this.crankRadius = 0.17;

    // ---------- 车轮 ----------
    this.rearWheel = this.buildWheel(R, rubber, steel);
    this.rearWheel.position.set(-L / 2, R, 0);
    this.frontWheel = this.buildWheel(R, rubber, steel);
    this.frontWheel.position.set(+L / 2, R, 0);
    this.group.add(this.rearWheel, this.frontWheel);

    // 飞轮（后轮同轴，随轮转）
    this.cog = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.018, 20), gold);
    this.cog.rotation.z = Math.PI / 2;
    this.cog.position.set(0.03, 0, 0);
    this.rearWheel.add(this.cog);

    // ---------- 车架（经典菱形双三角）----------
    const bb = [0, 0.28, 0];                        // 五通（曲柄中心）
    const seatTop = [-0.20, 0.82, 0];               // 立管顶
    const headTop = [0.42, 0.80, 0];                // 头管上
    const headBot = [0.50, 0.52, 0];                // 头管下
    const rt = 0.026;                               // 管半径

    const f = new THREE.Group();
    f.add(tube(bb[0], bb[1], bb[2], seatTop[0], seatTop[1], seatTop[2], rt, paint));      // 立管
    f.add(tube(bb[0], bb[1], bb[2], headBot[0], headBot[1], headBot[2], rt, paint));      // 下管
    f.add(tube(seatTop[0], seatTop[1], seatTop[2], headTop[0], headTop[1], headTop[2], rt, paint)); // 上管
    f.add(tube(headTop[0], headTop[1], headTop[2], headBot[0], headBot[1], headBot[2], 0.030, paint)); // 头管
    // 后三角
    f.add(tube(bb[0], bb[1], bb[2], -L / 2, R, -0.055, rt * 0.8, paint));
    f.add(tube(bb[0], bb[1], bb[2], -L / 2, R, +0.055, rt * 0.8, paint));
    f.add(tube(seatTop[0], seatTop[1], seatTop[2], -L / 2, R, -0.055, rt * 0.7, paint));
    f.add(tube(seatTop[0], seatTop[1], seatTop[2], -L / 2, R, +0.055, rt * 0.7, paint));
    // 前叉
    f.add(tube(headBot[0], headBot[1], headBot[2], L / 2, R, -0.05, 0.020, steel));
    f.add(tube(headBot[0], headBot[1], headBot[2], L / 2, R, +0.05, 0.020, steel));
    this.group.add(f);

    // ---------- 车把 ----------
    const bar = new THREE.Group();
    bar.position.set(headTop[0], headTop[1] + 0.02, 0);
    bar.add(tube(0, 0, 0, 0, 0.14, 0, 0.022, steel));                       // 把立
    bar.add(tube(0, 0.14, 0, 0, 0.16, -0.24, 0.020, steel));                // 左半
    bar.add(tube(0, 0.14, 0, 0, 0.16, +0.24, 0.020, steel));                // 右半
    bar.add(tube(0, 0.16, -0.24, 0.02, 0.14, -0.30, 0.020, dark));          // 握把
    bar.add(tube(0, 0.16, +0.24, 0.02, 0.14, +0.30, 0.020, dark));
    this.group.add(bar);
    this.bar = bar;

    // 车铃
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), gold);
    bell.position.set(0.01, 0.17, -0.16);
    bell.rotation.x = Math.PI * 0.15;
    bar.add(bell);
    this.bell = bell;

    // ---------- 鞍座 ----------
    const saddle = plate(shapeFromPoints([
      [-0.16, -0.06], [0.05, -0.085], [0.17, -0.03], [0.19, 0.02],
      [0.05, 0.07], [-0.16, 0.055], [-0.19, 0],
    ]), 0.035, leather, 0.014);
    saddle.rotation.x = -Math.PI / 2;
    saddle.position.set(-0.22, 0.90, 0);
    this.group.add(saddle);
    this.group.add(tube(-0.20, 0.82, 0, -0.22, 0.88, 0, 0.016, steel));

    // ---------- 传动：牙盘 + 曲柄 + 踏板 ----------
    const crank = new THREE.Group();
    crank.position.set(bb[0], bb[1], 0);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(this.crankRadius, 0.012, 8, 40), gold);
    ring.rotation.y = Math.PI / 2;
    crank.add(ring);
    const spider = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 16), gold);
    spider.rotation.z = Math.PI / 2;
    crank.add(spider);
    // 齿
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.022, 0.014), gold);
      t.position.set(0, Math.sin(a) * (this.crankRadius + 0.008), Math.cos(a) * (this.crankRadius + 0.008));
      crank.add(t);
    }
    this.crank = crank;
    this.group.add(crank);

    this.pedals = [];
    for (const s of [-1, 1]) {
      const arm = tube(0, 0, s * 0.03, 0, -this.crankRadius, s * 0.055, 0.017, steel);
      // 曲柄臂需要随牙盘整圈旋转 → 放进一个臂组
      const armGroup = new THREE.Group();
      const armMesh = tube(0, 0, 0, 0, -this.crankRadius, 0, 0.017, steel);
      armGroup.add(armMesh);
      const pedal = new THREE.Group();
      pedal.position.set(0, -this.crankRadius, s * 0.075);
      const pd = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.018, 0.075), dark);
      pd.castShadow = true;
      pedal.add(pd);
      armGroup.add(pedal);
      armGroup.position.z = s * 0.075;
      crank.add(armGroup);
      // 反向旋转保持踏板水平
      pedal.userData.keepLevel = true;
      this.pedals.push({ arm: armGroup, pedal, side: s });
      arm.visible = false;
    }

    // 链条：上下两条 + 环绕（简化为两条直板 + 随速度滚动的链节纹理感）
    const chainMat = new THREE.MeshStandardMaterial({ color: 0x3a3f47, metalness: 0.9, roughness: 0.35 });
    const chainUpper = tube(-L / 2, R + 0.03, 0.045, 0, 0.28 + 0.16, 0.045, 0.012, chainMat, 6);
    const chainLower = tube(-L / 2, R - 0.03, 0.045, 0, 0.28 - 0.16, 0.045, 0.010, chainMat, 6);
    this.group.add(chainUpper, chainLower);
    // 链节（可动的视觉细节）
    this.chainLinks = new THREE.Group();
    for (let i = 0; i < 26; i++) {
      const lk = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.012, 0.02), chainMat);
      lk.castShadow = false;
      this.chainLinks.add(lk);
    }
    this.group.add(this.chainLinks);
    this.chainPath = {
      ax: -L / 2, ay: R, ar: 0.03,
      bx: 0, by: 0.28, br: this.crankRadius,
    };

    // ---------- 车灯（发光）----------
    const lampHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.052, 0.06, 20), steel);
    lampHousing.rotation.x = Math.PI / 2;
    lampHousing.position.set(0.56, 0.78, 0);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.042, 20), new THREE.MeshBasicMaterial({ color: 0xfff0c0 }));
    lens.position.set(0.56, 0.78, 0.032);
    this.group.add(lampHousing, lens);
    this.lampLens = lens;
    const beam = new THREE.SpotLight(0xfff2cf, 26, 16, Math.PI * 0.14, 0.55, 1.6);
    beam.position.set(0.56, 0.78, 0.05);
    const tgt = new THREE.Object3D();
    tgt.position.set(6, -0.6, 0);
    this.group.add(tgt);
    beam.target = tgt;
    this.group.add(beam);
    this.lamp = beam;

    // ---------- 车筐 + 一条鱼 ----------
    const basketMat = new THREE.MeshStandardMaterial({ color: 0xb98b4e, metalness: 0.05, roughness: 0.85 });
    const basket = new THREE.Group();
    basket.position.set(0.50, 0.72, 0);
    const ringB = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.008, 6, 24), basketMat);
    ringB.rotation.x = Math.PI / 2;
    ringB.position.y = 0.11;
    basket.add(ringB);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      basket.add(tube(Math.cos(a) * 0.13, 0.11, Math.sin(a) * 0.13, Math.cos(a) * 0.10, 0, Math.sin(a) * 0.10, 0.005, basketMat, 4));
    }
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.10, 18), basketMat);
    bottom.rotation.x = -Math.PI / 2;
    basket.add(bottom);
    // 鱼
    const fish = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), new THREE.MeshStandardMaterial({ color: 0x9fd8e8, metalness: 0.6, roughness: 0.25 }));
    body.scale.set(1.7, 0.8, 0.7);
    fish.add(body);
    const tail = plate(shapeFromPoints([[-0.05, 0], [-0.11, 0.055], [-0.11, -0.055]]), 0.012, new THREE.MeshStandardMaterial({ color: 0x7fc0d8, roughness: 0.4 }), 0);
    tail.position.set(-0.11, 0, 0);
    tail.rotation.y = Math.PI / 2;
    fish.add(tail);
    fish.position.set(0, 0.05, 0);
    fish.rotation.y = 0.4;
    basket.add(fish);
    this.fish = fish;
    this.group.add(basket);

    // ---------- 尾灯 ----------
    const tailLamp = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 10), new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
    tailLamp.position.set(-0.60, 0.62, 0);
    this.group.add(tailLamp);
    this.tailLight = tailLamp;

    this.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  }

  buildWheel(R, rubber, steel) {
    const g = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.TorusGeometry(R, 0.036, 12, 40), rubber);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R - 0.04, 0.014, 8, 40), steel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.10, 14), steel);
    hub.rotation.x = Math.PI / 2;
    g.add(tire, rim, hub);
    // 辐条
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const s = tube(0, 0, 0, Math.cos(a) * (R - 0.045), Math.sin(a) * (R - 0.045), (i % 2 ? 0.028 : -0.028), 0.0035, steel, 4);
      g.add(s);
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  /**
   * @param {number} crankAngle  曲柄相位（弧度）
   * @param {number} dt
   */
  update(crankAngle, dt) {
    const wheelAngle = crankAngle * this.gearRatio;
    this.rearWheel.rotation.z = wheelAngle;
    this.frontWheel.rotation.z = wheelAngle;
    this.cog.rotation.x = wheelAngle;
    this.crank.rotation.x = crankAngle;
    for (const p of this.pedals) p.pedal.rotation.x = -crankAngle;

    // 链条链节沿“两圆外公切线 + 圆弧”运动
    const { ax, ay, ar, bx, by, br } = this.chainPath;
    const n = this.chainLinks.children.length;
    const total = 2.30; // 近似链长
    for (let i = 0; i < n; i++) {
      const t = ((crankAngle * br / (2 * Math.PI) * this.gearRatio) + (i / n) * total) % total;
      // 分段：上切线段 / 后轮圆弧 / 下切线段 / 牙盘圆弧
      const seg1 = Math.hypot(bx - ax, by - ay);
      if (t < seg1) {
        const k = t / seg1;
        this.chainLinks.children[i].position.set(ax + (bx - ax) * k, ay + ar + (by + br - ay - ar) * k, 0.045);
      } else if (t < seg1 + Math.PI * ar) {
        const a = (t - seg1) / ar;
        this.chainLinks.children[i].position.set(ax + Math.sin(a) * ar, ay + Math.cos(a) * ar, 0.045);
      } else if (t < seg1 + Math.PI * ar + seg1 * 0.98) {
        const k = (t - seg1 - Math.PI * ar) / (seg1 * 0.98);
        this.chainLinks.children[i].position.set(bx + (ax - bx) * k, by - br + (ay - ar - by + br) * k, 0.045);
      } else {
        const a = (t - seg1 * 1.98 - Math.PI * ar) / br + Math.PI;
        this.chainLinks.children[i].position.set(bx + Math.sin(a) * br, by + Math.cos(a) * br, 0.045);
      }
    }
  }
}
