// Mini moteur de templates : tout ce qui est interpolé est échappé, sauf Safe/raw().
export class Safe {
  constructor(public s: string) {}
  toString() {
    return this.s;
  }
}

export const raw = (s: string) => new Safe(s);

export const esc = (v: unknown) =>
  String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function render(v: unknown): string {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Safe) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  return esc(v);
}

export function h(strings: TemplateStringsArray, ...vals: unknown[]): Safe {
  let out = strings[0];
  vals.forEach((v, i) => (out += render(v) + strings[i + 1]));
  return new Safe(out);
}

// JSON injectable sans risque dans un <script>
export const json = (v: unknown) => raw(JSON.stringify(v).replace(/</g, '\\u003c'));

const BASE_CSS = `
:root{--bg:#fff;--fg:#0f172a;--muted:#64748b;--line:#e5e7eb;--soft:#f8fafc;--card:#fff;--radius:22px;--accent:#111827}
*{box-sizing:border-box}
html,body{margin:0}
body{font-family:Inter,system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--fg);-webkit-font-smoothing:antialiased;line-height:1.45}
a{color:inherit;text-decoration:none}
h1,h2,h3{letter-spacing:-.02em;margin:0}
.muted{color:var(--muted)}
.small{font-size:13px}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:0 1px 2px rgba(15,23,42,.04)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:40px;padding:0 16px;border-radius:10px;border:1px solid var(--fg);background:var(--fg);color:#fff;font:600 14px Inter,sans-serif;cursor:pointer;white-space:nowrap}
.btn:hover{opacity:.9}
.btn.ghost{background:#fff;color:var(--fg);border-color:var(--line)}
.btn.ghost:hover{background:var(--soft);opacity:1}
.btn.danger{background:#fff;color:#dc2626;border-color:#fecaca}
.btn.lg{height:48px;padding:0 22px;font-size:15px;border-radius:12px}
input,select,textarea{width:100%;height:42px;padding:0 12px;border:1px solid var(--line);border-radius:10px;font:14px Inter,sans-serif;color:var(--fg);background:#fff}
input:focus,select:focus{outline:2px solid #c7d2fe;border-color:#818cf8}
input[type=color]{padding:4px;width:56px}
label{display:block;font-size:13px;font-weight:600;margin:0 0 6px}
.field{margin-bottom:16px}
.hint{font-size:12px;color:var(--muted);margin-top:6px}
.flash{padding:12px 16px;border-radius:12px;margin-bottom:20px;font-size:14px}
.flash.err{background:#fef2f2;color:#991b1b;border:1px solid #fecaca}
.flash.ok{background:#f0fdf4;color:#166534;border:1px solid #bbf7d0}
`;

export function layout(opts: { title: string; body: Safe; head?: Safe; bodyClass?: string; bodyStyle?: string; css?: string }) {
  return h`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${opts.title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>${raw(BASE_CSS)}${raw(opts.css ?? '')}</style>
${opts.head ?? ''}
</head>
<body class="${opts.bodyClass ?? ''}" style="${opts.bodyStyle ?? ''}">${opts.body}</body>
</html>`;
}
