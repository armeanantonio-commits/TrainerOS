export const COOKIE_CONSENT_KEY = 'traineros_cookie_consent_v1';
export const COOKIE_CONSENT_UPDATED_EVENT = 'traineros:cookie-consent-updated';

export interface CookieConsent {
  accepted: boolean;
  analytics: boolean;
  updatedAt: string;
}

function canUseDom() {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

export function getStoredCookieConsent(): CookieConsent | null {
  if (!canUseDom()) {
    return null;
  }

  const rawValue = localStorage.getItem(COOKIE_CONSENT_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as CookieConsent;
  } catch {
    return null;
  }
}

export function hasStoredCookieConsent(): boolean {
  return getStoredCookieConsent() !== null;
}

export function hasAnalyticsConsent(): boolean {
  return getStoredCookieConsent()?.analytics === true;
}

export function saveCookieConsent(consent: CookieConsent): void {
  if (!canUseDom()) {
    return;
  }

  localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(consent));
  window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_UPDATED_EVENT, { detail: consent }));
}
