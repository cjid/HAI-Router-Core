/** True when viewport is within threshold px of scroll bottom. */
export function isNearScrollBottom(element, thresholdPx = 48) {
  if (!element) return true;
  const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
  return distance <= thresholdPx;
}
