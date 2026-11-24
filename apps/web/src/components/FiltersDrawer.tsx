import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { RESEARCH_OPTIONS, SINCE_OPTIONS, WEB_OPTIONS, type Filters } from '../lib/discovery';
import { Button, Input } from './ui';

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
const Group = ({ title, children, open }: { title: string; children: ReactNode; open?: boolean }) =>
  <details open={open} className="border-b border-line py-3"><summary className="cursor-pointer text-sm font-medium">{title}</summary><div className="mt-3 space-y-2 text-sm">{children}</div></details>;
const Check = ({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) =>
  <label className="flex min-h-8 items-center gap-2"><input type="checkbox" checked={checked} onChange={onChange} />{label}</label>;

export default function FiltersDrawer({ filters: f, onChange, sources, onClose, onClear }:
  { filters: Filters; onChange: (f: Filters) => void; sources: { name: string; label: string }[]; onClose: () => void; onClear: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Advanced filters" className="fixed inset-0 z-20 flex justify-end bg-black/60" onClick={onClose}>
      <div className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-surface p-4 pb-[env(safe-area-inset-bottom)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between"><h2 className="text-lg font-semibold">Advanced filters</h2>
          <button onClick={onClose} aria-label="Close filters"><X className="h-5 w-5" /></button></div>
        <p className="text-xs text-muted">Website, rating, review and contact filters are applied when searching and when listing results. Other filters only refine the results list.</p>
        <Group title="Website status" open>
          {WEB_OPTIONS.map(([v, l]) => <Check key={v} label={l} checked={f.websiteStatus.includes(v)} onChange={() => onChange({ ...f, websiteStatus: toggle(f.websiteStatus, v) })} />)}
          <p className="text-xs text-muted">"No website found" means no listing had one. It is not proof that none exists. Research verifies it later.</p></Group>
        <Group title="Ratings and reviews">
          <label className="block"><span className="text-muted">Minimum rating (0–5)</span><Input type="number" min={0} max={5} step={0.1} value={f.minRating} onChange={(e) => onChange({ ...f, minRating: e.target.value })} /></label>
          <label className="block"><span className="text-muted">Minimum review count</span><Input type="number" min={0} value={f.minReviewCount} onChange={(e) => onChange({ ...f, minReviewCount: e.target.value })} /></label>
          <p className="text-xs text-muted">At search time, places with no rating are kept. In the results list, setting a minimum hides unrated places (all OpenStreetMap places are unrated).</p></Group>
        <Group title="Contact availability">
          <Check label="Public phone number available" checked={f.hasPhone} onChange={() => onChange({ ...f, hasPhone: !f.hasPhone })} />
          <Check label="Public email available" checked={f.hasEmail} onChange={() => onChange({ ...f, hasEmail: !f.hasEmail })} /></Group>
        <Group title="Research status">
          {RESEARCH_OPTIONS.map(([v, l]) => <Check key={v} label={l} checked={f.researchStatus.includes(v)} onChange={() => onChange({ ...f, researchStatus: toggle(f.researchStatus, v) })} />)}</Group>
        <Group title="Discovery source">
          {sources.map((s) => <Check key={s.name} label={s.label} checked={f.provider.includes(s.name)} onChange={() => onChange({ ...f, provider: toggle(f.provider, s.name) })} />)}</Group>
        <Group title="Date discovered">
          <select aria-label="Date discovered" value={f.since} onChange={(e) => onChange({ ...f, since: e.target.value })} className="min-h-10 w-full rounded-lg border border-line bg-card px-2">
            {SINCE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Group>
        <Group title="Digital presence (needs research)"><p className="text-muted">Mobile usability, performance, missing booking or ordering and similar filters need website research, which is built in Phase 3.</p></Group>
        <Group title="AI opportunity (needs scoring)"><p className="text-muted">Opportunity score and recommended-service filters arrive with Phase 4 scoring.</p></Group>
        <div className="mt-4 flex gap-2"><Button variant="ghost" onClick={onClear}>Clear all</Button><Button className="flex-1" onClick={onClose}>Show results</Button></div>
      </div>
    </div>
  );
}
