import { hasAnalyticsConsent } from '@/lib/cookieConsent';

const META_PIXEL_ID = '1251519633819969';

declare global {
  interface Window {
    fbq?: MetaPixelFunction;
    _fbq?: MetaPixelFunction;
  }
}

type MetaPixelFunction = {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[][];
  push?: (args: unknown[]) => void;
  loaded?: boolean;
  version?: string;
};

let hasInitializedMetaPixel = false;

function canUseDom() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

export function initMetaPixel() {
  if (!canUseDom() || hasInitializedMetaPixel || !hasAnalyticsConsent()) {
    return;
  }

  if (window.fbq) {
    hasInitializedMetaPixel = true;
    return;
  }

  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) {
      fbq.callMethod(...args);
      return;
    }

    fbq.queue?.push(args);
  } as MetaPixelFunction;

  if (!window._fbq) {
    window._fbq = fbq;
  }

  fbq.push = (args: unknown[]) => {
    fbq.queue?.push(Array.isArray(args) ? args : [args]);
  };
  fbq.loaded = true;
  fbq.version = '2.0';
  fbq.queue = [];

  window.fbq = fbq;

  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://connect.facebook.net/en_US/fbevents.js';

  const firstScript = document.getElementsByTagName('script')[0];
  if (firstScript?.parentNode) {
    firstScript.parentNode.insertBefore(script, firstScript);
  } else {
    document.head.appendChild(script);
  }

  window.fbq('init', META_PIXEL_ID);
  hasInitializedMetaPixel = true;
}

export function trackMetaPageView() {
  if (!canUseDom() || !hasAnalyticsConsent() || !window.fbq) {
    return;
  }

  window.fbq('track', 'PageView');
}

export function trackMetaCompleteRegistration() {
  if (!canUseDom() || !hasAnalyticsConsent() || !window.fbq) {
    return;
  }

  window.fbq('track', 'CompleteRegistration', { content_name: 'register', status: true });
}
