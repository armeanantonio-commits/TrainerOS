import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import api, { ideaAPI } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import Card from '@/components/Card';
import Button from '@/components/Button';
import SetupOnboardingModal from '@/components/SetupOnboardingModal';
import { useI18n } from '@/hooks/useI18n';
import { useLocalizedNicheProfile } from '@/hooks/useLocalizedNicheProfile';

function PencilIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m12 20 9-9-3-3-9 9-1 4 4-1Z" />
      <path d="m15 5 3 3" />
    </svg>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { language, t } = useI18n();
  const [isOnboardingDismissed, setIsOnboardingDismissed] = useState(false);
  const [showSetupCompletedBanner, setShowSetupCompletedBanner] = useState(false);
  const [isNicheModalOpen, setIsNicheModalOpen] = useState(false);
  const onboardingDismissStorageKey = useMemo(
    () => (user?.id ? `traineros:setup-onboarding:dismissed:${user.id}` : null),
    [user?.id]
  );

  // Fetch live dashboard stats
  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const { data } = await api.get('/stats/dashboard');
      return data;
    },
    enabled: !!user, // Only run query if user is logged in
    retry: 1,
  });

  const stats = dashboardData?.stats;
  const recentActivity = dashboardData?.recentActivity;
  const recentIdeas = recentActivity?.ideas || [];
  const recentIdeasTranslationPayload = useMemo(
    () =>
      recentIdeas.map((idea: any) => ({
        id: idea.id,
        hook: idea.hook || '',
        cta: '',
        script: [],
      })),
    [recentIdeas]
  );
  const recentIdeasTranslationKey = useMemo(
    () => recentIdeasTranslationPayload.map((idea: any) => `${idea.id}:${idea.hook}`).join('|'),
    [recentIdeasTranslationPayload]
  );
  const { data: translatedRecentIdeasData } = useQuery({
    queryKey: ['dashboard-recent-ideas-translated', language, recentIdeasTranslationKey],
    queryFn: () =>
      ideaAPI.translate({
        targetLanguage: language,
        ideas: recentIdeasTranslationPayload,
      }),
    enabled: recentIdeasTranslationPayload.length > 0,
    staleTime: 5 * 60 * 1000,
  });
  const translatedRecentIdeasById = useMemo(() => {
    const list = translatedRecentIdeasData?.data?.ideas || [];
    return new Map(list.map((idea: any) => [idea.id, idea]));
  }, [translatedRecentIdeasData]);
  const localizedRecentIdeas = useMemo(
    () =>
      recentIdeas.map((idea: any) => {
        const translated = translatedRecentIdeasById.get(idea.id) as { hook?: string } | undefined;
        return translated ? { ...idea, hook: translated.hook || idea.hook } : idea;
      }),
    [recentIdeas, translatedRecentIdeasById]
  );
  const profile = dashboardData?.profile;
  const localizedProfile = useLocalizedNicheProfile({
    niche: profile?.niche,
    icpProfile: profile?.icpProfile,
    positioningMessage: profile?.positioningMessage,
    enabled: !!profile,
  });
  const nicheDescription = localizedProfile.positioningMessage;
  const idealClientDetails = localizedProfile.icpProfileText;
  const displayedNiche = localizedProfile.niche || profile?.niche || '';
  const dashboardLocale = language === 'en' ? 'en-US' : 'ro-RO';
  const hasNicheSetup = !!profile?.niche;
  const hasContentPreferences = !!user?.contentPreferences?.brandVoice || !!profile?.hasContentPreferences;
  const hasContentCreationPreferences =
    !!user?.contentPreferences?.contentCreation || !!profile?.hasContentCreationPreferences;
  const isSetupComplete =
    hasNicheSetup && hasContentPreferences && hasContentCreationPreferences;

  useEffect(() => {
    try {
      const shouldShow = sessionStorage.getItem('traineros:setup-completed') === '1';
      setShowSetupCompletedBanner(shouldShow);
      if (shouldShow) {
        sessionStorage.removeItem('traineros:setup-completed');
      }
    } catch {
      setShowSetupCompletedBanner(false);
    }
  }, []);

  useEffect(() => {
    if (!onboardingDismissStorageKey) {
      setIsOnboardingDismissed(false);
      return;
    }

    try {
      setIsOnboardingDismissed(localStorage.getItem(onboardingDismissStorageKey) === '1');
    } catch {
      setIsOnboardingDismissed(false);
    }
  }, [onboardingDismissStorageKey]);

  useEffect(() => {
    if (!isSetupComplete || !onboardingDismissStorageKey) {
      return;
    }

    try {
      localStorage.removeItem(onboardingDismissStorageKey);
    } catch {
      // Ignore localStorage write issues.
    }
  }, [isSetupComplete, onboardingDismissStorageKey]);

  useEffect(() => {
    setIsNicheModalOpen(false);
  }, [profile?.niche]);

  const handleCloseOnboarding = () => {
    if (onboardingDismissStorageKey) {
      try {
        localStorage.setItem(onboardingDismissStorageKey, '1');
      } catch {
        // Ignore localStorage write issues.
      }
    }

    setIsOnboardingDismissed(true);
  };

  const shouldShowSetupOnboarding =
    !isLoading &&
    !!user &&
    !!profile &&
    !isOnboardingDismissed &&
    !isSetupComplete;

  const getLocalizedObjective = (objective?: string | null) => {
    if (!objective) {
      return '';
    }

    const normalizedObjective = objective.trim().toLowerCase();
    if (
      normalizedObjective === 'generare lead-uri' ||
      normalizedObjective === 'lead generation'
    ) {
      return t('dashboard.objective.leadGen');
    }

    return objective;
  };

  return (
    <div className="min-h-screen overflow-x-hidden py-12">
      <SetupOnboardingModal
        isOpen={shouldShowSetupOnboarding}
        hasNiche={hasNicheSetup}
        hasBrandVoice={hasContentPreferences}
        hasContentCreationPreferences={hasContentCreationPreferences}
        onClose={handleCloseOnboarding}
      />
      {isNicheModalOpen && profile?.niche ? (
        <div
          className="fixed inset-x-0 bottom-0 top-20 z-40 overflow-y-auto bg-slate-950/72 px-4 py-4 sm:px-6"
          onClick={() => setIsNicheModalOpen(false)}
        >
          <div
            className="mx-auto w-full max-w-2xl overflow-x-hidden rounded-[28px] border border-cyan-300/18 bg-slate-950 p-6 shadow-2xl max-h-full overflow-y-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-slate-400">{t('dashboard.yourNiche')}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setIsNicheModalOpen(false)}>
                {t('common.close')}
              </Button>
            </div>
            <div className="min-w-0 rounded-[22px] border border-white/10 bg-white/[0.04] p-5">
              <p className="min-w-0 whitespace-pre-wrap break-all text-base font-semibold text-cyan-100 sm:text-lg">
                {displayedNiche}
              </p>
            </div>
            {nicheDescription ? (
              <div className="mt-4 min-w-0 rounded-[22px] border border-white/10 bg-white/[0.04] p-5">
                <p className="mb-2 text-[11px] font-mono uppercase tracking-[0.24em] text-slate-400">
                  {t('dashboard.positioningMessage')}
                </p>
                <p className="min-w-0 whitespace-pre-wrap break-all text-sm text-slate-200 sm:text-base">
                  {nicheDescription}
                </p>
              </div>
            ) : null}
            {idealClientDetails ? (
              <div className="mt-4 min-w-0 rounded-[22px] border border-white/10 bg-white/[0.04] p-5">
                <p className="mb-2 text-[11px] font-mono uppercase tracking-[0.24em] text-slate-400">
                  {t('dashboard.idealClient')}
                </p>
                <p className="min-w-0 whitespace-pre-wrap break-all text-sm text-slate-200 sm:text-base">
                  {idealClientDetails}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="mx-auto max-w-7xl overflow-x-hidden px-4 sm:px-6 lg:px-8">
        {/* Header */}
        {showSetupCompletedBanner ? (
          <Card className="mb-6 border-emerald-300/25 bg-[linear-gradient(135deg,rgba(16,185,129,0.12),rgba(8,18,30,0.85))]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="console-kicker mb-2">{t('dashboard.systemReady')}</p>
                <h3 className="text-lg font-bold text-white font-display">{t('dashboard.setupDone')}</h3>
                <p className="text-slate-300/78 text-sm">
                  {t('dashboard.setupDoneText')}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowSetupCompletedBanner(false)}>
                {t('common.close')}
              </Button>
            </div>
          </Card>
        ) : null}

        <div className="console-panel-strong mb-8 overflow-hidden rounded-[34px] p-6 sm:p-8">
          <div className="mb-8 flex min-w-0 flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="console-kicker mb-3">{t('dashboard.workspaceOverview')}</p>
              <h1 className="text-3xl font-bold text-white mb-2 font-display sm:text-4xl">
                {t('dashboard.welcome', { name: user?.name || t('dashboard.coachFallback') })}
              </h1>
              {profile?.niche ? (
                <div className="mt-4 flex min-w-0 w-full flex-wrap items-center gap-3">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setIsNicheModalOpen(true)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setIsNicheModalOpen(true);
                      }
                    }}
                    className="min-w-0 max-w-[calc(100vw-4.5rem)] overflow-hidden rounded-[18px] border border-cyan-300/18 bg-white/[0.04] px-3 py-2.5 text-left transition hover:border-cyan-300/28 hover:bg-white/[0.06] sm:max-w-full sm:rounded-[20px] sm:px-4 sm:py-3"
                    aria-haspopup="dialog"
                    aria-expanded={isNicheModalOpen}
                    title={t('dashboard.yourNiche')}
                  >
                    <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-slate-400">{t('dashboard.yourNiche')}</p>
                    <div className="mt-1 flex min-w-0 items-start gap-3">
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-cyan-100 sm:text-lg">
                        {displayedNiche}
                      </p>
                      <Link
                        to="/niche-finder"
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-slate-300 transition hover:border-cyan-300/28 hover:bg-white/[0.08] hover:text-white"
                        aria-label={t('dashboard.editNiche')}
                        title={t('dashboard.editNiche')}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <PencilIcon />
                      </Link>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
            <Link to="/settings" className="shrink-0 self-start">
              <Button variant="outline" className="flex items-center gap-2">
                {t('dashboard.settings')}
              </Button>
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
              <p className="console-kicker mb-3">{t('dashboard.generatedIdeas')}</p>
              <div className="text-4xl font-bold text-white">{isLoading ? '...' : stats?.totalIdeas || 0}</div>
              <p className="mt-2 text-xs text-slate-400">{isLoading ? '...' : `${stats?.ideasThisMonth || 0} ${t('dashboard.thisMonth')}`}</p>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
              <p className="console-kicker mb-3">{t('dashboard.contentAnalyzed')}</p>
              <div className="text-4xl font-bold text-white">{isLoading ? '...' : stats?.totalFeedbacks || 0}</div>
              <p className="mt-2 text-xs text-slate-400">{isLoading ? '...' : `${stats?.feedbacksThisMonth || 0} ${t('dashboard.thisMonth')}`}</p>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
              <p className="console-kicker mb-3">{t('dashboard.dailyStreak')}</p>
              <div className="text-4xl font-bold text-white">{isLoading ? '...' : `${stats?.streak || 0} 🔥`}</div>
              <p className="mt-2 text-xs text-slate-400">{t('dashboard.activeDays')}</p>
            </div>
          </div>
        </div>

        {/* Niche Setup Prompt */}
        {!hasNicheSetup && (
          <Card className="mb-8 border-cyan-300/28 bg-[linear-gradient(135deg,rgba(114,202,255,0.12),rgba(9,18,34,0.82))]">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-brand-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-3xl">🎯</span>
              </div>
              <div className="flex-grow">
                <h3 className="text-xl font-bold text-white mb-2 font-display">
                  {t('dashboard.completeProfileTitle')}
                </h3>
                <p className="mb-4 text-slate-300/78">
                  {t('dashboard.completeProfileText')}
                </p>
                <Link to="/niche-finder">
                  <Button>🎯 {t('dashboard.setNicheNow')}</Button>
                </Link>
              </div>
            </div>
          </Card>
        )}

        {/* Brand Voice Prompt */}
        {profile?.hasIcpProfile && !hasContentPreferences && (
          <Card className="mb-8 border-violet-300/25 bg-[linear-gradient(135deg,rgba(167,139,250,0.12),rgba(9,18,34,0.84))]">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-3xl">🎥</span>
              </div>
              <div className="flex-grow">
                <h3 className="text-xl font-bold text-white mb-2 font-display">
                  {t('dashboard.setBrandVoice')}
                </h3>
                <p className="mb-4 text-slate-300/78">
                  {t('dashboard.setBrandVoiceText')}
                </p>
                <Link to="/content-preferences">
                  <Button>🗣️ {t('dashboard.completeBrandVoice')}</Button>
                </Link>
              </div>
            </div>
          </Card>
        )}

        {/* Quick Actions */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <Link to="/daily-idea">
            <Card hover className="h-full cursor-pointer group">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-brand-500/20 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-brand-500/30 transition-colors">
                  <span className="text-3xl">💡</span>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-2 font-display">
                    Daily Idea
                  </h3>
                  <p className="text-slate-300/74 text-sm">
                    {t('dashboard.dailyIdeaDesc')}
                  </p>
                  {stats?.ideasThisWeek !== undefined && stats.ideasThisWeek > 0 && (
                    <p className="text-cyan-200 text-xs mt-2">
                      {t('dashboard.generatedThisWeek', { count: stats.ideasThisWeek })}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          </Link>

          <Link to="/niche-finder">
            <Card hover className="h-full cursor-pointer group">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-brand-500/20 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-brand-500/30 transition-colors">
                  <span className="text-3xl">🎯</span>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-2 font-display">
                    Niche Finder
                  </h3>
                  <p className="text-slate-300/74 text-sm">
                    {t('dashboard.nicheFinderDesc')}
                  </p>
                  <p className="text-cyan-200 text-xs mt-2">
                    {hasNicheSetup ? t('dashboard.profileComplete') : t('dashboard.profileMissing')}
                  </p>
                </div>
              </div>
            </Card>
          </Link>

          <Link to="/content-review">
            <Card hover className="h-full cursor-pointer group">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-brand-500/20 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-brand-500/30 transition-colors">
                  <span className="text-3xl">📊</span>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-2 font-display">
                    Content Review
                  </h3>
                  <p className="text-slate-300/74 text-sm">
                    {t('dashboard.contentReviewDesc')}
                  </p>
                  {stats?.avgOverallScore !== undefined && stats.avgOverallScore > 0 && (
                    <p className="text-cyan-200 text-xs mt-2">
                      {t('dashboard.avgScore', { score: stats.avgOverallScore })}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          </Link>

          <Link to="/content-preferences">
            <Card hover className="h-full cursor-pointer group">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-purple-500/30 transition-colors">
                  <span className="text-3xl">🗣️</span>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-2 font-display">
                    Brand Voice
                  </h3>
                  <p className="text-slate-300/74 text-sm">
                    {t('dashboard.brandVoiceDesc')}
                  </p>
                  <p className="text-cyan-200 text-xs mt-2">
                    {hasContentPreferences ? t('dashboard.brandVoiceSet') : t('dashboard.brandVoiceMissing')}
                  </p>
                </div>
              </div>
            </Card>
          </Link>

          <Link to="/idea-structure">
            <Card hover className="h-full cursor-pointer group">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500/30 transition-colors">
                  <span className="text-3xl">🧠</span>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-2 font-display">
                    {t('dashboard.ideaStructurer')}
                  </h3>
                  <p className="text-slate-300/74 text-sm">
                    {t('dashboard.ideaStructurerDesc')}
                  </p>
                  <p className="text-brand-500 text-xs mt-2">{t('dashboard.new')}</p>
                </div>
              </div>
            </Card>
          </Link>

          <Link to="/cum-vrei-sa-creezi-content">
            <Card hover className="h-full cursor-pointer group">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-cyan-500/20 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-cyan-500/30 transition-colors">
                  <span className="text-3xl">🎬</span>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-2 font-display">
                    {t('dashboard.contentCreation')}
                  </h3>
                  <p className="text-slate-300/74 text-sm">
                    {t('dashboard.contentCreationDesc')}
                  </p>
                </div>
              </div>
            </Card>
          </Link>
        </div>

        {/* Secondary Actions */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <Card className="h-full cursor-not-allowed border-white/10 bg-white/[0.025] opacity-60 grayscale">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-white/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-3xl">🥗</span>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-xl font-bold text-white font-display">
                    {t('dashboard.nutritionTitle')}
                  </h3>
                </div>
                <p className="text-slate-300/74 text-sm">
                  {t('dashboard.nutritionDesc')}
                </p>
                <span className="inline-block mt-2 px-3 py-1 bg-white/10 text-slate-300 text-xs font-semibold rounded-full">
                  {t('nav.upcoming')}
                </span>
              </div>
            </div>
          </Card>

          <Link to="/email">
            <Card hover className="h-full cursor-pointer group border-blue-500/30">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500/30 transition-colors">
                  <span className="text-3xl">📧</span>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-xl font-bold text-white font-display">
                      {t('dashboard.emailMarketingTitle')}
                    </h3>
                  </div>
                  <p className="text-slate-300/74 text-sm">
                    {t('dashboard.emailMarketingDesc')}
                  </p>
                  <span className="inline-block mt-2 px-3 py-1 bg-blue-500/20 text-blue-400 text-xs font-semibold rounded-full">
                    {t('dashboard.new')}
                  </span>
                </div>
              </div>
            </Card>
          </Link>

          <Link to="/chat">
            <Card hover className="h-full cursor-pointer group border-brand-500/30">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-brand-500/20 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-brand-500/30 transition-colors">
                  <span className="text-3xl">🤖</span>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-xl font-bold text-white font-display">
                      {t('dashboard.chatTitle')}
                    </h3>
                  </div>
                  <p className="text-gray-300 text-sm">
                    {t('dashboard.chatDesc')}
                  </p>
                  <span className="inline-block mt-2 px-3 py-1 bg-brand-500/20 text-brand-500 text-xs font-semibold rounded-full">
                    {t('dashboard.liveNow')}
                  </span>
                </div>
              </div>
            </Card>
          </Link>
        </div>

        {/* Recent Activity */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Recent Ideas */}
          <Card>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white font-display">{t('dashboard.recentIdeas')}</h3>
              <Link to="/idea-history">
                <Button variant="outline" size="sm">
                  {t('dashboard.viewAll')}
                </Button>
              </Link>
            </div>

            {isLoading ? (
              <div className="text-center py-8 text-slate-400">{t('dashboard.loading')}</div>
            ) : localizedRecentIdeas.length > 0 ? (
              <div className="space-y-3">
                {localizedRecentIdeas.map((idea: any, index: number) => (
                  <Link
                    key={`${idea.id}-${index}`}
                    to={`/idea/${idea.id}`}
                    className="block"
                  >
                    <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4 transition-colors cursor-pointer group hover:border-cyan-300/25">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex-grow">
                          <p className="text-white font-medium text-sm line-clamp-2 group-hover:text-cyan-200 transition-colors">
                            {idea.hook}
                          </p>
                          {idea.objective && (
                            <p className="text-slate-500 text-xs mt-1">
                              🎯 {getLocalizedObjective(idea.objective)}
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-slate-500 whitespace-nowrap">
                          {new Date(idea.createdAt).toLocaleDateString(dashboardLocale, {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="rounded-full bg-cyan-300/10 px-2 py-1 text-xs font-medium text-cyan-100">
                          {idea.format}
                        </span>
                        {/* conversion hidden */}
                        {idea.used && (
                          <span className="text-xs text-cyan-200 font-semibold">{t('dashboard.used')}</span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-slate-400 mb-4">{t('dashboard.noIdeasYet')}</p>
                <Link to="/daily-idea">
                  <Button size="sm">{t('dashboard.generateFirstIdea')}</Button>
                </Link>
              </div>
            )}
          </Card>

          {/* Recent Content Reviews */}
          <Card>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white font-display">{t('dashboard.recentReviewedContent')}</h3>
              <Link to="/content-review">
                <Button variant="outline" size="sm">
                  {t('dashboard.analyze')}
                </Button>
              </Link>
            </div>

            {isLoading ? (
              <div className="text-center py-8 text-slate-400">{t('dashboard.loading')}</div>
            ) : recentActivity?.feedbacks && recentActivity.feedbacks.length > 0 ? (
              <div className="space-y-3">
                {recentActivity.feedbacks.map((feedback: any, index: number) => (
                  <Link
                    key={`${feedback.id}-${index}`}
                    to={`/feedback/${feedback.id}`}
                    className="block"
                  >
                    <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4 transition-colors cursor-pointer group hover:border-cyan-300/25">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex-grow">
                          <p className="text-white font-medium text-sm line-clamp-1 group-hover:text-cyan-200 transition-colors">
                            📄 {feedback.fileName}
                          </p>
                          <p className="text-slate-500 text-xs mt-1">
                            {new Date(feedback.createdAt).toLocaleDateString(dashboardLocale, {
                              day: 'numeric',
                              month: 'short',
                            })}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-white">
                            {feedback.overallScore}
                            <span className="text-sm text-slate-400">/100</span>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400 w-20">{t('dashboard.clarity')}</span>
                          <div className="flex-grow rounded-full h-2 overflow-hidden bg-white/8">
                            <div
                              className="h-full rounded-full bg-[linear-gradient(90deg,#8CF8D4,#72CAFF)] transition-all"
                              style={{ width: `${feedback.clarityScore}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-400 w-8 text-right">
                            {feedback.clarityScore}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400 w-20">CTA</span>
                          <div className="flex-grow rounded-full h-2 overflow-hidden bg-white/8">
                            <div
                              className="h-full rounded-full bg-[linear-gradient(90deg,#8CF8D4,#72CAFF)] transition-all"
                              style={{ width: `${feedback.ctaScore}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-400 w-8 text-right">
                            {feedback.ctaScore}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-slate-400 mb-4">{t('dashboard.noAnalyzedContentYet')}</p>
                <Link to="/content-review">
                  <Button size="sm">{t('dashboard.analyzeContent')}</Button>
                </Link>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
