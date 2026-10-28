import { h, json, layout, raw } from '../html';
import { PLATFORM_BY_KEY, hostOf, iconTile, parsePlatforms } from '../platforms';
import { fontHref, parseTheme, themeVars } from '../theme';
import { parseCustomLinks } from '../custom-links';
import type { Link } from '../types';

// Toute l'apparence passe par des variables CSS posées par le thème (src/theme.ts)
const CSS = `
body{background:var(--page-bg);background-attachment:fixed;color:var(--ink);font-family:var(--font-body);min-height:100vh}
body.bg-photo::before{content:"";position:fixed;inset:var(--ph-inset);background:var(--photo) center/cover no-repeat;filter:var(--ph-filter);z-index:-2}
body.bg-photo::after{content:"";position:fixed;inset:0;background:var(--ph-overlay);z-index:-1}
h1,.cell .name{font-family:var(--font-head)}
.wrap{max-width:1120px;margin:0 auto;padding:56px 32px 96px;display:grid;grid-template-columns:320px 1fr;gap:56px;align-items:start}
.side{position:sticky;top:56px}
.art{width:100%;aspect-ratio:1;border-radius:calc(var(--r) + 6px);object-fit:cover;background:var(--chip);box-shadow:0 24px 60px -24px rgba(0,0,0,.55)}
.side h1{font-size:30px;font-weight:800;margin-top:24px;line-height:1.1}
.side .artist{font-size:17px;color:var(--ink-soft);margin-top:6px;font-weight:500}
.badge{display:inline-flex;align-items:center;gap:6px;margin-top:16px;padding:6px 12px;border-radius:999px;background:var(--chip);font-size:13px;font-weight:600}
.badge i{width:8px;height:8px;border-radius:50%;background:var(--accent);display:inline-block}
.section-title{font-size:14px;font-weight:700;margin:6px 0 14px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.cell{position:relative;display:flex;flex-direction:column;justify-content:space-between;min-height:168px;padding:18px;border-radius:var(--r);color:var(--card-ink);transition:transform .15s ease,box-shadow .15s ease,background .15s ease}
.cell:hover{transform:translateY(-2px)}
.cell .name{font-weight:600;font-size:15px;margin-top:14px}
.cell .host{font-size:12px;color:var(--card-ink-soft)}
.cell .cta{position:absolute;top:18px;right:18px;font-size:12px;font-weight:600;padding:6px 12px;border-radius:999px;background:var(--card-chip);color:var(--card-ink)}
.cell.wide{grid-column:span 2}
.cell.wide .name{font-size:20px;font-weight:700}
.ctile{width:40px;height:40px;background:var(--accent);color:var(--accent-ink);font-size:17px;overflow:hidden}
.ctile.img{background:#fff;box-shadow:inset 0 0 0 1px rgba(15,23,42,.08)}
.ctile img{width:100%;height:100%;object-fit:cover;display:block}
.tile{display:inline-flex;align-items:center;justify-content:center;border-radius:calc(var(--r) * .55);color:#fff;font-weight:800}

/* ── Styles de cartes ── */
.card-outline .cell{background:transparent;border:1px solid color-mix(in srgb,var(--ink) 14%,transparent)}
.card-outline .cell:hover{box-shadow:0 12px 30px -16px rgba(0,0,0,.35)}
.card-solid .cell{background:var(--card-color);border:1px solid transparent}
.card-solid .cell:hover{box-shadow:0 12px 30px -16px rgba(0,0,0,.45)}
.card-glass .cell{-webkit-backdrop-filter:blur(18px) saturate(160%);backdrop-filter:blur(18px) saturate(160%);box-shadow:0 8px 32px rgba(0,0,0,.12)}
.card-glass.ink-light .cell{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.28)}
.card-glass.ink-dark .cell{background:rgba(255,255,255,.55);border:1px solid rgba(255,255,255,.7)}
.card-glass .cell:hover{background:rgba(255,255,255,.2)}
.card-shadow .cell{background:var(--card-color);border:2px solid #111;box-shadow:5px 5px 0 #111}
.card-shadow .cell:hover{transform:translate(-2px,-2px);box-shadow:7px 7px 0 #111}
.card-glow .cell{background:var(--card-color);border:1px solid var(--accent);box-shadow:0 0 22px -6px var(--accent),inset 0 0 18px -12px var(--accent)}
.card-glow .cell:hover{box-shadow:0 0 34px -4px var(--accent),inset 0 0 18px -10px var(--accent)}
.card-minimal .cell{background:transparent;border:0;border-bottom:1px solid color-mix(in srgb,var(--ink) 16%,transparent);border-radius:0;box-shadow:none}
.card-minimal .cell:hover{transform:none;background:color-mix(in srgb,var(--ink) 4%,transparent)}

/* ── Disposition liste (façon Linktree) ── */
.layout-list .wrap{grid-template-columns:1fr;max-width:580px;gap:28px}
.layout-list .side{position:static;text-align:center}
.layout-list .art{max-width:240px;margin:0 auto;display:block}
.layout-list .grid{grid-template-columns:1fr;gap:12px}
.layout-list .section-title{text-align:center}
.layout-list .cell{flex-direction:row;align-items:center;min-height:0;padding:12px 14px}
.layout-list .cell>div:first-child{display:flex;align-items:center;gap:14px}
.layout-list .cell .name{margin-top:0;font-size:16px}
.layout-list .cell .host{display:none}
.layout-list .cell .cta{position:static;margin-left:auto}
.layout-list .foot{text-align:center}

.foot{margin-top:40px;font-size:12px;color:var(--ink-soft)}
.consent{position:fixed;left:16px;right:16px;bottom:16px;max-width:520px;margin:0 auto;padding:18px;background:#fff;color:#0f172a;border:1px solid #e5e7eb;border-radius:18px;box-shadow:0 20px 50px -20px rgba(15,23,42,.4);font-size:13px;display:none;z-index:10;font-family:Inter,sans-serif}
.consent p{margin:0 0 12px;color:#334155}
.consent .row{display:flex;gap:8px;justify-content:flex-end}
.consent .btn{height:36px;font-size:13px}
@media (max-width:900px){
 .wrap{grid-template-columns:1fr;gap:28px;padding:28px 16px 120px}
 .side{position:static;text-align:center}
 .art{max-width:260px;margin:0 auto;display:block}
 .side h1{font-size:26px}
 .grid{grid-template-columns:1fr 1fr;gap:12px}
 .layout-list .grid{grid-template-columns:1fr}
 .cell{min-height:140px;padding:16px}
 .layout-list .cell{min-height:0}
 .cell .cta{top:16px;right:16px}
}
`;

