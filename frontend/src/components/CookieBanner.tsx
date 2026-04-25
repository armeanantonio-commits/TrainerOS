import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '@/components/Button';
import { hasStoredCookieConsent, saveCookieConsent } from '@/lib/cookieConsent';

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);

  useEffect(() => {
    setVisible(!hasStoredCookieConsent());
  }, []);

  const handleAcceptAll = () => {
    saveCookieConsent({
      accepted: true,
      analytics: true,
      updatedAt: new Date().toISOString(),
    });
    setVisible(false);
  };

  const handleRejectOptional = () => {
    saveCookieConsent({
      accepted: true,
      analytics: false,
      updatedAt: new Date().toISOString(),
    });
    setVisible(false);
  };

  const handleSavePreferences = () => {
    saveCookieConsent({
      accepted: true,
      analytics: analyticsEnabled,
      updatedAt: new Date().toISOString(),
    });
    setVisible(false);
  };

  if (!visible) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50">
      <div className="console-panel-strong max-w-5xl mx-auto rounded-[28px] p-4 sm:p-6 shadow-2xl">
        <h3 className="text-white text-lg font-semibold mb-2">Cookie Settings</h3>
        <p className="text-slate-300/78 text-sm mb-4">
          We use essential cookies to keep TrainerOS secure and working properly. Optional analytics and marketing
          cookies help us measure traffic, understand conversions, and improve campaigns. See our{' '}
          <Link to="/privacy" className="text-cyan-200 hover:text-white">
            Privacy Policy
          </Link>{' '}
          and{' '}
          <Link to="/gdpr" className="text-cyan-200 hover:text-white">
            GDPR Notice
          </Link>
          .
        </p>

        {showCustomize ? (
          <div className="mb-4 rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="text-white font-medium text-sm">Strictly necessary cookies</p>
                <p className="text-slate-400 text-xs">Always active</p>
              </div>
              <span className="rounded-full bg-cyan-300/15 px-2 py-1 text-xs text-cyan-100">Required</span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-white font-medium text-sm">Analytics and marketing cookies</p>
                <p className="text-slate-400 text-xs">Help us measure usage, conversions, and campaign performance</p>
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={analyticsEnabled}
                  onChange={(e) => setAnalyticsEnabled(e.target.checked)}
                  className="h-4 w-4 accent-cyan-300"
                />
                Enable
              </label>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {!showCustomize ? (
            <Button variant="outline" onClick={() => setShowCustomize(true)}>
              Customize
            </Button>
          ) : (
            <Button variant="outline" onClick={handleSavePreferences}>
              Save preferences
            </Button>
          )}
          <Button variant="outline" onClick={handleRejectOptional}>
            Reject optional
          </Button>
          <Button onClick={handleAcceptAll}>Accept all</Button>
        </div>
      </div>
    </div>
  );
}
