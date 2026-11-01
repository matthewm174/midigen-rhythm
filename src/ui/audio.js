// Minimal WebAudio drum synth for previewing. The real sound comes from Superior Drummer 3.

const TOM_HZ = { t1: 230, t2: 185, t3: 150, f1: 112, f2: 88 };

export class Player {
  constructor() {
    this.ctx = null;
    this.playing = false;
    this.timer = null;
    this.raf = null;
  }

  ensure() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(comp).connect(this.ctx.destination);
  }

  env(t, peak, decay, attack = 0.001) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(this.master);
    return g;
  }

  noiseHit(t, peak, decay, type, freq, q = 0.7) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    src.connect(f).connect(this.env(t, peak, decay));
    src.start(t, Math.random() * 1.5);
    src.stop(t + decay + 0.05);
  }

  tone(t, peak, decay, f0, f1 = f0, type = 'sine', sweep = 0.1) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + sweep);
    o.connect(this.env(t, peak, decay));
    o.start(t);
    o.stop(t + decay + 0.05);
  }

  trigger(ev, t) {
    const v = (ev.vel / 127) ** 1.5;
    switch (ev.art) {
      case 'kick':
        this.tone(t, v * 1.2, 0.42, 150, 42, 'sine', 0.11);
        this.noiseHit(t, v * 0.25, 0.012, 'highpass', 3000);
        break;
      case 'center': case 'ghost': case 'rim':
        this.noiseHit(t, v * (ev.art === 'rim' ? 0.9 : 0.7), ev.art === 'ghost' ? 0.08 : 0.18, 'bandpass', ev.art === 'rim' ? 2600 : 1800, 0.8);
        this.tone(t, v * 0.5, 0.09, 200, 170, 'triangle');
        break;
      case 'side':
        this.noiseHit(t, v * 0.5, 0.03, 'bandpass', 2800, 3);
        this.tone(t, v * 0.4, 0.04, 520, 480, 'triangle');
        break;
      case 'closed': this.noiseHit(t, v * 0.45, 0.045, 'highpass', 7500); break;
      case 'open': this.noiseHit(t, v * 0.4, 0.35, 'highpass', 6500); break;
      case 'pedal': this.noiseHit(t, v * 0.3, 0.035, 'highpass', 5500); break;
      case 'bow':
        this.noiseHit(t, v * 0.18, 0.6, 'bandpass', 6500, 1.5);
        this.tone(t, v * 0.06, 0.5, 3150, 3150, 'square');
        break;
      case 'bell':
        for (const f of [820, 1240, 2030]) this.tone(t, v * 0.12, 0.8, f);
        break;
      case 'c1': case 'c2': this.noiseHit(t, v * 0.45, ev.art === 'c1' ? 1.4 : 1.1, 'highpass', ev.art === 'c1' ? 3500 : 4500); break;
      case 'china': this.noiseHit(t, v * 0.5, 0.9, 'bandpass', 2300, 1.2); break;
      case 'splash': this.noiseHit(t, v * 0.4, 0.4, 'highpass', 6000); break;
      default:
        if (TOM_HZ[ev.art]) {
          const f = TOM_HZ[ev.art];
          this.tone(t, v * 0.9, 0.45, f * 1.25, f * 0.85, 'sine', 0.18);
          this.noiseHit(t, v * 0.12, 0.05, 'bandpass', 1200);
        }
    }
  }

  play({ events, tempo, ppq, totalTicks, totalTatums }, onPos) {
    this.ensure();
    this.stop();
    this.ctx.resume();
    const secPerTick = 60 / tempo / ppq;
    this.events = events.map((e) => ({ ...e, sec: e.tick * secPerTick }));
    this.loopSec = totalTicks * secPerTick;
    this.start = this.ctx.currentTime + 0.08;
    this.cursor = 0;
    this.loop = 0;
    this.playing = true;
    // Look-ahead scheduling (a timer queues notes slightly ahead on the audio clock), after
    // C. Wilson, "A Tale of Two Clocks: Scheduling Web Audio with Precision" (HTML5 Rocks, 2013).
    const schedule = () => {
      const horizon = this.ctx.currentTime + 0.15;
      if (!this.events.length) return;
      for (;;) {
        const ev = this.events[this.cursor];
        const at = this.start + this.loop * this.loopSec + ev.sec;
        if (at > horizon) break;
        if (at >= this.ctx.currentTime - 0.01) this.trigger(ev, Math.max(at, this.ctx.currentTime));
        if (++this.cursor >= this.events.length) { this.cursor = 0; this.loop++; }
      }
    };
    schedule();
    this.timer = setInterval(schedule, 25);
    const frame = () => {
      if (!this.playing) return;
      const pos = ((this.ctx.currentTime - this.start) % this.loopSec + this.loopSec) % this.loopSec;
      onPos(Math.floor((pos / this.loopSec) * totalTatums));
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop() {
    this.playing = false;
    clearInterval(this.timer);
    cancelAnimationFrame(this.raf);
  }
}
