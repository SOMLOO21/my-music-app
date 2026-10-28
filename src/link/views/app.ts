import { h, layout, raw, type Safe } from '../html';
import { PLATFORMS, PLATFORM_BY_KEY, iconTile, parsePlatforms } from '../platforms';
import { parseCustomLinks, MAX_CUSTOM_LINKS, type CustomLink } from '../custom-links';
import { DEFAULT_THEME, PRESETS, parseTheme, sanitizeTheme, type Theme } from '../theme';
import type { Link, User } from '../types';

const APP_CSS = `
body{background:#fafafa}
.nav{position:sticky;top:0;z-index:5;background:rgba(255,255,255,.85);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.nav .in{max-width:1120px;margin:0 auto;height:60px;padding:0 24px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.logo{font-weight:800;font-size:18px;letter-spacing:-.03em;display:flex;align-items:center;gap:8px}
.logo i{width:22px;height:22px;border-radius:7px;background:linear-gradient(135deg,#111827,#6366f1);display:inline-block}
.nav .links{display:flex;gap:6px;align-items:center}
.nav .links a{padding:8px 12px;border-radius:8px;font-size:14px;font-weight:500;color:#334155}
.nav .links a:hover,.nav .links a.on{background:#f1f5f9;color:var(--fg)}
.page{max-width:1120px;margin:0 auto;padding:36px 24px 80px}
.head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:28px;flex-wrap:wrap}
.head h1{font-size:30px;font-weight:800}
.bento{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:18px}
.linkcard{padding:18px;display:flex;flex-direction:column;gap:14px}
.linkcard .top{display:flex;gap:14px;align-items:center}
.linkcard img,.linkcard .ph{width:64px;height:64px;border-radius:14px;object-fit:cover;background:#f1f5f9;flex:none}
.linkcard .t{font-weight:700;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.url{display:flex;align-items:center;gap:8px;padding:8px 10px;background:#f8fafc;border:1px solid var(--line);border-radius:10px;font-size:13px;font-family:ui-monospace,monospace}
.url span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.url button{border:0;background:#fff;border:1px solid var(--line);border-radius:7px;padding:4px 8px;font-size:12px;cursor:pointer}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.kpi{padding:10px;border-radius:12px;background:#f8fafc}
.kpi b{display:block;font-size:18px}
.kpi span{font-size:12px;color:var(--muted)}
.row{display:flex;gap:8px;flex-wrap:wrap}
.pill{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;background:#eef2ff;color:#3730a3}
.pill.green{background:#f0fdf4;color:#166534}
.empty{padding:56px 24px;text-align:center}
.empty h2{font-size:22px;margin-bottom:8px}
.form-grid{display:grid;grid-template-columns:1.3fr 1fr;gap:18px;align-items:start}
.panel{padding:24px}
.panel h2{font-size:17px;margin-bottom:16px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.plat{display:grid;grid-template-columns:40px 1fr;gap:12px;align-items:center;margin-bottom:10px}
.tile{display:inline-flex;align-items:center;justify-content:center;border-radius:12px;color:#fff;font-weight:800}
.import{display:flex;gap:10px}
.preview{position:sticky;top:84px;padding:20px;text-align:center}
.preview img{width:100%;max-width:260px;aspect-ratio:1;border-radius:22px;object-fit:cover;background:#f1f5f9}
.slugin{display:flex;align-items:center;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#fff}
.slugin span{padding:0 10px;color:var(--muted);font-size:13px;background:#f8fafc;height:42px;display:flex;align-items:center;border-right:1px solid var(--line)}
.slugin input{border:0;border-radius:0}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.stat{padding:20px}
.stat b{display:block;font-size:30px;font-weight:800;letter-spacing:-.03em}
.stat span{font-size:13px;color:var(--muted)}
.bars .b{display:grid;grid-template-columns:150px 1fr 60px;align-items:center;gap:12px;margin-bottom:12px;font-size:14px}
.bars .track{height:10px;background:#f1f5f9;border-radius:99px;overflow:hidden}
.bars .fill{height:100%;border-radius:99px}
.chart{display:flex;align-items:flex-end;gap:4px;height:160px;padding-top:10px}
.chart div{flex:1;background:#111827;border-radius:5px 5px 0 0;min-height:2px;position:relative}
.chart div.v{background:#cbd5e1}
.chart-wrap{display:flex;gap:4px;align-items:flex-end;height:160px}
.legend{display:flex;gap:16px;font-size:12px;color:var(--muted);margin-top:10px}
.legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.split{display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-top:16px}
.table{width:100%;border-collapse:collapse;font-size:14px}
.table td{padding:9px 0;border-bottom:1px solid #f1f5f9}
.table td:last-child{text-align:right;font-weight:600}
@media (max-width:860px){.form-grid,.split{grid-template-columns:1fr}.stats{grid-template-columns:1fr 1fr}.preview{position:static}.nav .links a.hide-m{display:none}.bars .b{grid-template-columns:110px 1fr 44px}}
`;

