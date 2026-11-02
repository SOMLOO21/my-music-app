// Détection du tempo et de la grille de temps, entièrement dans le navigateur.
// Principe : enveloppe d'attaques (spectral flux) → autocorrélation pour le BPM
// → ajustement fin BPM + phase par « peigne » sur tout le morceau.
(function () {
  const FFT_N = 1024;
  const HOP = 256;

  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len;
      const wr = Math.cos(ang), wi = Math.sin(ang);
      const half = len >> 1;
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < half; k++) {
          const a = i + k, b = a + half;
          const tr = re[b] * cr - im[b] * ci;
          const ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
          const ncr = cr * wr - ci * wi;
          ci = cr * wi + ci * wr;
          cr = ncr;
        }
      }
    }
  }

  // Mono + sous-échantillonnage vers ~22 kHz.
  function toMono(buf) {
    const dec = Math.max(1, Math.round(buf.sampleRate / 22050));
    const chs = [];
    for (let c = 0; c < buf.numberOfChannels; c++) chs.push(buf.getChannelData(c));
    const n = Math.floor(buf.length / dec);
    const x = new Float32Array(n);
    const norm = 1 / (dec * chs.length);
    for (let i = 0; i < n; i++) {
      let s = 0;
      const base = i * dec;
      for (let c = 0; c < chs.length; c++) {
        const ch = chs[c];
        for (let j = 0; j < dec; j++) s += ch[base + j];
      }
      x[i] = s * norm;
    }
    return { x, sr: buf.sampleRate / dec };
  }

  function onsetEnvelope(x, sr) {
    const frames = Math.max(0, Math.floor((x.length - FFT_N) / HOP) + 1);
    const win = new Float32Array(FFT_N);
    for (let i = 0; i < FFT_N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / FFT_N);
    const re = new Float32Array(FFT_N), im = new Float32Array(FFT_N);
    const prev = new Float32Array(FFT_N / 2);
    const raw = new Float32Array(frames);
    const rawLow = new Float32Array(frames);
    const lowBins = Math.max(2, Math.round(160 / (sr / FFT_N)));
    for (let f = 0; f < frames; f++) {
      const off = f * HOP;
      for (let i = 0; i < FFT_N; i++) { re[i] = x[off + i] * win[i]; im[i] = 0; }
      fft(re, im);
      let s = 0, lo = 0;
      for (let k = 1; k < FFT_N / 2; k++) {
        const m = Math.log1p(100 * Math.sqrt(re[k] * re[k] + im[k] * im[k]));
        const d = m - prev[k];
        if (d > 0) { s += d; if (k <= lowBins) lo += d; }
        prev[k] = m;
      }
      raw[f] = s;
      rawLow[f] = lo;
    }
    const fps = sr / HOP;
    const env = detrend(raw, fps);
    // Enveloppe « grosse caisse » : sert à placer les temps sur le kick plutôt que sur les contretemps.
    const low = detrend(rawLow, fps);
    const phaseEnv = new Float32Array(frames);
    for (let i = 0; i < frames; i++) phaseEnv[i] = env[i] + 2 * low[i];
    return { env, phaseEnv, fps, t0: FFT_N / 2 / sr };
  }

  // Retire la tendance locale pour ne garder que les attaques, puis normalise.
  function detrend(raw, fps) {
    const frames = raw.length;
    const w = Math.max(1, Math.round(0.2 * fps));
    const pre = new Float64Array(frames + 1);
    for (let i = 0; i < frames; i++) pre[i + 1] = pre[i] + raw[i];
    const env = new Float32Array(frames);
    let sum = 0, sum2 = 0;
    for (let i = 0; i < frames; i++) {
      const a = Math.max(0, i - w), b = Math.min(frames, i + w + 1);
      const v = Math.max(0, raw[i] - (pre[b] - pre[a]) / (b - a));
      env[i] = v; sum += v; sum2 += v * v;
    }
    const mean = sum / Math.max(1, frames);
    const std = Math.sqrt(Math.max(1e-12, sum2 / Math.max(1, frames) - mean * mean));
    for (let i = 0; i < frames; i++) env[i] /= std;
    return env;
  }

  function estimateTempo(env, fps) {
    const len = Math.min(env.length, Math.round(120 * fps));
    const minLag = Math.floor(fps * 60 / 200);
    const maxLag = Math.ceil(fps * 60 / 60);
    const ac = new Float32Array(2 * maxLag + 2);
    for (let l = minLag; l <= 2 * maxLag + 1 && l < len; l++) {
      let s = 0;
      for (let i = 0; i < len - l; i++) s += env[i] * env[i + l];
      ac[l] = s / (len - l);
    }
    let best = minLag, bestScore = -Infinity;
    for (let l = minLag; l <= maxLag; l++) {
      const bpm = 60 * fps / l;
      const oct = Math.log2(bpm / 120);
      const w = Math.exp(-0.5 * oct * oct);
      const score = w * (ac[l] + 0.5 * (ac[2 * l] || 0));
      if (score > bestScore) { bestScore = score; best = l; }
    }
    let lag = best;
    const a = ac[best - 1], b = ac[best], c = ac[best + 1];
    const den = a - 2 * b + c;
    if (den < 0) lag = best + 0.5 * (a - c) / den;
    return 60 * fps / lag;
  }

  function sample(env, pos) {
    const i = Math.floor(pos);
    if (i < 0 || i + 1 >= env.length) return 0;
    const f = pos - i;
    return env[i] * (1 - f) + env[i + 1] * f;
  }

  function combScore(env, P, ph) {
    let s = 0, n = 0;
    for (let pos = ph; pos < env.length; pos += P) { s += sample(env, pos); n++; }
    return n ? s / n : 0;
  }

  // Meilleure phase (en secondes) pour un BPM donné.
  function fitPhase(an, bpm, steps = 256) {
    const P = 60 / bpm * an.fps;
    let best = 0, bestScore = -Infinity;
    for (let s = 0; s < steps; s++) {
      const ph = s / steps * P;
      const sc = combScore(an.phaseEnv, P, ph);
      if (sc > bestScore) { bestScore = sc; best = ph; }
    }
    const period = 60 / bpm;
    let offset = an.t0 + best / an.fps;
    offset = ((offset % period) + period) % period;
    return offset;
  }

  function refineTempo(an, bpm0) {
    let best = { score: -Infinity, bpm: bpm0 };
    for (let bpm = bpm0 * 0.985; bpm <= bpm0 * 1.015; bpm += 0.02) {
      const P = 60 / bpm * an.fps;
      for (let s = 0; s < 48; s++) {
        const sc = combScore(an.env, P, s / 48 * P);
        if (sc > best.score) best = { score: sc, bpm };
      }
    }
    let bpm = best.bpm;
    // La musique produite est presque toujours à BPM entier.
    if (Math.abs(bpm - Math.round(bpm)) < 0.12) bpm = Math.round(bpm);
    return Math.round(bpm * 100) / 100;
  }

  // Énergie moyenne (RMS) entre deux instants.
  function rms(mono, t0, t1) {
    const a = Math.max(0, Math.floor(t0 * mono.sr));
    const b = Math.min(mono.x.length, Math.floor(t1 * mono.sr));
    let s = 0;
    for (let i = a; i < b; i += 4) s += mono.x[i] * mono.x[i];
    return Math.sqrt(s / Math.max(1, (b - a) / 4));
  }

  function analyze(buf) {
    const mono = toMono(buf);
    const an = onsetEnvelope(mono.x, mono.sr);
    const rough = estimateTempo(an.env, an.fps);
    const bpm = refineTempo(an, rough);
    const offset = fitPhase(an, bpm);
    return { bpm, offset, mono, an };
  }

  window.Beat = { analyze, fitPhase, rms };
})();
