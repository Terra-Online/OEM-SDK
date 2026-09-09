import { bindPanelDragging } from './configPanel';

export type OEMClickPointMode = 'single' | 'multiple';

export interface DemoClickPointsPanelCallbacks {
  setMode(mode: OEMClickPointMode): void;
}

export interface DemoClickPointsPanel {
  element: HTMLDetailsElement;
  setBusy(busy: boolean): void;
  setMode(mode: OEMClickPointMode): void;
  destroy(): void;
}

/** Creates the demo panel that controls click-created custom points. */
export function createDemoClickPointsPanel(
  initialMode: OEMClickPointMode,
  callbacks: DemoClickPointsPanelCallbacks,
): DemoClickPointsPanel {
  const element = document.createElement('details');
  element.className = 'demoPanel demoClickPointsPanel';
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
  title.textContent = 'Click to Add';
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
  description.textContent = 'Click the map to add an instance marker to the custom points JSON.';
  const mode = document.createElement('div');
  mode.className = 'demoSegments demoClickModeChoices';
  mode.setAttribute('role', 'radiogroup');
  mode.setAttribute('aria-label', 'Click point mode');
  const inputs = new Map<OEMClickPointMode, HTMLInputElement>();
  for (const [value, label] of [['single', 'Single point'], ['multiple', 'Multiple points']] as const) {
    const choice = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'demoClickPointMode';
    input.value = value;
    input.autocomplete = 'off';
    input.addEventListener('change', () => {
      if (input.checked) {
        setMode(value);
        callbacks.setMode(value);
      }
    });
    const text = document.createElement('span');
    text.textContent = label;
    choice.append(input, text);
    mode.append(choice);
    inputs.set(value, input);
  }

  const status = document.createElement('div');
  status.className = 'demoCustomPointsStatus';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  body.append(description, mode, status);

  const setMode = (value: OEMClickPointMode): void => {
    const input = inputs.get(value);
    if (input) input.checked = true;
    status.textContent = value === 'single'
      ? 'Only the latest clicked point is kept.'
      : 'Every clicked point is kept.';
  };
  setMode(initialMode);

  return {
    element,
    setBusy(busy) {
      element.classList.toggle('busy', busy);
      element.setAttribute('aria-busy', String(busy));
      for (const input of inputs.values()) input.disabled = busy;
    },
    setMode,
    destroy() {
      panelAnimation?.cancel();
      destroyPanelDragging();
    },
  };
}
