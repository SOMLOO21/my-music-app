(() => {
  const $ = (s) => document.querySelector(s);
  const W = 1080, H = 1920;

  const S = {
    buf: null, name: '', analysis: null, peaks: null,
    bpm: 0, offset: 0,
    segStart: 0, segDur: 15,
    clips: [], cutEvery: 1,
    words: [], perLine: 3, density: 1,
    style: {
      lyric: 'karaoke', font: 'Anton', upper: true, size: 104, pos: 'mid',
      text: '#ffffff', accent: '#c6ff3d', emph: '#ff4d6d',
      fx: { zoom: true, shake: true, flash: false, sat: false, glow: false, vhs: false, grain: false, vignette: true },
    },
  };

  let actx = null;
  let play = null;        // lecture en cours
  let pausedT = 0;        // instant affiché quand rien ne joue
  let tapIdx = -1;        // index du prochain mot à taper (-1 = mode tap inactif)
  let lastChipWord = -2;  // mot surligné dans l'éditeur pendant la lecture
  let exporting = null;

  const view = $('#view');
  const g = view.getContext('2d');
  const wave = $('#wave');

  // ---------- Utilitaires ----------
  const period = () => 60 / S.bpm;
  const beatTime = (i) => S.offset + i * period();
  const firstBeatIdx = (t) => Math.ceil((t - S.offset) / period() - 1e-6);
  const fmt = (t) => {
    const m = Math.floor(t / 60), s = t - m * 60;
    return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
  };
  const status = (msg) => { $('#status').textContent = msg; };
  const nextFrame = () => new Promise((r) => setTimeout(r, 30));

  function ensureCtx() {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }

  function curTime() {
    if (!play) return pausedT;
    const lat = play.exporting ? 0 : (actx.outputLatency || actx.baseLatency || 0);
    return play.base + Math.max(0, actx.currentTime - play.when - lat);
  }

  // Pendant le hook d'ouverture : temps écoulé dans le hook (sinon -1).
  function hookPhase() {
    if (!play || !play.hookDur) return -1;
    const p = curTime() - play.base;
    return p < play.hookDur ? p : -1;
  }

  // ---------- Chargement du son ----------
  async function loadFile(file) {
    if (!file) return;
    ensureCtx();
    status('Décodage du son…');
    try {
      const buf = await actx.decodeAudioData(await file.arrayBuffer());
      await saveProject();
      restoring = true;
      S.songId = null;
      await setAudio(buf, file.name.replace(/\.[^.]+$/, ''));
      // Nouveau son : les paroles de l'ancien ne le concernent pas.
      S.words = [];
      hist.length = 0;
      redoStack.length = 0;
      refreshLyrics();
      restoring = false;
      await uploadSong(file, buf.duration);
    } catch (e) {
      console.error(e);
      status("Impossible de lire ce fichier audio. Essaie un MP3 ou un WAV.");
    }
  }

  async function setAudio(buf, name) {
    stop();
    status('Analyse du tempo…');
    await nextFrame();
    const t0 = performance.now();
    const a = Beat.analyze(buf);
    S.buf = buf; S.name = name;
    S.analysis = a; S.bpm = a.bpm; S.offset = a.offset;
    S.peaks = computePeaks(a.mono, 1600);
    status(`Tempo détecté en ${Math.round(performance.now() - t0)} ms`);
    $('#audioBox').classList.remove('hidden');
    $('#trackName').textContent = name;
    $('#playBtn').disabled = false;
    $('#restartBtn').disabled = false;
    $('#exportBtn').disabled = false;
    findLoudest();
    syncGridUI();
    renderStepper();
  }

  function computePeaks(mono, n) {
    const out = new Float32Array(n);
    const step = mono.x.length / n;
    for (let i = 0; i < n; i++) {
      let m = 0;
      const a = Math.floor(i * step), b = Math.floor((i + 1) * step);
      for (let j = a; j < b; j += 2) { const v = Math.abs(mono.x[j]); if (v > m) m = v; }
      out[i] = m;
    }
    let max = 0; for (const v of out) max = Math.max(max, v);
    if (max > 0) for (let i = 0; i < n; i++) out[i] /= max;
    return out;
  }

  // ---------- Extrait ----------
  function setSegStart(t) {
    const dur = S.buf.duration;
    const i = Math.round((t - S.offset) / period());
    let start = Math.max(0, beatTime(i));
    if (start + S.segDur > dur) start = Math.max(0, beatTime(Math.floor((dur - S.segDur - S.offset) / period())));
    S.segStart = Math.max(0, start);
    pausedT = S.segStart;
    syncGridUI();
  }

  // Passage le plus énergique, aligné sur des mesures de 4 temps.
  function findLoudest() {
    const a = S.analysis;
    const dur = S.buf.duration;
    let best = 0, bestE = -1;
    for (let i = 0; beatTime(i) + S.segDur <= dur; i += 4) {
      const e = Beat.rms(a.mono, beatTime(i), beatTime(i) + S.segDur);
      if (e > bestE * 1.02) { bestE = e; best = i; }
    }
    setSegStart(beatTime(best));
  }

  function syncGridUI() {
    if (!S.buf) return;
    $('#bpmVal').textContent = S.bpm % 1 ? S.bpm.toFixed(2) : S.bpm;
    $('#bpmInput').value = S.bpm;
    $('#offsetVal').textContent = `${Math.round(S.offset * 1000)} ms`;
    const nBeats = Math.round(S.segDur / period());
    $('#segInfo').innerHTML = `Extrait de <b>${fmt(S.segStart)}</b> à <b>${fmt(S.segStart + S.segDur)}</b> · ${nBeats} temps · ${Math.ceil(nBeats / S.cutEvery)} plans`;
    drawWave();
    refreshLyrics();
  }

  function setBpm(bpm) {
    if (!S.analysis || !(bpm >= 40 && bpm <= 240)) return;
    S.bpm = Math.round(bpm * 100) / 100;
    S.offset = Beat.fitPhase(S.analysis.an, S.bpm);
    setSegStart(S.segStart);
  }

  // ---------- Forme d'onde ----------
  function drawWave() {
    if (!S.peaks) return;
    const dpr = window.devicePixelRatio || 1;
    const w = wave.clientWidth * dpr, h = wave.clientHeight * dpr;
    if (wave.width !== w) wave.width = w;
    if (wave.height !== h) wave.height = h;
    const c = wave.getContext('2d');
    const dur = S.buf.duration;
    c.clearRect(0, 0, w, h);
    const x0 = S.segStart / dur * w, x1 = (S.segStart + S.segDur) / dur * w;
    c.fillStyle = hexA(S.style.accent, 0.12);
    c.fillRect(x0, 0, x1 - x0, h);

    // Temps (tous, ou une mesure sur deux si trop serrés)
    const px = period() / dur * w;
    const every = px > 4 ? 1 : px * 4 > 4 ? 4 : 16;
    for (let i = 0; beatTime(i) < dur; i += every) {
      const x = beatTime(i) / dur * w;
      c.fillStyle = i % 4 === 0 ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.06)';
      c.fillRect(Math.round(x), 0, 1, h);
    }
    const n = S.peaks.length;
    const bw = w / n;
    for (let i = 0; i < n; i++) {
      const x = i * bw;
      const ph = Math.max(1, S.peaks[i] * h * 0.86);
      c.fillStyle = x >= x0 && x <= x1 ? S.style.accent : '#4a4a52';
      c.fillRect(x, (h - ph) / 2, Math.max(1, bw - 0.3), ph);
    }
    c.fillStyle = S.style.accent;
    c.fillRect(x0, 0, 2 * dpr, h);
    if (play) {
      const xp = curTime() / dur * w;
      c.fillStyle = '#fff';
      c.fillRect(xp, 0, 1.5 * dpr, h);
    }
  }

  // ---------- Lecture ----------
  function start(opts = {}) {
    if (!S.buf) return;
    ensureCtx();
    stop();
    const src = actx.createBufferSource();
    src.buffer = S.buf;
    const gain = actx.createGain();
    src.connect(gain);
    gain.connect(actx.destination);
    if (opts.dest) gain.connect(opts.dest);
    const segEnd = S.segStart + S.segDur;
    let from = opts.from != null ? opts.from : pausedT;
    if (!(from >= S.segStart && from < segEnd - 0.2)) from = S.segStart;
    const when = actx.currentTime + 0.1;
    // Hook d'ouverture : seulement quand on part du début de l'extrait.
    const hookDur = S.hook && S.hook.dur && from === S.segStart && opts.hook !== false ? hookLength() : 0;
    let musicFrom = from, musicAt = when;
    if (hookDur && S.hook.sound === 'hook') musicAt = when + hookDur;            // le son du hook, puis la musique
    else if (hookDur) {                                                          // la musique démarre sous le hook
      musicFrom = Math.max(0, from - hookDur);
      musicAt = when + hookDur - (from - musicFrom);
    }
    src.start(musicAt, musicFrom, segEnd - musicFrom);
    // base : instant du morceau correspondant au tout début de la lecture (hook compris).
    play = { src, when, from, base: from - hookDur, hookDur, exporting: !!opts.dest, onEnd: opts.onEnd, clicks: [] };
    if (hookDur) play.unhook = startHook(when, hookDur, opts.dest);
    src.onended = () => {
      if (play && play.src === src) {
        const cb = play.onEnd;
        stop(true);
        cb && cb();
      }
    };
    if ($('#metro').checked && !opts.dest) scheduleClicks(when, from);
    if (hookDur && opts.dest && S.hook.id) hookEvent(S.hook.id, 'exports');
    activeClip = null;
    $('#playBtn').textContent = '■';
    $('#playBtn').setAttribute('aria-label', "Arrêter l'extrait");
  }

  function stop(ended) {
    if (!play) return;
    const t = curTime();
    const p = play;
    play = null;
    try { p.src.onended = null; p.src.stop(); } catch (e) {}
    p.clicks.forEach((o) => { try { o.stop(); } catch (e) {} });
    if (S.hook) S.hook.el.pause();
    if (p.unhook) p.unhook();
    S.clips.forEach((c) => c.type === 'video' && c.el.pause());
    activeClip = null;
    pausedT = ended || p.exporting ? S.segStart : t;
    $('#playBtn').textContent = '▶';
    $('#playBtn').setAttribute('aria-label', "Lire l'extrait");
    if (tapIdx >= 0) endTap();
    drawWave();
  }

  function scheduleClicks(when, from) {
    for (let i = firstBeatIdx(from); beatTime(i) < S.segStart + S.segDur; i++) {
      const t = when + beatTime(i) - play.base;
      const o = actx.createOscillator(), gg = actx.createGain();
      o.frequency.value = i % 4 === 0 ? 1600 : 1000;
      gg.gain.setValueAtTime(0.25, t);
      gg.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      o.connect(gg).connect(actx.destination);
      o.start(t); o.stop(t + 0.06);
      play.clicks.push(o);
    }
  }

  // ---------- Clips ----------
  // Un plan : { el, type, url, name, source ('fichier' | 'banque' | 'lien'), bankId? }
  function addClip(file, meta = {}) {
    const url = URL.createObjectURL(file);
    let el, type;
    if (file.type.startsWith('video')) {
      el = document.createElement('video');
      Object.assign(el, { src: url, muted: true, loop: true, playsInline: true, preload: 'auto' });
      el.setAttribute('playsinline', '');
      type = 'video';
    } else if (file.type.startsWith('image')) {
      el = new Image(); el.src = url; type = 'image';
    } else return null;
    const clip = { el, type, url, name: meta.name || file.name, source: meta.source || 'fichier', bankId: meta.bankId || null,
      remote: meta.remote || { kind: 'local', name: meta.name || file.name } };
    S.clips.push(clip);
    renderClips();
    return clip;
  }

  function addClips(files) {
    for (const f of files) addClip(f, { source: 'fichier' });
  }

  function removeClip(clip) {
    const i = S.clips.indexOf(clip);
    if (i < 0) return;
    clip.el.pause && clip.el.pause();
    S.clips.splice(i, 1);
    URL.revokeObjectURL(clip.url);
    renderClips();
  }

  function renderClips() {
    const box = $('#clips');
    box.innerHTML = '';
    S.clips.forEach((c, i) => {
      const d = document.createElement('div');
      d.className = 'clip';
      d.title = c.name;
      const thumb = c.type === 'video' ? document.createElement('video') : document.createElement('img');
      // Vignette prise à 1 s : beaucoup de vidéos commencent sur une image noire.
      thumb.src = c.type === 'video' ? `${c.url}#t=1` : c.url;
      if (c.type === 'video') { thumb.muted = true; thumb.preload = 'metadata'; }
      const rm = document.createElement('button');
      rm.textContent = '✕';
      rm.setAttribute('aria-label', `Retirer ${c.name}`);
      rm.onclick = () => removeClip(c);
      const n = document.createElement('i');
      n.textContent = i + 1;
      d.append(thumb, rm, n);
      if (c.source !== 'fichier') {
        const src = document.createElement('span');
        src.className = 'src';
        src.textContent = c.source === 'banque' ? 'Banque' : 'Lien';
        d.append(src);
      }
      box.append(d);
    });
    $('#clipCount').textContent = S.clips.length ? `${S.clips.length} plan${S.clips.length > 1 ? 's' : ''}` : '';
    $('#clipsEmpty').classList.toggle('hidden', S.clips.length > 0);
    markTiles();
    syncGridUI();
  }

  // Un seul clip décode à la fois : celui affiché. Les autres restent en pause là où ils étaient.
  let activeClip = null;
  function setActiveClip(clip) {
    if (clip === activeClip) {
      if (play && clip && clip.type === 'video' && clip.el.paused) clip.el.play().catch(() => {});
      return;
    }
    if (activeClip && activeClip.type === 'video') activeClip.el.pause();
    activeClip = clip;
    if (play && clip && clip.type === 'video') clip.el.play().catch(() => {});
  }

  // ---------- Banque de clips par mood (Pixabay ou Pexels, via le serveur local) ----------
  const B = { moods: [], mood: null, q: '', ori: '', dur: '', page: 1, clips: [], more: false, loading: false, pending: new Set() };

  async function api(path, opts) {
    let r;
    try { r = await fetch(path, opts); } catch (e) { throw Object.assign(new Error('Serveur SYNCOPE injoignable'), { offline: true }); }
    let j = {};
    try { j = await r.json(); } catch (e) { if (!r.ok) throw Object.assign(new Error('Serveur SYNCOPE injoignable'), { offline: true }); }
    if (r.status === 401 && j.detail === 'Connexion requise') { location.href = '/compte'; }
    if (!r.ok) throw Object.assign(new Error(j.detail || `Erreur ${r.status}`), { needKey: !!j.need_key });
    return j;
  }

  function bankView(v) {
    $('#bankOffline').classList.toggle('hidden', v !== 'offline');
    $('#bankSetup').classList.toggle('hidden', v !== 'setup');
    $('#bankUi').classList.toggle('hidden', v !== 'ui');
  }

  async function bankInit() {
    try {
      const st = await api('api/status');
      if (!st.provider) { bankView('setup'); return; }
      B.provider = st.provider;
      const credit = $('#bankCredit');
      credit.textContent = st.provider === 'pexels' ? 'Pexels' : 'Pixabay';
      credit.href = st.provider === 'pexels' ? 'https://www.pexels.com' : 'https://pixabay.com';
      const { moods } = await api('api/bank/moods');
      B.moods = moods;
      bankView('ui');
      renderMoods();
      if (!B.mood && !B.q) selectMood(moods[0].id);
    } catch (e) {
      bankView(e.offline ? 'offline' : 'setup');
    }
  }

  function renderMoods() {
    const box = $('#moods');
    box.innerHTML = '';
    for (const m of B.moods) {
      const b = document.createElement('button');
      b.className = 'mood' + (m.id === B.mood && !B.q ? ' on' : '');
      b.style.background = `linear-gradient(135deg, ${m.colors[0]}, ${m.colors[1]})`;
      b.textContent = m.name;
      b.onclick = () => selectMood(m.id);
      box.append(b);
    }
  }

  function selectMood(id) {
    B.mood = id; B.q = ''; $('#bankSearch').value = '';
    renderMoods();
    loadBank(false);
  }

  let bankReq = 0;
  async function loadBank(more) {
    const req = ++bankReq;
    B.loading = true;
    B.page = more ? B.page + 1 : 1;
    if (!more) { B.clips = []; renderBankGrid(); }
    $('#bankStatus').textContent = 'Chargement…';
    const qs = `orientation=${B.ori}&dur=${B.dur}&page=${B.page}`;
    try {
      const j = B.q
        ? await api(`api/bank/search?q=${encodeURIComponent(B.q)}&${qs}`)
        : await api(`api/bank?mood=${B.mood}&${qs}`);
      if (req !== bankReq) return;
      const have = new Set(B.clips.map((c) => c.id));
      B.clips = B.clips.concat(j.clips.filter((c) => !have.has(c.id)));
      B.more = j.has_more;
      $('#bankStatus').textContent = B.clips.length ? '' : 'Aucun clip avec ces filtres.';
    } catch (e) {
      if (req !== bankReq) return;
      if (e.needKey) { bankView('setup'); return; }
      $('#bankStatus').textContent = e.message;
    } finally {
      if (req === bankReq) B.loading = false;
    }
    renderBankGrid();
  }

  function renderBankGrid() {
    const g = $('#bankGrid');
    g.innerHTML = '';
    for (const c of B.clips) {
      const t = document.createElement('button');
      t.className = 'tile';
      t.dataset.id = c.id;
      t.style.backgroundImage = `url("${c.thumb}")`;
      t.title = `Ajouter ce plan · ${c.author}`;
      t.innerHTML = `<span class="dur">${Math.round(c.duration)} s</span><span class="tick">+</span>`;
      t.onclick = () => toggleBankClip(c);
      t.addEventListener('pointerenter', () => {
        if (t.querySelector('video')) return;
        const v = document.createElement('video');
        Object.assign(v, { muted: true, loop: true, playsInline: true, autoplay: true, src: `api/proxy?u=${encodeURIComponent(c.preview)}` });
        t.prepend(v);
      });
      t.addEventListener('pointerleave', () => { const v = t.querySelector('video'); if (v) { v.pause(); v.remove(); } });
      g.append(t);
    }
    $('#bankMore').classList.toggle('hidden', !B.more || !B.clips.length);
    markTiles();
  }

  function markTiles() {
    const chosen = new Set(S.clips.map((c) => c.bankId).filter(Boolean));
    document.querySelectorAll('#bankGrid .tile').forEach((t) => {
      const on = chosen.has(t.dataset.id);
      t.classList.toggle('on', on);
      t.classList.toggle('busy', B.pending.has(t.dataset.id));
      const tick = t.querySelector('.tick');
      if (tick) tick.textContent = on ? '✓' : '+';
    });
  }

  async function fetchBankClip(c) {
    const r = await fetch(`api/proxy?u=${encodeURIComponent(c.file)}`);
    if (!r.ok) throw new Error('Clip indisponible');
    return new File([await r.blob()], `${c.id}.mp4`, { type: 'video/mp4' });
  }

  async function toggleBankClip(c) {
    const existing = S.clips.find((x) => x.bankId === c.id);
    if (existing) { removeClip(existing); return; }
    if (B.pending.has(c.id)) return;
    B.pending.add(c.id); markTiles();
    try {
      addClip(await fetchBankClip(c), { source: 'banque', bankId: c.id, name: `${B.provider === 'pexels' ? 'Pexels' : 'Pixabay'} · ${c.author}`, remote: { kind: 'bank', bankId: c.id, file: c.file, name: `${B.provider === 'pexels' ? 'Pexels' : 'Pixabay'} · ${c.author}` } });
    } catch (e) {
      $('#bankStatus').textContent = 'Ce clip est indisponible, essaie-en un autre.';
    } finally {
      B.pending.delete(c.id); markTiles();
    }
  }

  // « Choisis pour moi » : une dizaine de plans du mood au hasard, sans doublons.
  async function pickForMe() {
    const btn = $('#pickForMe');
    btn.disabled = true;
    try {
      if (B.clips.length < 14 && B.more) await loadBank(true);
      const chosen = new Set(S.clips.map((c) => c.bankId));
      const pool = B.clips.filter((c) => !chosen.has(c.id));
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      const want = Math.min(10, pool.length);
      let done = 0;
      for (const c of pool.slice(0, want)) {
        $('#bankStatus').textContent = `Plans choisis : ${done} / ${want}…`;
        B.pending.add(c.id); markTiles();
        try { addClip(await fetchBankClip(c), { source: 'banque', bankId: c.id, name: `${B.provider === 'pexels' ? 'Pexels' : 'Pixabay'} · ${c.author}`, remote: { kind: 'bank', bankId: c.id, file: c.file, name: `${B.provider === 'pexels' ? 'Pexels' : 'Pixabay'} · ${c.author}` } }); done++; } catch (e) {}
        B.pending.delete(c.id); markTiles();
      }
      $('#bankStatus').textContent = done ? `✓ ${done} plans ajoutés. Retire ceux qui ne te plaisent pas.` : 'Aucun plan disponible.';
    } finally {
      btn.disabled = false;
    }
  }

  async function saveKey() {
    const key = $('#pexelsKey').value.trim();
    if (!key) return;
    $('#keyStatus').textContent = 'Vérification de la clé auprès de Pixabay…';
    try {
      await api('api/settings/key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'pixabay', key }) });
      $('#pexelsKey').value = '';
      $('#keyStatus').textContent = '';
      bankInit();
    } catch (e) {
      $('#keyStatus').textContent = e.message;
    }
  }

  // ---------- Import par lien (yt-dlp sur le serveur local) ----------
  async function importLink() {
    const url = $('#linkUrl').value.trim();
    const say = (t) => { $('#linkStatus').textContent = t; };
    if (!/^https?:\/\//.test(url)) { say('Colle un lien complet, qui commence par https://'); return; }
    if (!$('#linkRights').checked) { say('Coche la case : tu dois avoir le droit d’utiliser cette vidéo.'); return; }
    const btn = $('#linkImport');
    btn.disabled = true;
    $('#linkProgress').classList.remove('hidden');
    $('#linkBar').style.width = '3%';
    say('Import lancé…');
    try {
      const { job_id } = await api('api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, rights_ok: true }) });
      const t0 = Date.now();
      let st;
      while (Date.now() - t0 < 11 * 60 * 1000) {
        await new Promise((r) => setTimeout(r, 1000));
        st = await api(`api/import/${job_id}`);
        if (st.status === 'downloading') { say(`Téléchargement${st.title ? ` de « ${st.title} »` : ''}… ${Math.round(st.progress || 0)} %`); $('#linkBar').style.width = `${Math.max(3, st.progress || 0) * 0.9}%`; }
        else if (st.status === 'processing') { say('Préparation de la vidéo…'); $('#linkBar').style.width = '94%'; }
        else if (st.status === 'done' || st.status === 'error') break;
      }
      if (!st || st.status !== 'done') throw new Error((st && st.error) || 'Import trop long, réessaie.');
      say('Ajout au montage…');
      const r = await fetch(`media/${encodeURIComponent(st.file)}`);
      if (!r.ok) throw new Error('Fichier importé introuvable');
      addClip(new File([await r.blob()], st.file, { type: 'video/mp4' }), { source: 'lien', name: st.title || st.file, remote: { kind: 'media', file: st.file, name: st.title || st.file } });
      $('#linkBar').style.width = '100%';
      say(`✓ « ${st.title || 'Vidéo'} » ajoutée à tes plans.`);
      $('#linkUrl').value = '';
    } catch (e) {
      say(e.offline ? 'Le serveur SYNCOPE ne répond pas : lance « python3 server.py ».' : e.message);
    } finally {
      btn.disabled = false;
      setTimeout(() => $('#linkProgress').classList.add('hidden'), 1500);
    }
  }

  // ---------- Hook d'ouverture (banque Google Drive via le serveur local) ----------
  // S.hook : { id, name, url, el (vidéo), dur, sound ('hook' | 'music'), len (0 = tout), text }
  const HK = { all: [], cat: '', q: '', shown: 30, previewed: new Set(), loading: null };

  const hookLength = () => {
    const h = S.hook;
    if (!h || !h.dur) return 0;
    return h.len ? Math.min(h.len, h.dur) : h.dur;
  };

  function hookEvent(id, type) {
    if (!id) return;
    fetch('api/hooks/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, type }) })
      .then(() => { const h = HK.all.find((x) => x.id === id); if (h) { h[type] = (h[type] || 0) + 1; renderHookTop(); } })
      .catch(() => {});
  }

  async function hooksInit() {
    try {
      const { hooks } = await api('api/hooks');
      HK.all = hooks;
      $('#hookOffline').classList.add('hidden');
      renderHookCats();
      renderHookGrid();
      renderHookTop();
    } catch (e) {
      $('#hookOffline').classList.remove('hidden');
      if (!e.offline) $('#hookOffline').textContent = `Banque de hooks indisponible : ${e.message}`;
    }
  }

  function renderHookCats() {
    const cats = [...new Set(HK.all.map((h) => h.category))];
    const box = $('#hookCats');
    box.innerHTML = '';
    for (const [v, label] of [['', `Tous (${HK.all.length})`], ...cats.map((c) => [c, `${c} (${HK.all.filter((h) => h.category === c).length})`])]) {
      const b = document.createElement('button');
      b.textContent = label;
      b.classList.toggle('on', v === HK.cat);
      b.onclick = () => { HK.cat = v; HK.shown = 30; renderHookCats(); renderHookGrid(); };
      box.append(b);
    }
  }

  function filteredHooks() {
    const q = HK.q.toLowerCase();
    return HK.all.filter((h) => (!HK.cat || h.category === HK.cat) && (!q || h.name.toLowerCase().includes(q)));
  }

  function renderHookGrid() {
    const list = filteredHooks();
    const g = $('#hookGrid');
    g.innerHTML = '';
    for (const h of list.slice(0, HK.shown)) {
      const t = document.createElement('button');
      t.className = 'tile' + (S.hook && S.hook.id === h.id ? ' on' : '');
      t.dataset.id = h.id;
      t.title = `${h.name} · ${h.category}`;
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.alt = '';
      img.src = `api/hooks/thumb/${h.id}`;
      t.append(img);
      t.insertAdjacentHTML('beforeend', `<span class="tick">${S.hook && S.hook.id === h.id ? '✓' : '+'}</span>`);
      if (h.uses) t.insertAdjacentHTML('beforeend', `<span class="pop-count">${h.uses} choisi${h.uses > 1 ? 's' : ''}</span>`);
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = h.name;
      t.append(name);
      t.onclick = () => useBankHook(h);
      let timer = null;
      t.addEventListener('pointerenter', () => {
        timer = setTimeout(() => {
          if (t.querySelector('video')) return;
          const v = document.createElement('video');
          Object.assign(v, { muted: true, loop: true, playsInline: true, autoplay: true, src: `api/hooks/file/${h.id}` });
          v.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover';
          t.insertBefore(v, img.nextSibling);
          if (!HK.previewed.has(h.id)) { HK.previewed.add(h.id); hookEvent(h.id, 'previews'); }
        }, 250);
      });
      t.addEventListener('pointerleave', () => { clearTimeout(timer); const v = t.querySelector('video'); if (v) { v.pause(); v.remove(); } });
      g.append(t);
    }
    $('#hookMore').classList.toggle('hidden', list.length <= HK.shown);
    if (!list.length) g.innerHTML = '<p class="hint">Aucun hook ne correspond.</p>';
  }

  // Classement : un hook choisi compte plus qu'un simple aperçu, un export plus encore.
  function renderHookTop() {
    const score = (h) => (h.previews || 0) + 3 * (h.uses || 0) + 5 * (h.exports || 0);
    const top = HK.all.filter((h) => score(h) > 0).sort((a, b) => score(b) - score(a)).slice(0, 15);
    const box = $('#hookTop');
    box.innerHTML = top.length ? '' : '<p class="hint">Pas encore de statistiques : elles se remplissent quand on regarde, choisit et exporte des hooks.</p>';
    top.forEach((h, i) => {
      const row = document.createElement('div');
      row.className = 'top-row';
      row.innerHTML = `<span class="rank">${i + 1}</span><img loading="lazy" alt="" src="api/hooks/thumb/${h.id}">`
        + `<span class="t"><b></b><span>${h.previews || 0} aperçu${(h.previews || 0) > 1 ? 's' : ''} · ${h.uses || 0} choisi${(h.uses || 0) > 1 ? 's' : ''} · ${h.exports || 0} export${(h.exports || 0) > 1 ? 's' : ''}</span></span>`;
      row.querySelector('b').textContent = h.name;
      const btn = document.createElement('button');
      btn.className = 'small';
      btn.textContent = S.hook && S.hook.id === h.id ? '✓ Utilisé' : 'Utiliser';
      btn.onclick = () => useBankHook(h);
      row.append(btn);
      box.append(row);
    });
  }

  async function useBankHook(h) {
    if (S.hook && S.hook.id === h.id) return;
    const tile = document.querySelector(`#hookGrid .tile[data-id="${h.id}"]`);
    if (tile) tile.classList.add('busy');
    try {
      const r = await fetch(`api/hooks/file/${h.id}`);
      if (!r.ok) throw new Error('Hook indisponible');
      await setHook(await r.blob(), { id: h.id, name: h.name });
      hookEvent(h.id, 'uses');
    } catch (e) {
      status(`Ce hook est indisponible : ${e.message}`);
    } finally {
      if (tile) tile.classList.remove('busy');
    }
  }

  function setHook(blob, meta) {
    stop();
    clearHook();
    const url = URL.createObjectURL(blob);
    const el = document.createElement('video');
    Object.assign(el, { src: url, playsInline: true, preload: 'auto' });
    el.setAttribute('playsinline', '');
    const prev = S.hookPrefs || { sound: 'hook', len: 0, text: '' };
    S.hook = { id: meta.id || null, name: meta.name, url, el, dur: 0, ...prev };
    return new Promise((resolve) => {
      el.onloadedmetadata = () => { S.hook.dur = el.duration || 0; renderHookChosen(); resolve(); };
      el.onerror = () => { status('Cette vidéo ne peut pas être lue comme hook.'); clearHook(); resolve(); };
    });
  }

  function clearHook() {
    if (!S.hook) return;
    S.hook.el.pause();
    URL.revokeObjectURL(S.hook.url);
    S.hook = null;
    renderHookChosen();
  }

  function renderHookChosen() {
    const h = S.hook;
    $('#hookChosen').classList.toggle('hidden', !h);
    if (h) {
      $('#hookName').textContent = h.name;
      $('#hookMeta').textContent = `${hookLength().toFixed(1)} s en ouverture`;
      $('#hookVid').src = h.url;
      $('#hookSound').value = h.sound;
      $('#hookLen').value = String(h.len);
      $('#hookText').value = h.text;
    } else $('#hookVid').removeAttribute('src');
    document.querySelectorAll('#hookGrid .tile').forEach((t) => {
      const on = !!(h && h.id === t.dataset.id);
      t.classList.toggle('on', on);
      t.querySelector('.tick').textContent = on ? '✓' : '+';
    });
    renderHookTop();
  }

  // Son du hook : la vidéo passe par l'AudioContext pour être enregistrée avec la musique à l'export.
  function hookAudio() {
    const h = S.hook;
    if (!h.node) {
      h.node = actx.createMediaElementSource(h.el);
      h.gain = actx.createGain();
      h.node.connect(h.gain);
      h.gain.connect(actx.destination);
    }
    return h.gain;
  }

  function startHook(when, len, dest) {
    const h = S.hook, el = h.el;
    const gain = hookAudio();
    gain.gain.cancelScheduledValues(0);
    gain.gain.setValueAtTime(h.sound === 'hook' ? 1 : 0, actx.currentTime);
    gain.gain.setValueAtTime(0, when + len);
    if (dest) gain.connect(dest);
    el.pause();
    el.currentTime = 0;
    setTimeout(() => { if (play && play.hookDur) el.play().catch(() => {}); }, Math.max(0, (when - actx.currentTime) * 1000));
    return dest ? () => { try { gain.disconnect(dest); } catch (e) {} } : null;
  }

  // Image du hook : plein cadre, avec son texte éventuel.
  function drawHookFrame(p) {
    const h = S.hook, st = S.style;
    if (!drawCover(h.el, 1, 0, 0, 1)) { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); }
    if (!h.text) return;
    const txt = st.upper ? h.text.toLocaleUpperCase('fr') : h.text;
    let size = 92;
    g.font = `${size}px "${st.font}"`;
    const words = txt.split(/\s+/), lines = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (g.measureText(test).width > W * 0.84 && cur) { lines.push(cur); cur = w; } else cur = test;
    }
    if (cur) lines.push(cur);
    const sc = 1 + 0.25 * Math.exp(-p * 10);
    g.save();
    g.translate(W / 2, H * 0.22);
    g.scale(sc, sc);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    lines.forEach((l, i) => {
      const y = (i - (lines.length - 1) / 2) * size * 1.12;
      g.lineWidth = 14;
      g.strokeStyle = 'rgba(0,0,0,.85)';
      g.strokeText(l, 0, y);
      g.fillStyle = '#fff';
      g.fillText(l, 0, y);
    });
    g.restore();
  }

  // ---------- Mes sons : chaque son importé est gardé avec son projet ----------
  // Le projet (grille, extrait, paroles calées, style, hook, clips) est sauvegardé tout seul dès qu'il change.
  let SONGS = [];
  let lastSaved = '';
  let restoring = false;

  function projectData() {
    return {
      name: S.name, bpm: S.bpm, offset: S.offset, segStart: S.segStart, segDur: S.segDur,
      cutEvery: S.cutEvery, perLine: S.perLine, density: S.density,
      words: S.words.filter((w) => !w._new).map((w) => {
        const o = { text: w.text, t: w.t, end: w.end };
        if (w.br) o.br = true;
        if (w.emph) o.emph = w.emph;
        return o;
      }),
      style: S.style,
      hook: S.hook ? { id: S.hook.id, name: S.hook.name, sound: S.hook.sound, len: S.hook.len, text: S.hook.text } : null,
      clips: S.clips.map((c) => c.remote).filter(Boolean),
    };
  }

  function setSaveState(text, ok) {
    const el = $('#saveState');
    el.textContent = text;
    el.classList.toggle('ok', !!ok);
  }

  async function saveProject() {
    if (!S.songId || restoring || exporting || tapIdx >= 0) return;
    const json = JSON.stringify(projectData());
    if (json === lastSaved) return;
    try {
      await api(`api/songs/${S.songId}/project`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: json });
      lastSaved = json;
      setSaveState('✓ Sauvegardé', true);
      loadSongs();
    } catch (e) {
      setSaveState(e.offline ? 'Non sauvegardé : serveur arrêté' : 'Sauvegarde impossible');
    }
  }
  setInterval(saveProject, 2500);

  async function uploadSong(file, duration) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    setSaveState('Sauvegarde…');
    try {
      // Le fichier part directement dans le stockage Vercel Blob (trop lourd pour passer par le serveur),
      // puis le serveur enregistre le son.
      const { upload } = await import('https://cdn.jsdelivr.net/npm/@vercel/blob@2.8.2/dist/client.js/+esm');
      const { pathname } = await upload(`syncope/songs/upload/${Date.now()}.${ext}`, file, { access: 'private', handleUploadUrl: '/syncope/api/songs/upload', multipart: file.size > 50 * 1024 * 1024 });
      const meta = await api('api/songs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pathname, name: S.name, ext, size: file.size, duration }) });
      S.songId = meta.id;
      lastSaved = '';
      await saveProject();
    } catch (e) {
      setSaveState(e.offline ? 'Non sauvegardé : serveur arrêté' : `Non sauvegardé : ${e.message}`);
    }
  }

  async function loadSongs() {
    try { SONGS = (await api('api/songs')).songs; } catch (e) { SONGS = []; }
    renderSongs();
  }

  function renderSongs() {
    if (document.querySelector('#songsList .name-edit')) return; // on ne casse pas une saisie en cours
    $('#songsBox').classList.toggle('hidden', !SONGS.length);
    $('#songsCount').textContent = `${SONGS.length} son${SONGS.length > 1 ? 's' : ''} · clique pour reprendre là où tu en étais`;
    const box = $('#songsList');
    box.innerHTML = '';
    for (const m of SONGS) {
      const row = document.createElement('div');
      row.className = 'song' + (m.id === S.songId ? ' on' : '');
      const open = document.createElement('button');
      open.className = 'open';
      const d = m.updated ? new Date(m.updated) : null;
      const bits = [
        m.bpm ? `${Math.round(m.bpm * 100) / 100} BPM` : null,
        m.duration ? fmt(m.duration).replace(/\.\d$/, '') : null,
        m.words ? `${m.words} mots calés` : 'paroles à faire',
        m.keys ? `${m.keys} mot${m.keys > 1 ? 's' : ''} clé${m.keys > 1 ? 's' : ''}` : null,
        m.hook ? 'hook' : null,
        d ? `modifié le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : null,
      ].filter(Boolean);
      open.innerHTML = '<b></b><span></span>';
      open.querySelector('b').textContent = (m.id === S.songId ? '● ' : '') + m.name;
      open.querySelector('span').textContent = bits.join(' · ');
      open.onclick = () => openSong(m);
      const del = document.createElement('button');
      del.className = 'del';
      del.textContent = '✕';
      del.title = 'Supprimer ce son de Mes sons';
      del.setAttribute('aria-label', `Supprimer ${m.name}`);
      del.onclick = () => deleteSong(m);
      const ren = document.createElement('button');
      ren.className = 'del';
      ren.textContent = '✎';
      ren.title = 'Renommer ce son';
      ren.setAttribute('aria-label', `Renommer ${m.name}`);
      ren.onclick = () => editName(open, m.name, (n) => renameSong(m.id, n));
      row.append(open, ren, del);
      box.append(row);
    }
  }

  async function deleteSong(m) {
    if (!confirm(`Supprimer « ${m.name} » de Mes sons ? Le son et son travail (paroles calées, réglages) seront effacés.`)) return;
    try { await api(`api/songs/${m.id}`, { method: 'DELETE' }); } catch (e) { status(`Suppression impossible : ${e.message}`); return; }
    if (S.songId === m.id) { S.songId = null; setSaveState(''); }
    loadSongs();
  }

  async function openSong(m) {
    if (S.songId === m.id) return;
    await saveProject();
    status(`Ouverture de « ${m.name} »…`);
    try {
      const [ab, proj] = await Promise.all([
        fetch(`api/songs/${m.id}/audio`).then((r) => { if (!r.ok) throw new Error('fichier introuvable'); return r.arrayBuffer(); }),
        api(`api/songs/${m.id}/project`),
      ]);
      ensureCtx();
      const buf = await actx.decodeAudioData(ab);
      restoring = true;
      S.songId = null;
      await setAudio(buf, m.name);
      S.songId = m.id;
      const missing = await applyProject(proj);
      lastSaved = JSON.stringify(projectData());
      setSaveState('✓ Sauvegardé', true);
      status(missing ? `« ${m.name} » rechargé. ${missing} clip${missing > 1 ? 's' : ''} venant de ton ordinateur à rajouter.` : `« ${m.name} » rechargé avec tous ses réglages`);
    } catch (e) {
      status(`Impossible d'ouvrir ce son : ${e.message}`);
    } finally {
      restoring = false;
      renderSongs();
    }
  }

  function syncStyleInputs() {
    const st = S.style;
    $('#pos').value = st.pos;
    $('#size').value = st.size;
    $('#textColor').value = st.text;
    $('#accent').value = st.accent;
    $('#emphColor').value = st.emph;
    $('#upper').checked = !!st.upper;
    document.documentElement.style.setProperty('--acc', st.accent);
    document.documentElement.style.setProperty('--emph', st.emph);
  }

  // Remet le projet sauvegardé : grille, extrait, paroles, style, hook, clips. Renvoie le nombre de clips non récupérables.
  async function applyProject(p) {
    if (!p || !p.bpm) return 0;
    S.bpm = p.bpm;
    S.offset = p.offset;
    S.segDur = p.segDur || S.segDur;
    $('#segDur').value = String(S.segDur);
    S.cutEvery = p.cutEvery || 1;
    S.perLine = p.perLine || 3;
    S.density = p.density || 1;
    $('#perLine').value = String(S.perLine);
    $('#density').value = String(S.density);
    if (p.style) {
      S.style = { ...S.style, ...p.style, fx: { ...S.style.fx, ...(p.style.fx || {}) } };
      syncStyleUI();
      syncStyleInputs();
      loadFont();
    }
    S.words = (p.words || []).map((w) => ({ ...w }));
    hist.length = 0;
    redoStack.length = 0;
    sel.clear();
    setSegStart(p.segStart);

    stop();
    clearHook();
    if (p.hook) {
      S.hookPrefs = { sound: p.hook.sound || 'hook', len: p.hook.len || 0, text: p.hook.text || '' };
      if (p.hook.id) {
        try {
          const r = await fetch(`api/hooks/file/${p.hook.id}`);
          if (r.ok) await setHook(await r.blob(), { id: p.hook.id, name: p.hook.name });
        } catch (e) {}
      }
    }

    S.clips.slice().forEach(removeClip);
    let missing = 0;
    for (const c of p.clips || []) {
      try {
        if (c.kind === 'bank') {
          addClip(await fetchBankClip({ id: c.bankId, file: c.file }), { source: 'banque', bankId: c.bankId, name: c.name, remote: c });
        } else if (c.kind === 'media') {
          const r = await fetch(`media/${encodeURIComponent(c.file)}`);
          if (!r.ok) throw new Error('absent');
          addClip(new File([await r.blob()], c.file, { type: 'video/mp4' }), { source: 'lien', name: c.name, remote: c });
        } else missing++;
      } catch (e) { missing++; }
    }
    refreshLyrics();
    renderHookChosen();
    syncGridUI();
    return missing;
  }

  // ----- Renommer un son (dans Mes sons ou le son en cours) -----
  async function renameSong(id, name) {
    if (!id || id === S.songId) { S.name = name; $('#trackName').textContent = name; }
    if (!id) return;
    try {
      await api(`api/songs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      loadSongs();
    } catch (e) {
      status(`Renommage impossible : ${e.message}`);
    }
  }

  // Remplace un élément par un champ texte le temps de la saisie (Entrée valide, Échap annule).
  function editName(el, current, onDone) {
    const inp = document.createElement('input');
    inp.className = 'name-edit';
    inp.value = current;
    inp.maxLength = 120;
    inp.setAttribute('aria-label', 'Nom du son');
    el.replaceWith(inp);
    inp.focus();
    inp.select();
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      const v = inp.value.trim();
      inp.replaceWith(el);
      if (save && v && v !== current) onDone(v);
    };
    inp.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    };
    inp.onblur = () => finish(true);
  }

  const renameCurrent = () => {
    if (!S.buf) return;
    editName($('#trackName'), S.name, (n) => renameSong(S.songId, n));
  };

  // ---------- Parcours étape par étape ----------
  // Une page par étape ; l'aperçu vidéo n'apparaît qu'à partir du hook, et en grand à l'export.
  const STEPS = [...document.querySelectorAll('.card[data-step]')];
  const NO_STAGE = new Set([1, 2]);
  let step = 1;

  function renderStepper() {
    const nav = $('#stepper');
    nav.innerHTML = '';
    STEPS.forEach((c, i) => {
      const n = i + 1;
      const b = document.createElement('button');
      b.className = 'st' + (n === step ? ' on' : '') + (n < step ? ' done' : '');
      b.innerHTML = `<span class="n">${n < step ? '✓' : n}</span><span class="l">${c.dataset.title}</span>`;
      b.disabled = n > 1 && !S.buf;
      if (n === step) b.setAttribute('aria-current', 'step');
      b.onclick = () => goStep(n);
      nav.append(b);
      if (i < STEPS.length - 1) nav.append(Object.assign(document.createElement('span'), { className: 'sep' }));
    });
    document.querySelectorAll('.step-next').forEach((b) => (b.disabled = !S.buf));
  }

  function goStep(n) {
    n = Math.max(1, Math.min(STEPS.length, n));
    if (n > 1 && !S.buf) { status('Choisis ou importe un son pour continuer.'); return; }
    if (n !== 4 && $('#tlDetails').open) $('#tlDetails').open = false;
    closePop();
    step = n;
    STEPS.forEach((c, i) => c.classList.toggle('hidden', i + 1 !== n));
    document.body.dataset.step = n;
    document.body.classList.toggle('no-stage', NO_STAGE.has(n));
    renderStepper();
    window.scrollTo(0, 0);
    requestAnimationFrame(() => { drawWave(); renderTimeline(); });
  }

  // Pied de chaque étape : Précédent / Suivant.
  STEPS.forEach((c, i) => {
    const f = document.createElement('div');
    f.className = 'step-foot';
    if (i > 0) {
      const p = document.createElement('button');
      p.className = 'ghost';
      p.textContent = '← Précédent';
      p.onclick = () => goStep(i);
      f.append(p);
    }
    f.append(Object.assign(document.createElement('span'), { className: 'grow' }));
    if (i < STEPS.length - 1) {
      const nx = document.createElement('button');
      nx.className = 'primary step-next';
      nx.textContent = `Suivant : ${STEPS[i + 1].dataset.title} →`;
      nx.onclick = () => goStep(i + 2);
      f.append(nx);
    }
    c.append(f);
  });

  // ---------- Paroles ----------
  // Un mot : { text, t (début), end (fin), br (début de ligne voulu), line (calculé) }.
  // Règle : corriger le texte d'un mot ne change jamais aucun timing.
  const sel = new Set();      // mots sélectionnés (objets)
  let selAnchor = null;       // dernier mot cliqué, pour Maj-clic
  let wordClip = null;        // mots copiés, temps relatifs
  const hist = [], redoStack = [];
  let pxs = 0;                // zoom de la timeline (pixels par seconde), 0 = automatique
  let fitAll = false;         // « Adapter » : tout l'extrait visible, même si les mots deviennent étroits

  function snapshot() {
    hist.push(JSON.stringify(S.words));
    if (hist.length > 80) hist.shift();
    redoStack.length = 0;
  }
  function undo() {
    if (!hist.length) return;
    redoStack.push(JSON.stringify(S.words));
    S.words = JSON.parse(hist.pop());
    sel.clear();
    refreshLyrics();
  }
  function redo() {
    if (!redoStack.length) return;
    hist.push(JSON.stringify(S.words));
    S.words = JSON.parse(redoStack.pop());
    sel.clear();
    refreshLyrics();
  }

  // Texte collé → mots, en gardant les retours à la ligne comme débuts de ligne.
  function parseTokens(text) {
    const out = [];
    for (const l of text.split('\n')) {
      l.trim().split(/\s+/).filter(Boolean).forEach((w, i) => out.push({ text: w, br: i === 0 && out.length > 0 }));
    }
    return out;
  }

  // Trie par temps et découpe en lignes : retour à la ligne voulu, ligne pleine, ou pause.
  function relayout() {
    S.words.sort((a, b) => (a.t ?? Infinity) - (b.t ?? Infinity));
    let line = 0, count = 0;
    S.words.forEach((w, i) => {
      const prev = S.words[i - 1];
      if (prev && (count >= S.perLine || w.br || (w.t != null && prev.t != null && w.t - (prev.end ?? prev.t) > 0.6))) {
        line++; count = 0;
      }
      w.line = line;
      count++;
    });
  }

  function beatDistribute(tokens) {
    const step = period() / S.density;
    const t0 = beatTime(firstBeatIdx(S.segStart));
    return tokens.map((w, i) => ({ text: w.text, br: !!w.br, t: t0 + i * step, end: t0 + (i + 0.9) * step }));
  }

  function refreshLyrics() {
    relayout();
    const has = S.words.length > 0;
    $('#editor').classList.toggle('hidden', !has);
    $('#lyricsChoice').classList.toggle('hidden', has || !$('#pasteZone').classList.contains('hidden'));
    for (const w of [...sel]) if (!S.words.includes(w)) sel.delete(w);
    renderList();
    renderTimeline();
    renderKeys();
    syncSelBar();
    const out = S.words.filter((w) => w.t != null && (w.t < S.segStart - 0.05 || w.t > S.segStart + S.segDur)).length;
    $('#outHint').textContent = out ? `${out} mot${out > 1 ? 's sont' : ' est'} hors de l'extrait : « Recaler les paroles » les replace sur ta voix.` : '';
    lastChipWord = -2;
  }

  // ----- Liste de mots -----
  function selectWord(w, e) {
    if (e && e.shiftKey && selAnchor && S.words.includes(selAnchor)) {
      const a = S.words.indexOf(selAnchor), b = S.words.indexOf(w);
      sel.clear();
      for (let k = Math.min(a, b); k <= Math.max(a, b); k++) sel.add(S.words[k]);
    } else if (e && (e.ctrlKey || e.metaKey)) {
      sel.has(w) ? sel.delete(w) : sel.add(w);
      selAnchor = w;
    } else {
      sel.clear(); sel.add(w); selAnchor = w;
    }
    syncSel();
  }

  function syncSel() {
    document.querySelectorAll('#lyricsList .chip, #tlWords .wb').forEach((el) => {
      el.classList.toggle('sel', sel.has(S.words[+el.dataset.i]));
    });
    syncSelBar();
  }

  function syncSelBar() {
    $('#selBar').classList.toggle('hidden', !sel.size);
    $('#selCount').textContent = `${sel.size} mot${sel.size > 1 ? 's' : ''}`;
    $('#pasteWordsBtn').classList.toggle('hidden', !(wordClip && wordClip.length));
    $('#undoBtn').disabled = !hist.length;
    $('#redoBtn').disabled = !redoStack.length;
    syncEmphBar();
  }

  // ----- Mots clés : effets propres à certains mots (gros, couleur, néon, secousse, rebond, plein écran) -----
  const hasEmph = (w) => !!(w.emph && Object.values(w.emph).some(Boolean));

  // ----- Fenêtre du mot : s'ouvre au clic sur un mot (liste, timeline ou vidéo) -----
  const pop = $('#wordPop');
  let popEdited = false;

  function syncEmphBar() {
    if (pop.classList.contains('hidden')) return;
    const list = [...sel];
    if (!list.length) { closePop(); return; }
    const one = list.length === 1;
    const inp = $('#popText');
    if (document.activeElement !== inp) inp.value = one ? list[0].text : `${list.length} mots`;
    inp.disabled = !one;
    $('#popTime').textContent = one && list[0].t != null ? fmt(list[0].t - S.segStart) : '';
    document.querySelectorAll('#wordPop [data-emph]').forEach((b) => {
      const k = b.dataset.emph;
      b.classList.toggle('on', list.every((w) => w.emph && w.emph[k]));
    });
  }

  // Ouvre la fenêtre sous l'élément cliqué (ou au point cliqué) et montre le mot dans l'aperçu.
  function openWord(w, e, anchor) {
    selectWord(w, e);
    if (!sel.size) { closePop(); return; }
    if (!play && w.t != null) { pausedT = Math.min(S.segStart + S.segDur - 0.05, w.t + 0.12); placeHead(pausedT); }
    popEdited = false;
    pop.classList.remove('hidden');
    placePop(anchor, e);
    syncEmphBar();
  }

  // Position de la fenêtre (coordonnées d'écran). Avec la grande timeline : sur le côté droit,
  // au-dessus du panneau du bas. Une position choisie à la poignée est gardée pour les mots suivants.
  const popPos = { big: null, normal: null };
  const bigMode = () => document.body.classList.contains('tl-big');

  function clampPop(left, top) {
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    const dock = bigMode() ? $('#tlDock').getBoundingClientRect().top : window.innerHeight;
    return [
      Math.min(Math.max(8, left), window.innerWidth - pw - 8),
      Math.min(Math.max(8, top), Math.max(8, dock - ph - 8)),
    ];
  }

  function placePop(anchor, e) {
    let left, top;
    const saved = popPos[bigMode() ? 'big' : 'normal'];
    if (saved) [left, top] = saved;
    else if (bigMode()) { left = window.innerWidth - pop.offsetWidth - 20; top = 72; }
    else {
      const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect()
        : { left: e.clientX - 10, right: e.clientX + 10, top: e.clientY - 10, bottom: e.clientY + 10 };
      left = r.left;
      top = r.bottom + 8;
      if (top + pop.offsetHeight > window.innerHeight - 8) top = r.top - pop.offsetHeight - 8;
    }
    [left, top] = clampPop(left, top);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  }

  // Poignée ⋮⋮ : on déplace la fenêtre où l'on veut.
  $('#popGrip').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const r = pop.getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    const grip = e.currentTarget;
    grip.setPointerCapture(e.pointerId);
    pop.classList.add('dragging');
    const mv = (ev) => {
      const [l, t] = clampPop(ev.clientX - dx, ev.clientY - dy);
      pop.style.left = `${l}px`;
      pop.style.top = `${t}px`;
    };
    const up = () => {
      grip.removeEventListener('pointermove', mv);
      grip.removeEventListener('pointerup', up);
      pop.classList.remove('dragging');
      popPos[bigMode() ? 'big' : 'normal'] = [parseFloat(pop.style.left), parseFloat(pop.style.top)];
    };
    grip.addEventListener('pointermove', mv);
    grip.addEventListener('pointerup', up);
  });
  // Double-clic sur la poignée : la fenêtre reprend sa place automatique.
  $('#popGrip').addEventListener('dblclick', () => {
    popPos[bigMode() ? 'big' : 'normal'] = null;
    placePop(null, { clientX: window.innerWidth - 40, clientY: 80 });
  });

  function closePop() {
    pop.classList.add('hidden');
  }

  // Active l'effet sur toute la sélection, ou le retire si tous les mots l'ont déjà.
  function toggleEmph(k) {
    if (!sel.size) return;
    snapshot();
    const on = ![...sel].every((w) => w.emph && w.emph[k]);
    for (const w of sel) {
      w.emph = { ...(w.emph || {}), [k]: on };
      if (!hasEmph(w)) delete w.emph;
    }
    refreshLyrics();
  }

  const FX_NAMES = { big: 'Gros', color: 'Couleur', glow: 'Néon', shake: 'Secousse', pop: 'Rebond', solo: 'Plein écran' };

  function renderKeys() {
    const keys = S.words.filter(hasEmph);
    $('#keysCount').textContent = keys.length ? `★ ${keys.length}` : '';
    $('#keysEmpty').classList.toggle('hidden', keys.length > 0);
    const box = $('#keysList');
    box.innerHTML = '';
    for (const w of keys) {
      const row = document.createElement('div');
      row.className = 'key-row';
      const name = document.createElement('b');
      name.textContent = w.text;
      const fxs = document.createElement('span');
      fxs.className = 'fxs';
      fxs.textContent = Object.keys(FX_NAMES).filter((k) => w.emph[k]).map((k) => FX_NAMES[k]).join(' · ');
      const time = document.createElement('span');
      time.className = 'mono';
      time.textContent = w.t != null ? fmt(w.t - S.segStart) : '';
      const edit = document.createElement('button');
      edit.className = 'small ghost';
      edit.textContent = 'Modifier';
      edit.onclick = (e) => { e.stopPropagation(); openWord(w, null, row); };
      const rm = document.createElement('button');
      rm.className = 'small ghost';
      rm.textContent = 'Retirer';
      rm.onclick = (e) => { e.stopPropagation(); snapshot(); delete w.emph; refreshLyrics(); };
      row.append(name, fxs, time, edit, rm);
      box.append(row);
    }
  }

  function clearEmph() {
    if (!sel.size) return;
    snapshot();
    for (const w of sel) delete w.emph;
    refreshLyrics();
  }

  function renderList() {
    const root = $('#lyricsList');
    root.innerHTML = '';
    const mkAdd = (at) => {
      const a = document.createElement('button');
      a.className = 'add';
      a.textContent = '+';
      a.title = 'Insérer un mot ici';
      a.onclick = (e) => { e.stopPropagation(); insertWordAt(at); };
      return a;
    };
    let lineEl = null, curLine = -1;
    S.words.forEach((w, i) => {
      if (w.line !== curLine) {
        curLine = w.line;
        lineEl = document.createElement('div');
        lineEl.className = 'lyr-line';
        lineEl.append(mkAdd(i));
        root.append(lineEl);
      }
      const chip = document.createElement('span');
      chip.className = 'chip' + (sel.has(w) ? ' sel' : '') + (hasEmph(w) ? ' emph' : '') + (w.t == null || w.t < S.segStart - 0.05 || w.t > S.segStart + S.segDur ? ' out' : '');
      chip.textContent = w.text;
      chip.dataset.i = i;
      chip.title = w.t != null ? fmt(w.t) : 'pas encore calé';
      chip.onclick = (e) => openWord(w, e, chip);
      chip.ondblclick = () => editWord(w, chip);
      lineEl.append(chip, mkAdd(i + 1));
    });
  }

  function editWord(w, el) {
    const inp = document.createElement('input');
    inp.value = w.text;
    el.textContent = '';
    el.append(inp);
    inp.focus();
    inp.select();
    let done = false;
    const finish = (keep) => {
      if (done) return;
      done = true;
      const v = keep ? inp.value.trim() : w.text;
      if (!v) {
        if (!w._new) snapshot();
        S.words.splice(S.words.indexOf(w), 1);
      } else if (v !== w.text) {
        if (!w._new) snapshot();
        w.text = v.replace(/\s+/g, ' ');
      }
      delete w._new;
      refreshLyrics();
    };
    inp.onblur = () => finish(true);
    inp.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') { if (w._new) inp.value = ''; finish(!!w._new); }
    };
    inp.onpointerdown = (e) => e.stopPropagation();
  }

  // Nouveau mot entre deux mots existants, dans l'espace libre entre eux.
  function insertWordAt(i) {
    snapshot();
    const prev = S.words[i - 1], next = S.words[i];
    let t, end;
    if (prev && next) {
      const a = prev.end ?? prev.t, b = next.t;
      t = b - a > 0.12 ? a + 0.02 : a; end = Math.max(t + 0.08, Math.min(b, t + 0.4));
    } else if (prev) { t = (prev.end ?? prev.t) + 0.05; end = t + 0.35; }
    else if (next) { t = Math.max(S.segStart, next.t - 0.4); end = next.t; }
    else { t = curTime(); end = t + 0.4; }
    const w = { text: '', t, end, _new: true, br: false };
    S.words.splice(i, 0, w);
    hist.pop(); // l'insertion ne compte qu'une fois le mot écrit
    refreshLyrics();
    const chip = document.querySelector(`#lyricsList .chip[data-i="${S.words.indexOf(w)}"]`);
    if (chip) { hist.push(JSON.stringify(S.words.filter((x) => x !== w))); editWord(w, chip); }
  }

  function deleteSelected() {
    if (!sel.size) return;
    snapshot();
    S.words = S.words.filter((w) => !sel.has(w));
    sel.clear();
    refreshLyrics();
  }

  function copySelected() {
    if (!sel.size) return;
    const list = [...sel].sort((a, b) => a.t - b.t);
    const base = list[0].t;
    wordClip = list.map((w) => ({ text: w.text, emph: w.emph, ds: w.t - base, de: (w.end ?? w.t + 0.3) - base }));
    syncSelBar();
    status(`${list.length} mot${list.length > 1 ? 's copiés' : ' copié'} : place la lecture puis « Coller au curseur ».`);
  }

  function pasteWords() {
    if (!wordClip || !wordClip.length) return;
    snapshot();
    const at = Math.max(S.segStart, Math.min(curTime(), S.segStart + S.segDur - 0.1));
    sel.clear();
    for (const c of wordClip) {
      const w = { text: c.text, t: at + c.ds, end: at + c.de, br: false };
      if (c.emph) w.emph = { ...c.emph };
      S.words.push(w);
      sel.add(w);
    }
    refreshLyrics();
  }

  // ----- Timeline -----
  const tlScroll = $('#tlScroll'), tlInner = $('#tlInner'), tlWords = $('#tlWords'), tlWave = $('#tlWave');
  // Par défaut : tout l'extrait si les mots restent lisibles, sinon assez large pour les lire (on fait défiler).
  const curPxs = () => {
    if (pxs) return pxs;
    const fit = Math.max(20, (tlScroll.clientWidth - 2) / S.segDur);
    return fitAll ? fit : Math.max(fit, document.body.classList.contains('tl-big') ? 170 : 110);
  };
  const tToX = (t) => (t - S.segStart) * curPxs();
  const xToT = (x) => S.segStart + x / curPxs();

  function renderTimeline() {
    if (!S.buf || $('#editor').classList.contains('hidden')) return;
    const p = curPxs();
    const width = Math.max(tlScroll.clientWidth, S.segDur * p);
    tlInner.style.width = `${width}px`;

    // Règle (graduations en secondes de l'extrait)
    const ruler = $('#tlRuler');
    ruler.innerHTML = '';
    const stepS = p > 120 ? 0.5 : p > 40 ? 1 : 2;
    for (let s = 0; s <= S.segDur + 1e-6; s += stepS) {
      const i = document.createElement('i');
      i.style.left = `${s * p}px`;
      i.textContent = s % 1 ? '' : `${s}s`;
      ruler.append(i);
    }

    // Forme d'onde de l'extrait + temps
    const dpr = window.devicePixelRatio || 1;
    const h = tlWave.clientHeight || 50;
    tlWave.style.width = `${width}px`;
    tlWave.width = Math.min(16000, Math.round(width * dpr));
    tlWave.height = h * dpr;
    const c = tlWave.getContext('2d');
    c.scale(tlWave.width / width, dpr);
    const mono = S.analysis.mono;
    const a0 = Math.floor(S.segStart * mono.sr), a1 = Math.floor((S.segStart + S.segDur) * mono.sr);
    const per = Math.max(1, (a1 - a0) / width);
    let max = 1e-6;
    const vals = new Float32Array(Math.ceil(width));
    for (let x = 0; x < vals.length; x++) {
      let m = 0;
      for (let j = Math.floor(a0 + x * per), e = Math.floor(a0 + (x + 1) * per); j < e; j += 3) m = Math.max(m, Math.abs(mono.x[j] || 0));
      vals[x] = m; max = Math.max(max, m);
    }
    for (let i = firstBeatIdx(S.segStart); beatTime(i) <= S.segStart + S.segDur; i++) {
      c.fillStyle = i % 4 === 0 ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.08)';
      c.fillRect(tToX(beatTime(i)), 0, 1, h);
    }
    c.fillStyle = '#4a4a52';
    for (let x = 0; x < vals.length; x++) {
      const vh = Math.max(1, vals[x] / max * h * 0.9);
      c.fillRect(x, (h - vh) / 2, 1, vh);
    }

    // Blocs de mots
    tlWords.innerHTML = '';
    S.words.forEach((w, i) => {
      if (w.t == null) return;
      const b = document.createElement('div');
      b.className = 'wb' + (sel.has(w) ? ' sel' : '') + (hasEmph(w) ? ' emph' : '');
      b.dataset.i = i;
      b.textContent = w.text;
      b.title = w.text;
      b.tabIndex = 0;
      placeBlock(b, w);
      b.addEventListener('pointermove', (e) => {
        if (b._drag) return;
        const r = b.getBoundingClientRect(), x = e.clientX - r.left;
        b.style.cursor = x < 7 || x > r.width - 7 ? 'ew-resize' : 'grab';
      });
      b.addEventListener('pointerdown', (e) => blockDown(e, w, b));
      b.addEventListener('dblclick', (e) => { e.stopPropagation(); editWord(w, b); });
      tlWords.append(b);
    });
    placeHead(curTime());
  }

  function placeBlock(b, w) {
    const end = w.end ?? w.t + 0.3;
    b.style.left = `${tToX(w.t)}px`;
    b.style.width = `${Math.max(14, (end - w.t) * curPxs() - 1)}px`;
  }

  function placeHead(t) {
    const head = $('#tlHead');
    if (!head || $('#editor').classList.contains('hidden')) return;
    const x = tToX(t);
    head.style.left = `${x}px`;
    if (play && document.body.classList.contains('tl-big')) {
      const v = tlScroll.scrollLeft, w = tlScroll.clientWidth;
      if (x > v + w - 80 || x < v) tlScroll.scrollLeft = Math.max(0, x - 80);
    }
  }

  function blockDown(e, w, b) {
    if (e.button !== 0 || b.querySelector('input')) return;
    if (e.shiftKey || e.ctrlKey || e.metaKey) { openWord(w, e, b); return; }
    if (!sel.has(w)) selectWord(w);
    const r = b.getBoundingClientRect(), px = e.clientX - r.left;
    const mode = px < 7 ? 'l' : px > r.width - 7 ? 'r' : 'm';
    const group = mode === 'm' ? [...sel] : [w];
    const init = group.map((x) => ({ w: x, t: x.t, end: x.end ?? x.t + 0.3 }));
    const minT = Math.min(...init.map((o) => o.t)), maxE = Math.max(...init.map((o) => o.end));
    const x0 = e.clientX;
    let moved = false;
    const mv = (ev) => {
      if (!moved) {
        if (Math.abs(ev.clientX - x0) < 3) return;
        moved = true; b._drag = true; snapshot();
      }
      let dt = (ev.clientX - x0) / curPxs();
      const segEnd = S.segStart + S.segDur;
      if (mode === 'm') {
        dt = Math.max(S.segStart - minT, Math.min(dt, segEnd - maxE));
        for (const o of init) {
          o.w.t = o.t + dt; o.w.end = o.end + dt;
          const el = tlWords.querySelector(`.wb[data-i="${S.words.indexOf(o.w)}"]`);
          if (el) placeBlock(el, o.w);
        }
      } else if (mode === 'l') {
        w.t = Math.min(init[0].end - 0.06, Math.max(S.segStart, init[0].t + dt));
        placeBlock(b, w);
      } else {
        w.end = Math.max(init[0].t + 0.06, Math.min(segEnd, init[0].end + dt));
        placeBlock(b, w);
      }
    };
    const up = () => {
      document.removeEventListener('pointermove', mv);
      document.removeEventListener('pointerup', up);
      if (moved) { b._drag = false; refreshLyrics(); }
      else openWord(w, null, b);
    };
    document.addEventListener('pointermove', mv);
    document.addEventListener('pointerup', up);
  }

  // Clic / glisser sur la règle : place la lecture.
  function seekFromRuler(e) {
    const r = tlInner.getBoundingClientRect();
    const t = Math.max(S.segStart, Math.min(S.segStart + S.segDur - 0.05, xToT(e.clientX - r.left)));
    if (play && !play.exporting) start({ from: t });
    else { pausedT = t; placeHead(t); }
  }
  $('#tlRuler').addEventListener('pointerdown', (e) => {
    seekFromRuler(e);
    const mv = (ev) => { if (!play) seekFromRuler(ev); };
    const up = (ev) => {
      document.removeEventListener('pointermove', mv);
      document.removeEventListener('pointerup', up);
      if (play) seekFromRuler(ev);
    };
    document.addEventListener('pointermove', mv);
    document.addEventListener('pointerup', up);
  });

  // Double-clic dans le vide de la piste : nouveau mot à cet instant.
  tlWords.addEventListener('dblclick', (e) => {
    if (e.target !== tlWords) return;
    const r = tlInner.getBoundingClientRect();
    const t = xToT(e.clientX - r.left);
    snapshot();
    const w = { text: '', t, end: t + 0.35, _new: true, br: false };
    S.words.push(w);
    hist.pop();
    hist.push(JSON.stringify(S.words.filter((x) => x !== w)));
    refreshLyrics();
    const b = tlWords.querySelector(`.wb[data-i="${S.words.indexOf(w)}"]`);
    if (b) editWord(w, b);
  });
  tlWords.addEventListener('pointerdown', (e) => { if (e.target === tlWords) { sel.clear(); syncSel(); } });

  function zoom(f) {
    const center = tlScroll.scrollLeft + tlScroll.clientWidth / 2;
    const tC = xToT(center);
    pxs = f ? Math.max(20, Math.min(600, curPxs() * f)) : 0;
    fitAll = !f;
    renderTimeline();
    tlScroll.scrollLeft = tToX(tC) - tlScroll.clientWidth / 2;
  }

  // ---------- Détection automatique (Whisper dans le navigateur) ----------
  let worker = null;
  let detecting = false;

  function setAsr(text, pct) {
    $('#asrStatus').textContent = text;
    if (pct != null) $('#asrBar').style.width = `${pct}%`;
  }
  function setStep(n, state) {
    const el = $(n === 1 ? '#ds1' : '#ds2');
    el.className = state || '';
  }

  // Écoute l'extrait et rend les mots détectés, recalés sur les attaques de la voix.
  async function transcribe() {
    const start = S.segStart, dur = Math.min(S.segDur, S.buf.duration - S.segStart);
    $('#asrBox').classList.remove('hidden');
    setStep(1, 'on'); setStep(2, '');
    setAsr("Préparation de l'extrait…", 2);
    const [audio, env] = await Promise.all([
      Lyrics.whisperInput(S.buf, start, dur),
      Lyrics.voiceEnvelope(S.buf, start, dur),
    ]);
    if (!worker) worker = new Worker('whisper-worker.js?v=12', { type: 'module' });
    const copy = new Float32Array(audio);
    const res = await new Promise((resolve, reject) => {
      worker.onmessage = (e) => {
        const d = e.data;
        if (d.type === 'progress') {
          const mb = (v) => Math.round(v / 1e6);
          setAsr(`Téléchargement du modèle : ${mb(d.loaded)} / ${mb(d.total)} Mo (une seule fois)`, 5 + 55 * d.loaded / d.total);
        } else if (d.type === 'status') {
          if (d.text.startsWith('Calage')) { setStep(1, 'ok'); setStep(2, 'on'); setAsr(d.text, 80); }
          else setAsr(d.text, d.text.startsWith('Écoute') ? 65 : null);
        } else if (d.type === 'done') resolve(d);
        else if (d.type === 'error') reject(new Error(d.message));
      };
      worker.onerror = (e) => reject(new Error(e.message || 'Le module de transcription n’a pas pu démarrer'));
      worker.postMessage({ type: 'transcribe', audio: copy, model: $('#asrModel').value, language: $('#asrLang').value }, [copy.buffer]);
    });
    if (!res.words.length) throw new Error('aucune voix détectée sur cet extrait');
    setAsr('Calage précis sur les attaques de la voix…', 95);
    const abs = res.words.map((w) => ({
      text: w.text,
      start: start + w.start,
      end: start + (Number.isFinite(w.end) && w.end > w.start ? w.end : w.start + 0.3),
    }));
    setStep(1, 'ok'); setStep(2, 'ok');
    return { anchors: Lyrics.refine(abs, env, start), ms: res.ms };
  }

  // Lance une tâche de paroles (détection, calage, recalage) en gérant l'état de l'interface.
  async function lyricsJob(fn) {
    if (!S.buf || detecting) { if (!S.buf) status("Dépose d'abord ton son."); return; }
    detecting = true;
    stop();
    document.querySelectorAll('#detectBtn, #applyPaste, #retimeBtn').forEach((b) => (b.disabled = true));
    try { await fn(); }
    catch (e) { console.error(e); setAsr(`Détection impossible : ${e.message || e}`, 0); }
    finally {
      detecting = false;
      document.querySelectorAll('#detectBtn, #applyPaste, #retimeBtn').forEach((b) => (b.disabled = false));
    }
  }

  const detectLyrics = () => lyricsJob(async () => {
    const { anchors, ms } = await transcribe();
    snapshot();
    S.words = anchors.map((a) => ({ text: a.text, t: a.start, end: a.end, br: false }));
    sel.clear();
    refreshLyrics();
    setAsr(`✓ ${S.words.length} mots calés sur ta voix en ${(ms / 1000).toFixed(1)} s. Double-clique un mot pour le corriger.`, 100);
    status('Paroles détectées');
  });

  // Texte collé : la transcription sert de grille de temps, le texte reste celui de l'artiste.
  const applyPaste = () => lyricsJob(async () => {
    const tokens = parseTokens($('#lyrics').value);
    if (!tokens.length) { setAsr("Colle ton texte d'abord.", 0); $('#asrBox').classList.remove('hidden'); return; }
    snapshot();
    try {
      const { anchors } = await transcribe();
      S.words = Lyrics.align(tokens, anchors).map((w) => ({ text: w.text, br: w.br, t: w.start, end: w.end }));
      setAsr(`✓ Tes paroles sont calées sur ta voix, mot par mot.`, 100);
    } catch (e) {
      S.words = beatDistribute(tokens);
      setAsr(`Paroles posées sur le beat (la voix n'a pas pu être chronométrée : ${e.message || e}). Tu peux les ajuster sur la timeline.`, 0);
    }
    $('#pasteZone').classList.add('hidden');
    sel.clear();
    refreshLyrics();
  });

  // Recalage : le texte ne change pas, seuls les timings s'affinent.
  const retime = () => lyricsJob(async () => {
    if (!S.words.length) return;
    const { anchors } = await transcribe();
    snapshot();
    S.words = Lyrics.align(S.words.map((w) => ({ text: w.text, br: w.br, emph: w.emph })), anchors)
      .map((w) => ({ text: w.text, br: w.br, emph: w.emph, t: w.start, end: w.end }));
    S.words.forEach((w) => { if (!w.emph) delete w.emph; });
    sel.clear();
    refreshLyrics();
    setAsr('✓ Timings recalés : ton texte n’a pas bougé.', 100);
  });

  function resetLyrics() {
    snapshot();
    S.words = [];
    sel.clear();
    $('#asrBox').classList.add('hidden');
    refreshLyrics();
  }

  // ----- Tap paroles : calage manuel en tapant chaque mot -----
  function startTap() {
    if (!S.buf || !S.words.length) return;
    snapshot();
    S.words.forEach((w) => { w.t = null; w.end = null; });
    tapIdx = 0;
    start({ from: S.segStart, hook: false });
    $('#tapBox').classList.remove('hidden');
    $('#nextWord').textContent = S.words[0].text;
    renderList();
    renderTimeline();
  }

  function tap() {
    if (tapIdx < 0 || !play) return;
    let t = curTime();
    if ($('#snapTap').checked) {
      const half = period() / 2;
      t = S.offset + Math.round((t - S.offset) / half) * half;
    }
    const w = S.words[tapIdx], prev = S.words[tapIdx - 1];
    w.t = t;
    w.end = t + Math.min(0.6, period());
    if (prev && prev.end > t - 0.02) prev.end = Math.max(prev.t + 0.06, t - 0.02);
    tapIdx++;
    renderTimeline();
    if (tapIdx >= S.words.length) { endTap(); return; }
    $('#nextWord').textContent = S.words[tapIdx].text;
  }

  function endTap() {
    if (tapIdx < 0) return;
    // Mots non tapés : un par temps après le dernier mot tapé.
    const tapped = S.words.filter((w) => w.t != null);
    let t = tapped.length ? tapped[tapped.length - 1].end : beatTime(firstBeatIdx(S.segStart));
    for (const w of S.words) if (w.t == null) { w.t = t; w.end = t + period() * 0.9; t += period(); }
    tapIdx = -1;
    $('#tapBox').classList.add('hidden');
    refreshLyrics();
  }

  function currentWord(t) {
    let cw = -1;
    for (let i = 0; i < S.words.length; i++) {
      const w = S.words[i];
      if (w.t != null && w.t <= t + 0.01) cw = i;
    }
    if (cw < 0) return -1;
    const w = S.words[cw];
    const hold = w.end != null ? Math.max(0, w.end - w.t) + 0.6 : Math.max(1.5, 4 * period());
    const next = S.words[cw + 1];
    if (t - w.t > hold && !(next && next.t != null && next.t <= t)) return -1;
    return cw;
  }

  function highlight(cw) {
    document.querySelectorAll('#lyricsList .chip.now, #tlWords .wb.now').forEach((el) => el.classList.remove('now'));
    if (cw < 0) return;
    document.querySelectorAll(`#lyricsList .chip[data-i="${cw}"], #tlWords .wb[data-i="${cw}"]`).forEach((el) => el.classList.add('now'));
  }

  // ---------- Rendu ----------
  const noiseTiles = [];
  for (let k = 0; k < 4; k++) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    const img = x.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    noiseTiles.push(c);
  }
  const small = document.createElement('canvas');
  small.width = W / 4; small.height = H / 4;
  const sg = small.getContext('2d');

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function drawCover(el, scale, dx, dy, kb) {
    const vw = el.videoWidth || el.naturalWidth, vh = el.videoHeight || el.naturalHeight;
    if (!vw || !vh) return false;
    const s = Math.max(W / vw, H / vh) * scale * kb;
    const dw = vw * s, dh = vh * s;
    g.drawImage(el, (W - dw) / 2 + dx, (H - dh) / 2 + dy, dw, dh);
    return true;
  }

  function drawBackdrop(cut, sinceBeat) {
    const hue = (cut * 67 + 90) % 360;
    const grd = g.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, `hsl(${hue},70%,18%)`);
    grd.addColorStop(1, `hsl(${(hue + 60) % 360},80%,6%)`);
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    g.save();
    g.translate(W / 2, H / 2);
    g.rotate(cut * 0.6);
    const r = 330 + 90 * Math.exp(-sinceBeat * 8);
    g.strokeStyle = hexA(S.style.accent, 0.55);
    g.lineWidth = 26;
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
    g.fillStyle = `hsla(${(hue + 180) % 360},90%,60%,.18)`;
    g.fillRect(-W, -40, W * 2, 80);
    g.restore();
  }

  function renderFrame(t) {
    const st = S.style, fx = st.fx;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.filter = 'none';
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);

    if (!S.buf) {
      drawBackdrop(0, 1);
      drawIdle();
      g.restore();
      return;
    }

    const P = period();
    const b0 = beatTime(firstBeatIdx(S.segStart));
    const segBeat = (t - b0) / P;
    const cut = Math.max(0, Math.floor(segBeat / S.cutEvery + 1e-6));
    const cutT = b0 + cut * S.cutEvery * P;
    const sinceCut = segBeat < 0 ? 1 : t - cutT;
    const beatIdx = Math.floor((t - S.offset) / P + 1e-6);
    const sinceBeat = t - beatTime(beatIdx);

    // Image de fond
    let scale = 1, dx = 0, dy = 0;
    if (fx.zoom) scale += 0.07 * Math.exp(-sinceBeat * 9);
    if (fx.shake && sinceCut < 0.16) {
      const a = 46 * (1 - sinceCut / 0.16);
      dx = (Math.random() * 2 - 1) * a; dy = (Math.random() * 2 - 1) * a;
    }
    if (fx.sat) g.filter = 'saturate(1.6) contrast(1.15)';
    let drawn = false;
    if (S.clips.length) {
      const clip = S.clips[cut % S.clips.length];
      setActiveClip(clip);
      const kb = clip.type === 'image' ? 1 + 0.04 * Math.min(1, sinceCut / (S.cutEvery * P * 1.5)) : 1;
      drawn = drawCover(clip.el, scale, dx, dy, kb);
    }
    if (!drawn) {
      g.save(); g.translate(W / 2 + dx, H / 2 + dy); g.scale(scale, scale); g.translate(-W / 2, -H / 2);
      drawBackdrop(cut, sinceBeat);
      g.restore();
    }
    g.filter = 'none';

    if (fx.glow) {
      sg.filter = 'blur(6px) brightness(1.3)';
      sg.clearRect(0, 0, small.width, small.height);
      sg.drawImage(view, 0, 0, small.width, small.height);
      sg.filter = 'none';
      g.globalCompositeOperation = 'screen';
      g.globalAlpha = 0.55;
      g.drawImage(small, 0, 0, W, H);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }

    if (fx.vhs) {
      // bandes décalées
      for (let k = 0; k < 3; k++) {
        if (Math.random() < 0.5) continue;
        const y = Math.random() * H, h = 20 + Math.random() * 70, off = (Math.random() * 2 - 1) * 40;
        g.drawImage(view, 0, y, W, h, off, y, W, h);
      }
      g.fillStyle = 'rgba(0,0,0,.18)';
      for (let y = 0; y < H; y += 6) g.fillRect(0, y, W, 2);
      g.globalCompositeOperation = 'screen';
      g.fillStyle = 'rgba(255,0,80,.06)'; g.fillRect(6, 0, W, H);
      g.fillStyle = 'rgba(0,200,255,.06)'; g.fillRect(-6, 0, W, H);
      g.globalCompositeOperation = 'source-over';
    }

    if (fx.flash && sinceCut < 0.4) {
      g.fillStyle = `rgba(255,255,255,${0.55 * Math.exp(-sinceCut * 14)})`;
      g.fillRect(0, 0, W, H);
    }

    if (fx.vignette) {
      const v = g.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.72);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,.7)');
      g.fillStyle = v;
      g.fillRect(0, 0, W, H);
    }

    drawLyrics(t);

    if (fx.grain) {
      g.globalCompositeOperation = 'overlay';
      g.globalAlpha = 0.22;
      const tile = noiseTiles[Math.floor(Math.random() * noiseTiles.length)];
      const pat = g.createPattern(tile, 'repeat');
      g.translate(-Math.random() * 256, -Math.random() * 256);
      g.fillStyle = pat;
      g.fillRect(0, 0, W + 256, H + 256);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    g.restore();
  }

  function drawIdle() {
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `110px "Anton"`;
    g.fillText('DÉPOSE', W / 2, H / 2 - 70);
    g.fillStyle = S.style.accent;
    g.fillText('TON SON', W / 2, H / 2 + 60);
  }

  let lyricHits = [];        // rectangles des mots dessinés, pour les retrouver au clic sur l'aperçu

  function drawLyrics(t) {
    lyricHits = [];
    const cw = currentWord(t);
    if (cw < 0) return;
    const st = S.style;
    const ec = st.emph;
    const E = (w) => w.emph || {};
    const cur = S.words[cw];
    const y = st.pos === 'top' ? H * 0.26 : st.pos === 'low' ? H * 0.74 : H * 0.5;
    const tx = (w) => (st.upper ? w.text.toLocaleUpperCase('fr') : w.text);
    const dt = t - cur.t;
    const next = S.words[cw + 1];
    const wordDur = cur.end != null && cur.end > cur.t ? cur.end - cur.t
      : next && next.t != null && next.t > cur.t ? next.t - cur.t : period();
    const jitter = (amp) => [(Math.random() * 2 - 1) * amp, (Math.random() * 2 - 1) * amp];

    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.lineJoin = 'round';

    // Mot seul à l'écran : style « Mot seul », ou mot clé « Plein écran » pendant qu'il est chanté.
    const solo = !!E(cur).solo;
    if (solo || st.lyric === 'pop') {
      const e = E(cur);
      let size = st.size * (solo ? 2.6 : 1.5) * (e.big && !solo ? 1.4 : 1);
      g.font = `${size}px "${st.font}"`;
      let w = g.measureText(tx(cur)).width;
      const maxW = W * (solo ? 0.92 : 0.88);
      if (w > maxW) { size *= maxW / w; g.font = `${size}px "${st.font}"`; w = g.measureText(tx(cur)).width; }
      if (solo) {
        g.fillStyle = hexA(ec, 0.3 * Math.exp(-dt * 9));
        g.fillRect(0, 0, W, H);
      }
      let sc = 1 + (solo ? 0.3 : 0.45) * Math.exp(-dt * 16);
      if (e.pop) sc += 0.5 * Math.exp(-dt * 10);
      g.save();
      g.translate(W / 2, solo ? H * 0.5 : y);
      if (e.shake) g.translate(...jitter(size * 0.05));
      if (e.pop) g.rotate(-0.08 * Math.exp(-dt * 6));
      g.scale(sc, sc);
      if (e.glow || solo) { g.shadowColor = ec; g.shadowBlur = 60; }
      else { g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 30; }
      g.fillStyle = e.color || solo ? ec : cw % 2 ? st.accent : st.text;
      g.fillText(tx(cur), -w / 2, 0);
      if (e.glow || solo) g.fillText(tx(cur), -w / 2, 0);
      g.restore();
      const cy = solo ? H * 0.5 : y;
      lyricHits.push({ w: cur, x: W / 2 - w * sc / 2, y: cy - size * 0.6 * sc, wd: w * sc, h: size * 1.2 * sc });
      return;
    }

    // Ligne de mots ; les mots clés « Gros » prennent plus de place.
    const line = S.words.filter((w) => w.line === cur.line && w.t != null);
    const fac = (w) => (E(w).big ? 1.5 : 1);
    let k = 1;
    const measure = () => {
      const ws = line.map((w) => { g.font = `${st.size * k * fac(w)}px "${st.font}"`; return g.measureText(tx(w)).width; });
      const gp = st.size * k * 0.28;
      return { ws, gp, total: ws.reduce((a, b) => a + b, 0) + gp * (line.length - 1) };
    };
    let m = measure();
    if (m.total > W * 0.86) { k *= W * 0.86 / m.total; m = measure(); }
    let x = (W - m.total) / 2;
    line.forEach((w, i) => {
      const e = E(w);
      const size = st.size * k * fac(w);
      const s = tx(w), ww = m.ws[i];
      const idx = S.words.indexOf(w);
      const past = idx < cw, now = idx === cw, future = idx > cw;
      const hi = e.color ? ec : st.accent;
      g.save();
      g.font = `${size}px "${st.font}"`;
      g.shadowColor = 'rgba(0,0,0,.65)';
      g.shadowBlur = 24;
      if (e.glow && !future) { g.shadowColor = ec; g.shadowBlur = 50; }
      if (e.shake && !future) g.translate(...jitter(size * 0.06));
      if (now) {
        let sc = st.lyric === 'karaoke' ? 1 + 0.12 * Math.exp(-dt * 14) : 1;
        if (e.pop) sc += 0.55 * Math.exp(-dt * 10);
        const cx = x + ww / 2;
        g.translate(cx, y);
        if (e.pop) g.rotate(-0.07 * Math.exp(-dt * 6));
        g.scale(sc, sc);
        g.translate(-cx, -y);
      }
      if (st.lyric === 'karaoke') {
        g.fillStyle = now ? hi : past ? (e.color ? ec : st.text) : hexA(e.color ? ec : st.text, 0.45);
        g.fillText(s, x, y);
      } else if (st.lyric === 'box') {
        if (now) {
          const sh = [g.shadowColor, g.shadowBlur];
          g.shadowBlur = e.glow ? 50 : 0;
          const pad = size * 0.16;
          g.fillStyle = hi;
          roundRect(x - pad, y - size * 0.62, ww + pad * 2, size * 1.2, size * 0.14);
          [g.shadowColor, g.shadowBlur] = sh;
          g.shadowBlur = 0;
          g.fillStyle = '#0b0b0c';
        } else g.fillStyle = future ? hexA(e.color ? ec : st.text, 0.5) : (e.color ? ec : st.text);
        g.fillText(s, x, y);
      } else if (st.lyric === 'fill') {
        g.fillStyle = past ? hi : hexA(e.color ? ec : st.text, 0.55);
        g.fillText(s, x, y);
        if (now) {
          const p = Math.min(1, dt / Math.max(0.08, wordDur * 0.9));
          g.beginPath(); g.rect(x - 4, y - size, (ww + 8) * p, size * 2); g.clip();
          g.fillStyle = hi;
          g.fillText(s, x, y);
        }
      }
      // Le néon est redessiné une fois de plus pour un halo plus dense.
      if (e.glow && !future && st.lyric !== 'box') g.fillText(s, x, y);
      g.restore();
      lyricHits.push({ w, x, y: y - size * 0.6, wd: ww, h: size * 1.2 });
      x += ww + m.gp;
    });
  }

  function roundRect(x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
    g.fill();
  }

    // requestAnimationFrame s'arrête quand l'onglet est caché : un minuteur prend le relais
  // pour que l'export continue à recevoir des images.
  let tick = 0;
  function schedule() {
    const id = ++tick;
    const run = () => { if (id !== tick) return; tick++; loop(); };
    requestAnimationFrame(run);
    setTimeout(run, 40);
  }

  function loop() {
    schedule();
    const t = curTime();
    const hp = hookPhase();
    try {
      if (hp >= 0) { setActiveClip(null); drawHookFrame(hp); }
      else {
        if (play && play.hookDur && S.hook && !S.hook.el.paused) S.hook.el.pause();
        renderFrame(t);
      }
    } catch (e) { console.error(e); }
    $('#time').textContent = hp >= 0 ? `Hook ${hp.toFixed(1)} s` : fmt(Math.max(0, t - S.segStart));
    placeHead(t);
    if (play) {
      drawWave();
      const cw = currentWord(t);
      if (cw !== lastChipWord) { lastChipWord = cw; highlight(cw); }
      if (exporting) $('#progressBar').style.width = `${Math.min(100, (t - play.base) / (S.segDur + play.hookDur) * 100)}%`;
    }
  }

  // ---------- Export ----------
  function pickMime() {
    const list = [
      'video/mp4;codecs=avc1.640028,mp4a.40.2',
      'video/mp4;codecs=avc1,mp4a',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    return list.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
  }

  async function exportVideo() {
    if (!S.buf || exporting) return;
    if (!window.MediaRecorder || !view.captureStream) {
      status("Ce navigateur ne sait pas enregistrer de vidéo. Utilise Chrome ou Safari récent.");
      return;
    }
    ensureCtx();
    await actx.resume();
    endTap();
    const mime = pickMime();
    const dest = actx.createMediaStreamDestination();
    const vstream = view.captureStream(30);
    const stream = new MediaStream([...vstream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 10e6, audioBitsPerSecond: 192e3 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    exporting = { rec };
    $('#exportBtn').disabled = true;
    $('#exportBtn').textContent = 'Export en cours…';
    $('#progress').classList.remove('hidden');
    $('#result').innerHTML = '';
    rec.onstop = () => {
      const type = mime.split(';')[0] || 'video/webm';
      const blob = new Blob(chunks, { type });
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `syncope-${S.name.replace(/[^\w-]+/g, '-').toLowerCase()}.${ext}`;
      a.textContent = `Télécharger la vidéo (${ext.toUpperCase()}, ${(blob.size / 1e6).toFixed(1)} Mo)`;
      $('#result').append(a);
      if (ext === 'webm') {
        const p = document.createElement('p');
        p.className = 'hint';
        p.textContent = "Ton navigateur exporte en WebM. Pour un MP4 directement, utilise Chrome ou Safari récent.";
        $('#result').append(p);
      }
      window.__lastExport = { size: blob.size, type, url };
      exporting = null;
      $('#exportBtn').disabled = false;
      $('#exportBtn').textContent = 'Exporter la vidéo 1080 × 1920';
      $('#progress').classList.add('hidden');
      $('#progressBar').style.width = '0';
      status('Vidéo prête');
    };
    rec.start(250);
    status('Export en cours…');
    start({ dest, from: S.segStart, onEnd: () => setTimeout(() => rec.state !== 'inactive' && rec.stop(), 200) });
  }

  // ---------- Styles prédéfinis ----------
  const PRESETS = {
    clean: { lyric: 'karaoke', font: 'Anton', fx: { zoom: true, shake: false, flash: false, sat: false, glow: false, vhs: false, grain: false, vignette: true }, cut: 2 },
    club: { lyric: 'box', font: 'Archivo Black', fx: { zoom: true, shake: true, flash: true, sat: true, glow: true, vhs: false, grain: false, vignette: true }, cut: 1 },
    vhs: { lyric: 'fill', font: 'Press Start 2P', fx: { zoom: false, shake: true, flash: false, sat: false, glow: false, vhs: true, grain: true, vignette: true }, cut: 2 },
    rage: { lyric: 'pop', font: 'Rubik Mono One', fx: { zoom: true, shake: true, flash: true, sat: true, glow: false, vhs: false, grain: true, vignette: true }, cut: 0.5 },
  };

  function applyPreset(name) {
    const p = PRESETS[name];
    S.style.lyric = p.lyric;
    S.style.font = p.font;
    S.style.fx = { ...p.fx };
    S.cutEvery = p.cut;
    syncStyleUI();
    loadFont();
    syncGridUI();
  }

  function syncStyleUI() {
    document.querySelectorAll('#lyricStyle button').forEach((b) => b.classList.toggle('on', b.dataset.v === S.style.lyric));
    $('#font').value = S.style.font;
    $('#cutEvery').value = String(S.cutEvery);
    document.querySelectorAll('#fx input').forEach((i) => (i.checked = !!S.style.fx[i.dataset.fx]));
  }

  function loadFont() {
    document.fonts && document.fonts.load(`100px "${S.style.font}"`).catch(() => {});
  }

  // ---------- Événements ----------
  $('#audioInput').onchange = (e) => loadFile(e.target.files[0]);
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
  drop.addEventListener('drop', (e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); });

  $('#demoBtn').onclick = async () => {
    ensureCtx();
    status('Création du son de démo…');
    const buf = await makeDemo();
    await saveProject();
    S.songId = null;
    await setAudio(buf, 'Démo 128 BPM');
    setSaveState('son de démo, non sauvegardé');
    renderSongs();
    if (!S.words.length) {
      S.words = beatDistribute(parseTokens('on avance sur le beat\nchaque coupe tombe juste\nmonte le son ce soir\non ne s’arrête plus'));
      refreshLyrics();
    }
  };

  wave.addEventListener('click', (e) => {
    if (!S.buf) return;
    const r = wave.getBoundingClientRect();
    const wasPlaying = !!play;
    stop();
    setSegStart((e.clientX - r.left) / r.width * S.buf.duration);
    if (wasPlaying) start();
  });

  $('#segDur').onchange = (e) => { S.segDur = +e.target.value; if (S.buf) setSegStart(S.segStart); };
  $('#chorusBtn').onclick = () => S.buf && findLoudest();
  $('#bpmInput').onchange = (e) => setBpm(+e.target.value);
  $('#halfBtn').onclick = () => setBpm(S.bpm / 2);
  $('#dblBtn').onclick = () => setBpm(S.bpm * 2);
  const nudge = (d) => {
    S.offset = ((S.offset + d) % period() + period()) % period();
    setSegStart(S.segStart);
  };
  $('#nudgeL').onclick = () => nudge(-0.01);
  $('#nudgeR').onclick = () => nudge(0.01);

  $('#clipInput').onchange = (e) => { addClips(e.target.files); e.target.value = ''; };
  $('#cutEvery').onchange = (e) => { S.cutEvery = +e.target.value; syncGridUI(); };
  $('#clipTabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ct]');
    if (!b) return;
    document.querySelectorAll('#clipTabs button').forEach((x) => x.classList.toggle('on', x === b));
    for (const k of ['bank', 'link', 'files']) $(`#ct${k[0].toUpperCase() + k.slice(1)}`).classList.toggle('hidden', b.dataset.ct !== k);
  });
  $('#bankSearch').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const q = e.target.value.trim();
    if (!q) return;
    B.q = q;
    renderMoods();
    loadBank(false);
  });
  const segPick = (id, key) => $(id).addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    $(id).querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    B[key] = b.dataset.v;
    loadBank(false);
  });
  segPick('#fOri', 'ori');
  segPick('#fDur', 'dur');
  $('#bankMore').onclick = () => loadBank(true);
  $('#pickForMe').onclick = pickForMe;
  $('#saveKey').onclick = saveKey;
  $('#pexelsKey').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveKey(); });
  $('#linkImport').onclick = importLink;
  $('#linkUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') importLink(); });

  $('#hookTabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ht]');
    if (!b) return;
    document.querySelectorAll('#hookTabs button').forEach((x) => x.classList.toggle('on', x === b));
    for (const k of ['bank', 'top', 'mine']) $(`#ht${k[0].toUpperCase() + k.slice(1)}`).classList.toggle('hidden', b.dataset.ht !== k);
  });
  $('#hookSearch').addEventListener('input', (e) => { HK.q = e.target.value.trim(); HK.shown = 30; renderHookGrid(); });
  $('#hookMore').onclick = () => { HK.shown += 30; renderHookGrid(); };
  $('#hookFile').onchange = (e) => {
    const f = e.target.files[0];
    if (f) setHook(f, { name: f.name.replace(/\.[^.]+$/, '') });
    e.target.value = '';
  };
  const hookPref = (k, v) => {
    S.hookPrefs = { ...(S.hookPrefs || { sound: 'hook', len: 0, text: '' }), [k]: v };
    if (S.hook) { S.hook[k] = v; $('#hookMeta').textContent = `${hookLength().toFixed(1)} s en ouverture`; }
  };
  $('#hookSound').onchange = (e) => hookPref('sound', e.target.value);
  $('#hookLen').onchange = (e) => hookPref('len', +e.target.value);
  $('#hookText').addEventListener('input', (e) => hookPref('text', e.target.value));
  $('#hookPlay').onclick = () => {
    if (!S.buf) { status("Dépose d'abord ton son : le hook se joue juste avant."); return; }
    start({ from: S.segStart });
    document.querySelector('.phone').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  $('#hookRemove').onclick = () => { stop(); clearHook(); };

  $('#shuffleBtn').onclick = () => {
    for (let i = S.clips.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [S.clips[i], S.clips[j]] = [S.clips[j], S.clips[i]];
    }
    renderClips();
  };

  $('#perLine').onchange = (e) => { S.perLine = +e.target.value; refreshLyrics(); };
  $('#density').onchange = (e) => { S.density = +e.target.value; };
  $('#detectBtn').onclick = detectLyrics;
  $('#pasteBtn').onclick = () => {
    $('#lyricsChoice').classList.add('hidden');
    $('#pasteZone').classList.remove('hidden');
    $('#lyrics').focus();
  };
  $('#cancelPaste').onclick = () => { $('#pasteZone').classList.add('hidden'); refreshLyrics(); };
  $('#applyPaste').onclick = applyPaste;
  $('#autoLyrics').onclick = () => {
    if (!S.buf) { status("Dépose d'abord ton son."); return; }
    const tokens = parseTokens($('#lyrics').value);
    if (!tokens.length) return;
    snapshot();
    S.words = beatDistribute(tokens);
    $('#pasteZone').classList.add('hidden');
    refreshLyrics();
  };
  $('#retimeBtn').onclick = retime;
  $('#resetLyrics').onclick = resetLyrics;
  $('#tapLyrics').onclick = startTap;
  $('#undoBtn').onclick = undo;
  $('#redoBtn').onclick = redo;
  $('#copyBtn').onclick = copySelected;
  $('#delBtn').onclick = deleteSelected;
  $('#pasteWordsBtn').onclick = pasteWords;
  $('#zoomIn').onclick = () => zoom(1.5);
  $('#zoomOut').onclick = () => zoom(1 / 1.5);
  $('#zoomFit').onclick = () => zoom(0);
  document.querySelector('#editor .tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    document.querySelectorAll('#editor .tabs button').forEach((x) => x.classList.toggle('on', x === b));
    $('#tabText').classList.toggle('hidden', b.dataset.tab !== 'text');
    $('#tabKeys').classList.toggle('hidden', b.dataset.tab !== 'keys');
    closePop();
    if (b.dataset.tab === 'text') renderTimeline();
  });
  // « Ajuster le timing des mots » ouvre la timeline en grand, en bas de l'écran ; l'aperçu se réduit.
  const tlBox = document.querySelector('#tlDetails .tl');
  const tlHome = document.createComment('timeline');
  tlBox.before(tlHome);
  function setDock(open) {
    document.body.classList.toggle('tl-big', open);
    if (open) $('#tlDock').append(tlBox);
    else tlHome.after(tlBox);
    pxs = 0; fitAll = false;
    renderTimeline();
    drawWave();
    if (open) {
      const w = [...sel][0] || S.words.find((x) => x.t != null && x.t >= curTime() - 0.5);
      if (w) tlScroll.scrollLeft = Math.max(0, tToX(w.t) - 120);
    }
  }
  $('#tlDetails').addEventListener('toggle', () => setDock($('#tlDetails').open));
  $('#tlClose').onclick = () => { $('#tlDetails').open = false; };

  pop.addEventListener('click', (e) => {
    const b = e.target.closest('[data-emph]');
    if (b) toggleEmph(b.dataset.emph);
  });
  $('#popText').addEventListener('input', (e) => {
    const w = [...sel][0];
    const v = e.target.value.replace(/\s+/g, ' ').trim();
    if (sel.size !== 1 || !v) return;
    if (!popEdited) { snapshot(); popEdited = true; }
    w.text = v;
    renderList(); renderTimeline(); renderKeys();
  });
  $('#popText').addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' || e.key === 'Escape') closePop();
  });
  $('#popClose').onclick = closePop;
  $('#popDelete').onclick = () => { deleteSelected(); closePop(); };
  $('#popListen').onclick = () => {
    const w = [...sel].sort((a, b) => a.t - b.t)[0];
    if (w && w.t != null) start({ from: Math.max(S.segStart, w.t - 1.2) });
  };
  // Clic ailleurs ou Échap : la fenêtre se ferme.
  document.addEventListener('pointerdown', (e) => {
    if (pop.classList.contains('hidden')) return;
    if (pop.contains(e.target) || e.target.closest('.chip, .wb, #view, .key-row')) return;
    closePop();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePop(); });

  // Clic sur un mot dans l'aperçu vidéo : on s'arrête dessus et on ouvre sa fenêtre.
  const hitWord = (e) => {
    const r = view.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
    const h = lyricHits.find((b) => x >= b.x - 20 && x <= b.x + b.wd + 20 && y >= b.y - 20 && y <= b.y + b.h + 20);
    return h && S.words.includes(h.w) ? h.w : null;
  };
  view.addEventListener('click', (e) => {
    const w = hitWord(e);
    if (!w) return;
    if (play && !exporting) stop();
    openWord(w, e, null);
  });
  view.addEventListener('pointermove', (e) => view.classList.toggle('hover-word', !!hitWord(e)));
  $('#emphColor').oninput = (e) => {
    S.style.emph = e.target.value;
    document.documentElement.style.setProperty('--emph', e.target.value);
  };
  $('#tapBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); tap(); });

  $('#presets').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) applyPreset(b.dataset.preset); });
  $('#lyricStyle').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    S.style.lyric = b.dataset.v; syncStyleUI();
  });
  $('#font').onchange = (e) => { S.style.font = e.target.value; loadFont(); };
  $('#pos').onchange = (e) => (S.style.pos = e.target.value);
  $('#size').oninput = (e) => (S.style.size = +e.target.value);
  $('#textColor').oninput = (e) => (S.style.text = e.target.value);
  $('#accent').oninput = (e) => {
    S.style.accent = e.target.value;
    document.documentElement.style.setProperty('--acc', e.target.value);
    drawWave();
  };
  $('#upper').onchange = (e) => (S.style.upper = e.target.checked);
  $('#fx').addEventListener('change', (e) => { if (e.target.dataset.fx) S.style.fx[e.target.dataset.fx] = e.target.checked; });

  $('#playBtn').onclick = () => (play ? stop() : start());
  // Recommencer : relance tout de suite depuis le début de l'extrait (hook compris), même en pleine lecture.
  const restart = () => {
    if (!S.buf || exporting) return;
    if (tapIdx >= 0) endTap();
    start({ from: S.segStart });
  };
  $('#restartBtn').onclick = restart;
  $('#exportBtn').onclick = exportVideo;

  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === 'c' && sel.size) { e.preventDefault(); copySelected(); return; }
    if (mod && e.key.toLowerCase() === 'v' && wordClip) { e.preventDefault(); pasteWords(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel.size) { e.preventDefault(); deleteSelected(); return; }
    if (e.key.toLowerCase() === 'r' && !mod && !e.repeat) { e.preventDefault(); restart(); return; }
    if (e.code !== 'Space' || e.repeat) return;
    e.preventDefault();
    if (tapIdx >= 0) tap();
    else if (S.buf && !exporting) (play ? stop() : start());
  });
  window.addEventListener('resize', () => { drawWave(); renderTimeline(); });

  loadFont();
  bankInit();
  hooksInit();
  loadSongs();
  goStep(1);
  $('#renameBtn').onclick = renameCurrent;
  $('#trackName').onclick = renameCurrent;
  if (document.fonts) document.fonts.ready.then(() => renderFrame(0));
  schedule();

  window.__syncope = { S, setAudio, exportVideo, start, stop, curTime, refreshLyrics, beatDistribute, parseTokens };
})();
