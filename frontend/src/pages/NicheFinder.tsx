import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { nicheAPI } from '@/services/api';
import Button from '@/components/Button';
import Card from '@/components/Card';
import Input from '@/components/Input';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/hooks/useI18n';

type Mode = 'select' | 'quick' | 'wizard' | 'preset';

interface PresetNicheOption {
  niche: string;
  description: string;
}

interface WizardAnswers {
  targetAudience: string;
  problemSolved: string;
  results: string;
  clientType: string;
  uniquePosition: string;
}

function getResultValue(value: string | undefined, fallback: string): string {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
}

export default function NicheFinder() {
  const [mode, setMode] = useState<Mode>('select');
  const [quickQuery, setQuickQuery] = useState('');
  const [wizardStep, setWizardStep] = useState(1);
  const [presetNiches, setPresetNiches] = useState<PresetNicheOption[]>([]);
  const [wizardAnswers, setWizardAnswers] = useState<WizardAnswers>({
    targetAudience: '',
    problemSolved: '',
    results: '',
    clientType: '',
    uniquePosition: '',
  });

  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const { t } = useI18n();

  const quickMutation = useMutation({
    mutationFn: (query: string) => nicheAPI.generateQuick({ query, saveToProfile: true }),
    onSuccess: async () => {
      await refreshUser();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['user-me'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] }),
      ]);
      console.log('✅ Niche saved successfully!');
      
      // Auto-redirect to Daily Idea after 3 seconds
      setTimeout(() => {
        navigate('/daily-idea');
      }, 3000);
    },
  });

  const wizardMutation = useMutation({
    mutationFn: (answers: WizardAnswers) => nicheAPI.generateWizard({ ...answers, saveToProfile: true }),
    onSuccess: async () => {
      await refreshUser();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['user-me'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] }),
      ]);
      console.log('✅ Niche saved successfully!');
      
      // Auto-redirect to Daily Idea after 3 seconds
      setTimeout(() => {
        navigate('/daily-idea');
      }, 3000);
    },
  });

  const presetOptionsMutation = useMutation({
    mutationFn: () => nicheAPI.generatePresetOptions(),
    onSuccess: (response) => {
      setPresetNiches(response.data.niches || []);
      setMode('preset');
    },
  });

  const presetSelectionMutation = useMutation({
    mutationFn: (selectedOption: PresetNicheOption) =>
      nicheAPI.savePresetSelection({
        niche: selectedOption.niche,
        description: selectedOption.description,
      }),
    onSuccess: async () => {
      await refreshUser();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['user-me'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] }),
      ]);
      console.log('✅ Preset niche saved successfully!');

      setTimeout(() => {
        navigate('/daily-idea');
      }, 3000);
    },
  });

  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    quickMutation.mutate(quickQuery);
  };

  const handleOpenPresetMode = () => {
    if (presetNiches.length > 0) {
      setMode('preset');
      return;
    }

    presetOptionsMutation.mutate();
  };

  const handlePresetSelect = (selectedOption: PresetNicheOption) => {
    setQuickQuery(selectedOption.niche);
    presetSelectionMutation.mutate(selectedOption);
  };

  const handleWizardNext = () => {
    if (wizardStep < 5) {
      setWizardStep(wizardStep + 1);
    } else {
      wizardMutation.mutate(wizardAnswers);
    }
  };

  const wizardQuestions = [
    {
      step: 1,
      question: t('niche.wizard.q1'),
      placeholder: t('niche.wizard.p1'),
      field: 'targetAudience' as keyof WizardAnswers,
    },
    {
      step: 2,
      question: t('niche.wizard.q2'),
      placeholder: t('niche.wizard.p2'),
      field: 'problemSolved' as keyof WizardAnswers,
    },
    {
      step: 3,
      question: t('niche.wizard.q3'),
      placeholder: t('niche.wizard.p3'),
      field: 'results' as keyof WizardAnswers,
    },
    {
      step: 4,
      question: t('niche.wizard.q4'),
      placeholder: t('niche.wizard.p4'),
      field: 'clientType' as keyof WizardAnswers,
    },
    {
      step: 5,
      question: t('niche.wizard.q5'),
      placeholder: t('niche.wizard.p5'),
      field: 'uniquePosition' as keyof WizardAnswers,
    },
  ];

  if (mode === 'select') {
    return (
      <div className="min-h-screen py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="console-hero mb-12">
            <div className="console-orb left-[-4rem] top-[-3rem] h-32 w-32 bg-cyan-300/18 animate-float-slow" />
            <div className="console-orb right-[-2rem] top-8 h-24 w-24 bg-emerald-300/18 animate-float-delay" />
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <span className="console-badge">{t('niche.badge')}</span>
            </div>
            <h1 className="mt-2 mb-4 text-4xl font-bold text-white font-display sm:text-5xl">
              {t('niche.heroTitle')} <span className="bg-gradient-to-r from-[#8CF8D4] to-[#72CAFF] bg-clip-text text-transparent">{t('niche.heroHighlight')}</span>
            </h1>
            <p className="text-lg text-slate-300/78 max-w-2xl">
              {t('niche.heroText')}
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3 max-w-6xl mx-auto">
            <Card hover className="cursor-pointer" onClick={() => navigate('/niche-quick')}>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10">
                <span className="text-3xl">⚡</span>
              </div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-2xl font-bold text-white font-display">
                {t('niche.quickTitle')}
                </h2>
              </div>
              <p className="mb-6 text-slate-300/78">
                {t('niche.quickText')}
              </p>
              <div className="console-option mb-4 p-4">
                <p className="whitespace-pre-line text-xs text-slate-300/72">
                  {t('niche.quickFeatures')}
                </p>
              </div>
              <Button variant="primary" className="w-full">
                {t('niche.quickButton')}
              </Button>
            </Card>

            <Card hover className="cursor-pointer" onClick={() => navigate('/niche-discover')}>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-300/10">
                <span className="text-3xl">🔍</span>
              </div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-2xl font-bold text-white font-display">
                {t('niche.discoverTitle')}
                </h2>
              </div>
              <p className="mb-6 text-slate-300/78">
                {t('niche.discoverText')}
              </p>
              <div className="console-option mb-4 p-4">
                <p className="whitespace-pre-line text-xs text-slate-300/72">
                  {t('niche.discoverFeatures')}
                </p>
              </div>
              <Button variant="outline" className="w-full">
                {t('niche.discoverButton')}
              </Button>
            </Card>

            <Card hover className="cursor-pointer" onClick={handleOpenPresetMode}>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-300/10">
                <span className="text-3xl">🧠</span>
              </div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-2xl font-bold text-white font-display">
                  {t('niche.presetTitle')}
                </h2>
              </div>
              <p className="mb-6 text-slate-300/78">
                {t('niche.presetText')}
              </p>
              <div className="console-option mb-4 p-4">
                <p className="whitespace-pre-line text-xs text-slate-300/72">
                  {t('niche.presetFeatures')}
                </p>
              </div>
              <Button variant="outline" className="w-full" isLoading={presetOptionsMutation.isPending}>
                {t('niche.presetButton')}
              </Button>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'preset') {
    return (
      <div className="min-h-screen py-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <Button variant="outline" size="sm" onClick={() => setMode('select')} className="mb-6">
            ← {t('common.back')}
          </Button>

          <div className="console-hero mb-8">
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <span className="console-badge">{t('niche.presetBadge')}</span>
            </div>
            <h1 className="mt-2 mb-4 text-4xl font-bold text-white font-display sm:text-5xl">
              {t('niche.presetHeroTitle')}
            </h1>
            <p className="max-w-2xl text-lg text-slate-300/78">
              {t('niche.presetHeroText')}
            </p>
          </div>

          {presetOptionsMutation.isPending && (
            <Card className="mb-8 text-center">
              <p className="text-slate-300/78">{t('niche.presetLoading')}</p>
            </Card>
          )}

          {presetOptionsMutation.isError && (
            <Card className="mb-8 border-red-500/40 bg-red-500/10">
              <p className="text-sm text-red-200">
                {t('niche.presetError')}
              </p>
            </Card>
          )}

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {presetNiches.map((option, index) => (
              <Card key={`${option.niche}-${index}`} className="flex h-full flex-col justify-between">
                <div>
                  <div className="mb-4 inline-flex rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-100">
                    {t('niche.aiOption', { number: index + 1 })}
                  </div>
                  <h2 className="mb-3 text-2xl font-bold text-white font-display">
                    {option.niche}
                  </h2>
                  <p className="mb-6 text-slate-300/78">
                    {option.description}
                  </p>
                </div>
                <Button
                  className="w-full"
                  isLoading={presetSelectionMutation.isPending && quickQuery === option.niche}
                  onClick={() => handlePresetSelect(option)}
                >
                  {t('niche.chooseThis')}
                </Button>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'quick') {
    return (
      <div className="min-h-screen py-12">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <Button variant="outline" size="sm" onClick={() => setMode('select')} className="mb-6">
            ← {t('common.back')}
          </Button>

          <Card className="console-panel-strong">
            <div className="flex items-center gap-4 mb-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10">
                <span className="text-3xl">⚡</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white font-display">{t('niche.quickMode')}</h1>
                <p className="text-gray-300 text-sm">{t('niche.quickModeText')}</p>
              </div>
            </div>

            <form onSubmit={handleQuickSubmit} className="space-y-6">
              <Input
                label={t('niche.describeNiche')}
                placeholder={t('niche.describePlaceholder')}
                value={quickQuery}
                onChange={(e) => setQuickQuery(e.target.value)}
                required
              />

              <Button type="submit" className="w-full" isLoading={quickMutation.isPending}>
                {t('niche.generateProfile')}
              </Button>
            </form>

            {quickMutation.isSuccess && (
              <>
                {/* Success Banner */}
                <div className="mt-6 rounded-[22px] border border-cyan-300/25 bg-cyan-300/12 p-4 text-center">
                  <p className="mb-1 text-lg font-bold text-white">
                    {t('niche.saved')}
                  </p>
                  <p className="text-sm text-slate-200">
                    {t('niche.redirecting')}
                  </p>
                </div>

                {/* Results */}
                <div className="mt-6 space-y-4">
                  <div className="rounded-[22px] border border-cyan-300/25 bg-cyan-300/10 p-6">
                    <h3 className="mb-2 text-sm font-bold uppercase text-console-accent">{t('niche.yourNiche')}</h3>
                    <p className="text-white text-lg">
                      {getResultValue(
                        quickMutation.data.data.niche,
                        t('niche.nicheFallback')
                      )}
                    </p>
                  </div>

                  <div className="console-option p-6">
                    <h3 className="mb-2 text-sm font-bold uppercase text-slate-300/72">
                      {t('niche.idealClient')}
                    </h3>
                    <p className="whitespace-pre-line text-white">
                      {getResultValue(
                        quickMutation.data.data.idealClient,
                        t('niche.idealClientFallback')
                      )}
                    </p>
                  </div>

                  <div className="console-option p-6">
                    <h3 className="mb-2 text-sm font-bold uppercase text-slate-300/72">
                      {t('niche.positioning')}
                    </h3>
                    <p className="whitespace-pre-line text-white">
                      {getResultValue(
                        quickMutation.data.data.positioning,
                        t('niche.positioningFallback')
                      )}
                    </p>
                  </div>

                  {/* Quick Actions */}
                  <div className="flex gap-4 pt-4">
                    <Button onClick={() => navigate('/daily-idea')} className="flex-1">
                      {t('niche.generateFirstIdea')}
                    </Button>
                    <Button onClick={() => navigate('/dashboard')} variant="outline" className="flex-1">
                      {t('niche.goDashboard')}
                    </Button>
                  </div>
                </div>
              </>
            )}

            {quickMutation.isError && (
              <div className="mt-6 bg-red-500/10 border border-red-500 rounded-lg p-4">
                <p className="text-red-500 text-sm">
                  {t('niche.genericError')}
                </p>
              </div>
            )}
          </Card>
        </div>
      </div>
    );
  }

  // Wizard Mode
  const currentQuestion = wizardQuestions[wizardStep - 1];

  return (
    <div className="min-h-screen py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <Button variant="outline" size="sm" onClick={() => setMode('select')} className="mb-6">
          ← {t('common.back')}
        </Button>

        <Card className="console-panel-strong">
          <div className="flex items-center gap-4 mb-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10">
              <span className="text-3xl">🧭</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white font-display">{t('niche.wizardMode')}</h1>
              <p className="text-gray-300 text-sm">
                {t('niche.questionCount', { current: wizardStep, total: 5 })}
              </p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mb-8">
            <div className="h-2 w-full rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#8CF8D4,#72CAFF)] transition-all duration-300"
                style={{ width: `${(wizardStep / 5) * 100}%` }}
              />
            </div>
          </div>

          {!wizardMutation.isSuccess ? (
            <>
              <div className="mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,#8CF8D4,#72CAFF)]">
                    <span className="font-bold text-slate-950">{currentQuestion.step}</span>
                  </div>
                  <h2 className="text-xl font-semibold text-white">
                    {currentQuestion.question}
                  </h2>
                </div>
                <Input
                  placeholder={currentQuestion.placeholder}
                  value={wizardAnswers[currentQuestion.field]}
                  onChange={(e) =>
                    setWizardAnswers({
                      ...wizardAnswers,
                      [currentQuestion.field]: e.target.value,
                    })
                  }
                />
              </div>

              <div className="flex gap-4">
                {wizardStep > 1 && (
                  <Button
                    variant="outline"
                    onClick={() => setWizardStep(wizardStep - 1)}
                    className="flex-1"
                  >
                    ← Înapoi
                  </Button>
                )}
                <Button
                  onClick={handleWizardNext}
                  className="flex-1"
                  isLoading={wizardMutation.isPending}
                  disabled={!wizardAnswers[currentQuestion.field]}
                >
                  {wizardStep === 5 ? t('niche.finish') : t('niche.continue')}
                </Button>
              </div>
            </>
          ) : (
            <>
              {/* Success Banner */}
              <div className="mb-6 rounded-[22px] border border-cyan-300/25 bg-cyan-300/12 p-4 text-center">
                <p className="mb-1 text-lg font-bold text-white">
                  {t('niche.saved')}
                </p>
                <p className="text-sm text-slate-200">
                  {t('niche.redirecting')}
                </p>
              </div>

              {/* Results */}
              <div className="space-y-4">
                <div className="rounded-[22px] border border-cyan-300/25 bg-cyan-300/10 p-6">
                  <h3 className="mb-2 text-sm font-bold uppercase text-console-accent">{t('niche.yourNiche')}</h3>
                  <p className="text-white text-lg">
                    {getResultValue(
                      wizardMutation.data.data.niche,
                      t('niche.nicheFallback')
                    )}
                  </p>
                </div>

                <div className="console-option p-6">
                  <h3 className="mb-2 text-sm font-bold uppercase text-slate-300/72">{t('niche.idealClient')}</h3>
                  <p className="whitespace-pre-line text-white">
                    {getResultValue(
                      wizardMutation.data.data.idealClient,
                      t('niche.idealClientFallback')
                    )}
                  </p>
                </div>

                <div className="console-option p-6">
                  <h3 className="mb-2 text-sm font-bold uppercase text-slate-300/72">
                    {t('niche.positioning')}
                  </h3>
                  <p className="whitespace-pre-line text-white">
                    {getResultValue(
                      wizardMutation.data.data.positioning,
                      t('niche.positioningFallback')
                    )}
                  </p>
                </div>

                {/* Quick Actions */}
                <div className="flex gap-4 pt-4">
                  <Button onClick={() => navigate('/daily-idea')} className="flex-1">
                    {t('niche.generateFirstIdea')}
                  </Button>
                  <Button onClick={() => navigate('/dashboard')} variant="outline" className="flex-1">
                    {t('niche.goDashboard')}
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
