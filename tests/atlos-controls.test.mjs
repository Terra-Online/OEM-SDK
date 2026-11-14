import { describe, expect, it } from 'vitest';
import { getControlMessages } from '../scripts/atlos-controls.mjs';

const ui = {
  mapControls: { layerSelect: 'Ebenenauswahl' },
  settings: { shortcuts: { zoomIn: 'Vergrößern', zoomOut: 'Verkleinern' } },
  meta: { title: 'Endfield-Atlas' },
  locator: {
    binding: {
      docsLinks:
        '<a href="{privacy}">Datenschutz</a> · <a href="{tos}">Nutzungsbedingungen</a> · <a href="{data}">Datenerfassung</a>',
    },
  },
};

describe('Atlos control export', () => {
  it('reads the legal label without depending on the removed terms/storage panel', () => {
    expect(getControlMessages(ui, 'de-DE')).toEqual({
      layerSelect: 'Ebenenauswahl',
      zoomIn: 'Vergrößern',
      zoomOut: 'Verkleinern',
      brandName: 'Endfield-Atlas',
      termsOfService: 'Nutzungsbedingungen',
    });
  });

  it.each([
    ['en-US', 'Terms of Services'],
    ['zh-CN', '服务条款'],
    ['zh-HK', '服務條款'],
  ])('preserves the existing SDK legal label for %s', (locale, label) => {
    expect(getControlMessages(ui, locale).termsOfService).toBe(label);
  });

  it('rejects missing legal text or required control messages', () => {
    expect(() => getControlMessages({ ...ui, locator: undefined }, 'de-DE')).toThrow(
      'Missing Atlos control messages for locale: de-DE',
    );
    expect(() => getControlMessages({ ...ui, mapControls: {} }, 'de-DE')).toThrow(
      'Missing Atlos control messages for locale: de-DE',
    );
  });
});
