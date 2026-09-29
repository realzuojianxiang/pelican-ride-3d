/**
 * 纯 WebAudio 程序化音效引擎：风声、链条、铃声、轮胎滚动、鹈鹕叫声、BGM
 * 不加载任何音频文件，全部由噪声/振荡器实时合成。
 */
export class Audio {
  constructor() {
    this.ready = false;
    this.enabled = true;
    this.musicOn = false;
    this.ctx = null;
  }

  init() {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);

    // 轻压缩，避免爆音
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(this.master);
    this.bus = comp;

    // ---- 白噪声缓冲（复用）----
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    // ---- 风声（噪声 → 带通）----
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = buf; windSrc.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass'; windFilter.frequency.value = 480; windFilter.Q.value = 0.7;
    const windGain = ctx.createGain(); windGain.gain.value = 0.0;
    windSrc.connect(windFilter).connect(windGain).connect(this.bus);
    windSrc.start();
    this.wind = { gain: windGain, filter: windFilter };

    // ---- 轮胎滚动（噪声 → 低通，音量随速度）----
    const rollSrc = ctx.createBufferSource();
    rollSrc.buffer = buf; rollSrc.loop = true;
    const rollFilter = ctx.createBiquadFilter();
    rollFilter.type = 'lowpass'; rollFilter.frequency.value = 900;
    const rollGain = ctx.createGain(); rollGain.gain.value = 0;
    rollSrc.connect(rollFilter).connect(rollGain).connect(this.bus);
    rollSrc.start();
    this.roll = { gain: rollGain, filter: rollFilter };

    // ---- 链条咔哒（周期脉冲）----
    const chainGain = ctx.createGain(); chainGain.gain.value = 0;
    const chainFilter = ctx.createBiquadFilter();
    chainFilter.type = 'highpass'; chainFilter.frequency.value = 2600;
    chainGain.connect(chainFilter).connect(this.bus);
    this.chain = { gain: chainGain };

    this.ready = true;
  }

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  /** 每帧驱动：speed m/s */
  update(dt, speed, cadence) {
    if (!this.ready || !this.enabled) return;
    const v = Math.min(speed / 14, 1.4);
    const now = this.ctx.currentTime;
    this.wind.gain.gain.setTargetAtTime(0.02 + v * 0.16, now, 0.15);
    this.wind.filter.frequency.setTargetAtTime(380 + v * 900, now, 0.2);
    this.roll.gain.gain.setTargetAtTime(v * 0.075, now, 0.12);
    this.roll.filter.frequency.setTargetAtTime(600 + v * 1400, now, 0.2);

    // 链条脉冲按踏频
    if (cadence > 4) {
      const interval = 60 / (cadence * 2.2);
      this.chainTimer = (this.chainTimer || 0) + dt;
      if (this.chainTimer > interval) {
        this.chainTimer = 0;
        this.chainClick(v);
      }
    }
  }

  chainClick(v) {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 1.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.05 + v * 0.05, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 2;
    src.connect(bp).connect(g).connect(this.bus);
    src.start(now); src.stop(now + 0.09);
  }

  /** 车铃：两个高频正弦 + 快速衰减 */
  bell() {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx, now = ctx.currentTime;
    for (const f of [1568, 2093, 2637]) {
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.28, now + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 1.15);
      o.connect(g).connect(this.bus);
      o.start(now); o.stop(now + 1.2);
    }
    // 一点金属噪声
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4200;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.12, now);
    g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    src.connect(hp).connect(g2).connect(this.bus);
    src.start(now); src.stop(now + 0.3);
  }

  /** 鹈鹕叫声：锯齿波做粗糙的 "嘎" —— 频率下滑 + 共振峰 */
  squawk(pitch = 1) {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(430 * pitch, now);
    o.frequency.exponentialRampToValueAtTime(190 * pitch, now + 0.28);
    // 颤音
    const lfo = ctx.createOscillator(); lfo.frequency.value = 26;
    const lfoG = ctx.createGain(); lfoG.gain.value = 42;
    lfo.connect(lfoG).connect(o.frequency);

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1250; bp.Q.value = 3.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.34, now + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    o.connect(bp).connect(g).connect(this.bus);
    o.start(now); o.stop(now + 0.45);
    lfo.start(now); lfo.stop(now + 0.45);
  }

  /** 欢呼/UI 提示音 */
  blip(f = 880) {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.16, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    o.connect(g).connect(this.bus);
    o.start(now); o.stop(now + 0.2);
  }

  /** 简易 BGM：五声音阶琶音循环 */
  startMusic() {
    this.init();
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    const ctx = this.ctx;
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.0;
    this.musicGain.connect(this.bus);
    this.musicGain.gain.setTargetAtTime(0.10, ctx.currentTime, 1.0);

    const scale = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3];
    let step = 0;
    const tick = () => {
      if (!this.musicOn) return;
      const now = ctx.currentTime;
      // 低音
      const bass = ctx.createOscillator(); bass.type = 'triangle';
      bass.frequency.value = scale[step % 4] / 2;
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0.0001, now);
      bg.gain.exponentialRampToValueAtTime(0.22, now + 0.05);
      bg.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
      bass.connect(bg).connect(this.musicGain);
      bass.start(now); bass.stop(now + 1.0);
      // 琶音
      for (let k = 0; k < 3; k++) {
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.value = scale[(step * 3 + k * 2) % scale.length] * (k === 2 ? 2 : 1);
        const g = ctx.createGain();
        const t0 = now + k * 0.13;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.14, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
        o.connect(g).connect(this.musicGain);
        o.start(t0); o.stop(t0 + 0.5);
      }
      step = (step + 1) % 8;
      this.musicTimer = setTimeout(tick, 620);
    };
    tick();
  }

  stopMusic() {
    this.musicOn = false;
    clearTimeout(this.musicTimer);
    if (this.musicGain) this.musicGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.2);
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.9 : 0.0, this.ctx.currentTime, 0.1);
  }
}
