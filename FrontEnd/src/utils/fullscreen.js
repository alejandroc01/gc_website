export function getFullscreenElement() {
  if (typeof document === 'undefined') {
    return null;
  }

  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

export function isFullscreenActive() {
  return Boolean(getFullscreenElement());
}

export async function requestFullscreenForElement(element) {
  if (!element) {
    return false;
  }

  const requestFullscreen = element.requestFullscreen || element.webkitRequestFullscreen;

  if (typeof requestFullscreen !== 'function') {
    return false;
  }

  try {
    await requestFullscreen.call(element);
    return true;
  } catch {
    return false;
  }
}

export async function exitFullscreenIfActive() {
  if (typeof document === 'undefined' || !getFullscreenElement()) {
    return false;
  }

  const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen;

  if (typeof exitFullscreen !== 'function') {
    return false;
  }

  try {
    await exitFullscreen.call(document);
    return true;
  } catch {
    return false;
  }
}
