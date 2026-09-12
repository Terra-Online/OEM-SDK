// Internal official visual contract; this is not a renderer customization API.
export const markerClasses: Record<string, string> = Object.fromEntries([
  'markerInner', 'noFrameInner', 'selected', 'checked', 'offLayer', 'pulsing',
  'appearing', 'disappearing', 'subIconContainer', 'subIcon', 'completedMarker', 'clusterMarker', 'clusterCount',
].map(name => [name, name]));
