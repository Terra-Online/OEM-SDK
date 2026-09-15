import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createOEMWidget, diffOEMWidgetConfig, snapshotOEMWidgetConfig } from '@opendfieldmap/sdk';
import type {
  OEMWidget as WidgetHandle,
  OEMWidgetConfig,
  OEMWidgetEvents,
  OEMWidgetOptions,
  OEMWidgetState,
} from '@opendfieldmap/sdk';

const events = {
  onMapClick: 'click',
  onPointClick: 'pointclick',
  onPointEnter: 'pointenter',
  onPointLeave: 'pointleave',
  onViewChange: 'viewchange',
  onRegionChange: 'regionchange',
  onFloorChange: 'floorchange',
  onCustomPointsChange: 'custompointschange',
  onResourceChange: 'resourcechange',
  onLoading: 'loading',
  onLoad: 'load',
  onDestroy: 'destroy',
} as const;
type EventProps = { [K in keyof typeof events]?: (payload: OEMWidgetEvents[(typeof events)[K]]) => void };
export interface OEMWidgetProps extends EventProps {
  /** Resources/manifest/signal are creation-only. Change React key to replace them. */
  options?: OEMWidgetOptions;
  className?: string;
  /** Host wrapper sizing/layout; official map styles remain internal. */
  style?: CSSProperties;
  onReady?: (widget: WidgetHandle) => void;
  onStateChange?: (state: OEMWidgetState) => void;
  onError?: (error: Error) => void;
}
interface Mount {
  controller: AbortController;
  instance?: WidgetHandle;
  submitted: OEMWidgetConfig;
  cancelled: boolean;
  off: (() => void)[];
}

export const OEMWidget = forwardRef<WidgetHandle, OEMWidgetProps>(function OEMWidget(props, ref) {
  const { options = {}, className, style } = props;
  const container = useRef<HTMLDivElement>(null);
  const active = useRef<Mount | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const initial = useRef(options);
  const [handle, setHandle] = useState<WidgetHandle | null>(null);
  useImperativeHandle<WidgetHandle | null, WidgetHandle | null>(ref, () => handle, [handle]);

  const report = (error: unknown) => {
    const handler = latest.current.onError ?? latest.current.options?.onError;
    try {
      handler?.(error instanceof Error ? error : new Error(String(error)));
    } catch (cause) {
      console.error(cause);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    const mount: Mount = { controller, submitted: {}, cancelled: false, off: [] };
    active.current = mount;
    const external = initial.current.signal;
    const abort = () => controller.abort(external?.reason);
    external?.addEventListener('abort', abort, { once: true });
    if (external?.aborted) abort();
    void (async () => {
      mount.submitted = snapshotOEMWidgetConfig(initial.current);
      const instance = await createOEMWidget(container.current!, {
        ...initial.current,
        signal: controller.signal,
        onReady: undefined,
        onError: (error) => {
          if (!mount.cancelled) report(error);
        },
        onStateChange: (state) => {
          if (!mount.cancelled)
            (latest.current.onStateChange ?? latest.current.options?.onStateChange)?.(state);
        },
      });
      if (controller.signal.aborted || active.current !== mount) {
        instance.destroy();
        return;
      }
      mount.instance = instance;
      for (const prop of Object.keys(events) as (keyof typeof events)[]) {
        mount.off.push(
          instance.on(events[prop], (value) => {
            if (mount.cancelled || active.current !== mount) return;
            if (prop === 'onDestroy') setHandle((current) => (current === instance ? null : current));
            const handler = latest.current[prop] as ((payload: typeof value) => void) | undefined;
            handler?.(value);
          }),
        );
      }
      setHandle(instance);
      const current = snapshotOEMWidgetConfig(latest.current.options ?? {});
      const patch = diffOEMWidgetConfig(mount.submitted, current);
      mount.submitted = current;
      if (Object.keys(patch).length) await instance.setOptions(patch);
      if (!mount.cancelled && !instance.destroyed)
        (latest.current.onReady ?? latest.current.options?.onReady)?.(instance);
    })().catch((error) => {
      if (!controller.signal.aborted && !mount.cancelled) {
        mount.submitted = {};
        report(error);
      }
    });
    return () => {
      mount.cancelled = true;
      mount.off.forEach((off) => off());
      controller.abort();
      external?.removeEventListener('abort', abort);
      mount.instance?.destroy();
      if (active.current === mount) active.current = null;
      setHandle((current) => (current === mount.instance ? null : current));
    };
  }, []);

  useEffect(() => {
    const mount = active.current;
    if (!mount?.instance || mount.instance.destroyed) return;
    try {
      const current = snapshotOEMWidgetConfig(options);
      const patch = diffOEMWidgetConfig(mount.submitted, current);
      mount.submitted = current;
      if (!Object.keys(patch).length) return;
      void mount.instance.setOptions(patch).catch((error) => {
        if (active.current !== mount || mount.cancelled || mount.controller.signal.aborted) return;
        mount.submitted = {};
        report(error);
      });
    } catch (error) {
      report(error);
    }
  }, [options, handle]);

  return <div ref={container} className={className} style={{ height: 480, ...style }} />;
});
