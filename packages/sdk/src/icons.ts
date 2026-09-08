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
