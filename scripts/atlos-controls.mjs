/** Read only the UI messages included in the SDK's static control bundle. */
export function getControlMessages(uiMessages, locale) {
  // Atlos now keeps the localized legal label in its binding document links.
  const termsOfService =
    locale === 'en-US'
      ? 'Terms of Services'
      : locale === 'zh-CN'
        ? '服务条款'
        : locale === 'zh-HK'
          ? '服務條款'
          : uiMessages.locator?.binding?.docsLinks?.match(/<a href=["']\{tos\}["']>([^<]+)<\/a>/)?.[1];
  const messages = {
    layerSelect: uiMessages.mapControls?.layerSelect,
    zoomIn: uiMessages.settings?.shortcuts?.zoomIn,
    zoomOut: uiMessages.settings?.shortcuts?.zoomOut,
    brandName: uiMessages.meta?.title,
    termsOfService,
  };
  if (!Object.values(messages).every((value) => typeof value === 'string' && value.trim())) {
    throw new Error(`Missing Atlos control messages for locale: ${locale}`);
  }
  return messages;
}
