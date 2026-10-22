// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { MarkerPainter } from '../packages/map/src/atlos/canvas/canvasMarkerPaint';
import { MarkerMotionPool } from '../packages/map/src/atlos/canvas/canvasMarkerMotion';

it('shares settled artwork across pulse clocks and updates each ring only once per frame', () => {
  const pool = new MarkerMotionPool(),
    painter = new MarkerPainter(2, () => {});
  const a = pool.transition(pool.initial, 32, 100, false, false);
  const b = pool.transition(pool.initial, 32, 200, false, false);
  const art = { image: '', subImage: '', noFrame: false, tier: 'B1' };
  expect(a.pulseOnly(500)).toBe(true);
  const left = painter.pulseLayers(art, a, 500),
    right = painter.pulseLayers({ ...art }, b, 500);
  expect(left.underlay).toBe(right.underlay);
  expect(left.overlay).toBe(right.overlay);
  const ring = painter.pulse(a, 500),
    version = ring.version;
  for (let i = 0; i < 1000; i++) expect(painter.pulse(a, 500)).toBe(ring);
  expect(ring.version).toBe(version);
  expect(painter.pulse(b, 500).canvas).not.toBe(ring.canvas);
  const selected = pool.transition(a, 33, 300, false, false);
  expect(selected.pulseStart).toBe(a.pulseStart);
  expect(painter.pulse(selected, 500).canvas).toBe(ring.canvas);
  painter.pulse(a, 516);
  expect(ring.version).toBe((version ?? 0) + 1);
  painter.setRatio(3);
  expect(painter.pulse(a, 516).canvas).not.toBe(ring.canvas);
  expect(painter.pulseLayers(art, a, 516).overlay).not.toBe(left.overlay);
  painter.dispose();
});

it('keeps the continuous original pose while hover or image geometry is changing', () => {
  const pool = new MarkerMotionPool();
  const pulse = pool.transition(pool.initial, 32, 0, true, false);
  const hover = pool.transition(pulse, 40, 100, true, false);
  expect(hover.pulseOnly(150)).toBe(false);
  expect(hover.pulseOnly(600)).toBe(true);
  expect(hover.pulseStart).toBe(pulse.pulseStart);
  const checked = pool.transition(hover, 42, 600, true, false);
  expect(checked.pulseOnly(650)).toBe(false);
  expect(checked.pulseOnly(1000)).toBe(true);
  expect(pulse.state?.hover).toBe(false);
});

it('keeps rounded backing pixels at their authored scale and refreshes both sprite caches on density change', () => {
  const pool = new MarkerMotionPool(),
    painter = new MarkerPainter(1.25, () => {});
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
  const pool = new MarkerMotionPool(),
    painter = new MarkerPainter(2, () => {});
  const rest = pool.transition(pool.initial, 0, 0, false, false);
  const selected = pool.transition(rest, 1, 100, false, false);
  const art = { image: '', subImage: '', noFrame: false, tier: '' };
  const a = painter.animation(art, selected),
    b = painter.animation({ ...art }, selected);
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

it('reuses live immutable sprites after cache eviction and invalidates them on display changes', () => {
  const painter = new MarkerPainter(2, () => {});
  const pool = new MarkerMotionPool();
  const motion = pool.transition(pool.initial, 0, 0, false, false);
  const art = (index: number) => ({ image: '', subImage: '', noFrame: false, tier: `L${index}` });
  const paint = vi.spyOn(painter, 'paint');
  try {
    const sprites = Array.from({ length: 700 }, (_, i) => painter.sprite(art(i), motion, 1000));
    for (let i = 0; i < sprites.length; i++) expect(painter.sprite(art(i), motion, 1000)).toBe(sprites[i]);
    expect(paint).toHaveBeenCalledTimes(700);
    painter.setRatio(3);
    const refreshed = painter.sprite(art(0), motion, 1000);
    expect(refreshed).not.toBe(sprites[0]);
    expect(refreshed.canvas.width).toBe(180);
  } finally {
    painter.dispose();
  }
});

it('retains raster fallback when weak references are unavailable', () => {
  vi.stubGlobal('WeakRef', undefined);
  const painter = new MarkerPainter(2, () => {});
  try {
    const pool = new MarkerMotionPool();
    const motion = pool.transition(pool.initial, 0, 0, false, false);
    expect(
      painter.sprite({ image: '', subImage: '', noFrame: false, tier: '' }, motion, 1000).canvas.width,
    ).toBe(120);
  } finally {
    painter.dispose();
    vi.unstubAllGlobals();
  }
});

it('waits for image decoding before invalidating cached artwork, including cached loads', async () => {
  let decode!: () => void;
  const decoded = new Promise<void>((resolve) => (decode = resolve));
  let image!: HTMLImageElement;
  vi.stubGlobal(
    'Image',
    class {
      complete = true;
      naturalWidth = 32;
      onload?: () => void;
      onerror?: () => void;
      decode = vi.fn(() => decoded);
      constructor() {
        image = this as unknown as HTMLImageElement;
      }
    },
  );
  const invalidate = vi.fn();
  const painter = new MarkerPainter(2, invalidate);
  try {
    painter.preload('/pin.webp');
    expect(image.decode).toHaveBeenCalledOnce();
    expect(invalidate).not.toHaveBeenCalled();
    image.onload?.(new Event('load'));
    decode();
    await decoded;
    await Promise.resolve();
    await Promise.resolve();
    expect(invalidate).toHaveBeenCalledExactlyOnceWith('/pin.webp');
  } finally {
    painter.dispose();
    vi.unstubAllGlobals();
  }
});
