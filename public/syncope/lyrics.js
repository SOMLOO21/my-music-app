// Paroles automatiques : préparation de l'audio pour Whisper, recalage des mots
// sur les attaques de la voix, et calage d'un texte collé sur les timings détectés.
(function () {
  const ENV_FPS = 100; // enveloppe vocale : une valeur toutes les 10 ms

  async function render16k(buf, start, dur, voiceBand) {
    const sr = 16000;
    const ctx = new OfflineAudioContext(1, Math.ceil(dur * sr), sr);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    let node = src;
    if (voiceBand) {
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 250;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3500;
      node.connect(hp); hp.connect(lp); node = lp;
    }
    node.connect(ctx.destination);
    src.start(0, start, dur);
    const out = await ctx.startRendering();
    return out.getChannelData(0);
  }

  // Audio de l'extrait au format attendu par Whisper (mono, 16 kHz).
  const whisperInput = (buf, start, dur) => render16k(buf, start, dur, false);

  // Énergie (log) dans la bande de la voix, pour repérer les attaques des syllabes.
  async function voiceEnvelope(buf, start, dur) {
    const x = await render16k(buf, start, dur, true);
    const hop = 16000 / ENV_FPS;
    const n = Math.floor(x.length / hop);
    const env = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < hop; j++) { const v = x[i * hop + j]; s += v * v; }
      env[i] = Math.log10(1e-6 + s / hop);
    }
    return env;
  }

  // Aimante le début de chaque mot sur la montée d'énergie vocale la plus nette à ±140 ms,
  // puis remet de l'ordre : chronologie, durées minimales, pas de chevauchement ni de micro-trous.
  function refine(words, env, offset) {
    const out = words.map((w) => ({ ...w }));
    if (env && env.length > 4) {
      const win = 0.14;
      out.forEach((w, k) => {
        const dur = w.end - w.start;
        const c = (w.start - offset) * ENV_FPS;
        // Whisper place souvent le premier mot d'une phrase trop tôt (au début de sa fenêtre) :
        // pour lui, on cherche l'attaque plus loin vers l'avant.
        const first = k === 0 || w.start - out[k - 1].end > 0.3;
        const i0 = Math.max(3, Math.floor(c - (first ? 0.1 : win) * ENV_FPS));
        const i1 = Math.min(env.length - 1, Math.ceil(c + (first ? 0.6 : win) * ENV_FPS));
        let best = -1, bestScore = 0;
        if (first) {
          // Première attaque nette de la fenêtre (et non la plus forte, qui peut être une caisse claire plus loin).
          let maxRise = 0;
          for (let i = i0; i <= i1; i++) maxRise = Math.max(maxRise, env[i] - env[i - 3]);
          for (let i = i0; i <= i1 && maxRise > 0.15; i++) {
            if (env[i] - env[i - 3] >= 0.6 * maxRise) { best = i; break; }
          }
        } else {
          for (let i = i0; i <= i1; i++) {
            const rise = env[i] - env[i - 3];
            if (rise <= 0.15) continue;
            const score = rise * (1 - Math.abs(i - c) / (win * ENV_FPS * 1.4));
            if (score > bestScore) { bestScore = score; best = i; }
          }
        }
        if (best > 0) {
          const ns = offset + (best - 2) / ENV_FPS; // le début de la montée, pas son sommet
          w.end = first ? Math.max(ns + 0.08, w.end) : ns + dur;
          w.start = ns;
        }
      });
    }
    for (let i = 0; i < out.length; i++) {
      if (i > 0 && out[i].start < out[i - 1].start + 0.05) out[i].start = out[i - 1].start + 0.05;
      if (out[i].end < out[i].start + 0.08) out[i].end = out[i].start + 0.08;
    }
    for (let i = 0; i < out.length - 1; i++) {
      const gap = out[i + 1].start - out[i].end;
      if (gap > 0 && gap < 0.15) out[i].end = out[i + 1].start;
      if (out[i].end > out[i + 1].start) out[i].end = out[i + 1].start;
    }
    return out;
  }

  const norm = (w) => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]/gu, '');

  // Cale le texte collé sur les mots détectés (plus longue sous-suite commune) :
  // un mot reconnu garde son timing exact, les autres (argot, verlan, fautes de la
  // transcription) se répartissent entre les deux mots reconnus qui les encadrent.
  function align(tokens, anchors) {
    const n = tokens.length, m = anchors.length;
    if (!n) return [];
    if (!m) return tokens.map((t) => ({ ...t, start: null, end: null }));
    const a = tokens.map((t) => norm(t.text));
    const b = anchors.map((w) => norm(w.text));
    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = a[i] && a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const match = new Int32Array(n).fill(-1);
    for (let i = 0, j = 0; i < n && j < m;) {
      if (a[i] && a[i] === b[j]) { match[i] = j; i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
      else j++;
    }
    const out = tokens.map((t, i) => ({
      ...t,
      start: match[i] >= 0 ? anchors[match[i]].start : null,
      end: match[i] >= 0 ? anchors[match[i]].end : null,
    }));
    const t0 = anchors[0].start, t1 = anchors[m - 1].end;
    for (let k = 0; k < n;) {
      if (out[k].start != null) { k++; continue; }
      const s = k;
      while (k < n && out[k].start == null) k++;
      const prev = s > 0 ? out[s - 1].end : t0;
      const next = k < n ? out[k].start : t1;
      const cnt = k - s, span = next - prev;
      for (let q = 0; q < cnt; q++) {
        if (span > 0.05) {
          out[s + q].start = prev + q * span / cnt;
          out[s + q].end = prev + (q + 1) * span / cnt;
        } else {
          out[s + q].start = prev + q * 0.2;
          out[s + q].end = prev + (q + 1) * 0.2;
        }
      }
    }
    for (let i = 1; i < n; i++) {
      if (out[i].start < out[i - 1].start + 0.02) out[i].start = out[i - 1].start + 0.02;
      if (out[i].end <= out[i].start) out[i].end = out[i].start + 0.15;
    }
    return out;
  }

  // Texte lisible à partir des mots détectés : une ligne par phrase (pause > 0,45 s).
  function toText(words) {
    const lines = [];
    let cur = [];
    words.forEach((w, i) => {
      if (cur.length && w.start - words[i - 1].end > 0.45) { lines.push(cur.join(' ')); cur = []; }
      cur.push(w.text);
    });
    if (cur.length) lines.push(cur.join(' '));
    return lines.join('\n');
  }

  window.Lyrics = { whisperInput, voiceEnvelope, refine, align, toText };
})();
