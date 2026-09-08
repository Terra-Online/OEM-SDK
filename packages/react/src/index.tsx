import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { createOEMWidget } from '@opendfieldmap/sdk';
import type { OEMWidget as WidgetHandle, OEMWidgetConfig, OEMWidgetOptions } from '@opendfieldmap/sdk';

export interface OEMWidgetProps {
  options?: OEMWidgetOptions;
  className?: string;
  style?: CSSProperties;
}

const getConfig = (options: OEMWidgetOptions): OEMWidgetConfig => ({
  region: options.region,
  subregion: options.subregion,
  floor: options.floor,
  locale: options.locale,
  markerTypes: options.markerTypes,
  labels: options.labels,
  boundaries: options.boundaries,
  markerClustering: options.markerClustering,
  zoom: options.zoom,
  center: options.center,
});

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

export function OEMWidget({ options = {}, className, style }: OEMWidgetProps) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<WidgetHandle | null>(null);
  const latestOptions = useRef(options);
  latestOptions.current = options;
  const initialOptions = useRef(options);

  useEffect(() => {
    const controller = new AbortController();
    const externalSignal = initialOptions.current.signal;
    const abort = () => controller.abort();
    externalSignal?.addEventListener('abort', abort, { once: true });
    if (externalSignal?.aborted) controller.abort();
    void createOEMWidget(container.current!, {
      ...initialOptions.current,
      signal: controller.signal,
      onError: (error) => latestOptions.current.onError?.(error),
      onReady: (instance) => latestOptions.current.onReady?.(instance),
      onStateChange: (state) => latestOptions.current.onStateChange?.(state),
    }).then((instance) => {
      if (controller.signal.aborted) {
        instance.destroy();
        return;
      }
      widget.current = instance;
      return instance.setOptions(getConfig(latestOptions.current));
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) latestOptions.current.onError?.(toError(error));
    });
    return () => {
      controller.abort();
      externalSignal?.removeEventListener('abort', abort);
      widget.current?.destroy();
      widget.current = null;
    };
  }, []);

  useEffect(() => {
    if (!widget.current || widget.current.destroyed) return;
    void widget.current.setOptions(getConfig(options)).catch((error: unknown) => {
      latestOptions.current.onError?.(toError(error));
    });
  }, [options.region, options.subregion, options.floor, options.locale, options.markerTypes, options.labels,
    options.boundaries, options.markerClustering, options.zoom, options.center]);

  return <div ref={container} className={className} style={{ height: 480, ...style }} />;
}
