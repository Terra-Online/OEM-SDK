import { describe, it, expect } from 'vitest';
import { MarkerMotion, MarkerMotionPool, Motion, type MarkerState } from '../packages/map/src/atlos/canvas/canvasMarkerMotion';

const initial: MarkerState = { selected: false, checked: false, offLayer: false,
  hover: false, focus: false, pulsing: false, appearing: false, disappearing: false };
describe('Canvas point animation state', () => {
  it('shares batch transitions but isolates later interaction on one point', () => {
    const pool = new MarkerMotionPool();
    const a = pool.transition(pool.initial, 0, 0, false, false);
    const b = pool.transition(pool.initial, 0, 0, false, false);
    expect(a).toBe(b);
    const selected = pool.transition(a, 1, 100, false, false);
    expect(pool.transition(b, 1, 100, false, false)).toBe(selected);
    const hovered = pool.transition(selected, 9, 140, false, false);
    expect(hovered).not.toBe(selected);
    expect(selected.state?.hover).toBe(false);
    expect(hovered.border.value(140)).toBe(selected.border.value(140));
  });
  it('animates entry opacity without repainting identical geometry', () => {
    const pool = new MarkerMotionPool();
    const motion = pool.transition(pool.initial, 64, 100, false, false);
    expect(motion.active(140)).toBe(true);
    expect(motion.paintActive(140)).toBe(false);
    expect(motion.opacity(140)).toBeGreaterThan(0);
    expect(motion.opacity(140)).toBeLessThan(1);
  });
  it('preserves the official selected no-frame filter precedence on another floor', () => {
    const motion = new MarkerMotion();
    motion.set({ ...initial, offLayer: true }, 0, true);
    motion.set({ ...initial, offLayer: true, selected: true }, 100, true);
    expect(motion.grayscale.value(400)).toBe(0);
    expect(motion.invert.value(400)).toBe(1);
  });
  it('retargets an interrupted transition from its current value', () => {
    const channel = new Motion(0);
    channel.to(1, 0, 250);
    const middle = channel.value(80);
    channel.to(0, 80, 250);
    expect(channel.value(80)).toBe(middle);
    expect(channel.value(330)).toBe(0);
  });
  it('never blanks a point on hover, selection, collection or floor changes', () => {
    const motion = new MarkerMotion();
    motion.set(initial, 0, false);
    let now = 100;
    for (const patch of [{ hover: true }, { selected: true }, { checked: true }, { offLayer: true }, { hover: false }]) {
      motion.set({ ...motion.state!, ...patch }, now, false);
      for (let frame = now; frame < now + 400; frame += 16) expect(motion.opacity(frame)).toBeGreaterThanOrEqual(0.3);
      now += 400;
    }
  });
  it('does not restart a pulse or a transition when another state field changes', () => {
    const motion = new MarkerMotion();
    motion.set(initial, 0, false);
    motion.set({ ...initial, pulsing: true, selected: true }, 100, false);
    const halfway = motion.border.value(175);
    motion.set({ ...initial, pulsing: true, selected: true, offLayer: true }, 175, false);
    expect(motion.pulseStart).toBe(100);
    expect(motion.border.value(175)).toBe(halfway);
    expect(motion.border.value(250)).toBe(1);
  });
  it('keeps unrelated points and their timelines independent', () => {
    const first = new MarkerMotion(), second = new MarkerMotion();
    first.set(initial, 0, false); second.set(initial, 0, false);
    first.set({ ...initial, hover: true, selected: true, checked: true }, 500, false);
    expect(second.active(501)).toBe(false);
    expect(second.opacity(501)).toBe(1);
    expect(second.ringAlpha.value(501)).toBe(0);
  });
});
