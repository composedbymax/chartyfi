const ua = navigator.userAgent;
const vendor = navigator.vendor || "";
const platform = navigator.platform || "";
const maxTouchPoints = navigator.maxTouchPoints || 0;
export const isIOS =
  /iPad|iPhone|iPod/.test(ua) ||
  (platform === "MacIntel" && maxTouchPoints > 1);
export const isMac = platform.toUpperCase().includes("MAC");
export const isAndroid = /Android/i.test(ua);
export const isMobile =
  /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(ua);
export const isFirefox = /Firefox\/\d+/i.test(ua);
export const isChrome =
  /Chrome\/\d+/i.test(ua) && /Google Inc/.test(vendor);
export const isSafari =
  /Safari\/\d+/i.test(ua) &&
  /Apple Computer/.test(vendor) &&
  !isChrome;