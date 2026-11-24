import { BlockList, isIP } from 'node:net';

export class UnsafeUrlError extends Error {
  code: string;
  constructor(message: string) { super(message); this.code = 'unsafe_url'; }
}

const bl = new BlockList();
for (const [a, p] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24],
  ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]] as [string, number][]) bl.addSubnet(a, p, 'ipv4');
for (const [a, p] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32], ['64:ff9b::', 96], ['100::', 64], ['2002::', 16], ['2001::', 32]] as [string, number][]) bl.addSubnet(a, p, 'ipv6');

/** True for loopback, private, link-local (incl. cloud metadata 169.254.169.254), CGNAT, multicast and reserved ranges.
 *  Anything unparseable is treated as blocked. */
export function isBlockedIp(ip: string): boolean {
  const s = ip.replace(/^\[|\]$/g, '').split('%')[0];
  const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(s);
  if (dotted) return isBlockedIp(dotted[1]);
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(s);
  if (hex) { const hi = parseInt(hex[1], 16), lo = parseInt(hex[2], 16); return isBlockedIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`); }
  const fam = isIP(s);
  return fam === 0 ? true : bl.check(s, fam === 4 ? 'ipv4' : 'ipv6');
}

export interface Guard { isBlockedIp: (ip: string) => boolean; allowedPorts: number[] | null; allowLocalNames: boolean }
export const DEFAULT_GUARD: Guard = { isBlockedIp, allowedPorts: [80, 443, 8080, 8443], allowLocalNames: false };

export function validateUrl(raw: string, guard: Guard = DEFAULT_GUARD): URL {
  let u: URL;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { throw new UnsafeUrlError('Invalid URL'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new UnsafeUrlError('Only http and https URLs are allowed');
  if (u.username || u.password) throw new UnsafeUrlError('URLs with credentials are not allowed');
  const port = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80;
  if (guard.allowedPorts && !guard.allowedPorts.includes(port)) throw new UnsafeUrlError(`Port ${port} is not allowed`);
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
  if (!host) throw new UnsafeUrlError('Missing host');
  if (isIP(host)) { if (guard.isBlockedIp(host)) throw new UnsafeUrlError('Address is not allowed'); }
  else if (!guard.allowLocalNames && (host === 'localhost' || !host.includes('.') || /\.(localhost|local|internal|lan|home|corp|intranet)$/.test(host))) throw new UnsafeUrlError('Host is not allowed');
  u.hash = '';
  return u;
}
