'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { RegistrationRow } from '@zemi/shared';
import { DoorOpen } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { Character } from '@/components/admin/characters/character';
import { Button } from '@/components/admin/ui/button';
import { Callout } from '@/components/admin/ui/feedback';
import { Field } from '@/components/admin/ui/field';
import { Input } from '@/components/admin/ui/input';
import { notify } from '@/components/admin/ui/toast';
import { Switch } from '@/components/admin/ui/toggles';
import { adminFetch, errorMessage, isApiError } from '@/lib/admin/api';
import { duplicateFrom, EMAIL_RE, type Duplicate } from '../add-registrant-dialog';
import { invalidatePeople, shortName } from '../lib';

/**
 * The fastest way to let someone in without a ticket: name, email, go. They get a seat
 * (source walk-in, in person) and are checked in on the spot. The form stays plain and quick;
 * the character cheers after it worked.
 */
export function QuickWalkIn({ eventId, device }: { eventId: string; device: string }) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dup, setDup] = useState<Duplicate | null>(null);
  const [saving, setSaving] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [cheer, setCheer] = useState(0);
  const nameRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFullName('');
    setEmail('');
    setPhone('');
    setErrors({});
    setDup(null);
    nameRef.current?.focus();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (fullName.trim().length < 2) errs.fullName = 'Tell us their name.';
    if (!EMAIL_RE.test(email.trim())) errs.email = 'That email looks off. Mind checking it?';
    setErrors(errs);
    setDup(null);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const row = await adminFetch<RegistrationRow>(`/admin/events/${eventId}/registrations`, {
        method: 'POST',
        body: { fullName: fullName.trim(), email: email.trim(), phone: phone.trim(), attendanceMode: 'in-person', source: 'walk-in', checkIn: true, sendEmail, notes: null },
      });
      void invalidatePeople(qc, eventId);
      notify.success(`${shortName(row.fullName)} is in. Welcome!`, { celebrate: 'arch', description: sendEmail ? 'A walk-in ticket is on its way to their inbox.' : undefined });
      setCheer((n) => n + 1);
      reset();
    } catch (err) {
      const d = duplicateFrom(err, fullName);
      if (d) setDup(d);
      else if (isApiError(err) && err.hasFieldErrors) setErrors(err.fieldErrors);
      else notify.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const checkInExisting = async () => {
    if (!dup) return;
    setCheckingIn(true);
    try {
      await adminFetch(`/admin/registrations/${dup.registrationId}/check-in`, { method: 'POST', body: { device } });
      void invalidatePeople(qc, eventId);
      notify.success(`${shortName(dup.fullName)} is in.`, { celebrate: 'arch' });
      setCheer((n) => n + 1);
      reset();
    } catch (err) {
      notify.error(err);
    } finally {
      setCheckingIn(false);
    }
  };

  return (
    <section aria-labelledby="walkin-title" className="rounded-[24px] border border-line bg-white p-4 sm:p-5">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 id="walkin-title" className="font-display text-xl font-extrabold tracking-[-0.02em]">
            Walk-in
          </h2>
          <p className="text-sm text-ink-3">No ticket? No problem. Add them and they are checked in.</p>
        </div>
        <Character shape="arch" mood={cheer ? 'cheer' : 'look'} follow size={44} replayKey={cheer} />
      </header>
      <form onSubmit={submit} className="space-y-3" noValidate>
        {dup ? (
          <Callout
            tone="yellow"
            title={`${shortName(dup.fullName)} already has a seat`}
            action={
              !dup.checkedIn ? (
                <Button size="sm" variant="primary" loading={checkingIn} onClick={() => void checkInExisting()}>
                  Check them in
                </Button>
              ) : undefined
            }
          >
            {dup.ticketCode ? `Ticket ${dup.ticketCode}. ` : ''}
            {dup.checkedIn ? 'They are already inside, too.' : 'No second ticket needed.'}
          </Callout>
        ) : null}
        <Field label="Full name" required error={errors.fullName}>
          <Input ref={nameRef} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="off" placeholder="Rina Sari" />
        </Field>
        <Field label="Email" required error={errors.email} hint="For the ticket, and next Friday's reminder.">
          <Input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" placeholder="rina@ui.ac.id" />
        </Field>
        <Field label="Phone" optional error={errors.phone}>
          <Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" placeholder="0812 3456 7890" mono />
        </Field>
        <Switch checked={sendEmail} onCheckedChange={setSendEmail} label="Email them a ticket" description="With the QR, for next time." size="sm" />
        <Button type="submit" variant="primary" fullWidth size="lg" loading={saving} icon={<DoorOpen />}>
          Add and check in
        </Button>
      </form>
    </section>
  );
}
