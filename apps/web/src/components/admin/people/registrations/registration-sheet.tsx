'use client';

import { ATTENDANCE_MODES, type AttendanceMode, type EventAction, type RegistrationRow } from '@zemi/shared';
import { Ban, Check, Copy, Mail, MessageCircle, Pencil, RotateCcw, Trash2, Undo2, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/admin/ui/badge';
import { Button } from '@/components/admin/ui/button';
import { useConfirm } from '@/components/admin/ui/confirm-dialog';
import { Sheet } from '@/components/admin/ui/dialog';
import { DateText, KeyValue, Timeline, useCopy, type TimelineItem } from '@/components/admin/ui/display';
import { Callout } from '@/components/admin/ui/feedback';
import { Field } from '@/components/admin/ui/field';
import { Input, Textarea } from '@/components/admin/ui/input';
import { StatusChip } from '@/components/admin/ui/status-chip';
import { SegmentedControl } from '@/components/admin/ui/toggles';
import { EMAIL_STATUS_LABEL, formatPhone, MODE_LABEL, shortName, SOURCE_LABEL, whatsappUrl } from '../lib';
import { useRegistrationActions } from '../queries';

const REGISTERED_HOW: Record<RegistrationRow['source'], string> = {
  web: 'Signed up on the website',
  admin: 'Added by an admin',
  'walk-in': 'Added at the door as a walk-in',
  import: 'Imported from a list',
};

/**
 * Everything about one registration: contact, ticket, a history timeline, notes, and the
 * actions this admin may take (check in or undo, resend, cancel or restore, edit, delete).
 */
export function RegistrationSheet({
  eventId,
  perms,
  registration,
  registrationId,
  onClose,
}: {
  eventId: string;
  perms: ReadonlySet<EventAction>;
  registration: RegistrationRow | null;
  registrationId: string | null;
  onClose: () => void;
}) {
  // Keep the last known copy on screen while the list refetches (or when a filter hides it).
  const [last, setLast] = useState<RegistrationRow | null>(registration);
  if (registration && registration !== last) setLast(registration);
  const r = registration ?? (last && last.id === registrationId ? last : null);
  const open = Boolean(registrationId);

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      width="md"
      title={r ? r.fullName : 'Registration'}
      description={r ? `${r.ticketCode} · ${MODE_LABEL[r.attendanceMode]}` : undefined}
    >
      {r ? (
        <SheetBody key={r.id} r={r} eventId={eventId} perms={perms} stale={!registration} onDeleted={onClose} />
      ) : (
        <Callout tone="blue" title="Not in this list">
          This person is not on the current page or filter. Clear the filters or search for their ticket code.
        </Callout>
      )}
    </Sheet>
  );
}

