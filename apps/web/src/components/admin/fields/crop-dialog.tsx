'use client';

import type { Adjust, Crop } from '@zemi/shared';

export type { CropResult };
import { Contrast, FlipHorizontal2, RotateCcw, RotateCw, SlidersHorizontal, SunMedium, ZoomIn } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { cn } from '@/lib/admin/cn';
import { Button, IconButton } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { Slider } from '../ui/slider';
import { adjustToCssFilter, DEFAULT_ADJUST, SharpenFilterDefs, type CropResult } from './crop-utils';
import { SegmentedControl, Switch } from '../ui/toggles';

export interface CropDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Object URL or absolute URL of the ORIGINAL image. */
  imageUrl: string | null;
  /** width / height. null = free (people pick from a few ratios). */
  aspect: number | null;
  initial?: { crop?: Crop | null; adjust?: Adjust | null };
  onConfirm: (result: CropResult) => void | Promise<void>;
  title?: string;
  confirmLabel?: string;
  /** Round mask preview (avatars). */
  round?: boolean;
}

const FREE_RATIOS = [
  { value: 'original', label: 'Original' },
  { value: '1', label: '1:1' },
  { value: '0.8', label: '4:5' },
  { value: '1.5', label: '3:2' },
  { value: '1.7778', label: '16:9' },
] as const;

/**
 * Crop + adjust modal (react-easy-crop). Keyboard: focus the image and use arrow keys to move
 * the crop; sliders take arrows, Page Up/Down, Home/End. "Hold to compare" shows the original.
 */
