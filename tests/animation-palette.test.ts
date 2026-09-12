// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { MarkerPainter } from '../packages/map/src/atlos/canvas/canvasMarkerPaint';
import { MarkerMotionPool } from '../packages/map/src/atlos/canvas/canvasMarkerMotion';

it('keeps rounded backing pixels at their authored scale and refreshes both sprite caches on density change', () => {
  const pool = new MarkerMotionPool(), painter = new MarkerPainter(1.25, () => {});
  const art = { image: '', subImage: '', noFrame: false, tier: '' };
  const rest = pool.transition(pool.initial, 0, 0, false, false);
  const sprite = painter.sprite(art, rest, 1000);
  expect(sprite.width * painter.ratio).toBe(sprite.canvas.width);
  expect(sprite.height * painter.ratio).toBe(sprite.canvas.height);
  const animated = painter.animation(art, rest);
  painter.setRatio(2);
  expect(painter.sprite(art, rest, 1000)).not.toBe(sprite);
  expect(painter.sprite(art, rest, 1000).canvas.width).toBe(120);
  expect(painter.animation(art, rest)).not.toBe(animated);
  painter.dispose();
});

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