export function shell(user: User | null, title: string, body: Safe, active = '', extraCss = '') {
  const nav = h`<header class="nav"><div class="in">
    <a class="logo" href="${user ? '/link' : '/'}"><i></i>My Music Link</a>
    <nav class="links">${
      user
        ? h`<a href="/link" class="${active === 'links' ? 'on' : ''}">Mes liens</a>
            <a href="/link/stats" class="${active === 'stats' ? 'on' : ''}">Statistiques</a>
            <a href="/link/settings" class="${active === 'settings' ? 'on' : ''}">Pixel Meta</a>
            <a href="/" class="hide-m">My Music App</a>
            <a href="/compte" class="btn ghost" style="height:34px" title="Mon compte My Music App">@${user.pseudo}</a>`
        : h`<a href="/" class="hide-m">My Music App</a><a class="btn" href="/compte" style="color:#fff">Connexion</a>`
    }</nav></div></header>`;
  return layout({ title: `${title} · My Music Link`, css: APP_CSS + extraCss, body: h`${nav}${body}` });
}

const flash = (msg?: { err?: string; ok?: string }) =>
  msg?.err ? h`<div class="flash err">${msg.err}</div>` : msg?.ok ? h`<div class="flash ok">${msg.ok}</div>` : '';

// ───────────── Landing ─────────────
export function landing() {
  const demo = ['spotify', 'appleMusic', 'deezer'].map((k) => PLATFORM_BY_KEY[k]);
  const body = h`<main class="page" style="text-align:center;padding-top:96px">
    <span class="pill">Pixel Meta + Conversions API intégrés</span>
    <h1 style="font-size:clamp(38px,6vw,64px);font-weight:800;line-height:1.05;margin:20px auto 18px;max-width:820px">Le smart link qui sait où vont tes fans.</h1>
    <p class="muted" style="font-size:18px;max-width:600px;margin:0 auto 32px">Un lien pour ta sortie, toutes les plateformes de streaming, et chaque clic Spotify, Deezer ou Apple Music remonté dans tes campagnes Meta.</p>
    <a class="btn lg" href="/compte">Me connecter pour créer mon smart link</a>
    <div class="bento" style="margin-top:72px;text-align:left;grid-template-columns:repeat(3,1fr)">
      ${demo.map((p) => h`<div class="card" style="padding:18px;min-height:130px;display:flex;flex-direction:column;justify-content:space-between">${raw(iconTile(p))}<b style="font-size:15px">${p.name}</b></div>`)}
    </div>
    <div class="bento" style="margin-top:18px;text-align:left">
      <div class="card panel"><h2>1 · Colle ton lien</h2><p class="muted">Spotify, Deezer ou Apple Music : on récupère la pochette et toutes les plateformes automatiquement.</p></div>
      <div class="card panel"><h2>2 · Branche ton pixel</h2><p class="muted">Chaque clic part vers Meta en double (pixel + Conversions API), avec dédoublonnage. Fini les conversions perdues sur iOS.</p></div>
      <div class="card panel"><h2>3 · À ton image</h2><p class="muted">Thèmes, fond photo, effet verre, néon… et tes autres liens (billetterie, merch) avec leurs icônes.</p></div>
    </div>
  </main>`;
  return shell(null, 'Smart links pour artistes', body);
}

// ───────────── Dashboard ─────────────
export type LinkSummary = Link & { views: number; clicks: number };

export function dashboard(user: User, links: LinkSummary[], base: string) {
  const pixelWarning = !user.pixel_id
    ? h`<div class="flash err" style="display:flex;justify-content:space-between;align-items:center;gap:12px">Ton pixel Meta n'est pas encore configuré : les clics ne remontent pas dans tes campagnes. <a class="btn" href="/link/settings" style="color:#fff">Configurer</a></div>`
    : '';
  const cards = links.map((l) => {
    const ctr = l.views ? Math.round((l.clicks / l.views) * 100) : 0;
    const url = `${base}/l/${l.slug}`;
    return h`<div class="card linkcard">
      <div class="top">
        ${l.artwork_url ? h`<img src="${l.artwork_url}" alt="">` : h`<div class="ph"></div>`}
        <div style="min-width:0">
          <div class="t">${l.title}</div>
          <div class="muted small">${l.artist}</div>
          <div style="margin-top:6px"><span class="pill green">En ligne</span></div>
        </div>
      </div>
      <div class="url"><span>${url.replace(/^https?:\/\//, '')}</span><button type="button" onclick="navigator.clipboard.writeText('${url}');this.textContent='Copié !'">Copier</button></div>
      <div class="kpis">
        <div class="kpi"><b>${l.views}</b><span>Vues</span></div>
        <div class="kpi"><b>${l.clicks}</b><span>Clics</span></div>
        <div class="kpi"><b>${ctr}%</b><span>Taux de clic</span></div>
      </div>
      <div class="row">
        <a class="btn" href="/link/stats?link=${l.id}" style="color:#fff;flex:1">Statistiques</a>
        <a class="btn ghost" href="/link/links/${l.id}">Modifier</a>
        <a class="btn ghost" href="/l/${l.slug}" target="_blank">Voir</a>
      </div>
    </div>`;
  });
  const body = h`<main class="page">
    <div class="head"><div><h1>Mes smart links</h1><p class="muted" style="margin:6px 0 0">Salut ${user.name} 👋</p></div><a class="btn lg" href="/link/new" style="color:#fff">+ Nouveau lien</a></div>
    ${pixelWarning}
    ${
      links.length
        ? h`<div class="bento">${cards}</div>`
        : h`<div class="card empty"><h2>Aucun lien pour l'instant</h2><p class="muted" style="margin:0 0 20px">Colle un lien Spotify, Deezer ou Apple Music et on s'occupe du reste.</p><a class="btn lg" href="/link/new" style="color:#fff">Créer mon premier smart link</a></div>`
    }
  </main>`;
  return shell(user, 'Mes liens', body, 'links');
}

