import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { useEffect, useRef } from 'react';
import type { Biz } from '../lib/discovery';

const ICON = L.divIcon({ className: '', iconSize: [14, 14],
  html: '<span style="display:block;width:14px;height:14px;border-radius:50%;background:#00ADEF;border:2px solid #fff"></span>' });

export default function MapView({ rows }: { rows: Biz[] }) {
  const el = useRef<HTMLDivElement>(null); const map = useRef<L.Map | null>(null); const group = useRef<L.MarkerClusterGroup | null>(null);
  useEffect(() => {
    const m = L.map(el.current!, { worldCopyJump: true }).setView([20, 0], 2);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(m);
    const g = L.markerClusterGroup(); m.addLayer(g); map.current = m; group.current = g;
    return () => { m.remove(); map.current = null; group.current = null; };
  }, []);
  useEffect(() => {
    const g = group.current, m = map.current; if (!g || !m) return;
    g.clearLayers(); const pts: L.LatLngTuple[] = [];
    for (const r of rows) {
      if (r.latitude === null || r.longitude === null) continue; // never invent coordinates
      const box = document.createElement('div');
      const b = document.createElement('strong'); b.textContent = r.name; // business data is untrusted: text nodes only
      const s = document.createElement('div'); s.textContent = [r.category, r.city].filter(Boolean).join(' · ');
      box.append(b, s);
      g.addLayer(L.marker([r.latitude, r.longitude], { icon: ICON }).bindPopup(box)); pts.push([r.latitude, r.longitude]);
    }
    if (pts.length) m.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 15 });
  }, [rows]);
  const mapped = rows.filter((r) => r.latitude !== null && r.longitude !== null).length;
  return (<div className="space-y-2"><div ref={el} className="h-[60vh] w-full overflow-hidden rounded-xl border border-line" role="application" aria-label="Map of results" />
    <p className="text-xs text-muted">{mapped} of {rows.length} results have coordinates. Map tiles © OpenStreetMap contributors.</p></div>);
}