export type PublicOpts = {
  pixelId: string | null;
  source: string;
  appName: string;
  preview?: boolean; // aperçu dans l'éditeur : pas de tracking, pas de navigation
};

export function publicPage(link: Link, opts: PublicOpts) {
  const theme = parseTheme(link.theme);
  const vars = themeVars(theme, link.accent, link.artwork_url);
  const platforms = parsePlatforms(link.platforms);
  const q = `?s=${encodeURIComponent(opts.source)}`;
  const bento = theme.layout === 'bento';

  const cells = platforms.map((lp, i) => {
    const p = PLATFORM_BY_KEY[lp.key];
    const wide = bento && i === 0;
    return h`<a class="cell${wide ? ' wide' : ''}" href="/l/go/${link.slug}/${p.key}${q}" data-event="${p.event}" data-platform="${p.key}" rel="nofollow">
      <div>${raw(iconTile(p, wide ? 48 : 40))}<div class="name">${wide ? `${p.cta} sur ${p.name}` : p.name}</div></div>
      <span class="cta">${p.cta}</span>
      <div class="host">${hostOf(lp.url)}</div>
    </a>`;
  });

  const customs = parseCustomLinks(link.custom_links).map(
    (cl) => h`<a class="cell" href="/l/go/${link.slug}/c-${cl.id}${q}" data-event="Click_Custom" data-platform="custom:${cl.id}" data-label="${cl.title}" rel="nofollow noopener">
      <div>${cl.icon ? h`<span class="tile ctile img"><img src="${cl.icon}" alt="" loading="lazy"></span>` : h`<span class="tile ctile">${[...cl.title][0]?.toUpperCase() ?? '•'}</span>`}<div class="name">${cl.title}</div></div>
      <span class="cta">Ouvrir</span>
      <div class="host">${hostOf(cl.url)}</div>
    </a>`,
  );

  const body = h`
  <main class="wrap">
    <aside class="side">
      ${link.artwork_url ? h`<img class="art" src="${link.artwork_url}" alt="${link.title}">` : h`<div class="art"></div>`}
      <h1>${link.title}</h1>
      <div class="artist">${link.artist}</div>
      <div class="badge"><i></i>Disponible maintenant</div>
    </aside>
    <section>
      <div class="section-title">Écouter</div>
      <div class="grid">${cells}</div>
      ${customs.length ? h`<div class="section-title" style="margin-top:28px">Plus</div><div class="grid">${customs}</div>` : ''}
      <div class="foot">Créé avec ${opts.appName}</div>
    </section>
  </main>
  ${opts.pixelId && !opts.preview ? h`<div class="consent" id="consent">
    <p>On utilise des cookies (Meta) pour mesurer l'efficacité de la promotion de cette sortie. Tu peux refuser, le lien fonctionnera pareil.</p>
    <div class="row"><button class="btn ghost" data-consent="denied">Refuser</button><button class="btn" data-consent="granted">Accepter</button></div>
  </div>` : ''}
  <script>window.MML=${json({ slug: link.slug, pixel: opts.preview ? null : opts.pixelId, preview: Boolean(opts.preview) })};</script>
  <script>${raw(CLIENT_JS)}</script>`;

  return layout({
    title: `${link.title} — ${link.artist}`,
    css: CSS,
    body,
    bodyClass: vars.classes,
    bodyStyle: vars.style,
    head: h`${theme.font !== 'inter' ? h`<link href="${fontHref(theme)}" rel="stylesheet">` : ''}
<meta name="theme-color" content="${theme.bg === 'cover' ? '#0b0b10' : theme.bg1}">
<meta property="og:title" content="${link.title} — ${link.artist}">
<meta property="og:type" content="music.song">
${link.artwork_url ? h`<meta property="og:image" content="${link.artwork_url}">` : ''}
<meta name="twitter:card" content="summary_large_image">`,
  });
}

