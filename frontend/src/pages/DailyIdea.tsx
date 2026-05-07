import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI, ideaAPI } from '@/services/api';
import Button from '@/components/Button';
import Card from '@/components/Card';
import IdeaCard from '@/components/IdeaCard';
import { useI18n } from '@/hooks/useI18n';
import { useLocalizedNicheProfile } from '@/hooks/useLocalizedNicheProfile';

const GENERAL_IDEA_PROMPT_COUNT_KEY = 'daily-idea-general-count';
const GENERAL_IDEA_NICHE_PROMPT_SHOWN_KEY = 'daily-idea-niche-prompt-shown';

type Scene = { scene?: number; number?: number; text?: string; description?: string; visual?: string };
type IdeaPayload = {
  id?: string;
  format: 'REEL' | 'CAROUSEL' | 'STORY' | string;
  hook: string;
  script: Scene[];
  cta: string;
  dmKeyword?: string;
  reasoning?: string;
  objective?: string;
  conversionRate?: number | string;
};
type MultiIdeas = {
  reel: IdeaPayload;
  carousel: IdeaPayload;
  story: IdeaPayload;
  source?: string;
};

export default function DailyIdea() {
  const outputRef = useRef<HTMLDivElement | null>(null);
  const generationLockRef = useRef(false);
  const navigate = useNavigate();
  const { language, t } = useI18n();
  const [generationMode, setGenerationMode] = useState<'niche' | 'general'>('niche');
  const [showNichePrompt, setShowNichePrompt] = useState(false);
  // Check if user has niche set
  const { data: userData } = useQuery({
    queryKey: ['user-me'],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      if (!token) return null;
      const { data } = await authAPI.me();
      return data.user;
    },
    enabled: !!localStorage.getItem('token'), // Only run if token exists
    retry: 1,
  });

  const generateMutation = useMutation({
    mutationFn: (mode: 'niche' | 'general') =>
      ideaAPI.generateMultiFormat({ general: mode === 'general' }),
    onSettled: () => {
      generationLockRef.current = false;
    },
  });

  const [activeTab, setActiveTab] = useState<'reel' | 'carousel' | 'story'>('reel');
  const [editableIdeas, setEditableIdeas] = useState<MultiIdeas | null>(null);
  const [regeneratingScenes, setRegeneratingScenes] = useState<number[]>([]);
  const [isRegeneratingHook, setIsRegeneratingHook] = useState(false);
  const generatedIdeas = editableIdeas || generateMutation.data?.data;
  const hasCompleteIdeaSet =
    !!generatedIdeas?.reel && !!generatedIdeas?.carousel && !!generatedIdeas?.story;
  const hasGeneratedIdea = generateMutation.isSuccess && hasCompleteIdeaSet;
  const hasMalformedIdeaResponse = generateMutation.isSuccess && !hasCompleteIdeaSet;
  const isProcessing = generateMutation.isPending;
  const activeIdea = generatedIdeas?.[activeTab];
  const localizedProfile = useLocalizedNicheProfile({
    niche: userData?.niche,
    icpProfile: userData?.icpProfile,
    positioningMessage: userData?.positioningMessage,
    enabled: !!userData,
  });

  const handleGenerate = (mode: 'niche' | 'general') => {
    if (generationLockRef.current || generateMutation.isPending) {
      return;
    }

    setGenerationMode(mode);
    setEditableIdeas(null);
    generationLockRef.current = true;
    generateMutation.mutate(mode);
  };

  const handleRegenerateScene = async (sceneNumber: number) => {
    if (!activeIdea || regeneratingScenes.includes(sceneNumber)) {
      return;
    }

    try {
      setRegeneratingScenes((prev) => [...prev, sceneNumber]);
      const normalizedScript = (activeIdea.script || [])
        .map((scene: Scene, idx: number) => ({
          scene: scene.scene ?? scene.number ?? idx + 1,
          text: scene.text ?? scene.description ?? '',
          visual: scene.visual || '',
        }))
        .filter((scene: { scene: number }) => scene.scene >= 1 && scene.scene <= 5);

      const response = await ideaAPI.regenerateScene({
        idea: {
          format: (activeIdea.format || '').toUpperCase() as 'REEL' | 'CAROUSEL' | 'STORY',
          hook: activeIdea.hook,
          script: normalizedScript,
          cta: activeIdea.cta,
          dmKeyword: activeIdea.dmKeyword || '',
        },
        targetScene: sceneNumber,
      });

      const regeneratedScene = response.data?.scene;
      if (!regeneratedScene?.text) {
        return;
      }

      setEditableIdeas((prev) => {
        if (!prev) return prev;
        const current = prev[activeTab];
        const nextScript = [...(current.script || [])];
        const existingIndex = nextScript.findIndex(
          (scene, idx) => (scene.scene ?? scene.number ?? idx + 1) === sceneNumber
        );

        const nextScene = {
          scene: sceneNumber,
          text: regeneratedScene.text,
          visual: regeneratedScene.visual || '',
        };

        if (existingIndex >= 0) {
          nextScript[existingIndex] = nextScene;
        } else {
          nextScript.push(nextScene);
        }

        nextScript.sort((a, b) => (a.scene ?? a.number ?? 99) - (b.scene ?? b.number ?? 99));

        return {
          ...prev,
          [activeTab]: {
            ...current,
            script: nextScript,
          },
        };
      });
    } finally {
      setRegeneratingScenes((prev) => prev.filter((value) => value !== sceneNumber));
    }
  };

  const handleRegenerateHook = async () => {
    if (!activeIdea || isRegeneratingHook) {
      return;
    }

    try {
      setIsRegeneratingHook(true);
      const normalizedScript = (activeIdea.script || [])
        .map((scene: Scene, idx: number) => ({
          scene: scene.scene ?? scene.number ?? idx + 1,
          text: scene.text ?? scene.description ?? '',
          visual: scene.visual || '',
        }))
        .filter((scene: { scene: number }) => scene.scene >= 1 && scene.scene <= 5);

      const response = await ideaAPI.regenerateHook({
        idea: {
          format: (activeIdea.format || '').toUpperCase() as 'REEL' | 'CAROUSEL' | 'STORY',
          hook: activeIdea.hook,
          script: normalizedScript,
          cta: activeIdea.cta,
          dmKeyword: activeIdea.dmKeyword || '',
        },
      });

      const regeneratedHook = response.data?.hook;
      if (!regeneratedHook) {
        return;
      }

      setEditableIdeas((prev) => {
        if (!prev) return prev;
        const current = prev[activeTab];
        return {
          ...prev,
          [activeTab]: {
            ...current,
            hook: regeneratedHook,
          },
        };
      });
    } finally {
      setIsRegeneratingHook(false);
    }
  };

  const hasNiche = !!userData?.niche;
  const hasBrandVoice = !!userData?.contentPreferences?.brandVoice;

  useEffect(() => {
    if (!hasNiche) {
      return;
    }

    window.localStorage.removeItem(GENERAL_IDEA_PROMPT_COUNT_KEY);
    window.localStorage.removeItem(GENERAL_IDEA_NICHE_PROMPT_SHOWN_KEY);
  }, [hasNiche]);

  useEffect(() => {
    if (!hasGeneratedIdea || isProcessing) {
      return;
    }

    const timer = window.setTimeout(() => {
      outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [hasGeneratedIdea, isProcessing, activeTab]);

  useEffect(() => {
    if (generateMutation.data?.data) {
      setEditableIdeas(generateMutation.data.data as MultiIdeas);
    }
  }, [generateMutation.data]);

  useEffect(() => {
    if (!generateMutation.isSuccess || !generateMutation.data?.data || hasNiche || generationMode !== 'general') {
      return;
    }

    const currentCount =
      Number(window.localStorage.getItem(GENERAL_IDEA_PROMPT_COUNT_KEY) || '0') + 1;
    window.localStorage.setItem(GENERAL_IDEA_PROMPT_COUNT_KEY, String(currentCount));

    const alreadyShown =
      window.localStorage.getItem(GENERAL_IDEA_NICHE_PROMPT_SHOWN_KEY) === 'true';
    if (currentCount >= 2 && !alreadyShown) {
      window.localStorage.setItem(GENERAL_IDEA_NICHE_PROMPT_SHOWN_KEY, 'true');
      setShowNichePrompt(true);
    }
  }, [generateMutation.isSuccess, generateMutation.data, generationMode, hasNiche]);

  return (
    <div className="min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div
          className={`console-hero overflow-hidden transition-all duration-500 ease-in-out ${
            hasGeneratedIdea ? 'mb-6 max-h-[220px] min-h-0 py-4' : 'mb-12 min-h-[420px] py-0'
          }`}
        >
          <div className="console-orb left-[-4rem] top-[-2rem] h-32 w-32 bg-cyan-300/18 animate-float-slow" />
          <div className="console-orb right-0 top-12 h-28 w-28 bg-indigo-300/16 animate-float-delay" />
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <span className="console-badge">{t('daily.badge')}</span>
          </div>
          <h1
            className={`mt-2 mb-4 font-bold text-white font-display transition-all duration-500 ease-in-out ${
              hasGeneratedIdea ? 'text-2xl sm:text-3xl' : 'text-4xl sm:text-5xl'
            }`}
          >
            {hasGeneratedIdea ? t('daily.generatedTitle') : (
              <>
                {t('daily.readyTitle')}{' '}
                <span className="bg-gradient-to-r from-[#8CF8D4] via-[#72CAFF] to-[#A78BFA] bg-clip-text text-transparent">{t('daily.readyHighlight')}</span>
              </>
            )}
          </h1>
          <p className={`max-w-2xl text-slate-300/78 transition-all duration-500 ease-in-out ${hasGeneratedIdea ? 'text-sm' : 'text-lg'}`}>
            {hasGeneratedIdea
              ? t('daily.generatedText')
              : t('daily.readyText')}
          </p>
          {!hasGeneratedIdea && (
            <div className="mt-8 grid gap-3 md:grid-cols-3">
              <div className="console-stat">
                <p className="console-kicker mb-2">{t('daily.formats')}</p>
                <p className="text-2xl font-bold text-white">Reel / Carousel / Story</p>
              </div>
              <div className="console-stat">
                <p className="console-kicker mb-2">{t('daily.input')}</p>
                <p className="text-2xl font-bold text-white">
                  {hasNiche ? t('daily.nicheOrGeneral') : t('daily.generalFirst')}
                </p>
              </div>
              <div className="console-stat">
                <p className="console-kicker mb-2">{t('daily.latency')}</p>
                <p className="text-2xl font-bold text-white">&lt; 2 min</p>
              </div>
            </div>
          )}
        </div>

        {/* Generate Button */}
        {!hasGeneratedIdea && (
          <div className="text-center mb-12">
            <div className="flex flex-wrap justify-center gap-3">
              {hasNiche && (
                <Button
                  onClick={() => handleGenerate('niche')}
                  size="lg"
                  isLoading={isProcessing && generationMode === 'niche'}
                  className="px-12"
                >
                  {isProcessing && generationMode === 'niche'
                    ? t('daily.generating')
                    : t('daily.generateNiche')}
                </Button>
              )}
              <Button
                onClick={() => handleGenerate('general')}
                size="lg"
                variant={hasNiche ? 'outline' : 'primary'}
                isLoading={isProcessing && generationMode === 'general'}
                className="px-8"
              >
                {hasNiche ? t('daily.generateGeneral') : t('daily.generateRandom')}
              </Button>
              {!hasNiche && (
                <Button
                  onClick={() => navigate('/niche-finder')}
                  size="lg"
                  variant="outline"
                  className="px-8"
                >
                  {t('daily.setNiche')}
                </Button>
              )}
            </div>
            {userData?.niche ? (
              <p className="mt-3 text-sm text-slate-300/74">
                {t('daily.yourNiche')}: <span className="text-console-accent">{localizedProfile.niche || userData.niche}</span>
              </p>
            ) : (
              <p className="mt-3 text-sm text-slate-300/74">
                {t('daily.noNicheNeeded')}
              </p>
            )}
            <p className="mt-2 text-xs text-slate-400">
              {t('daily.generalIgnoresNiche')}
            </p>
            {!hasBrandVoice && (
              <p className="mt-2 text-xs text-yellow-300">
                {t('daily.brandVoiceHint')}{' '}
                <Link to="/content-preferences" className="underline">
                  Brand Voice
                </Link>
                .
              </p>
            )}
            <p className="mt-2 text-xs text-slate-400">
              {t('daily.generationCanTake')}
            </p>
          </div>
        )}

        {/* Loading State */}
        {isProcessing && (
          <Card className="mx-auto max-w-3xl py-12 text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full border-4 border-cyan-300/50 border-t-transparent animate-spin" />
            <h3 className="text-xl font-bold text-white mb-2">
              {generationMode === 'general' ? t('daily.generatingGeneralSet') : t('daily.generatingIdea')}
            </h3>
            <p className="text-slate-300/78">
              {generationMode === 'general'
                ? t('daily.generatingGeneralText')
                : t('daily.generatingNicheText')}
            </p>
          </Card>
        )}

        {/* Error State */}
        {(generateMutation.isError || hasMalformedIdeaResponse) && (
          <Card className="max-w-3xl mx-auto bg-red-500/10 border-red-500/50 text-center py-8">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl">
                {!hasMalformedIdeaResponse && (generateMutation.error as any)?.response?.status === 429 ? '⏰' : '⚠️'}
              </span>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">
              {!hasMalformedIdeaResponse && (generateMutation.error as any)?.response?.status === 429
                ? t('daily.limitReached')
                : t('daily.oops')}
            </h3>
            <p className="text-gray-300 mb-6">
              {hasMalformedIdeaResponse
                ? t('daily.malformed')
                : (generateMutation.error as any)?.response?.data?.message || 
                  (generateMutation.error as any)?.response?.data?.error ||
                  t('daily.generateError')}
            </p>
            {!hasMalformedIdeaResponse && (generateMutation.error as any)?.response?.status === 429 ? (
              <div className="flex gap-3 justify-center">
                <Link to="/idea-history">
                  <Button variant="outline">
                    {t('daily.viewGeneratedIdeas')}
                  </Button>
                </Link>
                <Button onClick={() => generateMutation.reset()}>
                  {t('daily.okUnderstood')}
                </Button>
              </div>
            ) : (
              <div className="flex gap-3 justify-center">
                {!hasNiche && (
                  <Link to="/niche-finder">
                    <Button variant="outline">
                      🎯 {t('daily.setNiche')}
                    </Button>
                  </Link>
                )}
                <Button onClick={() => handleGenerate(generationMode)}>
                  {t('daily.tryAgain')}
                </Button>
              </div>
            )}
          </Card>
        )}

        {/* Success - Display Ideas with Tabs */}
        {hasGeneratedIdea && (
          <>
            {/* Idea Header Info */}
            <div ref={outputRef} id="generated-output" className="mb-6 scroll-mt-24">
              <Card className="max-w-3xl mx-auto">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10">
                      <span className="text-2xl">💡</span>
                    </div>
                    <div>
                      <h3 className="text-white font-bold">{t('daily.ideaOfDay')}</h3>
                      <p className="text-sm text-slate-300/72">
                        {new Date().toLocaleDateString(language === 'en' ? 'en-US' : 'ro-RO', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {generationMode === 'general' ? t('daily.generalMode') : t('daily.nicheMode')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => setActiveTab('reel')}
                      className={`console-option flex items-center gap-2 px-4 py-2 text-sm font-semibold ${
                        activeTab === 'reel'
                          ? 'console-option-active text-white'
                          : 'text-slate-300/78'
                      }`}
                    >
                      <span>🎬</span>
                      REEL
                    </button>
                    <button
                      onClick={() => setActiveTab('carousel')}
                      className={`console-option flex items-center gap-2 px-4 py-2 text-sm font-semibold ${
                        activeTab === 'carousel'
                          ? 'console-option-active text-white'
                          : 'text-slate-300/78'
                      }`}
                    >
                      <span>📊</span>
                      CAROUSEL
                    </button>
                    <button
                      onClick={() => setActiveTab('story')}
                      className={`console-option flex items-center gap-2 px-4 py-2 text-sm font-semibold ${
                        activeTab === 'story'
                          ? 'console-option-active text-white'
                          : 'text-slate-300/78'
                      }`}
                    >
                      <span>⚡</span>
                      STORY
                    </button>
                  </div>
                </div>
              </Card>
            </div>

            {/* Display Active Format Idea Card */}
            {activeIdea && (
              <div className="max-w-3xl mx-auto">
              <IdeaCard
                idea={activeIdea}
                onRegenerateHook={handleRegenerateHook}
                isRegeneratingHook={isRegeneratingHook}
                onRegenerateScene={handleRegenerateScene}
                regeneratingScenes={regeneratingScenes}
              />
              </div>
            )}

            {/* Actions */}
            <div className="mx-auto mt-8 flex max-w-3xl justify-center md:sticky md:bottom-4 md:z-20">
              <div className="flex flex-wrap justify-center gap-4 rounded-[24px] border border-white/10 bg-[rgba(5,10,20,0.88)] px-4 py-4 backdrop-blur-xl">
                <Button
                  onClick={() => handleGenerate(generationMode)}
                  variant="outline"
                  isLoading={isProcessing}
                >
                  {t('daily.generateAnother')}
                </Button>
                <Link to="/idea-history">
                  <Button variant="outline">{t('daily.viewHistory')}</Button>
                </Link>
              </div>
            </div>
          </>
        )}

        {/* How It Works */}
        {!generateMutation.isSuccess && !hasMalformedIdeaResponse && (
          <div className="max-w-3xl mx-auto mt-16">
            <h2 className="text-2xl font-bold text-white text-center mb-8 font-display">
              {t('daily.howItWorks')}
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              <Card className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10">
                  <span className="text-2xl">🎯</span>
                </div>
                <h3 className="text-white font-semibold mb-2">{t('daily.stepAnalyze')}</h3>
                <p className="text-sm text-slate-300/72">
                  {t('daily.stepAnalyzeText')}
                </p>
              </Card>

              <Card className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10">
                  <span className="text-2xl">✨</span>
                </div>
                <h3 className="text-white font-semibold mb-2">{t('daily.stepCreate')}</h3>
                <p className="text-sm text-slate-300/72">
                  {t('daily.stepCreateText')}
                </p>
              </Card>

              <Card className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10">
                  <span className="text-2xl">🚀</span>
                </div>
                <h3 className="text-white font-semibold mb-2">{t('daily.stepDeliver')}</h3>
                <p className="text-sm text-slate-300/72">
                  {t('daily.stepDeliverText')}
                </p>
              </Card>
            </div>
          </div>
        )}
      </div>

      {showNichePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
          <Card className="w-full max-w-xl border-cyan-300/30 bg-[linear-gradient(135deg,rgba(18,34,52,0.98),rgba(5,10,20,0.98))]">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10">
              <span className="text-3xl">🎯</span>
            </div>
            <h2 className="mb-3 text-3xl font-bold text-white font-display">
              {t('daily.nichePromptTitle')}
            </h2>
            <p className="mb-4 text-slate-300/78">
              {t('daily.nichePromptText')}
            </p>
            <p className="mb-6 text-sm text-slate-400">
              {t('daily.nichePromptHint')}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => {
                  setShowNichePrompt(false);
                  navigate('/niche-finder');
                }}
              >
                {t('daily.setNiche')} →
              </Button>
              <Button variant="outline" onClick={() => setShowNichePrompt(false)}>
                {t('daily.later')}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
