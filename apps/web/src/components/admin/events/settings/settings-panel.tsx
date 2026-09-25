'use client';

import { VISIBILITIES, type Visibility } from '@zemi/shared';
import { Ban, CopyPlus, Lock, RotateCcw, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/admin/ui/button';
import { Section } from '@/components/admin/ui/card';
import { ConfirmDialog, useConfirm } from '@/components/admin/ui/confirm-dialog';
import { Callout } from '@/components/admin/ui/feedback';
import { Field } from '@/components/admin/ui/field';
import { Textarea } from '@/components/admin/ui/input';
import { RadioGroup, Switch } from '@/components/admin/ui/toggles';
import { useAbility } from '@/lib/admin/ability';
import { cn } from '@/lib/admin/cn';
import { VISIBILITY_COPY } from '../lib';
import { useEventActions, useWorkspaceEvent } from '../use-event';

const VIS_ICON: Record<Visibility, string> = { draft: 'Only admins', published: 'Everyone', unlisted: 'Link only' };

/**
 * Settings tab: visibility, cancel or restore, duplicate, delete. Every destructive action
 * says exactly what happens before it happens.
 */
export function EventSettingsPanel() {
  const { event, id, can, status } = useWorkspaceEvent();
  const ability = useAbility();
  const actions = useEventActions(id);
  const confirm = useConfirm();
  // What the radio shows: a pending pick, or the saved visibility.
  const [picked, setPicked] = useState<Visibility | null>(null);
  const vis = picked ?? event.visibility;
  const applyRef = useRef<HTMLButtonElement>(null);
  const [reason, setReason] = useState(event.cancelReason ?? '');
  const [notifyPeople, setNotifyPeople] = useState(true);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const reg = event.counts.registrations;
  const people = `${reg} ${reg === 1 ? 'person' : 'people'}`;


  const canPublish = can('publish');
  const canDelete = can('delete');
  const canDuplicate = ability.has('events.create') && can('view');
  const cancelled = status === 'cancelled';
  const past = status === 'past';

  return (
    <div className="space-y-10">
      {/* Visibility */}
      <Section
        aside
        title="Who can see it"
        description="Drafts are for getting it right. Publish when the page looks like a Friday you would come to."
      >
        <div className="space-y-4">
          {!canPublish ? (
            <Callout tone="neutral" icon={<Lock />}>
              Changing visibility needs the Publish permission on this event.
            </Callout>
          ) : null}
          <RadioGroup<Visibility>
            variant="cards"
            aria-label="Visibility"
            value={vis}
            onValueChange={(v) => setPicked(v === event.visibility ? null : v)}
            disabled={!canPublish || actions.publish.isPending}
            options={VISIBILITIES.map((v) => ({
              value: v,
              label: (
                <span className="flex items-center gap-2">
                  {VISIBILITY_COPY[v].label}
                  {v === event.visibility ? <span className="label rounded-full bg-surface-muted px-1.5 py-0.5 text-[0.625rem] text-ink-3">Now</span> : null}
                </span>
              ),
              description: (
                <>
                  <span className="font-medium text-ink-2">{VIS_ICON[v]}. </span>
                  {VISIBILITY_COPY[v].hint}
                </>
              ),
            }))}
          />
          {canPublish && vis !== event.visibility ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                ref={applyRef}
                variant="primary"
                loading={actions.publish.isPending}
                onClick={async () => {
                  if (event.visibility === 'published' && vis === 'draft') {
                    const ok = await confirm({
                      title: 'Unpublish this Friday?',
                      description: 'It disappears from the site and new registrations stop. People who already registered keep their tickets, and nobody gets an email.',
                      confirmLabel: 'Unpublish',
                    });
                    if (!ok) return;
                  }
                  actions.publish.mutate({ visibility: vis, from: applyRef.current }, { onSettled: () => setPicked(null) });
                }}
              >
                {vis === 'published' ? 'Publish it' : vis === 'unlisted' ? 'Make it unlisted' : 'Move back to draft'}
              </Button>
              <Button variant="ghost" onClick={() => setPicked(null)}>
                Never mind
              </Button>
            </div>
          ) : null}
        </div>
      </Section>

      {/* Cancel / restore */}
      <Section
        aside
        title={cancelled ? 'Cancelled' : 'Cancel this Friday'}
        description={cancelled ? 'It is marked as cancelled. You can bring it back.' : 'Rain, fever, projector on strike. It happens.'}
      >
        {!canPublish ? (
          <Callout tone="neutral" icon={<Lock />}>
            Cancelling or restoring needs the Publish permission on this event.
          </Callout>
        ) : cancelled ? (
          <div className="space-y-4 rounded-[20px] border border-line p-4 sm:p-5">
            <p className="text-[0.9375rem] text-ink-2">
              {event.cancelReason ? (
                <>
                  Reason on the page: <span className="font-medium text-ink">{event.cancelReason}</span>
                </>
              ) : (
                'No reason was given.'
              )}
            </p>
            <p className="text-sm text-ink-3">Restoring removes the cancelled note and registration follows its normal settings again. Nobody gets an email about it.</p>
            <Button
              icon={<RotateCcw />}
              loading={actions.restore.isPending}
              onClick={async () => {
                const ok = await confirm({ title: 'Bring this Friday back?', description: 'The cancelled note goes away and registration follows its normal settings again. Nobody gets an email.', confirmLabel: 'Restore event' });
                if (ok) actions.restore.mutate();
              }}
            >
              Restore event
            </Button>
          </div>
        ) : (
          <div className="space-y-4 rounded-[20px] border border-line p-4 sm:p-5">
            <Field label="Reason" optional hint="Shown on the event page and in the email. Keep it short and kind." count={{ value: reason.length, max: 500 }}>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} minRows={2} maxRows={5} placeholder="The speaker caught a cold. We will pick a new Friday soon." />
            </Field>
            <Switch
              checked={notifyPeople}
              onCheckedChange={setNotifyPeople}
              label="Email registrants"
              description={reg ? `Sends a cancellation email to ${people} with an active ticket.` : 'Nobody registered yet, so nobody would get it.'}
            />
            <Button variant="danger-soft" icon={<Ban />} onClick={() => setCancelOpen(true)} disabled={past && !reg}>
              Cancel this Friday
            </Button>
          </div>
        )}
      </Section>

      {/* Duplicate */}
      {canDuplicate ? (
        <Section aside title="Duplicate" description="Running something similar again? Start from a copy.">
          <div className="space-y-3 rounded-[20px] border border-line p-4 sm:p-5">
            <p className="text-[0.9375rem] text-ink-2">
              Makes a new <strong className="font-semibold">draft</strong> with the same title, description, cover, room, speakers, rundown and publications.
            </p>
            <p className="text-sm text-ink-3">It goes on the next free Friday, with the next number. Registrations, check-ins, emails, stream keys, recordings and documentation stay with this one. You land on the copy to tweak it.</p>
            <Button icon={<CopyPlus />} loading={actions.duplicate.isPending} onClick={() => actions.duplicate.mutate()}>
              Duplicate as a draft
            </Button>
          </div>
        </Section>
      ) : null}

      {/* Danger zone */}
      {canDelete ? (
        <Section aside title="Danger zone" description="For events that should never have existed. Cancelling is usually kinder.">
          <div className={cn('space-y-3 rounded-[20px] border border-red/30 bg-red-50/50 p-4 sm:p-5')}>
            <p className="text-[0.9375rem] font-semibold text-ink">Delete this event for good</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
              <li>The public page goes away, and its link stops working.</li>
              <li>{reg ? `${people} lose their registration, and their ticket QR codes stop working.` : 'No registrations to lose.'} Nobody is emailed.</li>
              <li>Check-ins, the rundown, and the speaker and publication links go with it.</li>
              <li>Stream keys, recordings and documentation links are removed too.</li>
              <li>Speakers and publications themselves stay in their libraries.</li>
            </ul>
            <Button variant="danger" icon={<Trash2 />} onClick={() => setDeleteOpen(true)}>
              Delete event
            </Button>
          </div>
        </Section>
      ) : null}

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        destructive
        title="Cancel this Friday?"
        description={
          notifyPeople && reg
            ? `The page stays up with a cancelled note, registration closes, and ${people} get an email${reason.trim() ? ' with your reason' : ''}. You can restore it later, but the email cannot be unsent.`
            : 'The page stays up with a cancelled note and registration closes. Nobody gets an email. You can restore it later.'
        }
        confirmLabel={notifyPeople && reg ? 'Cancel and email everyone' : 'Cancel event'}
        cancelLabel="Keep it"
        onConfirm={() => actions.cancel.mutateAsync({ reason: reason.trim() || null, notify: notifyPeople })}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        destructive
        title="Delete this event?"
        description={`${reg ? `${people} lose their tickets. ` : ''}The page, rundown, links, stream keys and recordings go with it. This cannot be undone.`}
        confirmLabel="Delete event"
        typeToConfirm={event.title}
        onConfirm={() => actions.remove.mutateAsync()}
      />
    </div>
  );
}
