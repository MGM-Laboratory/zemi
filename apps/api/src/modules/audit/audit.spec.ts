import type { AuditEntry } from '@zemi/shared';
import { describe, expect, it } from 'vitest';
import { redactAuditEntry } from './audit.service.js';

const entry = (action: string, meta: Record<string, unknown> | null): AuditEntry => ({
  id: 'a',
  actorType: 'admin',
  actorId: 'x',
  actorName: 'Rina',
  action,
  resourceType: null,
  resourceId: null,
  summary: 'Something happened',
  meta,
  ip: '203.0.113.9',
  createdAt: '2026-10-02T06:15:00.000Z',
});

describe('redactAuditEntry (non-superadmin readers)', () => {
  it('drops the IP, user agents and sign-in session ids', () => {
    const login = redactAuditEntry(entry('auth.login', { sessionId: 's1', userAgent: 'Mozilla/5.0' }));
    expect(login.ip).toBeNull();
    expect(login.meta).toBeNull();
    const revoke = redactAuditEntry(entry('session.revoke', { adminId: 'x', ip: '203.0.113.9', userAgent: 'curl' }));
    expect(revoke.meta).toEqual({ adminId: 'x' });
  });

  it('keeps stream session ids and everything else', () => {
    const rec = redactAuditEntry(entry('recording.delete', { sessionId: 'stream-session', assetDeleted: false }));
    expect(rec.meta).toEqual({ sessionId: 'stream-session', assetDeleted: false });
    expect(rec.summary).toBe('Something happened');
    expect(redactAuditEntry(entry('event.update', null)).meta).toBeNull();
  });
});
