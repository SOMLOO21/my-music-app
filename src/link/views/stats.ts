import { h, raw, type Safe } from '../html';
import { PLATFORM_BY_KEY, iconTile } from '../platforms';
import { SOURCE_GROUPS } from '../sources';
import type { User } from '../types';
import { shell } from './app';

export type LinkRow = {
  id: string;
  slug: string;
  title: string;
  artist: string;
  artwork_url: string | null;
  views: number;
  clicks: number;
  spotify: number;
  appleMusic: number;
  deezer: number;
  custom: number;
};

export type GlobalStats = {
  views: number;
  clicks: number;
  platforms: { key: string; n: number }[];
  customs: { title: string; release: string; n: number }[];
  sources: { key: string; views: number; clicks: number }[];
  daily: { day: string; views: number; clicks: number }[];
  links: LinkRow[];
};

type Slice = { label: string; value: number; color: string; icon?: string };

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 1000) / 10 : 0).toLocaleString('fr-FR');
const fmt = (n: number) => n.toLocaleString('fr-FR');

/** Camembert (anneau) SVG : 2px d'écart blanc entre les parts, total au centre, info-bulle au survol. */
function donut(slices: Slice[], centerLabel: string): Safe {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const R = 90, r = 58, C = 100;
  if (!total) {
    return h`<svg viewBox="0 0 200 200" class="donut" role="img" aria-label="Aucune donnée"><circle cx="100" cy="100" r="74" fill="none" stroke="#f1f5f9" stroke-width="32"/>
      <text x="100" y="104" text-anchor="middle" class="d-sub">Pas encore de données</text></svg>`;
  }
  let a0 = -Math.PI / 2;
  const paths = slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const tip = `${s.label} · ${fmt(s.value)} (${pct(s.value, total)} %)`;
      if (s.value === total) {
        return h`<circle cx="${C}" cy="${C}" r="${(R + r) / 2}" fill="none" stroke="${s.color}" stroke-width="${R - r}" data-tip="${tip}" class="seg"/>`;
      }
      const a1 = a0 + (s.value / total) * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (rad: number, a: number) => `${(C + rad * Math.cos(a)).toFixed(2)} ${(C + rad * Math.sin(a)).toFixed(2)}`;
      const d = `M ${p(R, a0)} A ${R} ${R} 0 ${large} 1 ${p(R, a1)} L ${p(r, a1)} A ${r} ${r} 0 ${large} 0 ${p(r, a0)} Z`;
      a0 = a1;
      return h`<path d="${d}" fill="${s.color}" stroke="#fff" stroke-width="2" stroke-linejoin="round" data-tip="${tip}" class="seg"/>`;
    });
  return h`<svg viewBox="0 0 200 200" class="donut" role="img" aria-label="${centerLabel} : ${slices.map((s) => `${s.label} ${pct(s.value, total)} %`).join(', ')}">
    ${paths}
    <text x="100" y="98" text-anchor="middle" class="d-num">${fmt(total)}</text>
    <text x="100" y="118" text-anchor="middle" class="d-sub">${centerLabel}</text>
  </svg>`;
}

const CSS = `
.stats{grid-template-columns:repeat(3,1fr)}
.filters{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.filters select{width:auto;min-width:220px;height:40px}
.seg-btns{display:inline-flex;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#fff}
.seg-btns a{padding:0 14px;height:38px;display:flex;align-items:center;font-size:14px;font-weight:600;color:#475569}
.seg-btns a.on{background:var(--fg);color:#fff}
.pies{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px}
.pie{display:grid;grid-template-columns:200px 1fr;gap:24px;align-items:center}
.donut{width:200px;height:200px;display:block}
.donut .seg{cursor:default;transition:opacity .15s}
.donut:hover .seg{opacity:.45}
.donut .seg:hover{opacity:1}
.d-num{font:800 28px Inter,sans-serif;fill:var(--fg);letter-spacing:-.03em}
.d-sub{font:500 11px Inter,sans-serif;fill:var(--muted)}
.leg{width:100%;border-collapse:collapse;font-size:14px}
.leg th{font-size:12px;font-weight:600;color:var(--muted);text-align:right;padding:0 0 8px 12px}
.leg th:first-child{text-align:left}
.leg td{padding:8px 0 8px 12px;border-top:1px solid #f1f5f9;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.leg td:first-child,.leg th:first-child{text-align:left;padding-left:0}
.leg .lab{display:flex;align-items:center;gap:8px;font-weight:500;white-space:nowrap}
.sw{width:10px;height:10px;border-radius:3px;flex:none}
.leg .p{color:var(--muted)}
.links-table{width:100%;border-collapse:collapse;font-size:14px}
.links-table th{font-size:12px;font-weight:600;color:var(--muted);text-align:right;padding:0 8px 10px}
.links-table th:first-child{text-align:left;padding-left:0}
.links-table td{padding:10px 8px;border-top:1px solid #f1f5f9;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.links-table td:first-child{text-align:left;padding-left:0;white-space:normal}
.lk{display:flex;align-items:center;gap:12px;min-width:200px}
.lk img,.lk .ph{width:40px;height:40px;border-radius:10px;object-fit:cover;background:#f1f5f9;flex:none}
.lk b{display:block;font-size:14px}
.mini{display:flex;align-items:center;gap:8px;justify-content:flex-end}
.mini .bar{width:90px;height:8px;background:#f1f5f9;border-radius:99px;overflow:hidden}
.mini .bar i{display:block;height:100%;background:var(--fg);border-radius:99px}
.scroll{overflow-x:auto}
.daily{display:flex;align-items:flex-end;gap:3px;height:170px;border-bottom:1px solid var(--line)}
.daily .d{flex:1;display:flex;gap:2px;align-items:flex-end;height:100%}
.daily .d span{flex:1;border-radius:4px 4px 0 0;min-height:2px}
.daily .d:hover span{filter:brightness(.85)}
.axis{display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:6px}
#tip{position:fixed;pointer-events:none;background:#0f172a;color:#fff;font-size:12px;font-weight:500;padding:6px 10px;border-radius:8px;opacity:0;transition:opacity .1s;z-index:50;white-space:nowrap}
@media (max-width:1100px){.pies{grid-template-columns:1fr}}
@media (max-width:560px){.stats{grid-template-columns:1fr}.pie{grid-template-columns:1fr;justify-items:center}.filters select{min-width:0;width:100%}}
`;