function SheetBody({ r, eventId, perms, stale, onDeleted }: { r: RegistrationRow; eventId: string; perms: ReadonlySet<EventAction>; stale: boolean; onDeleted: () => void }) {
  const { checkIn, resend, patch, remove } = useRegistrationActions(eventId);
  const confirm = useConfirm();
  const [copy] = useCopy();
  const canManage = perms.has('registrations.manage');
  const canDoor = perms.has('attendance.manage');
  const cancelled = r.status === 'cancelled';
  const [notes, setNotes] = useState(r.notes ?? '');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ fullName: r.fullName, email: r.email, phone: r.phone, attendanceMode: r.attendanceMode as AttendanceMode });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // A fresh copy from the server (someone else saved notes) replaces the draft.
  const [notesFrom, setNotesFrom] = useState(r.notes);
  if (r.notes !== notesFrom) {
    setNotesFrom(r.notes);
    setNotes(r.notes ?? '');
  }

  const history: TimelineItem[] = [];
  history.push({
    id: 'reg',
    title: REGISTERED_HOW[r.source],
    description: <DateText value={r.createdAt} format="datetime" />,
    at: r.createdAt,
    tone: 'blue',
  });
  if (r.emailStatus) {
    history.push({
      id: 'mail',
      title: r.emailStatus === 'failed' ? 'Ticket email failed' : r.emailStatus === 'pending' ? 'Ticket email on its way' : 'Ticket emailed',
      description: EMAIL_STATUS_LABEL[r.emailStatus],
      tone: r.emailStatus === 'failed' ? 'red' : 'yellow',
    });
  }
  if (r.checkedInAt) {
    history.push({
      id: 'in',
      title: `Checked in${r.checkedInBy ? ` by ${r.checkedInBy}` : ''}`,
      description: (
        <>
          {r.checkInMethod === 'qr' ? 'Scanned the QR' : 'Checked in by hand'} at <DateText value={r.checkedInAt} format="time" />
        </>
      ),
      at: r.checkedInAt,
      tone: 'green',
    });
  }
  if (cancelled) history.push({ id: 'cancel', title: 'Seat cancelled', description: 'The ticket no longer opens the door.', tone: 'red' });

  const saveNotes = () =>
    patch.mutate({ id: r.id, body: { notes: notes.trim() ? notes.trim() : null }, message: 'Notes saved.' });

  const saveEdit = () => {
    setFieldErrors({});
    const body: Record<string, unknown> = {};
    if (draft.fullName.trim() !== r.fullName) body.fullName = draft.fullName.trim();
    if (draft.email.trim().toLowerCase() !== r.email) body.email = draft.email.trim();
    if (draft.phone.trim() !== r.phone) body.phone = draft.phone.trim();
    if (draft.attendanceMode !== r.attendanceMode) body.attendanceMode = draft.attendanceMode;
    if (!Object.keys(body).length) {
      setEditing(false);
      return;
    }
    patch.mutate(
      { id: r.id, body, message: 'Details updated.' },
      {
        onSuccess: () => setEditing(false),
        onError: (err) => setFieldErrors(err.fieldErrors),
      },
    );
  };

  const wa = whatsappUrl(r.phone);

  return (
    <div className="space-y-6">
      {stale ? (
        <Callout tone="yellow" title="Showing the last copy">
          This person no longer matches the list filters, so this may be a moment out of date.
        </Callout>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <StatusChip kind="registration" value={cancelled ? 'cancelled' : r.checkedInAt ? 'checked-in' : 'registered'} />
        {r.otherEvents > 0 ? (
          <Badge tone="blue" shape="circle">
            Returning, {r.otherEvents} other {r.otherEvents === 1 ? 'Friday' : 'Fridays'}
          </Badge>
        ) : (
          <Badge tone="neutral">First Friday</Badge>
        )}
      </div>

      {/* Primary actions */}
      <div className="flex flex-wrap gap-2">
        {canDoor && !cancelled ? (
          r.checkedInAt ? (
            <Button variant="secondary" icon={<Undo2 />} loading={checkIn.isPending} onClick={() => checkIn.mutate({ id: r.id, fullName: r.fullName, undo: true })}>
              Undo check-in
            </Button>
          ) : (
            <Button variant="primary" icon={<UserCheck />} loading={checkIn.isPending} onClick={() => checkIn.mutate({ id: r.id, fullName: r.fullName })}>
              Check in now
            </Button>
          )
        ) : null}
        {canManage && !cancelled ? (
          <Button variant="secondary" icon={<Mail />} loading={resend.isPending} onClick={() => resend.mutate({ id: r.id, fullName: r.fullName })}>
            Resend ticket
          </Button>
        ) : null}
        {canManage && cancelled ? (
          <Button variant="secondary" icon={<RotateCcw />} loading={patch.isPending} onClick={() => patch.mutate({ id: r.id, body: { status: 'registered' }, message: `${shortName(r.fullName)} has a seat again.` })}>
            Restore seat
          </Button>
        ) : null}
      </div>

      {/* Details */}
      <section aria-labelledby="reg-details" className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 id="reg-details" className="font-display text-base font-extrabold tracking-[-0.01em]">
            Details
          </h3>
          {canManage && !editing ? (
            <Button variant="ghost" size="sm" icon={<Pencil />} onClick={() => setEditing(true)}>
              Edit
            </Button>
          ) : null}
        </div>
        {editing ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              saveEdit();
            }}
          >
            <Field label="Full name" error={fieldErrors.fullName}>
              <Input value={draft.fullName} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} autoComplete="off" />
            </Field>
            <Field label="Email" error={fieldErrors.email}>
              <Input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} autoComplete="off" />
            </Field>
            <Field label="Phone" error={fieldErrors.phone} hint="We tidy it to +62 format.">
              <Input type="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} autoComplete="off" mono />
            </Field>
            <Field label="Joining">
              <SegmentedControl
                aria-label="Joining"
                value={draft.attendanceMode}
                onValueChange={(v) => setDraft({ ...draft, attendanceMode: v })}
                options={ATTENDANCE_MODES.map((m) => ({ value: m, label: MODE_LABEL[m] }))}
              />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" variant="primary" loading={patch.isPending}>
                Save details
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setFieldErrors({});
                  setDraft({ fullName: r.fullName, email: r.email, phone: r.phone, attendanceMode: r.attendanceMode });
                }}
              >
                Never mind
              </Button>
            </div>
            <p className="text-[0.8125rem] text-ink-3">Changing details sends no email. Resend the ticket if the address changed.</p>
          </form>
        ) : (
          <KeyValue
            dense
            items={[
              {
                label: 'Email',
                value: (
                  <span className="inline-flex max-w-full items-center gap-1.5">
                    <a href={`mailto:${r.email}`} className="truncate text-blue-600 underline-offset-4 hover:underline">
                      {r.email}
                    </a>
                    <button type="button" onClick={() => void copy(r.email)} className="rounded p-0.5 text-ink-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-focus" aria-label="Copy email">
                      <Copy className="size-3.5" />
                    </button>
                  </span>
                ),
              },
              {
                label: 'Phone',
                value: r.phone ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="mono text-sm">{formatPhone(r.phone)}</span>
                    {wa ? (
                      <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[0.8125rem] text-green-600 hover:underline">
                        <MessageCircle className="size-3.5" aria-hidden="true" />
                        WhatsApp
                      </a>
                    ) : null}
                  </span>
                ) : null,
              },
              { label: 'Ticket code', value: r.ticketCode, mono: true },
              { label: 'Joining', value: MODE_LABEL[r.attendanceMode] },
              { label: 'Source', value: SOURCE_LABEL[r.source] },
              { label: 'Ticket email', value: r.emailStatus ? EMAIL_STATUS_LABEL[r.emailStatus] : 'Not sent' },
            ]}
          />
        )}
      </section>

      {/* History */}
      <section aria-labelledby="reg-history" className="space-y-3">
        <h3 id="reg-history" className="font-display text-base font-extrabold tracking-[-0.01em]">
          History
        </h3>
        <Timeline items={history} />
      </section>

      {/* Notes */}
      <section aria-labelledby="reg-notes" className="space-y-2">
        <h3 id="reg-notes" className="font-display text-base font-extrabold tracking-[-0.01em]">
          Notes
        </h3>
        <Field label="Notes for the team" hideLabel count={{ value: notes.length, max: 1000 }} hint="Only admins see these. Allergies, access needs, who they came with.">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 1000))} autosize minRows={3} maxRows={8} readOnly={!canManage} placeholder={canManage ? 'Add a note' : 'No notes'} />
        </Field>
        {canManage && notes !== (r.notes ?? '') ? (
          <div className="flex gap-2">
            <Button size="sm" variant="primary" icon={<Check />} loading={patch.isPending} onClick={saveNotes}>
              Save notes
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setNotes(r.notes ?? '')}>
              Discard
            </Button>
          </div>
        ) : null}
      </section>

      {canManage ? (
        <section aria-labelledby="reg-danger" className="space-y-2 border-t border-line pt-5">
          <h3 id="reg-danger" className="text-sm font-semibold text-ink-2">
            Careful zone
          </h3>
          <div className="flex flex-wrap gap-2">
            {!cancelled ? (
              <Button
                variant="danger-soft"
                size="sm"
                icon={<Ban />}
                onClick={async () => {
                  const ok = await confirm({
                    title: `Cancel ${shortName(r.fullName)}'s seat?`,
                    description: 'Their ticket stops working at the door and the seat opens up. No email goes out. You can restore it later.',
                    confirmLabel: 'Cancel seat',
                    destructive: true,
                  });
                  if (ok) patch.mutate({ id: r.id, body: { status: 'cancelled' }, message: `Cancelled ${shortName(r.fullName)}'s seat.` });
                }}
              >
                Cancel seat
              </Button>
            ) : null}
            <Button
              variant="danger-soft"
              size="sm"
              icon={<Trash2 />}
              onClick={async () => {
                const ok = await confirm({
                  title: `Delete ${r.fullName}?`,
                  description: 'The registration, ticket and check-in history go for good. Cancelling the seat keeps the history.',
                  confirmLabel: 'Delete registration',
                  destructive: true,
                });
                if (ok) remove.mutate({ id: r.id, fullName: r.fullName }, { onSuccess: onDeleted });
              }}
            >
              Delete
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
