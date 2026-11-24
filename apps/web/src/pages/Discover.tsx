import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Map as MapIcon, Plus, Search, SlidersHorizontal, Table2, X } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import FiltersDrawer from '../components/FiltersDrawer';
import { Badge, Button, Card, ErrorBox, Input, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { buildPayload, chips, emptyFilters, resultsParams, safeHref, summary, TERMINAL, type Biz, type Job, type Provider, type SearchForm } from '../lib/discovery';
import { websiteLabel } from '../lib/status';

const MapView = lazy(() => import('../components/MapView')); // keeps Leaflet out of the main bundle

const INITIAL: SearchForm = { categories: [], keywords: '', locations: [''], radius: 10, unit: 'km', providers: [], limit: 100, autoResearch: true, filters: emptyFilters };
const COLS: { key: string; label: string; sort?: string; cell: (b: Biz) => ReactNode }[] = [
  { key: 'name', label: 'Business', sort: 'name', cell: (b) => <><span className="font-medium">{b.name}</span>{b.lead_id && <> <Link to={`/leads/${b.lead_id}`}><Badge tone="accent">In leads</Badge></Link></>}{b.do_not_contact && <> <Badge tone="warm">Do not contact</Badge></>}</> },
  { key: 'category', label: 'Category', cell: (b) => b.category ?? 'n/a' },
  { key: 'location', label: 'Location', sort: 'city', cell: (b) => [b.city, b.country_code].filter(Boolean).join(', ') || 'Unknown' },
  { key: 'website', label: 'Website', cell: (b) => { const h = safeHref(b.website_url); return <>{websiteLabel(b.website_status)}{h && <> · <a href={h} target="_blank" rel="noopener noreferrer" className="text-accent">{new URL(h).hostname}</a></>}</>; } },
  { key: 'rating', label: 'Rating', sort: 'rating', cell: (b) => (b.rating === null ? 'n/a' : Number(b.rating).toFixed(1)) },
  { key: 'reviews', label: 'Reviews', sort: 'reviews', cell: (b) => b.review_count ?? 'n/a' },
  { key: 'contact', label: 'Contact', cell: (b) => (b.phone || b.email ? [b.phone && 'Phone', b.email && 'Email'].filter(Boolean).join(' + ') : 'None found') },
  { key: 'score', label: 'Score', cell: (b) => (b.opportunity_score ?? 'Not scored') },
  { key: 'research', label: 'Research', cell: (b) => b.research_status.replace('_', ' ') },
  { key: 'source', label: 'Source', cell: (b) => b.sources?.join(', ') ?? 'n/a' },
  { key: 'date', label: 'Discovered', sort: 'created', cell: (b) => new Date(b.created_at).toLocaleDateString() },
];
const load = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? '') as T; } catch { return d; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

export default function Discover() {
  const qc = useQueryClient();
  const [form, setForm] = useState<SearchForm>(INITIAL);
  const [drawer, setDrawer] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [scope, setScope] = useState<'job' | 'all'>('job');
  const [view, setView] = useState<'table' | 'map'>('table');
  const [page, setPage] = useState(1); const [sort, setSort] = useState('created'); const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [sel, setSel] = useState<Set<string>>(new Set()); const [notice, setNotice] = useState('');
  const [hidden, setHidden] = useState<string[]>(() => load('discover.hiddenCols', ['category', 'reviews', 'score']));
  const [recent, setRecent] = useState<{ label: string; form: SearchForm }[]>(() => load('discover.recent', []));
  const [saveName, setSaveName] = useState('');

  const providers = useQuery({ queryKey: ['providers'], queryFn: () => api<Provider[]>('/api/providers') });
  const cats = useQuery({ queryKey: ['categories'], queryFn: () => api<{ key: string; label: string }[]>('/api/discovery/categories') });
  const saved = useQuery({ queryKey: ['saved-searches'], queryFn: () => api<{ id: string; name: string; filters: ReturnType<typeof buildPayload> }[]>('/api/saved-searches') });
  const catLabels = useMemo(() => Object.fromEntries((cats.data?.data ?? []).map((c) => [c.key, c.label])), [cats.data]);
  const usable = (providers.data?.data ?? []).filter((p) => p.configured && p.enabled);
  useEffect(() => { if (providers.data && form.providers.length === 0) setForm((f) => ({ ...f, providers: usable.map((p) => p.name) })); }, [providers.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const job = useQuery({ queryKey: ['disc-job', jobId], enabled: !!jobId, queryFn: () => api<Job>(`/api/discovery/jobs/${jobId}`),
    refetchInterval: (q) => (q.state.data && TERMINAL.includes(q.state.data.data.status) ? false : 2000) });
  const running = !!job.data && !TERMINAL.includes(job.data.data.status);

  const pageSize = view === 'map' ? 200 : 25;
  const results = useQuery({
    queryKey: ['disc-results', scope, jobId, form.filters, page, sort, dir, pageSize],
    queryFn: () => { const p = resultsParams(form.filters); p.set('page', String(page)); p.set('pageSize', String(pageSize)); p.set('sort', sort); p.set('dir', dir);
      if (scope === 'job' && jobId) p.set('jobId', jobId); return api<Biz[]>(`/api/discovery/results?${p}`); },
    placeholderData: keepPreviousData, refetchInterval: running ? 3000 : false });
  useEffect(() => { if (job.data && TERMINAL.includes(job.data.data.status)) qc.invalidateQueries({ queryKey: ['disc-results'] }); }, [job.data?.data.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof SearchForm>(k: K, v: SearchForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const payload = buildPayload(form);
  const canSearch = (payload.categories.length > 0 || payload.keywords.length > 0) && payload.locations.length > 0 && form.providers.length > 0;
  const terms = Math.min(10, payload.categories.length + payload.keywords.length);
  const search = useMutation({ mutationFn: () => api<{ jobId: string }>('/api/discovery/search', { method: 'POST', body: payload }),
    onSuccess: (r) => { setJobId(r.data.jobId); setScope('job'); setPage(1); setSel(new Set()); setNotice('');
      const next = [{ label: summary(form, catLabels), form }, ...recent.filter((x) => x.label !== summary(form, catLabels))].slice(0, 5); setRecent(next); save('discover.recent', next); } });
  const control = useMutation({ mutationFn: (a: 'pause' | 'resume' | 'cancel') => api(`/api/discovery/jobs/${jobId}/${a}`, { method: 'POST' }), onSuccess: () => job.refetch() });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['disc-results'] }); qc.invalidateQueries({ queryKey: ['overview'] }); qc.invalidateQueries({ queryKey: ['leads'] }); setSel(new Set()); };
  const addLeads = useMutation({ mutationFn: () => api<{ added: number; skipped: number }>('/api/discovery/add-to-leads', { method: 'POST', body: { businessIds: [...sel] } }),
    onSuccess: (r) => { setNotice(`Added ${r.data.added} to leads. Skipped ${r.data.skipped} (already leads, excluded or do not contact).`); refresh(); } });
  const bulk = useMutation({ mutationFn: (action: 'exclude' | 'do_not_contact') => api('/api/businesses/bulk', { method: 'POST', body: { ids: [...sel], action } }), onSuccess: () => { setNotice('Updated.'); refresh(); } });
  const saveSearch = useMutation({ mutationFn: () => api('/api/saved-searches', { method: 'POST', body: { name: saveName, filters: payload } }), onSuccess: () => { setSaveName(''); saved.refetch(); } });
  const delSaved = useMutation({ mutationFn: (id: string) => api(`/api/saved-searches/${id}`, { method: 'DELETE' }), onSuccess: () => saved.refetch() });

  const loadSaved = (p: ReturnType<typeof buildPayload>) => setForm({ ...INITIAL, categories: p.categories, keywords: p.keywords.join(', '), providers: p.providers,
    locations: p.locations.map((l) => l.query), radius: p.locations[0]?.radiusKm ?? 10, unit: 'km', limit: p.limit, autoResearch: p.autoResearch,
    filters: { ...emptyFilters, ...(p.filters as Record<string, never>), minRating: String((p.filters as { minRating?: number }).minRating ?? ''), minReviewCount: String((p.filters as { minReviewCount?: number }).minReviewCount ?? ''), websiteStatus: ((p.filters as { websiteStatus?: string[] }).websiteStatus ?? []) } });

  const rows = results.data?.data ?? []; const total = results.data?.meta?.total ?? 0; const pages = Math.max(1, Math.ceil(total / pageSize));
  const cols = COLS.filter((c) => !hidden.includes(c.key));
  const active = chips(form.filters);
  const toggleSel = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const sortBy = (k: string) => { if (sort === k) setDir(dir === 'asc' ? 'desc' : 'asc'); else { setSort(k); setDir('asc'); } setPage(1); };
  const toggleCol = (k: string) => { const n = hidden.includes(k) ? hidden.filter((x) => x !== k) : [...hidden, k]; setHidden(n); save('discover.hiddenCols', n); };
  const setFilters = (filters: SearchForm['filters']) => { set('filters', filters); setPage(1); };
  const d = job.data?.data;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Discover</h1>
      <Card className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <details className="rounded-lg border border-line bg-surface"><summary className="min-h-10 cursor-pointer px-3 py-2 text-sm">Categories {form.categories.length > 0 && `(${form.categories.length})`}</summary>
              <div className="grid max-h-60 gap-1 overflow-y-auto p-3 text-sm sm:grid-cols-2">{(cats.data?.data ?? []).map((c) => (
                <label key={c.key} className="flex min-h-8 items-center gap-2"><input type="checkbox" checked={form.categories.includes(c.key)}
                  onChange={() => set('categories', form.categories.includes(c.key) ? form.categories.filter((x) => x !== c.key) : [...form.categories, c.key])} />{c.label}</label>))}</div></details>
            <Input aria-label="Custom keywords" placeholder="Custom keywords, comma separated (e.g. vegan, tattoo)" value={form.keywords} onChange={(e) => set('keywords', e.target.value)} />
          </div>
          <div className="space-y-2">
            {form.locations.map((l, i) => (
              <div key={i} className="flex gap-2"><Input aria-label={`Location ${i + 1}`} placeholder="City, region or country (e.g. Lisbon, Portugal)" value={l}
                onChange={(e) => set('locations', form.locations.map((x, j) => (j === i ? e.target.value : x)))} />
                {form.locations.length > 1 && <button aria-label="Remove location" onClick={() => set('locations', form.locations.filter((_, j) => j !== i))}><X className="h-4 w-4 text-muted" /></button>}</div>))}
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {form.locations.length < 10 && <Button variant="ghost" className="min-h-9" onClick={() => set('locations', [...form.locations, ''])}><Plus className="h-4 w-4" />Add location</Button>}
              <label className="flex items-center gap-1 text-muted">Radius <Input type="number" min={1} max={50} className="w-20" value={form.radius} onChange={(e) => set('radius', Number(e.target.value) || 1)} /></label>
              <select aria-label="Distance unit" value={form.unit} onChange={(e) => set('unit', e.target.value as 'km' | 'mi')} className="min-h-10 rounded-lg border border-line bg-surface px-2"><option value="km">km</option><option value="mi">mi</option></select>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {(providers.data?.data ?? []).map((p) => { const ok = p.configured && p.enabled; return (
            <label key={p.name} className={`flex items-center gap-2 ${ok ? '' : 'text-muted'}`} title={p.coverageNote}>
              <input type="checkbox" disabled={!ok} checked={form.providers.includes(p.name)} onChange={() => set('providers', form.providers.includes(p.name) ? form.providers.filter((x) => x !== p.name) : [...form.providers, p.name])} />
              {p.label}{!p.configured && ' (no API key)'}{p.configured && !p.enabled && ' (disabled)'}</label>); })}
          <select aria-label="Result limit" value={form.limit} onChange={(e) => set('limit', Number(e.target.value))} className="min-h-10 rounded-lg border border-line bg-surface px-2">
            {[25, 50, 100, 250, 500].map((n) => <option key={n} value={n}>Up to {n} per provider</option>)}</select>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.autoResearch} onChange={(e) => set('autoResearch', e.target.checked)} />Queue new businesses for research</label>
        </div>
        {form.autoResearch && <p className="text-xs text-muted">Businesses are marked "queued". Research itself is built in Phase 3, so they wait until then.</p>}
        {form.providers.includes('foursquare') && terms > 0 && <p className="text-xs text-muted">Estimated workload: up to {payload.locations.length * terms} Foursquare calls{form.providers.includes('openstreetmap') ? ` and ${payload.locations.length} Overpass request(s)` : ''}. Free tiers have limits.</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={!canSearch || search.isPending || running} onClick={() => search.mutate()}><Search className="h-4 w-4" />{search.isPending ? 'Starting…' : 'Search'}</Button>
          <Button variant="ghost" onClick={() => setDrawer(true)}><SlidersHorizontal className="h-4 w-4" />Advanced filters{active.length > 0 && ` (${active.length})`}</Button>
        </div>
        {canSearch && <p className="text-sm text-muted">{summary(form, catLabels)}</p>}
        {search.isError && <ErrorBox error={search.error} />}
        <details className="text-sm"><summary className="cursor-pointer text-muted">Saved and recent searches</summary>
          <div className="mt-2 space-y-2">
            {(saved.data?.data ?? []).map((s) => <div key={s.id} className="flex items-center justify-between gap-2"><button className="text-left text-accent" onClick={() => loadSaved(s.filters)}>{s.name}</button>
              <button aria-label={`Delete saved search ${s.name}`} onClick={() => delSaved.mutate(s.id)}><X className="h-4 w-4 text-muted" /></button></div>)}
            {recent.map((r, i) => <button key={i} className="block text-left text-muted hover:text-ink" onClick={() => setForm(r.form)}>Recent: {r.label}</button>)}
            <div className="flex gap-2"><Input aria-label="Saved search name" placeholder="Name this search" value={saveName} onChange={(e) => setSaveName(e.target.value)} />
              <Button variant="ghost" disabled={!canSearch || !saveName.trim() || saveSearch.isPending} onClick={() => saveSearch.mutate()}>Save</Button></div>
            {saveSearch.isError && <ErrorBox error={saveSearch.error} />}</div></details>
      </Card>

      {d && <Card className="space-y-2 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">Search job: {d.status}{running && ` (${d.completed_tasks + d.failed_tasks}/${d.total_tasks} providers done)`} · {d.businesses_found} businesses</span>
          <span className="flex gap-2">{(d.status === 'running' || d.status === 'pending') && <Button variant="ghost" className="min-h-8" onClick={() => control.mutate('pause')}>Pause</Button>}
            {d.status === 'paused' && <Button variant="ghost" className="min-h-8" onClick={() => control.mutate('resume')}>Resume</Button>}
            {!TERMINAL.includes(d.status) && <Button variant="danger" className="min-h-8" onClick={() => control.mutate('cancel')}>Cancel</Button>}</span></div>
        <ul className="space-y-1 text-muted">{Object.entries(d.error_details?.providers ?? {}).map(([n, p]) => <li key={n}>{n}: {p.status === 'ok' ? `${p.fetched} fetched` : `failed (${p.error})`}</li>)}
          {d.error_details?.skipped?.map((s) => <li key={s.name}>{s.name}: skipped ({s.reason})</li>)}</ul>
        {d.error_details?.counts && <p className="text-muted">New {d.error_details.counts.created} · merged duplicates {d.error_details.counts.merged} · already known {d.error_details.counts.existing} · flagged for duplicate review {d.error_details.counts.review}</p>}
        {d.error_details?.error && <ErrorBox error={new Error(d.error_details.error)} />}
        {!!d.error_details?.warnings?.length && <details><summary className="cursor-pointer text-warm">{d.error_details.warnings.length} warning(s)</summary><ul className="mt-1 list-disc pl-5 text-muted">{d.error_details.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details>}
      </Card>}

      <div className="flex flex-wrap items-center gap-2">
        {active.map((c) => <button key={c.id} onClick={() => setFilters(c.clear(form.filters))} className="flex items-center gap-1 rounded-full bg-accent/15 px-3 py-1 text-xs text-accent" aria-label={`Remove filter ${c.label}`}>{c.label}<X className="h-3 w-3" /></button>)}
        {active.length > 0 && <button className="text-xs text-muted underline" onClick={() => setFilters(emptyFilters)}>Clear all</button>}
        <span className="ml-auto text-sm text-muted">{total} result{total === 1 ? '' : 's'}</span>
        {jobId && <select aria-label="Result scope" value={scope} onChange={(e) => { setScope(e.target.value as 'job' | 'all'); setPage(1); }} className="min-h-9 rounded-lg border border-line bg-surface px-2 text-sm"><option value="job">This search</option><option value="all">All discovered</option></select>}
        <div className="flex rounded-lg border border-line" role="group" aria-label="View">
          <button aria-pressed={view === 'table'} aria-label="List view" onClick={() => { setView('table'); setPage(1); }} className={`px-3 py-2 ${view === 'table' ? 'bg-accent/15 text-accent' : 'text-muted'}`}><Table2 className="h-4 w-4" /></button>
          <button aria-pressed={view === 'map'} aria-label="Map view" onClick={() => { setView('map'); setPage(1); }} className={`px-3 py-2 ${view === 'map' ? 'bg-accent/15 text-accent' : 'text-muted'}`}><MapIcon className="h-4 w-4" /></button></div>
        {view === 'table' && <details className="relative text-sm"><summary className="cursor-pointer rounded-lg border border-line px-3 py-2 text-muted">Columns</summary>
          <div className="absolute right-0 z-10 mt-1 w-44 space-y-1 rounded-lg border border-line bg-surface p-3">{COLS.map((c) => <label key={c.key} className="flex items-center gap-2"><input type="checkbox" checked={!hidden.includes(c.key)} disabled={c.key === 'name'} onChange={() => toggleCol(c.key)} />{c.label}</label>)}</div></details>}
      </div>

      {sel.size > 0 && <Card className="flex flex-wrap items-center gap-2 py-3"><span className="text-sm">{sel.size} selected</span>
        <Button disabled={addLeads.isPending} onClick={() => addLeads.mutate()}>Add to leads</Button>
        <Button variant="ghost" disabled={bulk.isPending} onClick={() => bulk.mutate('exclude')}>Exclude from future results</Button>
        <Button variant="danger" disabled={bulk.isPending} onClick={() => confirm(`Mark ${sel.size} business(es) as do-not-contact? They are added to the suppression list.`) && bulk.mutate('do_not_contact')}>Do not contact</Button>
        <Button variant="ghost" onClick={() => setSel(new Set())}>Clear</Button></Card>}
      {notice && <p role="status" className="text-sm text-success">{notice}</p>}
      {(addLeads.isError || bulk.isError) && <ErrorBox error={addLeads.error ?? bulk.error} />}
      {results.isPending && <Spinner />}
      {results.isError && <ErrorBox error={results.error} />}
      {results.isSuccess && rows.length === 0 && <Card><p className="text-sm text-muted">{jobId && running ? 'Waiting for providers…' : 'No results. Run a search, or loosen the filters.'}</p></Card>}

      {view === 'map' && rows.length > 0 && <><Suspense fallback={<Spinner />}><MapView rows={rows} /></Suspense>{total > rows.length && <p className="text-xs text-muted">Showing the first {rows.length} of {total} on the map. Narrow the filters to see the rest.</p>}</>}
      {view === 'table' && rows.length > 0 && (<>
        <div className="hidden overflow-x-auto rounded-xl border border-line md:block"><table className="w-full text-left text-sm"><thead className="bg-surface text-muted"><tr>
          <th className="w-10 p-3"><input type="checkbox" aria-label="Select all on page" checked={rows.every((r) => sel.has(r.id))} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} /></th>
          {cols.map((c) => <th key={c.key} className="p-3 font-medium">{c.sort ? <button onClick={() => sortBy(c.sort!)} aria-label={`Sort by ${c.label}`}>{c.label}{sort === c.sort ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}</button> : c.label}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">{rows.map((r) => <tr key={r.id} className="bg-card hover:bg-surface"><td className="p-3"><input type="checkbox" aria-label={`Select ${r.name}`} checked={sel.has(r.id)} onChange={() => toggleSel(r.id)} /></td>
            {cols.map((c) => <td key={c.key} className="p-3 text-muted first:text-ink">{c.cell(r)}</td>)}</tr>)}</tbody></table></div>
        <div className="grid gap-3 md:hidden">{rows.map((r) => <Card key={r.id} className="space-y-1 text-sm"><label className="flex items-start gap-2"><input type="checkbox" className="mt-1" aria-label={`Select ${r.name}`} checked={sel.has(r.id)} onChange={() => toggleSel(r.id)} />
          <span>{COLS[0].cell(r)}</span></label>
          <div className="text-xs text-muted">{[r.category, COLS[2].cell(r)].filter(Boolean).map((x, i) => <span key={i}>{i > 0 && ' · '}{x}</span>)}</div>
          <div className="text-xs text-muted">{COLS[3].cell(r)} · {COLS[6].cell(r)}</div></Card>)}</div>
        {total > pageSize && <div className="flex items-center justify-center gap-3 text-sm"><Button variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><span className="text-muted">Page {page} of {pages}</span><Button variant="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button></div>}</>)}
      <p className="text-xs text-muted">Bulk research and export are added in Phases 3 and 6. Source data: {(providers.data?.data ?? []).map((p) => p.label).join(', ')}.</p>
      {drawer && <FiltersDrawer filters={form.filters} onChange={setFilters} sources={(providers.data?.data ?? []).map((p) => ({ name: p.name, label: p.label }))} onClose={() => setDrawer(false)} onClear={() => setFilters(emptyFilters)} />}
    </div>
  );
}
