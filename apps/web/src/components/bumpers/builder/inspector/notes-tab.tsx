'use client';

import { Field } from '@/components/admin/ui/field';
import { Input, Textarea } from '@/components/admin/ui/input';
import { describeSlide } from '../canvas/labels';
import { useBuilder } from '../store';
import type { InspectorCtx } from './context';
import { InspectorSection } from './ui';

/** Notes: what the operator reads in the controller, and the name in the rail. */
export function NotesTab({ ic }: { ic: InspectorCtx }) {
  const b = useBuilder();
  const { slide, canEdit, theme, data, showEventId } = ic;
  const notes = slide.notes ?? '';
  const label = slide.label ?? '';
  const auto = describeSlide(slide, theme, data, showEventId);
  return (
    <div>
      <InspectorSection title="Operator notes" description="Shown next to this bumper in the controller. Never on screen.">
        <Field label="Notes" hideLabel count={{ value: notes.length, max: 4000 }}>
          <Textarea
            data-focus="notes"
            value={notes}
            maxLength={4000}
            minRows={5}
            maxRows={16}
            readOnly={!canEdit}
            placeholder="Cue the mic before this one. Rani wants the clicker."
            onChange={(e) => b.updateSlide(slide.id, (s) => ({ ...s, notes: e.target.value || null }), `notes:${slide.id}`)}
          />
        </Field>
      </InspectorSection>
      <InspectorSection title="Name in the rail" description="Leave it empty and it names itself from the data.">
        <Field label="Name" hideLabel count={{ value: label.length, max: 80 }}>
          <Input value={label} maxLength={80} placeholder={auto} readOnly={!canEdit} onChange={(e) => b.updateSlide(slide.id, (s) => ({ ...s, label: e.target.value || null }), `label:${slide.id}`)} />
        </Field>
      </InspectorSection>
    </div>
  );
}
