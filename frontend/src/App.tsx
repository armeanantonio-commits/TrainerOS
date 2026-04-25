import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, Link, useNavigate, useNavigationType } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { initMetaPixel, trackMetaPageView } from '@/lib/metaPixel';
import { COOKIE_CONSENT_UPDATED_EVENT, hasAnalyticsConsent } from '@/lib/cookieConsent';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import ProtectedRoute from '@/components/ProtectedRoute';
import CookieBanner from '@/components/CookieBanner';
import SeoManager from '@/components/SeoManager';
import Button from '@/components/Button';

// Public Pages
import Home from '@/pages/Home';
import Features from '@/pages/Features';
import Pricing from '@/pages/Pricing';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import ActivateAccount from '@/pages/ActivateAccount';
import Terms from '@/pages/Terms';
import Privacy from '@/pages/Privacy';
import GDPR from '@/pages/GDPR';
import About from '@/pages/About';
import Contact from '@/pages/Contact';

// Dashboard Pages
import Dashboard from '@/pages/Dashboard';
import NicheFinder from '@/pages/NicheFinder';
import NicheQuick from '@/pages/NicheQuick';
import NicheDiscover from '@/pages/NicheDiscover';
import ContentPreferences from '@/pages/ContentPreferences';
import ContentCreationPreferences from '@/pages/ContentCreationPreferences';
import DailyIdea from '@/pages/DailyIdea';
import IdeaStructurer from '@/pages/IdeaStructurer';
import IdeaDetail from '@/pages/IdeaDetail';
import ContentReview from '@/pages/ContentReview';
import FeedbackDetail from '@/pages/FeedbackDetail';
import IdeaHistory from '@/pages/IdeaHistory';
import Settings from '@/pages/Settings';
import Chat from '@/pages/Chat';
import EmailMarketing from '@/pages/EmailMarketing';

function UpcomingNutritionFeature() {
  return (
    <div className="flex min-h-[calc(100dvh-12rem)] items-center justify-center px-4 py-12">
      <div className="console-panel-strong max-w-2xl rounded-[30px] p-8 text-center">
        <p className="console-kicker mb-3">Upcoming Feature</p>
        <h1 className="mb-4 text-3xl font-bold text-white font-display">Nutriția nu este încă activă</h1>
        <p className="mb-6 text-slate-300">
          Modulul de nutriție este încă în lucru. Îl activăm după ce finalizăm fluxul și validăm output-ul.
        </p>
        <Link to="/dashboard">
          <Button variant="outline">Înapoi la Dashboard</Button>
        </Link>
      </div>
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname]);

  return null;
}

function MetaPixelTracker() {
  const { pathname, search } = useLocation();
  const lastTrackedPath = useRef<string | null>(null);
  const [isTrackingEnabled, setIsTrackingEnabled] = useState(() => hasAnalyticsConsent());

  useEffect(() => {
    const syncTrackingConsent = () => {
      setIsTrackingEnabled(hasAnalyticsConsent());
    };

    syncTrackingConsent();
    window.addEventListener(COOKIE_CONSENT_UPDATED_EVENT, syncTrackingConsent);
    window.addEventListener('storage', syncTrackingConsent);

    return () => {
      window.removeEventListener(COOKIE_CONSENT_UPDATED_EVENT, syncTrackingConsent);
      window.removeEventListener('storage', syncTrackingConsent);
    };
  }, []);

  useEffect(() => {
    if (!isTrackingEnabled) {
      return;
    }

    const currentPath = `${pathname}${search}`;

    initMetaPixel();
    if (lastTrackedPath.current === currentPath) {
      return;
    }

    trackMetaPageView();
    lastTrackedPath.current = currentPath;
  }, [isTrackingEnabled, pathname, search]);

  return null;
}

function GlobalBackButton() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();

  const hiddenRoutes = [
    '/',
    '/dashboard',
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/activate-account',
  ];

  const shouldHide = hiddenRoutes.some((route) => pathname === route);

  if (shouldHide) {
    return null;
  }

  const handleBack = () => {
    if (window.history.length > 1 && navigationType !== 'POP') {
      navigate(-1);
      return;
    }

    if (pathname.startsWith('/idea/') || pathname.startsWith('/feedback/')) {
      navigate('/idea-history');
      return;
    }

    if (pathname.startsWith('/niche-')) {
      navigate('/niche-finder');
      return;
    }

    navigate('/dashboard');
  };

  return (
    <div className="mx-auto mb-4 flex w-full max-w-7xl px-4 sm:px-6 lg:px-8">
      <Button variant="outline" size="sm" onClick={handleBack}>
        ← Înapoi
      </Button>
    </div>
  );
}

