import { Card } from '../components/ui';
export default function ComingSoon({ title, phase, note }: { title: string; phase: number; note: string }) {
  return <div className="space-y-4"><h1 className="text-xl font-semibold">{title}</h1>
    <Card><p className="text-sm">Not built yet — planned for Phase {phase}.</p><p className="mt-1 text-sm text-muted">{note}</p></Card></div>;
}