// ───────────── Éditeur ─────────────
export type LinkForm = {
  id?: string;
  slug: string;
  title: string;
  artist: string;
  artwork_url: string;
  accent: string;
  platforms: Record<string, string>;
  theme: Theme;
  customLinks: CustomLink[];
};

export const emptyForm = (): LinkForm => ({
  slug: '', title: '', artist: '', artwork_url: '', accent: '#111827', platforms: {}, theme: { ...DEFAULT_THEME }, customLinks: [],
});

export function linkToForm(l: Link): LinkForm {
  const platforms: Record<string, string> = {};
  for (const p of parsePlatforms(l.platforms)) platforms[p.key] = p.url;
  return {
    id: l.id,
    slug: l.slug,
    title: l.title,
    artist: l.artist,
    artwork_url: l.artwork_url || '',
    accent: l.accent,
    platforms,
    theme: parseTheme(l.theme),
    customLinks: parseCustomLinks(l.custom_links),
  };
}

export function editor(user: User, f: LinkForm, base: string, opts: { msg?: { err?: string; ok?: string } } = {}) {
  const editing = Boolean(f.id);
  const host = base.replace(/^https?:\/\//, '');
  const body = h`<main class="page">
    <div class="head"><div><a class="muted small" href="/link">← Mes liens</a><h1 style="margin-top:6px">${editing ? 'Modifier le lien' : 'Nouveau smart link'}</h1></div></div>
    ${flash(opts.msg)}
    ${
      editing
        ? ''
        : h`<form class="card panel" method="post" action="/link/import" style="margin-bottom:18px">
      <h2>Importer automatiquement</h2>
      <div class="import"><input name="url" placeholder="Lien Spotify, Deezer ou Apple Music — ou un ISRC / UPC" required><button class="btn">Importer</button></div>
      <div class="hint">On récupère le titre, la pochette et les liens Spotify, Apple Music et Deezer. Tu peux aussi remplir le formulaire à la main.</div>
    </form>`
    }
    <form method="post" id="link-form" action="${editing ? `/link/links/${f.id}` : '/link/links'}">
      <div class="form-grid">
        <div>
          <div class="card panel" style="margin-bottom:18px">
            <h2>Infos de la sortie</h2>
            <div class="two">
              <div class="field"><label>Titre</label><input name="title" required value="${f.title}" id="f-title"></div>
              <div class="field"><label>Artiste</label><input name="artist" required value="${f.artist}" id="f-artist"></div>
            </div>
            <div class="field"><label>URL de la pochette</label><input name="artwork_url" value="${f.artwork_url}" id="f-art" placeholder="https://…"></div>
            <div class="field"><label>Adresse du lien</label><div class="slugin"><span>${host}/l/</span><input name="slug" required pattern="[a-z0-9-]{3,60}" value="${f.slug}" placeholder="artiste-titre"></div><div class="hint">Minuscules, chiffres et tirets.</div></div>
          </div>
          ${appearancePanel(f)}
          <div class="card panel">
            <h2>Plateformes</h2>
            ${PLATFORMS.map(
              (p) => h`<div class="plat">${raw(iconTile(p))}<input name="p_${p.key}" value="${f.platforms[p.key] ?? ''}" placeholder="Lien ${p.name}"></div>`,
            )}
            <div class="hint">Laisse vide une plateforme pour la masquer.</div>
          </div>
          ${customLinksPanel(f)}
        </div>
        <div class="preview">
          <div class="phone"><iframe id="pv" title="Aperçu du smart link" srcdoc="&lt;p style='font:14px Inter,sans-serif;color:#94a3b8;text-align:center;margin-top:40%'&gt;Aperçu…&lt;/p&gt;"></iframe></div>
          <div class="seg-mini" role="group" aria-label="Taille de l'aperçu"><button type="button" data-pv="mobile" class="on">Mobile</button><button type="button" data-pv="desktop">Ordinateur</button></div>
          <button class="btn lg" style="width:100%;margin-top:14px">${editing ? 'Enregistrer' : 'Créer le smart link'}</button>
          ${editing ? h`<a class="btn ghost" href="/l/${f.slug}" target="_blank" style="width:100%;margin-top:10px">Voir la page</a>` : ''}
        </div>
      </div>
    </form>
    ${editing ? h`<form method="post" action="/link/links/${f.id}/delete" onsubmit="return confirm('Supprimer définitivement ce lien et ses statistiques ?')" style="margin-top:28px"><button class="btn danger">Supprimer ce lien</button></form>` : ''}
  </main>
  <script>${raw(EDITOR_JS)}</script>`;
  return shell(user, editing ? 'Modifier' : 'Nouveau lien', body, 'links', EDITOR_CSS);
}

// ───────────── Autres liens ─────────────
function customRow(l: Partial<CustomLink> = {}) {
  return h`<div class="clink">
    <input type="hidden" name="c_id" value="${l.id ?? ''}"><input type="hidden" name="c_icon" value="${l.icon ?? ''}">
    <button type="button" class="icon-pick ${l.icon ? 'has' : ''}" title="Importer une icône" aria-label="Importer une icône">
      <img src="${l.icon || 'data:,'}" alt="">
      <svg class="ph" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
      <span class="icon-x" title="Retirer l'icône">×</span>
    </button>
    <div class="clink-fields"><input name="c_title" value="${l.title ?? ''}" placeholder="Titre (ex : Billetterie)" maxlength="60"><input name="c_url" value="${l.url ?? ''}" placeholder="https://…" inputmode="url"></div>
    <div class="clink-actions">
      <button type="button" data-move="-1" aria-label="Monter">↑</button><button type="button" data-move="1" aria-label="Descendre">↓</button><button type="button" data-remove aria-label="Supprimer">✕</button>
    </div>
  </div>`;
}

function customLinksPanel(f: LinkForm) {
  const ideas = ['Billetterie', 'Merch', 'Clip YouTube', 'Instagram', 'TikTok', 'Site officiel'];
  return h`<div class="card panel" style="margin-top:18px">
    <h2>Autres liens</h2>
    <p class="hint" style="margin:-8px 0 14px">Billetterie, merch, clip, réseaux… Ils s'affichent sous les plateformes, dans le même style. Clique sur le carré pour importer une icône.</p>
    <div id="clinks">${f.customLinks.map((l) => customRow(l))}</div>
    <template id="clink-tpl">${customRow()}</template>
    <div class="ideas">${ideas.map((t) => h`<button type="button" class="idea" data-idea="${t}">+ ${t}</button>`)}<button type="button" class="idea add" data-idea="">+ Lien vide</button></div>
    <input type="file" id="icon-file" accept="image/jpeg,image/png,image/webp,image/avif" hidden>
    <div class="hint" id="clink-status" role="status"></div>
  </div>`;
}

// ───────────── Apparence ─────────────
const choice = (name: string, value: string, current: string, label: unknown, extra = '') =>
  h`<label class="opt ${extra}"><input type="radio" name="${name}" value="${value}" ${value === current ? raw('checked') : ''}><span>${label}</span></label>`;

function presetSwatch(p: (typeof PRESETS)[number]) {
  const t = sanitizeTheme({ ...DEFAULT_THEME, ...p.theme });
  const bg = t.bg === 'gradient' ? `linear-gradient(${t.angle}deg,${t.bg1},${t.bg2})` : t.bg === 'cover' ? 'linear-gradient(135deg,#7c2d12,#1e1b4b 60%,#0f172a)' : t.bg1;
  const card =
    t.card === 'glass' ? 'background:rgba(255,255,255,.22);border:1px solid rgba(255,255,255,.4)'
    : t.card === 'shadow' ? `background:${t.cardColor};border:2px solid #111;box-shadow:3px 3px 0 #111`
    : t.card === 'glow' ? `background:${t.cardColor};border:1px solid ${p.accent};box-shadow:0 0 10px -2px ${p.accent}`
    : t.card === 'solid' ? `background:${t.cardColor}`
    : t.card === 'minimal' ? 'background:transparent;border-bottom:1px solid rgba(0,0,0,.2);border-radius:0'
    : 'background:transparent;border:1px solid rgba(15,23,42,.18)';
  const r = t.radius === 'square' ? '3px' : t.radius === 'pill' ? '12px' : '7px';
  const bars = t.layout === 'list' ? [0, 1, 2].map(() => `<i style="${card};border-radius:${r};height:12px;width:100%"></i>`).join('') : `<i style="${card};border-radius:${r};grid-column:span 2"></i><i style="${card};border-radius:${r}"></i><i style="${card};border-radius:${r}"></i><i style="${card};border-radius:${r}"></i>`;
  return h`<button type="button" class="preset" data-preset="${JSON.stringify({ ...t, accent: p.accent })}">
    <span class="sw-prev" style="background:${bg}"><span class="${t.layout === 'list' ? 'sw-list' : 'sw-grid'}">${raw(bars)}</span></span>
    <span class="preset-name">${p.name}</span>
  </button>`;
}

function appearancePanel(f: LinkForm) {
  const t = f.theme;
  return h`<div class="card panel" style="margin-bottom:18px" id="appearance">
    <h2>Apparence</h2>
    <label>Thèmes</label>
    <div class="presets">${PRESETS.map(presetSwatch)}</div>

    <label style="margin-top:20px">Fond</label>
    <div class="opts">${[['solid', 'Couleur'], ['gradient', 'Dégradé'], ['cover', 'Pochette floutée'], ['image', 'Image']].map(([v, l]) => choice('t_bg', v, t.bg, l))}</div>
    <div class="sub" data-show-bg="solid gradient">
      <div class="colors">
        <div><span class="mini-l">Couleur${t.bg === 'gradient' ? ' 1' : ''}</span><input type="color" name="t_bg1" value="${t.bg1}"></div>
        <div data-show-bg="gradient"><span class="mini-l">Couleur 2</span><input type="color" name="t_bg2" value="${t.bg2}"></div>
        <div data-show-bg="gradient" style="flex:1"><span class="mini-l">Angle</span><input type="range" name="t_angle" min="0" max="360" step="5" value="${t.angle}"></div>
      </div>
    </div>
    <div class="sub" data-show-bg="image">
      <input type="hidden" name="t_bgImage" value="${t.bgImage}">
      <div class="drop ${t.bgImage ? 'has' : ''}" id="drop">
        <img id="drop-img" src="${t.bgImage || 'data:,'}" alt="">
        <div class="drop-empty">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="9" cy="9" r="2"/><path d="m21 15-4.5-4.5L6 21"/></svg>
          <div><b>Glisse une image ici</b> ou <button type="button" class="linkbtn" data-pick>choisis un fichier</button></div>
          <span class="hint" style="margin:0">Photo de l'artiste, visuel de la sortie… JPG, PNG, WebP · 8 Mo max</span>
        </div>
        <div class="drop-actions"><button type="button" class="btn ghost" data-pick>Changer</button><button type="button" class="btn ghost" id="drop-remove">Retirer</button></div>
        <div class="drop-status" id="drop-status" role="status"></div>
      </div>
      <input type="file" id="drop-file" accept="image/jpeg,image/png,image/webp,image/avif" hidden>
    </div>
    <div class="sub" data-show-bg="image cover">
      <span class="mini-l" style="margin-top:6px">Retouche</span>
      <div class="opts fx">${[
        ['none', 'Aucune'], ['blur', 'Flou'], ['glass', 'Verre'], ['dark', 'Assombri'], ['bw', 'Noir & blanc'],
      ].map(([v, l]) => choice('t_bgFilter', v, t.bgFilter, h`<b class="fthumb fx-${v}"><i></i></b>${l}`))}</div>
      <div class="sub" data-show-filter="blur glass dark bw"><span class="mini-l">Intensité</span><input type="range" name="t_bgStrength" min="0" max="100" step="1" value="${t.bgStrength}"></div>
    </div>

    <label style="margin-top:20px">Style des cartes</label>
    <div class="opts cards">${[
      ['outline', 'Contour'], ['solid', 'Plein'], ['glass', 'Verre'], ['shadow', 'Ombre brute'], ['glow', 'Néon'], ['minimal', 'Minimal'],
    ].map(([v, l]) => choice('t_card', v, t.card, h`<b class="cs cs-${v}"></b>${l}`))}</div>
    <div class="sub colors" data-show-card="solid shadow glow"><div><span class="mini-l">Couleur des cartes</span><input type="color" name="t_cardColor" value="${t.cardColor}"></div></div>

    <div class="two" style="margin-top:20px">
      <div><label>Disposition</label><div class="opts">${choice('t_layout', 'bento', t.layout, 'Bento')}${choice('t_layout', 'list', t.layout, 'Liste')}</div></div>
      <div><label>Coins</label><div class="opts">${choice('t_radius', 'square', t.radius, 'Carrés')}${choice('t_radius', 'round', t.radius, 'Arrondis')}${choice('t_radius', 'pill', t.radius, 'Pilule')}</div></div>
    </div>
    <div class="two" style="margin-top:20px">
      <div><label>Police</label><select name="t_font">${[
        ['inter', 'Inter (moderne)'], ['grotesk', 'Space Grotesk (tech)'], ['serif', 'DM Serif (élégant)'], ['syne', 'Syne (artistique)'], ['mono', 'JetBrains Mono (brut)'],
      ].map(([v, l]) => h`<option value="${v}" ${v === t.font ? raw('selected') : ''}>${l}</option>`)}</select></div>
      <div><label>Texte</label><div class="opts">${choice('t_text', 'auto', t.text, 'Auto')}${choice('t_text', 'light', t.text, 'Clair')}${choice('t_text', 'dark', t.text, 'Foncé')}</div></div>
    </div>
    <div class="field" style="margin:20px 0 0"><label>Couleur d'accent</label><div class="colors"><input type="color" name="accent" value="${f.accent}"><span class="hint" style="margin:0">Point « Disponible », initiales des autres liens, bordure néon.</span></div></div>
  </div>`;
}

const EDITOR_CSS = `
.presets{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.preset{border:0;background:none;padding:0;cursor:pointer;text-align:center;font:inherit;color:inherit}
.sw-prev{display:block;aspect-ratio:4/5;border-radius:12px;padding:10px;border:2px solid transparent;box-shadow:inset 0 0 0 1px rgba(15,23,42,.08);transition:border-color .15s}
.preset:hover .sw-prev{border-color:#cbd5e1}
.preset.on .sw-prev{border-color:var(--fg)}
.sw-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px;height:100%;align-content:end}
.sw-grid i{height:20px;display:block}
.sw-list{display:flex;flex-direction:column;gap:5px;justify-content:flex-end;height:100%}
.sw-list i{display:block}
.preset-name{display:block;font-size:12px;font-weight:600;margin-top:6px}
.opts{display:flex;flex-wrap:wrap;gap:6px}
.opt input{position:absolute;opacity:0;pointer-events:none}
.opt span{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 12px;border:1px solid var(--line);border-radius:9px;font-size:13px;font-weight:500;cursor:pointer;background:#fff}
.opt input:checked+span{border-color:var(--fg);box-shadow:inset 0 0 0 1px var(--fg);font-weight:600}
.opt input:focus-visible+span{outline:2px solid #818cf8}
.opts.cards .opt span{height:40px}
.cs{display:inline-block;width:18px;height:14px;border-radius:4px}
.cs-outline{border:1.5px solid #94a3b8}
.cs-solid{background:#334155}
.cs-glass{background:linear-gradient(135deg,#c7d2fe,#fbcfe8);border:1px solid #fff;box-shadow:0 0 0 1px #cbd5e1}
.cs-shadow{background:#fff;border:1.5px solid #111;box-shadow:2px 2px 0 #111}
.cs-glow{background:#0b0b14;border:1px solid #22d3ee;box-shadow:0 0 6px #22d3ee}
.cs-minimal{border-bottom:2px solid #94a3b8;border-radius:0}
.sub{margin-top:10px}
.clink{display:grid;grid-template-columns:52px 1fr auto;gap:10px;align-items:center;padding:10px 0;border-top:1px solid #f1f5f9}
.clink:first-child{border-top:0}
.clink-fields{display:grid;grid-template-columns:1fr 1.4fr;gap:8px}
.icon-pick{position:relative;width:52px;height:52px;border-radius:14px;border:1.5px dashed #cbd5e1;background:#f8fafc;color:#64748b;cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center}
.icon-pick:hover{border-color:var(--fg);color:var(--fg)}
.icon-pick img{display:none;width:100%;height:100%;object-fit:cover;border-radius:12px}
.icon-pick.has{border:1px solid var(--line);background:#fff}
.icon-pick.has img{display:block}
.icon-pick.has .ph{display:none}
.icon-pick.busy{opacity:.5}
.icon-x{display:none;position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:var(--fg);color:#fff;font-size:12px;line-height:18px;text-align:center}
.icon-pick.has:hover .icon-x{display:block}
.clink-actions{display:flex;gap:4px}
.clink-actions button{width:30px;height:30px;border:1px solid var(--line);background:#fff;border-radius:8px;cursor:pointer;font-size:13px;color:#475569}
.clink-actions button:hover{border-color:var(--fg);color:var(--fg)}
.ideas{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.idea{border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 12px;font:500 13px Inter,sans-serif;cursor:pointer;color:#334155}
.idea:hover{border-color:var(--fg)}
.idea:disabled{opacity:.4;cursor:not-allowed}
@media (max-width:560px){.clink{grid-template-columns:44px 1fr}.clink-fields{grid-template-columns:1fr}.clink-actions{grid-column:2}.icon-pick{width:44px;height:44px}}
.drop{position:relative;border:1.5px dashed #cbd5e1;border-radius:14px;min-height:150px;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#f8fafc;transition:border-color .15s,background .15s}
.drop.over{border-color:var(--fg);background:#eef2ff}
.drop img{display:none;position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.drop.has img{display:block}
.drop-empty{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;padding:20px;color:#475569;font-size:14px}
.drop.has .drop-empty{display:none}
.drop-actions{display:none;position:absolute;right:10px;bottom:10px;gap:6px}
.drop.has .drop-actions{display:flex}
.drop-actions .btn{height:32px;font-size:12px;padding:0 12px;background:rgba(255,255,255,.92)}
.drop-status{position:absolute;left:10px;bottom:10px;font-size:12px;font-weight:600;background:rgba(15,23,42,.85);color:#fff;padding:5px 10px;border-radius:8px;display:none}
.drop-status.on{display:block}
.linkbtn{border:0;background:none;padding:0;font:inherit;font-weight:600;color:var(--fg);text-decoration:underline;cursor:pointer}
.fthumb{display:inline-block;width:22px;height:22px;border-radius:6px;overflow:hidden;position:relative;background:#64748b var(--thumb) center/cover}
.fthumb i{position:absolute;inset:0}
.fx-blur{filter:blur(1.5px) saturate(1.4)} .fx-blur i{background:rgba(0,0,0,.25)}
.fx-glass{filter:blur(1.5px) saturate(1.8)} .fx-glass i{background:rgba(255,255,255,.3)}
.fx-dark i{background:rgba(0,0,0,.55)}
.fx-bw{filter:grayscale(1) contrast(1.15)}
.colors{display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap}
.mini-l{display:block;font-size:11px;color:var(--muted);margin-bottom:4px}
input[type=range]{height:auto;padding:0;border:0;accent-color:var(--fg)}
.preview{position:sticky;top:84px}
.phone{width:100%;max-width:360px;margin:0 auto;aspect-ratio:9/18.5;border-radius:38px;border:10px solid #0f172a;overflow:hidden;background:#fff;box-shadow:0 30px 60px -30px rgba(15,23,42,.5);position:relative}
.phone iframe{position:absolute;top:0;left:0;border:0;width:390px;height:802px;transform-origin:0 0}
.phone.desktop{max-width:none;aspect-ratio:16/10;border-radius:14px;border-width:8px}
.phone.desktop iframe{width:1280px;height:800px}
.seg-mini{display:flex;justify-content:center;gap:4px;margin-top:12px}
.seg-mini button{border:1px solid var(--line);background:#fff;border-radius:8px;padding:6px 12px;font:600 12px Inter,sans-serif;color:#475569;cursor:pointer}
.seg-mini button.on{background:var(--fg);color:#fff;border-color:var(--fg)}
@media (max-width:860px){.presets{grid-template-columns:repeat(4,1fr)}.phone{max-width:300px}}
`;

// Aperçu en direct : le formulaire est envoyé à /link/preview (debounce) et rendu dans l'iframe
const EDITOR_JS = `
(function(){
  var form=document.getElementById('link-form'), frame=document.getElementById('pv'), phone=frame.parentNode, timer, ctrl;
  function fit(){ var w=phone.clientWidth; frame.style.transform='scale('+(w/frame.offsetWidth)+')'; }
  function refresh(){
    if(ctrl) ctrl.abort(); ctrl=new AbortController();
    fetch('/link/preview',{method:'POST',body:new FormData(form),signal:ctrl.signal}).then(function(r){return r.text()}).then(function(html){frame.srcdoc=html}).catch(function(){});
  }
  function later(){ clearTimeout(timer); timer=setTimeout(refresh,250); }
  function sync(){
    var bg=(form.querySelector('[name=t_bg]:checked')||{}).value, card=(form.querySelector('[name=t_card]:checked')||{}).value;
    document.querySelectorAll('[data-show-bg]').forEach(function(el){el.style.display=el.dataset.showBg.split(' ').indexOf(bg)>-1?'':'none'});
    document.querySelectorAll('[data-show-card]').forEach(function(el){el.style.display=el.dataset.showCard.split(' ').indexOf(card)>-1?'':'none'});
    var fx=(form.querySelector('[name=t_bgFilter]:checked')||{}).value;
    document.querySelectorAll('[data-show-filter]').forEach(function(el){el.style.display=el.dataset.showFilter.split(' ').indexOf(fx)>-1?'':'none'});
    // Miniatures des retouches avec la vraie photo (image importée ou pochette)
    var photo = bg==='image' ? form.t_bgImage.value : form.artwork_url.value;
    document.querySelectorAll('.fthumb').forEach(function(el){el.style.setProperty('--thumb', photo ? 'url("'+photo.replace(/"/g,'')+'")' : 'none')});
  }

  // ── Import d'image : redimensionnée et compressée dans le navigateur avant l'envoi ──
  var drop=document.getElementById('drop'), fileIn=document.getElementById('drop-file'), status=document.getElementById('drop-status');
  function say(msg){ status.textContent=msg||''; status.classList.toggle('on',!!msg); }
  function compress(file){
    return createImageBitmap(file).then(function(img){
      var max=2400, k=Math.min(1, max/Math.max(img.width,img.height));
      var cv=document.createElement('canvas'); cv.width=Math.round(img.width*k); cv.height=Math.round(img.height*k);
      cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
      return new Promise(function(res){ cv.toBlob(function(b){res(b||file)},'image/jpeg',0.86); });
    }).catch(function(){ return file; });
  }
  function upload(file){
    if(!file) return;
    if(!/^image\\/(jpeg|png|webp|avif)$/.test(file.type)){ say('Formats acceptés : JPG, PNG, WebP, AVIF'); return; }
    drop.classList.add('has'); say('Envoi…');
    document.getElementById('drop-img').src=URL.createObjectURL(file);
    compress(file).then(function(blob){
      var fd=new FormData(); fd.append('file', blob, 'fond.jpg');
      return fetch('/link/upload',{method:'POST',body:fd}).then(function(r){return r.json()});
    }).then(function(d){
      if(d.error){ say(d.error); return; }
      form.t_bgImage.value=d.url; say(''); sync(); refresh();
    }).catch(function(){ say("L'envoi a échoué, réessaie."); });
  }
  document.querySelectorAll('[data-pick]').forEach(function(b){b.addEventListener('click',function(){fileIn.click()})});
  fileIn.addEventListener('change',function(){ upload(fileIn.files[0]); fileIn.value=''; });
  ['dragenter','dragover'].forEach(function(ev){drop.addEventListener(ev,function(e){e.preventDefault();drop.classList.add('over')})});
  ['dragleave','drop'].forEach(function(ev){drop.addEventListener(ev,function(e){e.preventDefault();drop.classList.remove('over')})});
  drop.addEventListener('drop',function(e){ upload(e.dataTransfer.files[0]); });
  document.getElementById('drop-remove').addEventListener('click',function(){
    form.t_bgImage.value=''; drop.classList.remove('has'); document.getElementById('drop-img').src='data:,'; sync(); refresh();
  });
  form.addEventListener('input',function(){sync();later();});
  form.addEventListener('change',function(){sync();later();});
  document.querySelectorAll('.preset').forEach(function(b){
    b.addEventListener('click',function(){
      var t=JSON.parse(b.dataset.preset);
      Object.keys(t).forEach(function(k){
        var name=k==='accent'?'accent':'t_'+k, els=form.querySelectorAll('[name="'+name+'"]');
        els.forEach(function(el){ if(el.type==='radio') el.checked=(el.value===String(t[k])); else el.value=t[k]; });
      });
      document.querySelectorAll('.preset').forEach(function(x){x.classList.toggle('on',x===b)});
      sync(); refresh();
    });
  });
  document.querySelectorAll('[data-pv]').forEach(function(b){
    b.addEventListener('click',function(){
      document.querySelectorAll('[data-pv]').forEach(function(x){x.classList.toggle('on',x===b)});
      phone.classList.toggle('desktop',b.dataset.pv==='desktop'); fit();
    });
  });
  // ── Autres liens ──
  var list=document.getElementById('clinks'), tpl=document.getElementById('clink-tpl'), iconIn=document.getElementById('icon-file'), cStatus=document.getElementById('clink-status'), iconRow=null, MAX=${MAX_CUSTOM_LINKS};
  function changed(){ form.dispatchEvent(new Event('change',{bubbles:true})); limit(); }
  function limit(){ var full=list.children.length>=MAX; document.querySelectorAll('.idea').forEach(function(b){b.disabled=full}); cStatus.textContent=full?'Maximum '+MAX+' liens.':''; }
  document.querySelectorAll('.idea').forEach(function(b){
    b.addEventListener('click',function(){
      if(list.children.length>=MAX) return;
      var row=tpl.content.firstElementChild.cloneNode(true); list.appendChild(row);
      var t=row.querySelector('[name=c_title]'); t.value=b.dataset.idea; (b.dataset.idea?row.querySelector('[name=c_url]'):t).focus(); changed();
    });
  });
  list.addEventListener('click',function(e){
    var row=e.target.closest('.clink'); if(!row) return;
    if(e.target.closest('[data-remove]')){ row.remove(); changed(); return; }
    var mv=e.target.closest('[data-move]');
    if(mv){ var sib=mv.dataset.move==='-1'?row.previousElementSibling:row.nextElementSibling; if(sib){ mv.dataset.move==='-1'?list.insertBefore(row,sib):list.insertBefore(sib,row); changed(); } return; }
    if(e.target.closest('.icon-x')){ row.querySelector('[name=c_icon]').value=''; row.querySelector('.icon-pick').classList.remove('has'); changed(); return; }
    if(e.target.closest('.icon-pick')){ iconRow=row; iconIn.click(); }
  });
  // Icône : recadrée en carré 256 px (PNG pour garder la transparence) puis envoyée
  function squareIcon(file){
    return createImageBitmap(file).then(function(img){
      var side=Math.min(img.width,img.height), size=Math.min(256,side), cv=document.createElement('canvas'); cv.width=cv.height=size;
      cv.getContext('2d').drawImage(img,(img.width-side)/2,(img.height-side)/2,side,side,0,0,size,size);
      return new Promise(function(res){ cv.toBlob(function(b){res(b||file)},'image/png'); });
    }).catch(function(){ return file; });
  }
  iconIn.addEventListener('change',function(){
    var file=iconIn.files[0], row=iconRow; iconIn.value=''; if(!file||!row) return;
    var pick=row.querySelector('.icon-pick'); pick.classList.add('busy'); cStatus.textContent="Envoi de l’icône…";
    squareIcon(file).then(function(blob){
      var fd=new FormData(); fd.append('file',blob,'icone.png'); fd.append('kind','icon');
      return fetch('/link/upload',{method:'POST',body:fd}).then(function(r){return r.json()});
    }).then(function(d){
      pick.classList.remove('busy');
      if(d.error){ cStatus.textContent=d.error; return; }
      row.querySelector('[name=c_icon]').value=d.url; pick.querySelector('img').src=d.url; pick.classList.add('has'); cStatus.textContent=''; changed();
    }).catch(function(){ pick.classList.remove('busy'); cStatus.textContent="L'envoi a échoué, réessaie."; });
  });
  limit();

  window.addEventListener('resize',fit);
  sync(); fit(); refresh();
})();
`;

// ───────────── Réglages pixel ─────────────
export function settingsPage(user: User, msg?: { err?: string; ok?: string }) {
  const body = h`<main class="page" style="max-width:760px">
    <div class="head"><div><h1>Pixel Meta</h1><p class="muted" style="margin:6px 0 0">Appliqué à tous tes smart links.</p></div></div>
    ${flash(msg)}
    <form method="post" class="card panel">
      <div class="field"><label>ID du pixel (jeu de données)</label><input name="pixel_id" value="${user.pixel_id ?? ''}" placeholder="123456789012345" pattern="[0-9]{8,20}"><div class="hint">Gestionnaire d'événements Meta → Sources de données → ton pixel → Paramètres.</div></div>
      <div class="field"><label>Token d'accès Conversions API</label><input name="capi_token" type="password" value="${user.capi_token ?? ''}" placeholder="EAAB…" autocomplete="off"><div class="hint">Même page → « Conversions API » → « Générer un token d'accès ».</div></div>
      <div class="field"><label>Code d'événement test (facultatif)</label><input name="test_event_code" value="${user.test_event_code ?? ''}" placeholder="TEST12345"><div class="hint">Pour vérifier la réception dans l'onglet « Tester les événements ». Vide-le une fois les tests terminés.</div></div>
      <button class="btn lg">Enregistrer</button>
    </form>
    <div class="card panel" style="margin-top:18px">
      <h2>Événements envoyés</h2>
      <table class="table">
        <tr><td><b>PageView</b> — ouverture du smart link</td><td>standard</td></tr>
        ${PLATFORMS.map((p) => h`<tr><td><b>${p.event}</b> — clic vers ${p.name}</td><td>personnalisé</td></tr>`)}
        <tr><td><b>Click_Custom</b> — clic sur un autre lien (billetterie, merch…), avec son titre</td><td>personnalisé</td></tr>
      </table>
      <p class="hint">Chaque événement part du navigateur (pixel) et du serveur (Conversions API) avec le même event_id : Meta dédoublonne. Crée une conversion personnalisée sur <b>Click_Spotify</b> pour optimiser tes campagnes sur les clics Spotify. Les événements ne sont envoyés qu'après acceptation des cookies par le fan.</p>
    </div>
  </main>`;
  return shell(user, 'Pixel Meta', body, 'settings');
}