function AppFrame() {
  const { pathname } = useLocation();
  const isProtectedRoute = [
    '/dashboard',
    '/niche-finder',
    '/niche-quick',
    '/niche-discover',
    '/content-preferences',
    '/cum-vrei-sa-creezi-content',
    '/daily-idea',
    '/idea-structure',
    '/idea/',
    '/content-review',
    '/feedback/',
    '/idea-history',
    '/settings',
    '/chat',
    '/email',
    '/client-nutrition',
  ].some((route) => pathname === route || pathname.startsWith(route));

  const isFocusedWorkspace =
    pathname === '/niche-finder' ||
    pathname === '/daily-idea' ||
    pathname === '/client-nutrition' ||
    pathname === '/chat' ||
    pathname === '/content-review' ||
    pathname === '/settings';

  return (
    <div
      className={`app-shell min-h-screen flex flex-col ${
        isProtectedRoute ? 'route-mode-console' : 'route-mode-public'
      }`}
    >
      <div className="pointer-events-none fixed inset-x-0 top-0 z-0 h-64 bg-[radial-gradient(circle_at_top,rgba(114,202,255,0.16),transparent_72%)] animate-aurora" />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-0 h-72 bg-[radial-gradient(circle_at_bottom,rgba(140,248,212,0.12),transparent_72%)] animate-aurora" />
      <div className="pointer-events-none fixed inset-0 z-0 opacity-80">
        <div className="absolute left-[8%] top-28 h-56 w-56 rounded-full border border-cyan-300/10 animate-orbit-slow" />
        <div className="absolute right-[10%] top-[18%] h-40 w-40 rounded-full border border-emerald-300/10 animate-float-delay" />
        <div className="absolute bottom-[16%] left-[18%] h-32 w-32 rounded-full border border-indigo-300/10 animate-float-slow" />
      </div>
      <Navbar />
      <main className="relative z-10 flex-grow">
        <div className="pt-4">
          <GlobalBackButton />
        </div>
        <div
          className={`route-shell ${isProtectedRoute ? 'route-shell-console' : 'route-shell-public'} ${
            isFocusedWorkspace ? 'route-shell-focused' : ''
          }`}
        >
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Home />} />
            <Route path="/features" element={<Features />} />
            <Route path="/how-it-works" element={<Navigate to="/features" replace />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/activate-account" element={<ActivateAccount />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/gdpr" element={<GDPR />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />

            {/* Protected Routes */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/niche-finder"
              element={
                <ProtectedRoute>
                  <NicheFinder />
                </ProtectedRoute>
              }
            />
            <Route
              path="/niche-quick"
              element={
                <ProtectedRoute>
                  <NicheQuick />
                </ProtectedRoute>
              }
            />
            <Route
              path="/niche-discover"
              element={
                <ProtectedRoute>
                  <NicheDiscover />
                </ProtectedRoute>
              }
            />
            <Route
              path="/content-preferences"
              element={
                <ProtectedRoute>
                  <ContentPreferences />
                </ProtectedRoute>
              }
            />
            <Route
              path="/cum-vrei-sa-creezi-content"
              element={
                <ProtectedRoute>
                  <ContentCreationPreferences />
                </ProtectedRoute>
              }
            />
            <Route
              path="/daily-idea"
              element={
                <ProtectedRoute>
                  <DailyIdea />
                </ProtectedRoute>
              }
            />
            <Route
              path="/idea-structure"
              element={
                <ProtectedRoute>
                  <IdeaStructurer />
                </ProtectedRoute>
              }
            />
            <Route
              path="/idea/:id"
              element={
                <ProtectedRoute>
                  <IdeaDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/content-review"
              element={
                <ProtectedRoute>
                  <ContentReview />
                </ProtectedRoute>
              }
            />
            <Route
              path="/feedback/:id"
              element={
                <ProtectedRoute>
                  <FeedbackDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/idea-history"
              element={
                <ProtectedRoute>
                  <IdeaHistory />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/chat"
              element={
                <ProtectedRoute>
                  <Chat />
                </ProtectedRoute>
              }
            />
            <Route
              path="/email"
              element={
                <ProtectedRoute>
                  <EmailMarketing />
                </ProtectedRoute>
              }
            />
            <Route
              path="/client-nutrition"
              element={
                <ProtectedRoute>
                  <UpcomingNutritionFeature />
                </ProtectedRoute>
              }
            />

            {/* Catch all - redirect to home */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
      <Footer />
      <CookieBanner />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <ScrollToTop />
        <MetaPixelTracker />
        <SeoManager />
        <AppFrame />
      </Router>
    </AuthProvider>
  );
}

export default App;
