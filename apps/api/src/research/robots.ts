function matches(pattern: string, path: string): boolean {
  if (pattern.length > 200 || (pattern.match(/\*/g)?.length ?? 0) > 5) return false;
  const anchored = pattern.endsWith('$'); const p = anchored ? pattern.slice(0, -1) : pattern;
  return new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + (anchored ? '$' : '')).test(path);
}

/** Minimal robots.txt evaluation: most specific user-agent group wins, then longest matching rule (Allow wins ties). */
export function robotsAllows(txt: string, path: string, ua = 'prospectos-research'): boolean {
  type G = { agents: string[]; rules: { allow: boolean; pattern: string }[] };
  const groups: G[] = []; let cur: G | null = null; let lastAgent = false;
  for (const raw of txt.slice(0, 500_000).split(/\r?\n/)) {
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(raw.replace(/#.*/, '').trim());
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') { if (!cur || !lastAgent) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); lastAgent = true; }
    else { lastAgent = false; if ((k === 'allow' || k === 'disallow') && cur && v) cur.rules.push({ allow: k === 'allow', pattern: v }); }
  }
  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && ua.toLowerCase().includes(a)));
  const use = specific.length ? specific : groups.filter((g) => g.agents.includes('*'));
  let best: { len: number; allow: boolean } | null = null;
  for (const g of use) for (const r of g.rules) if (matches(r.pattern, path)) {
    const len = r.pattern.length;
    if (!best || len > best.len || (len === best.len && r.allow)) best = { len, allow: r.allow };
  }
  return best ? best.allow : true;
}
