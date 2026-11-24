import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');

export function Button({ variant = 'primary', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const v = { primary: 'bg-accent text-base hover:bg-accent/90', ghost: 'border border-line text-ink hover:bg-surface', danger: 'border border-warm/50 text-warm hover:bg-warm/10' }[variant];
  return <button {...p} className={cx('inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition disabled:opacity-50', v, className)} />;
}
export const Card = ({ className, children }: { className?: string; children: ReactNode }) =>
  <div className={cx('rounded-xl border border-line bg-card p-4', className)}>{children}</div>;
export const Spinner = () => <Loader2 className="h-5 w-5 animate-spin text-accent" aria-label="Loading" />;
export const ErrorBox = ({ error }: { error: unknown }) =>
  <div role="alert" className="rounded-lg border border-warm/40 bg-warm/10 p-3 text-sm text-warm">{error instanceof Error ? error.message : 'Something went wrong'}</div>;
export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'accent' | 'warm' | 'success' }) {
  const t = { muted: 'bg-surface text-muted', accent: 'bg-accent/15 text-accent', warm: 'bg-warm/15 text-warm', success: 'bg-success/15 text-success' }[tone];
  return <span className={cx('inline-block rounded-full px-2 py-0.5 text-xs', t)}>{children}</span>;
}
export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) =>
  <input {...p} className={cx('min-h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted', className)} />;
export const Field = ({ label, error, children }: { label: string; error?: string; children: ReactNode }) =>
  <label className="block text-sm"><span className="mb-1 block text-muted">{label}</span>{children}{error && <span role="alert" className="mt-1 block text-xs text-warm">{error}</span>}</label>;
export const scoreTone = (s: number | null) => (s === null ? 'muted' : s >= 65 ? 'success' : s >= 45 ? 'accent' : 'warm') as 'muted' | 'accent' | 'warm' | 'success';
