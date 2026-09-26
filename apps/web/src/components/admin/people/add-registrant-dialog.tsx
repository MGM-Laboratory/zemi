'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { EventAdmin, EventAction, RegistrationRow } from '@zemi/shared';
import { DoorOpen, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/admin/ui/button';
import { Dialog } from '@/components/admin/ui/dialog';
import { Callout } from '@/components/admin/ui/feedback';
import { Field } from '@/components/admin/ui/field';
import { Input, Textarea } from '@/components/admin/ui/input';
import { notify } from '@/components/admin/ui/toast';
import { SegmentedControl, Switch } from '@/components/admin/ui/toggles';
import { adminFetch, errorMessage, isApiError } from '@/lib/admin/api';
import { invalidatePeople, MODE_LABEL, shortName } from './lib';

type Kind = 'admin' | 'walk-in';
export interface Duplicate {
  registrationId: string;
  fullName: string;
  ticketCode: string;
  checkedIn: boolean;
  message: string;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** A 409 from POST /admin/events/:id/registrations when the email already has an active seat. */
export function duplicateFrom(err: unknown, fallbackName: string): Duplicate | null {
  if (!isApiError(err) || !err.isConflict) return null;
  const d = (err.details ?? {}) as Partial<Duplicate>;
  if (!d.registrationId) return null;
  return { registrationId: d.registrationId, fullName: d.fullName ?? fallbackName, ticketCode: d.ticketCode ?? '', checkedIn: Boolean(d.checkedIn), message: err.message };
}

/**
 * "Add registrant": a manual add (needs registrations.manage) or a walk-in at the door
 * (attendance.manage is enough). Admin adds skip capacity and deadlines. An email that already
 * has a seat gets a friendly way out: open that person, or check them in instead.
 */
export function AddRegistrantDialog({
  open,
  onOpenChange,
  event,
  perms,
  defaultKind,
  onAdded,
  onOpenExisting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: EventAdmin;
  perms: ReadonlySet<EventAction>;
  defaultKind?: Kind;
  onAdded?: (row: RegistrationRow) => void;
  onOpenExisting?: (id: string, ticketCode: string) => void;
}) {
  const qc = useQueryClient();
  const canManual = perms.has('registrations.manage');
  const canDoor = perms.has('attendance.manage');
  const kinds: Kind[] = [...(canManual ? (['admin'] as const) : []), ...(canDoor ? (['walk-in'] as const) : [])];
  const initialKind: Kind = defaultKind && kinds.includes(defaultKind) ? defaultKind : (kinds[0] ?? 'admin');

  const [kind, setKind] = useState<Kind>(initialKind);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [mode, setMode] = useState<'in-person' | 'online'>(event.mode === 'online' ? 'online' : 'in-person');
  const [checkIn, setCheckIn] = useState(initialKind === 'walk-in');
  const [sendEmail, setSendEmail] = useState(true);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dup, setDup] = useState<Duplicate | null>(null);
  const [saving, setSaving] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);

  // Fresh form every time the dialog opens (adjusting state on a prop change, no effect needed).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setKind(initialKind);
      setFullName('');
      setEmail('');
      setPhone('');
      setMode(event.mode === 'online' ? 'online' : 'in-person');
      setCheckIn(initialKind === 'walk-in' && canDoor);
      setSendEmail(true);
      setNotes('');
      setErrors({});
      setDup(null);
    }
  }

  const changeKind = (k: Kind) => {
    setKind(k);
    if (k === 'walk-in') {
      setCheckIn(canDoor);
      setMode('in-person');
    }
  };

  const hybrid = event.mode === 'hybrid';
  const walkIn = kind === 'walk-in';

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
      const row = await adminFetch<RegistrationRow>(`/admin/events/${event.id}/registrations`, {
        method: 'POST',
        body: {
          fullName: fullName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          attendanceMode: walkIn ? 'in-person' : mode,
          source: kind,
          checkIn: canDoor ? checkIn : false,
          sendEmail,
          notes: notes.trim() || null,
        },
      });
      void invalidatePeople(qc, event.id);
      const checkedIn = canDoor && checkIn;
      notify.success(checkedIn ? `${shortName(row.fullName)} is in. Welcome!` : walkIn ? `Added ${shortName(row.fullName)} as a walk-in.` : `Added ${shortName(row.fullName)}.`, {
        celebrate: checkedIn ? 'arch' : 'circle',
        description: sendEmail ? 'Their ticket is on its way.' : undefined,
      });
      onAdded?.(row);
      onOpenChange(false);
    } catch (err) {
      const d = duplicateFrom(err, fullName);
      if (d) {
        setDup(d);
        return;
      }
      if (isApiError(err) && err.hasFieldErrors) setErrors(err.fieldErrors);
      else notify.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const checkInExisting = async () => {
    if (!dup) return;
    setCheckingIn(true);
    try {
      await adminFetch(`/admin/registrations/${dup.registrationId}/check-in`, { method: 'POST', body: { device: 'Studio (add registrant)' } });
      void invalidatePeople(qc, event.id);
      notify.success(`${shortName(dup.fullName)} is in.`, { celebrate: 'arch' });
      onOpenChange(false);
    } catch (err) {
      notify.error(err);
    } finally {
      setCheckingIn(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      accent={walkIn ? 'green' : 'blue'}
      dismissible={false}
      title={walkIn ? 'Add a walk-in' : 'Add someone by hand'}
      description={walkIn ? 'For people who showed up without a ticket. They get checked in right away.' : 'Skips the seat cap and the deadline. Handy for speakers, guests and late emails.'}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="zemi-add-registrant" loading={saving} icon={walkIn ? <DoorOpen /> : <UserPlus />}>
            {walkIn ? (checkIn ? 'Add and check in' : 'Add walk-in') : 'Add registrant'}
          </Button>
        </>
      }
    >
      <form id="zemi-add-registrant" onSubmit={submit} className="space-y-4" noValidate>
        {kinds.length > 1 ? (
          <SegmentedControl
            aria-label="Kind of registration"
            fullWidth
            value={kind}
            onValueChange={changeKind}
            options={[
              { value: 'admin', label: 'By hand' },
              { value: 'walk-in', label: 'Walk-in at the door' },
            ]}
          />
        ) : null}

        {dup ? (
          <Callout
            tone="yellow"
            title={`${shortName(dup.fullName)} already has a seat`}
            action={
              <div className="flex flex-col gap-1.5 sm:flex-row">
                {!dup.checkedIn && canDoor ? (
                  <Button size="sm" variant="primary" loading={checkingIn} onClick={() => void checkInExisting()}>
                    Check them in
                  </Button>
                ) : null}
                {onOpenExisting ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      onOpenExisting(dup.registrationId, dup.ticketCode);
                      onOpenChange(false);
                    }}
                  >
                    Open them
                  </Button>
                ) : null}
              </div>
            }
          >
            {dup.ticketCode ? `Ticket ${dup.ticketCode}. ` : ''}
            {dup.checkedIn ? 'They are already checked in, too.' : 'No need for a second ticket.'}
          </Callout>
        ) : null}

        <Field label="Full name" required error={errors.fullName}>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="off" autoFocus placeholder="Rina Sari" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" required error={errors.email} hint="Their ticket goes here.">
            <Input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" placeholder="rina@ui.ac.id" />
          </Field>
          <Field label="Phone" optional error={errors.phone} hint="WhatsApp works best.">
            <Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" placeholder="0812 3456 7890" mono />
          </Field>
        </div>
        {hybrid && !walkIn ? (
          <Field label="Joining">
            <SegmentedControl aria-label="Joining" value={mode} onValueChange={setMode} options={(['in-person', 'online'] as const).map((m) => ({ value: m, label: MODE_LABEL[m] }))} />
          </Field>
        ) : null}
        <div className="space-y-3 rounded-2xl bg-surface-muted p-4">
          {canDoor ? <Switch checked={checkIn} onCheckedChange={setCheckIn} label="Check them in now" description={walkIn ? 'They are standing right here.' : 'Only if they are already in the room.'} /> : null}
          <Switch checked={sendEmail} onCheckedChange={setSendEmail} label="Email them the ticket" description={walkIn ? 'A walk-in copy, with the QR for next time.' : 'Same email as a website sign-up.'} />
        </div>
        <Field label="Notes" optional hint="Only admins see these.">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 1000))} autosize minRows={2} maxRows={5} placeholder={walkIn ? 'Came with a friend from ITB' : 'Guest of the speaker'} />
        </Field>
      </form>
    </Dialog>
  );
}