export function globalStatsPage(user: User, s: GlobalStats, opts: { days: number; linkId: string; allLinks: { id: string; title: string; artist: string }[] }) {
  const ctr = s.views ? ((s.clicks / s.views) * 100).toFixed(1).replace('.', ',') : '0';
  const qs = (o: Record<string, string | number>) => '?' + new URLSearchParams({ days: String(opts.days), link: opts.linkId, ...Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)])) });

  const platformSlices: Slice[] = ['spotify', 'appleMusic', 'deezer'].map((k) => {
    const p = PLATFORM_BY_KEY[k];
    return { label: p.name, value: s.platforms.find((x) => x.key === k)?.n ?? 0, color: p.color, icon: iconTile(p, 22) };
  });
  const customTotal = s.platforms.find((x) => x.key === 'custom')?.n ?? 0;
  if (customTotal) platformSlices.push({ label: 'Autres liens', value: customTotal, color: '#64748b', icon: '<span class="tile" style="background:#64748b;width:22px;height:22px;font-size:12px">+</span>' });
  const sourceSlices: Slice[] = SOURCE_GROUPS.map((g) => ({ label: g.label, value: s.sources.find((x) => x.key === g.key)?.views ?? 0, color: g.color }));
  const sourceClicks = (label: string) => s.sources.find((x) => SOURCE_GROUPS.find((g) => g.key === x.key)?.label === label)?.clicks ?? 0;

  const legend = (slices: Slice[], total: number, extra?: (sl: Slice) => string) => h`<table class="leg">
    <tr><th></th><th>Nombre</th><th>%</th>${extra ? h`<th>Clics</th>` : ''}</tr>
    ${slices
      .filter((x) => x.value > 0 || !extra)
      .map(
        (x) => h`<tr><td><span class="lab">${x.icon ? raw(x.icon) : h`<i class="sw" style="background:${x.color}"></i>`}${x.label}</span></td>
          <td><b>${fmt(x.value)}</b></td><td class="p">${pct(x.value, total)} %</td>${extra ? h`<td>${extra(x)}</td>` : ''}</tr>`,
      )}
  </table>`;

  const maxClicks = Math.max(1, ...s.links.map((l) => l.clicks));
  const maxDay = Math.max(1, ...s.daily.map((d) => Math.max(d.views, d.clicks)));
  const totalSourceViews = sourceSlices.reduce((a, b) => a + b.value, 0);
  const totalPlatformClicks = platformSlices.reduce((a, b) => a + b.value, 0);
  const dayLabel = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

  const body = h`<main class="page">
    <div class="head">
      <div><h1>Statistiques</h1><p class="muted" style="margin:6px 0 0">Ouvertures, clics par plateforme et provenance de tes fans.</p></div>
      <form class="filters" method="get">
        <input type="hidden" name="days" value="${opts.days}">
        <select name="link" onchange="this.form.submit()" aria-label="Smart link">
          <option value="all">Tous les smart links</option>
          ${opts.allLinks.map((l) => h`<option value="${l.id}" ${l.id === opts.linkId ? raw('selected') : ''}>${l.title} — ${l.artist}</option>`)}
        </select>
        <div class="seg-btns">${[7, 30, 90].map((d) => h`<a href="${qs({ days: d })}" class="${d === opts.days ? 'on' : ''}">${d} j</a>`)}</div>
      </form>
    </div>

    <div class="stats">
      <div class="card stat"><b>${fmt(s.views)}</b><span>Ouvertures du smart link</span></div>
      <div class="card stat"><b>${fmt(s.clicks)}</b><span>Clics vers les plateformes</span></div>
      <div class="card stat"><b>${ctr} %</b><span>Taux de clic</span></div>
    </div>

    <div class="pies">
      <div class="card panel">
        <h2>Plateforme cliquée</h2>
        <div class="pie">${donut(platformSlices, 'clics')}${legend(platformSlices, totalPlatformClicks)}</div>
        ${
          s.customs.length
            ? h`<h2 style="margin:22px 0 10px;font-size:15px">Autres liens</h2><table class="leg">
            <tr><th></th><th>Clics</th></tr>
            ${s.customs.map((c) => h`<tr><td><span class="lab">${c.title}${opts.linkId === 'all' && c.release ? h`<span class="muted small" style="font-weight:400">· ${c.release}</span>` : ''}</span></td><td><b>${fmt(c.n)}</b></td></tr>`)}
          </table>`
            : ''
        }
      </div>
      <div class="card panel">
        <h2>D'où viennent les ouvertures</h2>
        <div class="pie">${donut(sourceSlices, 'ouvertures')}${
          totalSourceViews ? legend(sourceSlices, totalSourceViews, (x) => fmt(sourceClicks(x.label))) : h`<p class="muted small">Pas encore de données.</p>`
        }</div>
        <p class="hint" style="margin-top:14px">Pub Meta = clic sur une pub (fbclid). Instagram / Facebook / TikTok = lien en bio, story ou post (détecté par le navigateur de l'app). Pour être sûr, ajoute <code>?utm_source=instagram</code> à ton lien.</p>
      </div>
    </div>

    <div class="card panel" style="margin-top:16px">
      <h2>Par smart link</h2>
      ${
        s.links.length
          ? h`<div class="scroll"><table class="links-table">
        <tr><th>Smart link</th><th>Ouvertures</th><th>Clics</th><th>Taux</th>
          ${['spotify', 'appleMusic', 'deezer'].map((k) => h`<th title="Clics ${PLATFORM_BY_KEY[k].name}" aria-label="Clics ${PLATFORM_BY_KEY[k].name}">${raw(iconTile(PLATFORM_BY_KEY[k], 20))}</th>`)}<th title="Clics sur les autres liens">Autres</th></tr>
        ${s.links.map(
          (l) => h`<tr>
            <td><a class="lk" href="${qs({ link: l.id })}">${l.artwork_url ? h`<img src="${l.artwork_url}" alt="">` : h`<span class="ph"></span>`}<span><b>${l.title}</b><span class="muted small">/${l.slug}</span></span></a></td>
            <td>${fmt(l.views)}</td>
            <td><span class="mini"><b>${fmt(l.clicks)}</b><span class="bar"><i style="width:${(l.clicks / maxClicks) * 100}%"></i></span></span></td>
            <td>${l.views ? Math.round((l.clicks / l.views) * 100) : 0} %</td>
            <td>${fmt(l.spotify)}</td><td>${fmt(l.appleMusic)}</td><td>${fmt(l.deezer)}</td><td>${fmt(l.custom)}</td>
          </tr>`,
        )}
      </table></div>`
          : h`<p class="muted small">Aucun smart link pour l'instant.</p>`
      }
    </div>

    <div class="card panel" style="margin-top:16px">
      <h2>Ouvertures et clics par jour</h2>
      <div class="daily">${s.daily.map(
        (d) => h`<div class="d" data-tip="${dayLabel(d.day)} · ${d.views} ouvertures · ${d.clicks} clics">
          <span style="background:#2a78d6;height:${(d.views / maxDay) * 100}%"></span>
          <span style="background:#eb6834;height:${(d.clicks / maxDay) * 100}%"></span>
        </div>`,
      )}</div>
      <div class="axis"><span>${dayLabel(s.daily[0].day)}</span><span>${dayLabel(s.daily[s.daily.length - 1].day)}</span></div>
      <div class="legend"><span><i style="background:#2a78d6"></i>Ouvertures</span><span><i style="background:#eb6834"></i>Clics</span></div>
    </div>
  </main>
  <div id="tip"></div>
  <script>
    (function(){var t=document.getElementById('tip');
      document.addEventListener('mousemove',function(e){var el=e.target.closest&&e.target.closest('[data-tip]');
        if(!el){t.style.opacity=0;return}
        t.textContent=el.getAttribute('data-tip');t.style.opacity=1;
        var x=Math.min(e.clientX+14,window.innerWidth-t.offsetWidth-8);t.style.left=x+'px';t.style.top=(e.clientY+14)+'px';});
    })();
  </script>`;
  return shell(user, 'Statistiques', body, 'stats', CSS);
}
