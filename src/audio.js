// Night sound: the river under everything, a breath of wind, footfalls on wet stone.
export class Sound {
  constructor() { this.ctx = null; }

  start() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    const noise = (sec) => {
      const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
      const d = b.getChannelData(0);
      let last = 0;
      for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
      return b;
    };
    this.master = ctx.createGain(); this.master.gain.value = 0.7; this.master.connect(ctx.destination);
    const river = ctx.createBufferSource(); river.buffer = noise(6); river.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    this.riverGain = ctx.createGain(); this.riverGain.gain.value = 0.25;
    river.connect(lp).connect(this.riverGain).connect(this.master); river.start();
    const wind = ctx.createBufferSource(); wind.buffer = noise(9); wind.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.6;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0.04;
    wind.connect(bp).connect(this.windGain).connect(this.master); wind.start();
    this.click = noise(0.2);
  }

  // nearness to the river 0..1, altitude in metres
  ambience(river, alt) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.riverGain.gain.setTargetAtTime(0.06 + river * 0.32, t, 0.4);
    this.windGain.gain.setTargetAtTime(0.03 + Math.min(1, alt / 40) * 0.25, t, 0.6);
  }

  step(hard = 1) {
    if (!this.ctx) return;
    const s = this.ctx.createBufferSource(); s.buffer = this.click;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 300 + Math.random() * 300; f.Q.value = 1.2;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * hard, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    s.connect(f).connect(g).connect(this.master); s.start(); s.stop(t + 0.15);
  }
}
