export const wideMQ = matchMedia('(min-width: 768px)');

export function isAppleTouch() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

// Nome dello sblocco biometrico da mostrare nei testi.
export function biometricName() {
  const ua = navigator.userAgent;
  if (isAppleTouch()) return 'Face ID';
  if (/Macintosh/.test(ua)) return 'Touch ID';
  if (/Windows/.test(ua)) return 'Windows Hello';
  return 'biometria';
}

export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
