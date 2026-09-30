'use client';

import { BUMPER_TONES, type BumperBox, type BumperLayer } from '@zemi/shared';
import { AlignCenter, AlignLeft, AlignRight, ArrowDownToLine, ArrowUpToLine, Eye, EyeOff, Lock, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/admin/ui/button';
import { Field } from '@/components/admin/ui/field';
import { Slider } from '@/components/admin/ui/slider';
import { notify } from '@/components/admin/ui/toast';
import { SegmentedControl } from '@/components/admin/ui/toggles';
import { EXTRA_LABELS } from '../../engine/extras';
import { clampBox, type ElementInfo } from '../canvas/geometry';
import { elementLabel } from '../canvas/labels';
import { EXTRA_ICONS } from '../canvas/toolbar';
import { useBuilder } from '../store';
import type { InspectorCtx } from './context';
import { ExtraProps } from './extra-props';
import { DraftNumberInput } from './inputs';
import { InspectorSection, ToneSwatches } from './ui';

type Align = 'start' | 'center' | 'end';

/** Element: position and size, rotation (free elements), alignment, color, size, stacking, visibility, reset or delete, and the free element's own props. */
export function ElementTab({ ic, el }: { ic: InspectorCtx; el: ElementInfo }) {
  const b = useBuilder();
  const { slide, canEdit, ctx } = ic;
  const extra = el.extraId ? (slide.extras.find((x) => x.id === el.extraId) ?? null) : null;
  const layer: BumperLayer | undefined = extra ? undefined : slide.layers[el.key];
  const ro = !canEdit;
  const label = elementLabel(slide, el);
  const movable = canEdit && !el.locked;

  const setBox = (patch: Partial<BumperBox>, field: string) => {
    let box = { ...el.box, ...patch };
    // Locked-aspect elements (photos, QR codes, characters) scale both sides together.
    if (el.lockAspect && (patch.w != null || patch.h != null)) {
      const ratio = el.box.w / el.box.h;
      if (patch.w != null) box = { ...box, h: patch.w / ratio };
      else if (patch.h != null) box = { ...box, w: patch.h * ratio };
    }
    const next = clampBox(box);
    if (extra) b.updateExtra(slide.id, extra.id, (e) => ({ ...e, box: next }), `extra:${slide.id}:${extra.id}:${field}`);
    else b.moveLayer(slide.id, el.key, next, `el:${slide.id}:${el.key}:${field}`);
  };
  const setLayer = (patch: Partial<BumperLayer>, field: string) => b.setLayer(slide.id, el.key, patch, `el:${slide.id}:${el.key}:${field}`);
  const z = extra ? extra.z : (layer?.z ?? 0);
  const setZ = (next: number) => {
    const v = Math.max(-50, Math.min(50, next));
    if (extra) b.updateExtra(slide.id, extra.id, (e) => ({ ...e, z: v }), `extra:${slide.id}:${extra.id}:z`);
    else setLayer({ z: v }, 'z');
  };
  const remove = () => {
    if (!extra) return;
    b.removeExtra(slide.id, extra.id);
    b.selectElement(null);
    notify.info(`${label} removed.`, { action: { label: 'Undo', onClick: () => b.undo() } });
  };

  const align: Align | 'auto' = extra ? ((extra.props.align as Align) ?? 'start') : (layer?.align ?? 'auto');
  const hasAlign = !extra || extra.type === 'text';
  const hasTone = !extra;
  const changed = !!layer && Object.keys(layer).length > 0;

  return (
    <div>
      <InspectorSection
        title={
          <span className="flex items-center gap-2">
            {extra ? <span className="flex size-5 items-center justify-center text-ink-3 [&_svg]:size-4">{EXTRA_ICONS[extra.type]}</span> : null}
            <span className="truncate">{label}</span>
          </span>
        }
        description={extra ? `Free ${EXTRA_LABELS[extra.type].toLowerCase()} on this bumper.` : el.locked ? 'Part of the backdrop. It stays where the template puts it.' : 'Part of the template. Your changes sit on top and can be reset.'}
      >
        {el.locked ? (
          <p className="flex items-center gap-2 text-sm text-ink-3">
            <Lock className="size-4" /> Locked in place
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              {(['x', 'y', 'w', 'h'] as const).map((k) => (
                <Field key={k} label={{ x: 'X', y: 'Y', w: 'Width', h: 'Height' }[k]} layout="stack">
                  <DraftNumberInput value={Math.round(el.box[k])} onCommit={(v) => setBox({ [k]: v }, k)} min={k === 'w' || k === 'h' ? 8 : k === 'y' ? -1080 : -1920} max={k === 'h' || k === 'y' ? 2160 : 3840} unit="px" size="sm" readOnly={!movable} steppers={false} />
                </Field>
              ))}
            </div>
            {el.lockAspect ? <p className="text-xs text-ink-3">Keeps its proportions, so width and height move together.</p> : null}
            {extra ? (
              <Slider label="Rotation" value={extra.rotate} onChange={(v) => b.updateExtra(slide.id, extra.id, (e) => ({ ...e, rotate: Math.round(v) }), `extra:${slide.id}:${extra.id}:rotate`)} min={-180} max={180} step={1} centered defaultValue={0} display={`${extra.rotate}°`} disabled={ro} />
            ) : null}
          </>
        )}
      </InspectorSection>

      {el.locked || !(hasAlign || hasTone || !extra) ? null : (
        <InspectorSection title="Look">
          <div className="space-y-4">
            {hasAlign ? (
              <Field label="Align">
                <SegmentedControl<Align | 'auto'>
                  aria-label="Align"
                  size="sm"
                  fullWidth
                  value={align}
                  onValueChange={(v) => {
                    if (ro) return;
                    if (extra) b.updateExtra(slide.id, extra.id, (e) => ({ ...e, props: { ...e.props, align: v } }), `extra:${slide.id}:${extra.id}:align`);
                    else setLayer({ align: v === 'auto' ? undefined : v }, 'align');
                  }}
                  options={[
                    ...(extra ? [] : [{ value: 'auto' as const, label: 'Template' }]),
                    { value: 'start', label: <><AlignLeft aria-hidden="true" /><span className="sr-only">Left</span></> },
                    { value: 'center', label: <><AlignCenter aria-hidden="true" /><span className="sr-only">Center</span></> },
                    { value: 'end', label: <><AlignRight aria-hidden="true" /><span className="sr-only">Right</span></> },
                  ]}
                />
              </Field>
            ) : null}
            {hasTone ? (
              <Field label="Color">
                <ToneSwatches label="Color" value={layer?.tone ?? null} onChange={(v) => setLayer({ tone: (v ?? undefined) as BumperLayer['tone'] }, 'tone')} tones={BUMPER_TONES} colors={ctx.colors} readOnly={ro} allowAuto autoLabel="Template" />
              </Field>
            ) : null}
            {!extra ? (
              <Slider label="Text size" value={layer?.scale ?? 1} onChange={(v) => setLayer({ scale: Math.abs(v - 1) < 0.001 ? undefined : Math.round(v * 100) / 100 }, 'scale')} min={0.4} max={2.5} step={0.05} defaultValue={1} display={`${Math.round((layer?.scale ?? 1) * 100)}%`} disabled={ro} />
            ) : null}
          </div>
        </InspectorSection>
      )}

      {extra ? (
        <InspectorSection title={EXTRA_LABELS[extra.type]}>
          <ExtraProps el={extra} ic={ic} />
        </InspectorSection>
      ) : null}

      <InspectorSection title="Arrange">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon={<ArrowUpToLine />} onClick={() => setZ(z + 1)} disabled={ro || z >= 50}>
            Bring forward
          </Button>
          <Button size="sm" variant="secondary" icon={<ArrowDownToLine />} onClick={() => setZ(z - 1)} disabled={ro || z <= -50}>
            Send back
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {extra ? (
            <Button size="sm" variant="danger-soft" icon={<Trash2 />} onClick={remove} disabled={ro}>
              Delete {EXTRA_LABELS[extra.type].toLowerCase()}
            </Button>
          ) : (
            <>
              <Button size="sm" variant="secondary" icon={el.hidden ? <Eye /> : <EyeOff />} onClick={() => setLayer({ hidden: el.hidden ? undefined : true }, 'hidden')} disabled={ro}>
                {el.hidden ? 'Show it' : 'Hide it'}
              </Button>
              <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={() => b.setLayer(slide.id, el.key, null)} disabled={ro || !changed}>
                Reset to template
              </Button>
            </>
          )}
        </div>
        {!extra && el.hidden ? <p className="text-xs text-ink-3">Hidden elements stay on the canvas as a dashed outline, so you can bring them back.</p> : null}
      </InspectorSection>
    </div>
  );
}
