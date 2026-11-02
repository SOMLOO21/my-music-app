// Son de démo synthétisé à la volée : 128 BPM, intro calme, drop, break.
(function () {
  async function makeDemo(bpm = 128, beats = 96) {
    const sr = 44100;
    const beat = 60 / bpm;
    const dur = beats * beat + 1;
    const ctx = new OfflineAudioContext(2, Math.ceil(dur * sr), sr);
    const master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);

    const noise = ctx.createBuffer(1, sr, sr);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    const kick = (t, v = 1) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.connect(g).connect(master); o.start(t); o.stop(t + 0.4);
    };
    const snare = (t) => {
      const s = ctx.createBufferSource(); s.buffer = noise;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + 0.2);
    };
    const hat = (t, v = 0.18) => {
      const s = ctx.createBufferSource(); s.buffer = noise;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + 0.06);
    };
    const note = (t, freq, len, type = 'sawtooth', v = 0.22, cut = 500) => {
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = type; o.frequency.value = freq;
      f.type = 'lowpass'; f.frequency.value = cut;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.01);
      g.gain.setTargetAtTime(0, t + len * 0.8, 0.03);
      o.connect(f).connect(g).connect(master); o.start(t); o.stop(t + len + 0.2);
    };

    const roots = [55, 43.65, 65.41, 49];
    const chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]];
    for (let b = 0; b < beats; b++) {
      const t = 0.05 + b * beat;
      const bar = Math.floor(b / 4) % 4;
      const part = b < 32 ? 'intro' : b < 64 ? 'drop' : 'break';
      if (part === 'intro') {
        if (b % 4 === 0) kick(t, 0.7);
        hat(t + beat / 2, 0.1);
      } else if (part === 'drop') {
        kick(t);
        if (b % 2 === 1) snare(t);
        hat(t, 0.12); hat(t + beat / 2, 0.2);
        note(t + beat / 2, roots[bar] * 2, beat / 2, 'sawtooth', 0.25, 600);
      } else {
        hat(t + beat / 2, 0.12);
        if (b % 4 === 0) kick(t, 0.5);
      }
      if (b % 4 === 0) chords[bar].forEach((f) => note(t, f, beat * 4, 'triangle', part === 'drop' ? 0.05 : 0.07, 2000));
    }
    return ctx.startRendering();
  }
  window.makeDemo = makeDemo;
})();
