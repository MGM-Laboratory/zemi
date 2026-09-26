/**
 * Tiny message bus between the contact form and whatever draws the paper plane (the 3D scene,
 * or the flat SVG plane under reduced motion / without WebGL). No React state per frame: the
 * renderers read `mode`, `since`, `dock` and `focus` directly.
 */
export type PlaneMode = 'dock' | 'launch' | 'gone' | 'return';

export class PlaneBus {
  mode: PlaneMode = 'dock';
  /** performance.now() when the current mode started. */
  since = 0;
  /** Element the plane perches on (its center). */
  dock: HTMLElement | null = null;
  /** The focused form field, so the plane can glance at it. */
  focus: HTMLElement | null = null;
  /** performance.now() of the last "happy roll" request. */
  rollAt = -1;
  /** A 3D plane is on screen (the flat one hides). */
  live = false;

  private listeners = new Set<(mode: PlaneMode) => void>();
  private flight: { resolve: () => void; timer: ReturnType<typeof setTimeout> } | null = null;

  /** Where the plane perches (null to clear, only if it is still `el`). */
  setDock(el: HTMLElement | null, only?: HTMLElement | null) {
    if (el === null && only !== undefined && this.dock !== only) return;
    this.dock = el;
  }

  /** The focused field the plane glances at (null when nothing is focused). */
  setFocus(el: HTMLElement | null) {
    this.focus = el;
  }

  subscribe(fn: (mode: PlaneMode) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(mode: PlaneMode) {
    this.mode = mode;
    this.since = typeof performance !== 'undefined' ? performance.now() : 0;
    for (const fn of this.listeners) fn(mode);
  }

  /** Take off. Resolves when the plane has left the screen (or after a safety timeout). */
  launch(): Promise<void> {
    this.finishFlight();
    this.set('launch');
    return new Promise<void>((resolve) => {
      this.flight = { resolve, timer: setTimeout(() => this.landed(), 2200) };
    });
  }

  /** Renderers call this when the flight is over. */
  landed() {
    if (this.mode === 'launch') this.set('gone');
    this.finishFlight();
  }

  /** Fly back in and perch again (after an error, or "send another"). */
  comeBack() {
    this.finishFlight();
    this.set('return');
  }

  /** Renderers call this when the return flight settles. */
  docked() {
    if (this.mode !== 'dock') this.set('dock');
  }

  /** A little barrel roll of joy (the form just became valid). */
  roll() {
    this.rollAt = typeof performance !== 'undefined' ? performance.now() : 0;
  }

  setLive(live: boolean) {
    if (this.live === live) return;
    this.live = live;
    for (const fn of this.listeners) fn(this.mode);
  }

  private finishFlight() {
    if (!this.flight) return;
    clearTimeout(this.flight.timer);
    const { resolve } = this.flight;
    this.flight = null;
    resolve();
  }
}
