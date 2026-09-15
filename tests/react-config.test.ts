// @vitest-environment jsdom
import { act, createElement, createRef, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { OEMWidget } from '@opendfieldmap/react';
import type { OEMWidget as Handle } from '@opendfieldmap/sdk';
import { createManifest, json, deferred } from './fixtures';

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});
it('keeps one StrictMode instance, updates all dynamic options and uses current event props', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({})),
  );
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    ref = createRef<Handle>();
  const manifest = createManifest(),
    first = vi.fn(),
    second = vi.fn();
  const options = { manifest, labels: false, markerTypes: ['unused'] };
  const ready = deferred<Handle>();
  try {
    await act(async () => {
      root.render(
        createElement(
          StrictMode,
          null,
          createElement(OEMWidget, {
            ref,
            options: { ...options, markerTypes: [] },
            onMapClick: first,
            onReady: ready.resolve,
          }),
        ),
      );
    });
    await act(async () => {
      await ready.promise;
    });
    expect(ref.current).not.toBeNull();
    expect(host.querySelectorAll('.mapRoot')).toHaveLength(1);
    const instance = ref.current!;
    const update = vi.spyOn(instance, 'setOptions');
    await act(async () => {
      root.render(
        createElement(
          StrictMode,
          null,
          createElement(OEMWidget, { ref, options: { ...options, markerTypes: [] }, onMapClick: second }),
        ),
      );
    });
    expect(update).not.toHaveBeenCalled();
    await act(async () => {
      root.render(
        createElement(
          StrictMode,
          null,
          createElement(OEMWidget, {
            ref,
            options: {
              ...options,
              markerTypes: [],
              theme: 'dark',
              interaction: { lockZoom: true },
              controls: { showScaleBar: false },
            },
            onMapClick: second,
          }),
        ),
      );
    });
    expect(ref.current).toBe(instance);
    expect(instance.getState()).toMatchObject({ theme: 'dark', lockZoom: true });
    expect(instance.getControlState().showScaleBar).toBe(false);
    host.querySelector('.mapRoot')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
  }
  expect(ref.current).toBeNull();
  expect(host.children).toHaveLength(0);
});

it('replays props changed during creation and rebuilds resource context only with a new key', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const pending = deferred<Response>();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => pending.promise),
  );
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    ref = createRef<Handle>();
  const manifest = createManifest(),
    ready = deferred<Handle>();
  const options = { manifest, labels: false, customPointsUrl: '/pending.json' };
  try {
    await act(async () =>
      root.render(createElement(OEMWidget, { key: 'v1', ref, options, onReady: ready.resolve })),
    );
    await act(async () =>
      root.render(
        createElement(OEMWidget, {
          key: 'v1',
          ref,
          options: { ...options, theme: 'dark', lockDrag: true },
          onReady: ready.resolve,
        }),
      ),
    );
    await act(async () => {
      pending.resolve(json([]));
      await ready.promise;
    });
    const first = ref.current!;
    expect(first.getState()).toMatchObject({ theme: 'dark', lockDrag: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    const nextReady = deferred<Handle>();
    await act(async () =>
      root.render(
        createElement(OEMWidget, {
          key: 'v2',
          ref,
          options: { manifest: createManifest(), labels: false },
          onReady: nextReady.resolve,
        }),
      ),
    );
    await act(async () => {
      await nextReady.promise;
    });
    expect(first.destroyed).toBe(true);
    expect(ref.current).not.toBe(first);
    expect(host.querySelectorAll('.mapRoot')).toHaveLength(1);
  } finally {
    await act(async () => root.unmount());
  }
});