// Script de la page publique : consentement, pixel Meta, événements de clic (dédoublonnés avec la CAPI via eventID)
const CLIENT_JS = `
(function(){
  var M = window.MML, COOKIE = 'mml_consent';
  function getC(n){var m=document.cookie.match(new RegExp('(?:^|; )'+n+'=([^;]*)'));return m?decodeURIComponent(m[1]):null}
  function setC(n,v,days){document.cookie=n+'='+v+'; Max-Age='+days*86400+'; Path=/; SameSite=Lax'}
  function uid(){return (crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random()).replace(/-/g,'')}
  var granted = function(){return getC(COOKIE)==='granted'};

  function fbc(){
    var c=getC('_fbc'); if(c) return c;
    var id=new URLSearchParams(location.search).get('fbclid');
    if(id){ c='fb.1.'+Date.now()+'.'+id; setC('_fbc',c,90); return c; }
    return null;
  }

  function loadPixel(){
    if(!M.pixel || window.fbq) return;
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', M.pixel);
    var eid = uid();
    fbq('track','PageView',{}, {eventID: eid});
    fbc();
    // Laisse le pixel poser _fbp avant l'envoi serveur
    setTimeout(function(){
      fetch('/l/t',{method:'POST',keepalive:true,headers:{'content-type':'application/json'},
        body:JSON.stringify({slug:M.slug,event:'PageView',eventId:eid,url:location.href,fbp:getC('_fbp'),fbc:fbc()})});
    }, 1200);
  }

  var banner = document.getElementById('consent');
  if(M.pixel){
    var state = getC(COOKIE);
    if(state==='granted') loadPixel();
    else if(!state && banner) banner.style.display='block';
  }
  document.querySelectorAll('[data-consent]').forEach(function(b){
    b.addEventListener('click', function(){
      setC(COOKIE, b.dataset.consent, 180);
      banner.style.display='none';
      if(b.dataset.consent==='granted') loadPixel();
    });
  });

  // Clic plateforme : événement pixel + même eventID transmis au serveur pour la CAPI
  document.querySelectorAll('a[data-event]').forEach(function(a){
    a.addEventListener('click', function(e){
      if(M.preview){ e.preventDefault(); return; }
      if(e.metaKey||e.ctrlKey) return;
      e.preventDefault();
      var eid = uid(), href = a.getAttribute('href')+'&eid='+eid+(getC('_fbp')?'&fbp='+encodeURIComponent(getC('_fbp')):'');
      if(granted() && window.fbq) fbq('trackCustom', a.dataset.event, {platform:a.dataset.platform, link_title:a.dataset.label||undefined, content_name: document.title}, {eventID:eid});
      setTimeout(function(){ location.href = href; }, 180);
    });
  });

})();
`;
