// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { MarkerPainter } from '../packages/map/src/atlos/canvasMarkerPaint';
import { MarkerMotionPool } from '../packages/map/src/atlos/canvasMarkerMotion';

it('rasterizes a shared bulk pose once per frame without sharing mutable point state', () => {
  const pool = new MarkerMotionPool(), painter = new MarkerPainter(2, () => {});
  const rest = pool.transition(pool.initial, 0, 0, false, false);
  const selected = pool.transition(rest, 1, 100, false, false);
  const art = { image: '', subImage: '', noFrame: false, tier: '' };
  const a = painter.animation(art, selected), b = painter.animation({ ...art }, selected);
  expect(a).toBe(b);
  const paint = vi.spyOn(painter, 'paint');
  for (let i = 0; i < 1000; i++) a.render(140);
  expect(paint).toHaveBeenCalledTimes(1);
  const version = a.render(140).version;
  b.render(156);
  expect(paint).toHaveBeenCalledTimes(2);
  expect(b.render(156).version).toBe((version ?? 0) + 1);
  const hover = pool.transition(selected, 9, 156, false, false);
  expect(painter.animation(art, hover)).not.toBe(a);
  expect(selected.state?.hover).toBe(false);
  painter.dispose();
});
