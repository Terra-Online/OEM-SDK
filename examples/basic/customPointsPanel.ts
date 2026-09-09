import type { OEMCustomPoint, OEMMapClick } from '@opendfieldmap/sdk';
import { bindPanelDragging } from './configPanel';

export interface DemoCustomPointsPanelCallbacks {
  apply(points: readonly OEMCustomPoint[]): Promise<boolean>;
}

export interface DemoCustomPointsPanel {
  element: HTMLDetailsElement;
  setBusy(busy: boolean): void;
  setPoints(points: readonly OEMCustomPoint[]): void;
  setPickStatus(value: OEMMapClick | string, failed?: boolean): void;
  destroy(): void;
}

const serializePoints = (points: readonly OEMCustomPoint[]): string => JSON.stringify(points, null, 2);

const REGION_CODES: Readonly<Record<string, string>> = Object.freeze({
  Valley_4: 'VL',
  Wuling: 'WL',
  Dijiang: 'DJ',
  Weekraid_1: 'ES',
});

const formatMapContext = (click: OEMMapClick): string => {
  const { position } = click;
  const region = REGION_CODES[position.regionId] ?? position.regionId;
  const subregion = position.subregionId ? `-${position.subregionId}` : '';
  const floor = position.floorId ? `, ${position.floorId}` : '';
  return `${region}${subregion}${floor}`;
};

const parsePoints = (value: string): OEMCustomPoint[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Invalid custom points JSON: ${message}`);
  }
  if (!Array.isArray(parsed)) throw new Error('Custom points JSON must be an array');
  return parsed as OEMCustomPoint[];
};

export function createDemoCustomPointsPanel(
  initialPoints: readonly OEMCustomPoint[],
  callbacks: DemoCustomPointsPanelCallbacks,
): DemoCustomPointsPanel {
  const element = document.createElement('details');
  element.className = 'demoPanel demoCustomPointsPanel';
  element.open = window.matchMedia('(min-width: 720px)').matches;

  const summary = document.createElement('summary');
  summary.className = 'demoPanelSummary';
  const summaryRow = document.createElement('span');
  summaryRow.className = 'demoPanelSummaryRow';
  const heading = document.createElement('span');
  heading.className = 'demoPanelHeading';
  const disclosure = document.createElement('span');
  disclosure.className = 'demoPanelDisclosure';
  disclosure.textContent = '✦';
  disclosure.setAttribute('aria-hidden', 'true');
  const title = document.createElement('span');
  title.className = 'demoPanelTitle';
  title.textContent = 'Custom Points';
  heading.append(disclosure, title);
  summaryRow.append(heading);
  summary.append(summaryRow);
  summary.setAttribute('aria-expanded', String(element.open));

  const body = document.createElement('div');
  body.className = 'demoPanelBody';
  element.append(summary, body);
  element.classList.toggle('expanded', element.open);
  const destroyPanelDragging = bindPanelDragging(element, summary);

  let expanded = element.open;
  let panelAnimation: Animation | null = null;
  summary.addEventListener('click', (event) => {
    event.preventDefault();
    const startHeight = element.getBoundingClientRect().height;
    panelAnimation?.cancel();
    expanded = !expanded;
    element.classList.toggle('expanded', expanded);
    summary.setAttribute('aria-expanded', String(expanded));
    if (expanded) element.open = true;
    const maximumHeight = Number.parseFloat(getComputedStyle(element).maxHeight);
    const endHeight = expanded
      ? Math.min(element.scrollHeight, Number.isFinite(maximumHeight) ? maximumHeight : element.scrollHeight)
      : summary.offsetHeight + 2;
    panelAnimation = element.animate(
      { height: [`${startHeight}px`, `${endHeight}px`] },
      { duration: 240, easing: 'cubic-bezier(0.6, 0, 0, 1)' },
    );
    panelAnimation.onfinish = () => {
      if (!expanded) element.open = false;
      panelAnimation = null;
    };
  });

  const description = document.createElement('p');
  description.className = 'demoCustomPointsDescription';
  description.textContent = 'Edit the predefined JSON, then apply it to preview the custom points.';
  const editorLabel = document.createElement('div');
  editorLabel.className = 'demoCustomPointsEditor';
  const editorCaption = document.createElement('span');
  editorCaption.className = 'demoFieldLabel';
  editorCaption.textContent = 'Static points JSON';
  const editor = document.createElement('textarea');
  editor.className = 'demoCustomPointsCode';
  editor.autocomplete = 'off';
  editor.spellcheck = false;
  editor.setAttribute('aria-label', 'Static custom points JSON');
  editorLabel.append(editorCaption, editor);

  const actions = document.createElement('div');
  actions.className = 'demoCustomPointsActions';
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'demoReset';
  reset.textContent = 'Reset';
  reset.setAttribute('aria-label', 'Reset custom points JSON');
  const apply = document.createElement('button');
  apply.type = 'button';
  apply.className = 'demoApply';
  apply.textContent = 'Apply';
  apply.setAttribute('aria-label', 'Apply custom points JSON');
  actions.append(reset, apply);

  const status = document.createElement('div');
  status.className = 'demoCustomPointsStatus';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  body.append(description, editorLabel, actions, status);

  const defaultJson = serializePoints(initialPoints);
  const setStatus = (message: string, failed = false): void => {
    status.textContent = message;
    status.classList.toggle('failed', failed);
  };
  const setPoints = (points: readonly OEMCustomPoint[]): void => {
    editor.value = serializePoints(points);
    setStatus(`${points.length} point${points.length === 1 ? '' : 's'} applied`);
  };
  const applyEditorValue = (): void => {
    let points: OEMCustomPoint[];
    try {
      points = parsePoints(editor.value);
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : String(cause), true);
      return;
    }
    setStatus('Applying…');
    void callbacks.apply(points).then((success) => {
      if (!success) setStatus('Apply failed', true);
    }).catch((cause) => {
      setStatus(cause instanceof Error ? cause.message : String(cause), true);
    });
  };

  apply.addEventListener('click', applyEditorValue);
  reset.addEventListener('click', () => {
    editor.value = defaultJson;
    applyEditorValue();
  });

  setPoints(initialPoints);

  return {
    element,
    setBusy(busy) {
      element.classList.toggle('busy', busy);
      element.setAttribute('aria-busy', String(busy));
      for (const control of body.querySelectorAll<HTMLTextAreaElement | HTMLButtonElement>('textarea, button')) {
        control.disabled = busy;
      }
    },
    setPoints,
    setPickStatus(value, failed = false) {
      if (typeof value === 'string') {
        setStatus(value, failed);
        return;
      }
      const { position, game } = value;
      setStatus(`Map (x ${position.x.toFixed(4)}, z ${position.z.toFixed(4)}) ${formatMapContext(value)}\nGame (x ${game.x.toFixed(4)}, z ${game.z.toFixed(4)})`);
    },
    destroy() {
      panelAnimation?.cancel();
      destroyPanelDragging();
    },
  };
}
