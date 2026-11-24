import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, ErrorBox, Field, Input } from '../components/ui';
import { api } from '../lib/api';

export default function Login() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const nav = useNavigate(); const qc = useQueryClient();
  const m = useMutation({ mutationFn: () => api('/api/auth/login', { method: 'POST', body: { email, password } }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['me'] }); nav('/'); } });
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };
  return (
    <div className="grid min-h-screen place-items-center p-4">
      <Card className="w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold">Prospect<span className="text-accent">OS</span></h1>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Email"><Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Password"><Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          {m.isError && <ErrorBox error={m.error} />}
          <Button type="submit" className="w-full" disabled={m.isPending}>{m.isPending ? 'Signing in…' : 'Sign in'}</Button>
        </form>
      </Card>
    </div>
  );
}
