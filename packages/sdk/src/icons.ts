import Valley4 from './assets/Valley_4.svg';
import Wuling from './assets/Wuling.svg';
import Dijiang from './assets/Dijiang.svg';
import Weekraid1 from './assets/Weekraid_1.svg';
import Layer from './assets/layer.svg';

const clean = (svg: string): string => svg.replace(/<\?xml[^>]*>\s*/, '');

export const REGION_ICONS: Readonly<Record<string, string>> = Object.freeze({
  Valley_4: clean(Valley4),
  Wuling: clean(Wuling),
  Dijiang: clean(Dijiang),
  Weekraid_1: clean(Weekraid1),
});

export const LAYER_ICON = clean(Layer);
/** Official generic fallback for regions added by a data release. */
export const GENERIC_REGION_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Z M9 3v16 M15 5v16"/></svg>';
