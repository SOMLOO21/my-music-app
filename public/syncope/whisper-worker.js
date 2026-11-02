// Transcription Whisper dans le navigateur (Transformers.js), dans un worker pour ne pas figer l'interface.
// Entrée : audio mono 16 kHz. Sortie : mots horodatés [{text, start, end}] relatifs à l'extrait.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm';
// 3.8.1 plutôt que 4.x : l'onnxruntime de développement embarqué en 4.x ne sait pas charger ces modèles.

env.allowLocalModels = false;
env.useBrowserCache = true;

const MODELS = {
  base: 'onnx-community/whisper-base_timestamped',
  small: 'onnx-community/whisper-small_timestamped',
};

let current = { key: null, asr: null, device: null };

async function hasWebGPU() {
  try {
    return !!(navigator.gpu && (await navigator.gpu.requestAdapter()));
  } catch (e) {
    return false;
  }
}

async function load(modelKey) {
  if (current.key === modelKey && current.asr) return current;
  const id = MODELS[modelKey] || MODELS.base;
  const files = new Map();
  const progress_callback = (p) => {
    if (p.status === 'progress' && p.total) {
      files.set(p.file, { loaded: p.loaded, total: p.total });
      let loaded = 0, total = 0;
      for (const f of files.values()) { loaded += f.loaded; total += f.total; }
      postMessage({ type: 'progress', phase: 'download', loaded, total });
    }
  };
  const attempts = [];
  // Seules ces précisions donnent une transcription juste (fp16 / q8 sur carte graphique produisent du charabia).
  if (await hasWebGPU()) attempts.push({ device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' } });
  attempts.push({ device: 'wasm', dtype: modelKey === 'small'
    ? { encoder_model: 'q8', decoder_model_merged: 'q8' }
    : { encoder_model: 'fp32', decoder_model_merged: 'fp32' } });

  let lastErr;
  for (const a of attempts) {
    try {
      postMessage({ type: 'status', text: `Chargement du modèle (${a.device === 'webgpu' ? 'carte graphique' : 'processeur'})…` });
      const asr = await pipeline('automatic-speech-recognition', id, { ...a, progress_callback });
      current = { key: modelKey, asr, device: a.device };
      return current;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Modèle indisponible');
}

// Whisper découpe parfois un mot en plusieurs morceaux (« s » + « 'arrête ») :
// un morceau sans espace devant se recolle au mot précédent.
function mergeChunks(chunks) {
  const words = [];
  for (const c of chunks) {
    const raw = c.text || '';
    const text = raw.trim();
    if (!text || !Number.isFinite(c.timestamp[0])) continue;
    const prev = words[words.length - 1];
    if (prev && !/^\s/.test(raw)) {
      prev.text += text;
      prev.end = c.timestamp[1];
    } else {
      words.push({ text, start: c.timestamp[0], end: c.timestamp[1] });
    }
  }
  return words;
}

self.onmessage = async (e) => {
  const { type, audio, model, language } = e.data;
  if (type !== 'transcribe') return;
  try {
    const { asr, device } = await load(model);
    const where = device === 'webgpu' ? 'carte graphique' : 'processeur';
    const lang = language && language !== 'auto' ? { language, task: 'transcribe' } : {};
    const len = audio.length / 16000;
    const t0 = performance.now();

    // Passe 1 : les phrases et leurs bornes. L'alignement mot à mot de Whisper s'effondre
    // quand la fenêtre se termine sans voix (instru, silence) : on ne l'utilise donc que
    // sur chaque phrase recadrée, en passe 2.
    postMessage({ type: 'status', text: `Écoute de la voix (${where})…` });
    const pass1 = await asr(audio, { return_timestamps: true, ...(len > 30 ? { chunk_length_s: 30, stride_length_s: 5 } : {}), ...lang });
    const phrases = (pass1.chunks || []).filter((c) => (c.text || '').trim());

    const words = [];
    for (let p = 0; p < phrases.length; p++) {
      postMessage({ type: 'status', text: `Calage des mots : phrase ${p + 1} / ${phrases.length}…` });
      const ps = Number.isFinite(phrases[p].timestamp[0]) ? phrases[p].timestamp[0] : 0;
      const pe = Number.isFinite(phrases[p].timestamp[1]) ? phrases[p].timestamp[1] : len;
      const s = Math.max(0, ps - 0.2), e = Math.min(len, pe + 0.3);
      const crop = audio.slice(Math.floor(s * 16000), Math.floor(e * 16000));
      const out = await asr(crop, { return_timestamps: 'word', ...lang });
      const pw = mergeChunks(out.chunks || []);
      const collapsed = !pw.length || pw.every((w) => w.start === pw[0].start) || pw.some((w) => w.start > e - s + 0.5);
      if (collapsed) {
        // Repli : mots de la phrase répartis selon leur longueur entre ses bornes.
        const list = phrases[p].text.trim().split(/\s+/);
        const total = list.reduce((n, w) => n + w.length + 1, 0);
        let t = ps;
        for (const w of list) {
          const d = (pe - ps) * (w.length + 1) / total;
          words.push({ text: w, start: t, end: t + d });
          t += d;
        }
      } else {
        for (const w of pw) words.push({ text: w.text, start: w.start + s, end: (Number.isFinite(w.end) ? w.end : w.start + 0.3) + s });
      }
    }
    postMessage({ type: 'done', words, device, ms: Math.round(performance.now() - t0) });
  } catch (err) {
    postMessage({ type: 'error', message: String((err && err.message) || err) });
  }
};