export default function CropDialog({ open, onOpenChange, imageUrl, aspect, initial, onConfirm, title = 'Frame it', confirmLabel = 'Use this crop', round }: CropDialogProps) {
  const [cropPos, setCropPos] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [quarter, setQuarter] = useState(0);
  const [fine, setFine] = useState(0);
  const [adjust, setAdjust] = useState<Adjust>(DEFAULT_ADJUST);
  const [area, setArea] = useState<Area | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [freeRatio, setFreeRatio] = useState<string>('original');
  const [compare, setCompare] = useState(false);
  const [tab, setTab] = useState<'frame' | 'adjust'>('frame');
  const [saving, setSaving] = useState(false);
  const initialArea = useRef<Area | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    const c = initial?.crop;
    const rot = c?.rotation ?? 0;
    const q = Math.round(rot / 90);
    setQuarter(((q % 4) + 4) % 4);
    setFine(Math.max(-45, Math.min(45, rot - q * 90)));
    setAdjust({ ...DEFAULT_ADJUST, ...(initial?.adjust ?? {}) });
    setZoom(1);
    setCropPos({ x: 0, y: 0 });
    setCompare(false);
    setTab('frame');
    setFreeRatio('original');
    initialArea.current = c ? { x: c.x, y: c.y, width: c.width, height: c.height } : undefined;
  }, [open, initial?.crop, initial?.adjust]);

  const rotation = quarter * 90 + fine;
  const ratio = useMemo(() => {
    if (aspect) return aspect;
    if (freeRatio === 'original' && natural) {
      const swapped = quarter % 2 === 1;
      return swapped ? natural.h / natural.w : natural.w / natural.h;
    }
    return Number(freeRatio) || 1;
  }, [aspect, freeRatio, natural, quarter]);

  const filter = compare ? 'none' : adjustToCssFilter(adjust);
  const small = natural && area ? Math.min(area.width, area.height) < 800 : false;

  const confirm = async () => {
    if (!area) return;
    const crop: Crop = {
      x: Math.max(0, Math.round(area.x)),
      y: Math.max(0, Math.round(area.y)),
      width: Math.max(1, Math.round(area.width)),
      height: Math.max(1, Math.round(area.height)),
      rotation: Math.round(rotation * 10) / 10,
    };
    setSaving(true);
    try {
      await onConfirm({ crop, adjust });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const setA = (patch: Partial<Adjust>) => setAdjust((a) => ({ ...a, ...patch }));
  const adjusted = JSON.stringify(adjust) !== JSON.stringify(DEFAULT_ADJUST);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !saving && onOpenChange(o)}
      title={title}
      description={aspect ? `Locked to ${aspectLabel(aspect)}. Drag to move, pinch or scroll to zoom.` : 'Drag to move, pinch or scroll to zoom.'}
      size="xl"
      dismissible={false}
      bodyClassName="px-0 pb-0 sm:px-0"
      footer={
        <>
          <span className="mr-auto hidden text-[0.8125rem] text-ink-3 sm:block">
            {area ? (
              <span className="mono">
                {Math.round(area.width)} x {Math.round(area.height)} px
                {small ? <span className="ml-2 font-sans text-[#7a5600]">A bit small. It may look soft on big screens.</span> : null}
              </span>
            ) : null}
          </span>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void confirm()} loading={saving} disabled={!area}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <SharpenFilterDefs />
      <div className="grid min-h-0 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* On phones the image sticks to the top while the controls scroll under it. */}
        <div className="relative z-10 h-[44dvh] min-h-[15rem] bg-[#15181e] max-lg:sticky max-lg:top-0 lg:h-[min(64dvh,38rem)]">
          {imageUrl ? (
            <Cropper
              image={imageUrl}
              crop={cropPos}
              zoom={zoom}
              rotation={rotation}
              aspect={ratio}
              minZoom={1}
              maxZoom={5}
              zoomSpeed={0.25}
              cropShape={round ? 'round' : 'rect'}
              showGrid
              keyboardStep={8}
              restrictPosition
              initialCroppedAreaPixels={initialArea.current}
              onCropChange={setCropPos}
              onZoomChange={setZoom}
              onRotationChange={(r) => {
                const q = Math.round(r / 90);
                setQuarter(((q % 4) + 4) % 4);
                setFine(Math.max(-45, Math.min(45, r - q * 90)));
              }}
              onCropComplete={(_, px) => setArea(px)}
              onMediaLoaded={(m) => setNatural({ w: m.naturalWidth, h: m.naturalHeight })}
              style={{
                mediaStyle: { filter, transition: 'filter 120ms linear' },
                cropAreaStyle: { border: '2px solid rgba(255,255,255,0.95)', boxShadow: '0 0 0 9999em rgba(14,17,22,0.62)', borderRadius: round ? '50%' : 12 },
              }}
              cropperProps={{ 'aria-label': 'Crop area. Use arrow keys to move the image.' } as React.HTMLAttributes<HTMLDivElement>}
            />
          ) : null}
          <button
            type="button"
            onPointerDown={() => setCompare(true)}
            onPointerUp={() => setCompare(false)}
            onPointerLeave={() => setCompare(false)}
            onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && setCompare(true)}
            onKeyUp={() => setCompare(false)}
            disabled={!adjusted}
            aria-pressed={compare}
            className="absolute top-3 left-3 z-10 inline-flex h-8 items-center gap-1.5 rounded-full bg-black/55 px-3 text-xs font-medium text-white backdrop-blur transition hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-white disabled:opacity-0"
          >
            <FlipHorizontal2 className="size-3.5" />
            {compare ? 'Original' : 'Hold to compare'}
          </button>
        </div>

        <div className="flex min-h-0 flex-col gap-5 border-t border-line p-5 lg:border-t-0 lg:border-l">
          <SegmentedControl
            aria-label="Editor panel"
            fullWidth
            value={tab}
            onValueChange={setTab}
            options={[
              { value: 'frame', label: 'Frame', icon: <ZoomIn /> },
              { value: 'adjust', label: 'Adjust', icon: <SlidersHorizontal /> },
            ]}
          />
          {tab === 'frame' ? (
            <div className="space-y-5">
              {!aspect ? (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-ink-2">Shape</div>
                  <div className="flex flex-wrap gap-1.5">
                    {FREE_RATIOS.map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        aria-pressed={freeRatio === r.value}
                        onClick={() => setFreeRatio(r.value)}
                        className={cn(
                          'h-8 rounded-full border px-3 text-[0.8125rem] font-medium transition focus-visible:outline-2 focus-visible:outline-focus',
                          freeRatio === r.value ? 'border-ink bg-ink text-white' : 'border-line-strong text-ink-2 hover:border-ink-4',
                        )}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <Slider label="Zoom" value={zoom} onChange={setZoom} min={1} max={5} step={0.01} defaultValue={1} display={`${Math.round(zoom * 100)}%`} />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-ink-2">Rotate</span>
                  <div className="flex gap-1">
                    <IconButton label="Rotate left 90 degrees" size="sm" variant="secondary" onClick={() => setQuarter((q) => (q + 3) % 4)}>
                      <RotateCcw />
                    </IconButton>
                    <IconButton label="Rotate right 90 degrees" size="sm" variant="secondary" onClick={() => setQuarter((q) => (q + 1) % 4)}>
                      <RotateCw />
                    </IconButton>
                  </div>
                </div>
                <Slider label="Straighten" value={fine} onChange={setFine} min={-45} max={45} step={0.5} defaultValue={0} centered display={`${fine > 0 ? '+' : ''}${fine}°`} />
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <Slider label={<span className="inline-flex items-center gap-1.5"><SunMedium className="size-3.5" /> Brightness</span>} value={adjust.brightness} onChange={(v) => setA({ brightness: v })} min={0.2} max={2} step={0.01} defaultValue={1} centered={false} display={`${Math.round(adjust.brightness * 100)}%`} />
              <Slider label={<span className="inline-flex items-center gap-1.5"><Contrast className="size-3.5" /> Contrast</span>} value={adjust.contrast} onChange={(v) => setA({ contrast: v })} min={0.2} max={2} step={0.01} defaultValue={1} display={`${Math.round(adjust.contrast * 100)}%`} />
              <Slider label="Saturation" value={adjust.saturation} onChange={(v) => setA({ saturation: v })} min={0} max={2} step={0.01} defaultValue={1} display={`${Math.round(adjust.saturation * 100)}%`} />
              <Slider label="Hue" value={adjust.hue} onChange={(v) => setA({ hue: v })} min={-180} max={180} step={1} defaultValue={0} centered display={`${adjust.hue > 0 ? '+' : ''}${adjust.hue}°`} />
              <div className="space-y-3 border-t border-line pt-4">
                <Switch size="sm" label="Black and white" checked={adjust.grayscale} onCheckedChange={(v) => setA({ grayscale: v })} />
                <Switch size="sm" label="Sharpen" description="A light touch for soft phone photos." checked={adjust.sharpen} onCheckedChange={(v) => setA({ sharpen: v })} />
              </div>
              <Button size="sm" variant="ghost" icon={<RotateCcw />} disabled={!adjusted} onClick={() => setAdjust(DEFAULT_ADJUST)}>
                Reset adjustments
              </Button>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function aspectLabel(a: number) {
  if (Math.abs(a - 0.8) < 0.01) return '4:5 portrait';
  if (Math.abs(a - 1) < 0.01) return 'a square';
  if (Math.abs(a - 16 / 9) < 0.01) return '16:9';
  return `${a.toFixed(2)}:1`;
}

