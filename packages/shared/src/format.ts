/** Mask an email for display to people without registrations.view: r***a@gmail.com */
export function maskEmail(email: string): string {
  const [user = '', domain = ''] = email.split('@');
  if (!domain) return '***';
  const head = user.slice(0, 1);
  const tail = user.length > 2 ? user.slice(-1) : '';
  return `${head}***${tail}@${domain}`;
}

/** Mask a phone number: +62 ••• ••• 4821 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '••••';
  return `••• ${digits.slice(-4)}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

/** Extract a QR token from a scanned payload (full ticket URL or raw token). */
export function parseTicketPayload(payload: string): string | null {
  const s = payload.trim();
  const m = s.match(/\/t(?:ickets)?\/([A-Za-z0-9_-]{16,64})/);
  if (m) return m[1]!;
  if (/^[A-Za-z0-9_-]{16,64}$/.test(s)) return s;
  const code = s.match(/^ZM-[A-Z0-9]{6}$/i);
  if (code) return s.toUpperCase();
  return null;
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}
