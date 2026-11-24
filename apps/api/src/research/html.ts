// Static HTML extraction only. Scripts are never executed; everything here is treated as untrusted text.
export interface Page {
  title: string | null; lang: string | null; meta: Record<string, string>; canonical: string | null;
  headings: { level: number; text: string }[]; links: { href: string; text: string; rel: string }[]; images: { alt: string | null }[];
  forms: number; hasNav: boolean; buttons: string[]; scriptSrcs: string[]; inlineScriptBytes: number; jsonLdTypes: string[]; text: string; wordCount: number;
}
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s: string) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' '; }
  return ENT[e.toLowerCase()] ?? m;
});
const collapse = (s: string) => decode(s).replace(/\s+/g, ' ').trim();

function attrsOf(s: string): Record<string, string> {
  const out: Record<string, string> = {}; const re = /([^\s=\/"'<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g; let m: RegExpExecArray | null; let n = 0;
  while ((m = re.exec(s)) && n++ < 60) out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  return out;
}
function stripComments(html: string): string {
  let out = '', pos = 0;
  for (;;) { const s = html.indexOf('<!--', pos); if (s === -1) return out + html.slice(pos); out += html.slice(pos, s); const e = html.indexOf('-->', s + 4); if (e === -1) return out; pos = e + 3; }
}
function extractRaw(html: string, tag: string) { // linear scan; avoids regex backtracking on hostile input
  const lower = html.toLowerCase(); const open = `<${tag}`, close = `</${tag}`; const items: { attrs: string; content: string }[] = []; let out = '', pos = 0;
  while (items.length < 500) {
    const s = lower.indexOf(open, pos); if (s === -1) break;
    const nx = lower[s + open.length];
    if (nx && !/[\s>\/]/.test(nx)) { out += html.slice(pos, s + open.length); pos = s + open.length; continue; }
    const gt = html.indexOf('>', s); if (gt === -1) break;
    const e = lower.indexOf(close, gt);
    items.push({ attrs: html.slice(s + open.length, gt), content: html.slice(gt + 1, Math.min(e === -1 ? html.length : e, gt + 200_001)) });
    out += html.slice(pos, s);
    const g2 = e === -1 ? -1 : html.indexOf('>', e); pos = g2 === -1 ? html.length : g2 + 1;
  }
  return { rest: out + html.slice(pos), items };
}

const MAX_TAG = 6000;
function scanTag(s: string, start: number): { end: number; closing: boolean; name: string; attrs: string } | null {
  let i = start + 1; const closing = s[i] === '/'; if (closing) i++;
  const ns = i; const c0 = s.charCodeAt(i);
  if (!((c0 >= 65 && c0 <= 90) || (c0 >= 97 && c0 <= 122))) return null;
  while (i < s.length) { const c = s.charCodeAt(i); if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 45) i++; else break; }
  const name = s.slice(ns, i).toLowerCase(); const as = i; const limit = Math.min(s.length, start + MAX_TAG); let q = '';
  for (; i < limit; i++) {
    const c = s[i];
    if (q) { if (c === q) q = ''; } else if (c === '"' || c === "'") q = c; else if (c === '>') return { end: i + 1, closing, name, attrs: s.slice(as, i) }; else if (c === '<') return null;
  }
  return null;
}

export function parseHtml(input: string): Page {
  const scripts = extractRaw(stripComments(input), 'script');
  const styles = extractRaw(scripts.rest, 'style'); const body = extractRaw(styles.rest, 'noscript').rest;
  const page: Page = { title: null, lang: null, meta: {}, canonical: null, headings: [], links: [], images: [], forms: 0, hasNav: false, buttons: [], scriptSrcs: [], inlineScriptBytes: 0, jsonLdTypes: [], text: '', wordCount: 0 };
  for (const s of scripts.items) {
    const a = attrsOf(s.attrs);
    if (a.src) page.scriptSrcs.push(a.src.slice(0, 300));
    else if ((a.type ?? '').includes('ld+json')) { try { const walk = (v: unknown) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { const o = v as Record<string, unknown>; for (const t of [o['@type']].flat()) if (typeof t === 'string' && page.jsonLdTypes.length < 30) page.jsonLdTypes.push(t); walk(o['@graph']); } }; walk(JSON.parse(s.content)); } catch { /* invalid JSON-LD is ignored */ } }
    else page.inlineScriptBytes += s.content.length;
  }
  type Cap = { tag: string; attrs: Record<string, string>; text: string };
  let caps: Cap[] = []; const textParts: string[] = []; let textLen = 0;
  const finalize = (c: Cap) => {
    const t = collapse(c.text).slice(0, 300);
    if (c.tag === 'title') page.title ??= t;
    else if (c.tag === 'a' && c.attrs.href !== undefined && page.links.length < 500) page.links.push({ href: c.attrs.href.slice(0, 500), text: t, rel: (c.attrs.rel ?? '').toLowerCase() });
    else if (c.tag === 'button' && page.buttons.length < 100) page.buttons.push(t);
    else if (/^h[1-6]$/.test(c.tag) && page.headings.length < 100) page.headings.push({ level: Number(c.tag[1]), text: t });
  };
  const pushText = (t: string) => { if (textLen < 200_000) { textParts.push(t); textLen += t.length; } for (const c of caps) if (c.text.length < 400) c.text += t; };
  const handle = (closing: boolean, name: string, attrStr: string) => {
    if (closing) { const i = caps.map((c) => c.tag).lastIndexOf(name); if (i >= 0) { finalize(caps[i]); caps.splice(i, 1); } return; }
    const a = attrsOf(attrStr);
    if (name === 'html') page.lang = a.lang ?? null;
    else if (name === 'meta') { const k = (a.name ?? a.property ?? a['http-equiv'] ?? '').toLowerCase(); if (k && a.content !== undefined) page.meta[k] ??= a.content.slice(0, 500); }
    else if (name === 'link') { if ((a.rel ?? '').toLowerCase().split(/\s+/).includes('canonical')) page.canonical = a.href ?? null; }
    else if (name === 'img') { if (page.images.length < 1000) page.images.push({ alt: a.alt ?? null }); }
    else if (name === 'form') page.forms++;
    else if (name === 'nav' || a.role === 'navigation') page.hasNav = true;
    if (name === 'title' || name === 'a' || name === 'button' || /^h[1-6]$/.test(name)) { if (caps.length >= 8) finalize(caps.shift()!); caps.push({ tag: name, attrs: a, text: '' }); }
  };
  // Hand-written linear scanner: regex tag matching backtracks quadratically on inputs like "<a <a <a ...".
  let i = 0; const n = body.length;
  while (i < n) {
    const lt = body.indexOf('<', i);
    if (lt === -1) { pushText(body.slice(i)); break; }
    if (lt > i) pushText(body.slice(i, lt));
    const tag = scanTag(body, lt);
    if (!tag) { pushText('<'); i = lt + 1; continue; }
    handle(tag.closing, tag.name, tag.attrs); i = tag.end;
  }
  caps.forEach(finalize); caps = [];
  page.text = collapse(textParts.join(' ')).slice(0, 200_000);
  page.wordCount = page.text ? page.text.split(' ').length : 0;
  return page;
}
