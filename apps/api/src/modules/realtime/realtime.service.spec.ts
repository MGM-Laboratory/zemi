import { describe, expect, it, vi } from 'vitest';
import { channels, RealtimeService } from './realtime.service.js';

describe('RealtimeService', () => {
  it('delivers initial snapshot, published events and pings; counts and cleans up', async () => {
    vi.useFakeTimers();
    const rt = new RealtimeService();
    const ch = channels.live('e1');
    expect(ch).toBe('event:e1:live');
    const got: unknown[] = [];
    const onClose = vi.fn();
    const sub = rt.stream(ch, { initial: () => ({ type: 'state', n: 0 }), pingMs: 1000, onClose }).subscribe((m) => got.push(m.data));
    await vi.advanceTimersByTimeAsync(0);
    expect(rt.subscriberCount(ch)).toBe(1);
    rt.publish(ch, { type: 'viewers', viewers: 3 });
    rt.publish(channels.live('other'), { type: 'viewers', viewers: 9 }); // nobody listens: no-op
    await vi.advanceTimersByTimeAsync(1000);
    expect(got[0]).toEqual({ type: 'state', n: 0 });
    expect(got[1]).toEqual({ type: 'viewers', viewers: 3 });
    expect((got[2] as { type: string }).type).toBe('ping');
    sub.unsubscribe();
    expect(rt.subscriberCount(ch)).toBe(0);
    expect(onClose).toHaveBeenCalledOnce();
    expect(rt.stats()).toEqual({});
    vi.useRealTimers();
  });

  it('completes open streams on shutdown', () => {
    const rt = new RealtimeService();
    const complete = vi.fn();
    rt.stream(channels.attendance('e1')).subscribe({ complete });
    rt.beforeApplicationShutdown();
    expect(complete).toHaveBeenCalled();
    let closed = false;
    rt.stream('x').subscribe({ complete: () => (closed = true) });
    expect(closed).toBe(true);
  });
});
