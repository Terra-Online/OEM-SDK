import type { OEMClickPointOptions, OEMCustomPoint, OEMMapAPI, OEMMapClick } from '@opendfieldmap/map';
import { invalid } from '@opendfieldmap/core';

export interface OEMClickPointTool {
  readonly destroyed: boolean;
  getPoints(): OEMCustomPoint[];
  setMode(mode: OEMClickPointOptions['mode']): Promise<void>;
  clear(): Promise<void>;
  /** Stop observing clicks; existing points remain until explicitly removed. */
  destroy(): void;
}

/** Optional composition of public events and point commands; no renderer internals. */
export function createClickPointTool(api: OEMMapAPI, options: OEMClickPointOptions): OEMClickPointTool {
  const validMode = (mode: unknown) => { if (mode !== 'single' && mode !== 'multiple') invalid('mode', 'Expected single or multiple'); };
  validMode(options.mode);
  if (options.style !== 'framed' && options.style !== 'no-frame') invalid('style', 'Expected an official point style');
  if (typeof options.icon !== 'string' || !options.icon) invalid('icon', 'Expected an image URL');
  if (api.destroyed) invalid('map', 'Map has been destroyed');
  const config = { ...options };
  const prefix = `oem-click-${crypto.randomUUID()}`;
  const ids = new Set<string>();
  const controller = new AbortController();
  let sequence = 0, destroyed = false;
  let tail = Promise.resolve();
  const command = (operation: () => Promise<void>) => {
    const result = tail.then(async () => { controller.signal.throwIfAborted(); await operation(); });
    tail = result.catch(() => undefined); return result;
  };
  const getPoints = () => api.destroyed ? [] : [...ids].flatMap(id => { const point = api.getCustomPoint(id); return point ? [point] : []; });
  const click = (event: OEMMapClick) => {
    const position = { ...event.mapPosition };
    void command(async () => {
      const id = `${prefix}-${++sequence}`;
      await api.upsertCustomPoints([{ id, position, style: config.style, icon: config.icon }], { signal: controller.signal });
      ids.add(id);
      if (config.mode === 'single') {
        const remove = [...ids].filter(value => value !== id);
        await api.removeCustomPoints(remove, { signal: controller.signal });
        remove.forEach(value => ids.delete(value));
      }
    });
  };
  const unsubscribe = api.on('click', click);
  const unsubscribeChanges = api.on('custompointschange', event => event.removed.forEach(id => ids.delete(id)));
  const destroy = () => {
    if (destroyed) return;
    destroyed = true; controller.abort(); unsubscribe(); unsubscribeChanges(); unsubscribeDestroy();
  };
  const unsubscribeDestroy = api.on('destroy', destroy);
  return {
    get destroyed() { return destroyed; }, getPoints,
    setMode(mode) {
      validMode(mode);
      return command(async () => {
        config.mode = mode;
        if (mode === 'single') {
          const remove = [...ids].slice(0, -1);
          await api.removeCustomPoints(remove, { signal: controller.signal });
          remove.forEach(id => ids.delete(id));
        }
      });
    },
    clear: async () => {
      await tail;
      if (!api.destroyed) await api.removeCustomPoints([...ids]);
      ids.clear();
    },
    destroy,
  };
}
