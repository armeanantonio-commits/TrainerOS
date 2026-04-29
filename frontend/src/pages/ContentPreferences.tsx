import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '@/services/api';
import Button from '@/components/Button';
import Card from '@/components/Card';
import { useI18n } from '@/hooks/useI18n';

interface BrandVoiceData {
  perception: string[];
  naturalStyle: string;
  neverDo: string[];
  principles: string[];
  customPrinciple: string;
  ctaStyle: string;
  brandWords: string[];
  frequentPhrases: string;
  humorTone: string;
}

const totalSteps = 8;

export default function ContentPreferences() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<BrandVoiceData>({
    perception: [],
    naturalStyle: '',
    neverDo: [],
    principles: [],
    customPrinciple: '',
    ctaStyle: '',
    brandWords: [],
    frequentPhrases: '',
    humorTone: '',
  });

  const preferencesQuery = useQuery({
    queryKey: ['content-preferences'],
    queryFn: async () => {
      const { data } = await api.get('/niche/content-preferences');
      return data;
    },
  });

  useEffect(() => {
    const payload = preferencesQuery.data?.contentPreferences?.brandVoice;
    if (!payload) return;
    setFormData({
      perception: payload.perception || [],
      naturalStyle: payload.naturalStyle || '',
      neverDo: payload.neverDo || [],
      principles: payload.principles || [],
      customPrinciple: payload.customPrinciple || '',
      ctaStyle: payload.ctaStyle || '',
      brandWords: payload.brandWords || [],
      frequentPhrases: payload.frequentPhrases || '',
      humorTone: payload.humorTone || '',
    });
  }, [preferencesQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async (data: BrandVoiceData) => {
      return api.post('/niche/content-preferences', {
        type: 'brand-voice',
        version: 1,
        completedAt: new Date().toISOString(),
        brandVoice: data,
      });
    },
    onSuccess: () => {
      const hasContentCreation = !!preferencesQuery.data?.contentPreferences?.contentCreation;
      void queryClient.invalidateQueries({ queryKey: ['content-preferences'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      void queryClient.invalidateQueries({ queryKey: ['user-me'] });
      navigate(hasContentCreation ? '/dashboard' : '/cum-vrei-sa-creezi-content?setupFlow=1');
    },
  });

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  const toggleArray = (field: keyof BrandVoiceData, value: string, max: number) => {
    const current = formData[field] as string[];
    if (current.includes(value)) {
      setFormData({ ...formData, [field]: current.filter((v) => v !== value) });
      setError(null);
      return;
    }
    if (current.length >= max) {
      setError(t('prefs.maxOptions', { max }));
      return;
    }
    setFormData({ ...formData, [field]: [...current, value] });
    setError(null);
  };

  const canGoNext = () => {
    switch (step) {
      case 1:
        return formData.perception.length >= 1 && formData.perception.length <= 2;
      case 2:
        return !!formData.naturalStyle;
      case 3:
        return formData.neverDo.length >= 1 && formData.neverDo.length <= 2;
      case 4:
        return formData.principles.length >= 1 && formData.principles.length <= 2;
      case 5:
        return !!formData.ctaStyle;
      case 6:
        return formData.brandWords.length === 3;
      case 7:
        return true;
      case 8:
        return true;
      default:
        return true;
    }
  };

  const handleSubmit = () => {
    if (!canGoNext()) {
      setError(t('prefs.requiredError'));
      return;
    }
    saveMutation.mutate(formData);
  };

  return (
    <div className="min-h-screen bg-dark-400 py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">
              {t('prefs.questionProgress', { current: step, total: totalSteps })}
            </span>
            <span className="text-sm text-brand-500 font-semibold">{t('prefs.durationBrand')}</span>
          </div>
          <div className="w-full bg-dark-200 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-500 to-brand-600 transition-all duration-300"
              style={{ width: `${(step / totalSteps) * 100}%` }}
            />
          </div>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-3 font-display">{t('brand.title')}</h1>
          <p className="text-gray-300 text-lg">
            {t('brand.subtitle')}
          </p>
        </div>

        <Card>
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-white font-display">
                {t('brand.q1')}
              </h2>
              <p className="text-gray-400 text-sm">{t('brand.max2')}</p>
              {[
                { value: 'Direct și clar', label: t('brand.perception.direct') },
                { value: 'Prietenos și cald', label: t('brand.perception.warm') },
                { value: 'Funny și relatable', label: t('brand.perception.funny') },
                { value: 'Serios și autoritar', label: t('brand.perception.authoritative') },
                { value: 'Calm și educativ', label: t('brand.perception.calm') },
                { value: 'Energic și “pushy” (pozitiv)', label: t('brand.perception.energetic') },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => toggleArray('perception', option.value, 2)}
                  className={`w-full text-left px-6 py-4 rounded-lg border-2 transition-all ${
                    formData.perception.includes(option.value)
                      ? 'border-brand-500 bg-brand-500/10 text-white'
                      : 'border-dark-200 hover:border-dark-100 text-gray-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-white font-display">{t('brand.q2')}</h2>
              {[
                { value: 'Simplu, pe înțelesul tuturor', label: t('brand.style.simple') },
                { value: 'Mix: simplu + un pic tehnic', label: t('brand.style.mix') },
                { value: 'Mai tehnic (pentru oameni deja avansați)', label: t('brand.style.technical') },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setFormData({ ...formData, naturalStyle: option.value })}
                  className={`w-full text-left px-6 py-4 rounded-lg border-2 transition-all ${
                    formData.naturalStyle === option.value
                      ? 'border-brand-500 bg-brand-500/10 text-white'
                      : 'border-dark-200 hover:border-dark-100 text-gray-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-white font-display">
                {t('brand.q3')}
              </h2>
              <p className="text-gray-400 text-sm">{t('brand.max2')}</p>
              {[
                { value: 'Rușinare / motivare toxică', label: t('brand.never.shame') },
                { value: 'Promisiuni rapide', label: t('brand.never.promises') },
                { value: 'Extreme', label: t('brand.never.extreme') },
                { value: 'Prea tehnic / rigid', label: t('brand.never.rigid') },
                { value: 'Clickbait', label: t('brand.never.clickbait') },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => toggleArray('neverDo', option.value, 2)}
                  className={`w-full text-left px-6 py-4 rounded-lg border-2 transition-all ${
                    formData.neverDo.includes(option.value)
                      ? 'border-brand-500 bg-brand-500/10 text-white'
                      : 'border-dark-200 hover:border-dark-100 text-gray-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-white font-display">
                {t('brand.q4')}
              </h2>
              <p className="text-gray-400 text-sm">{t('brand.max2')}</p>
              {[
                { value: 'Consistență > perfecțiune', label: t('brand.principle.consistency') },
                { value: 'Simplitate > programe complicate', label: t('brand.principle.simplicity') },
                { value: 'Tehnică > greutăți mari', label: t('brand.principle.technique') },
                { value: 'Obiceiuri > dietă extremă', label: t('brand.principle.habits') },
                { value: 'Sănătate & performanță > doar estetic', label: t('brand.principle.health') },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => toggleArray('principles', option.value, 2)}
                  className={`w-full text-left px-6 py-4 rounded-lg border-2 transition-all ${
                    formData.principles.includes(option.value)
                      ? 'border-brand-500 bg-brand-500/10 text-white'
                      : 'border-dark-200 hover:border-dark-100 text-gray-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  {t('brand.customPrinciple')}
                </label>
                <input
                  type="text"
                  value={formData.customPrinciple}
                  onChange={(e) => setFormData({ ...formData, customPrinciple: e.target.value })}
                  placeholder={t('brand.customPrinciplePlaceholder')}
                  className="w-full px-4 py-3 bg-dark-300 border border-dark-200 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-white font-display">
                {t('brand.q5')}
              </h2>
              {[
                { value: 'Soft (comentariu / întrebare)', label: t('brand.cta.soft') },
                { value: 'Direct (scrie-mi X / trimite mesaj)', label: t('brand.cta.direct') },
                { value: 'Educațional (salvează / share)', label: t('brand.cta.educational') },
                { value: 'Mix', label: t('brand.cta.mix') },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setFormData({ ...formData, ctaStyle: option.value })}
                  className={`w-full text-left px-6 py-4 rounded-lg border-2 transition-all ${
                    formData.ctaStyle === option.value
                      ? 'border-brand-500 bg-brand-500/10 text-white'
                      : 'border-dark-200 hover:border-dark-100 text-gray-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          {step === 6 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-white font-display">
                {t('brand.q6')}
              </h2>
              <p className="text-gray-400 text-sm">{t('brand.exact3')}</p>
              {[
                { value: 'Clar', label: t('brand.word.clear') },
                { value: 'Calm', label: t('brand.word.calm') },
                { value: 'Funny', label: t('brand.word.funny') },
                { value: 'Empatic', label: t('brand.word.empathic') },
                { value: 'Disciplinat', label: t('brand.word.disciplined') },
                { value: 'Științific', label: t('brand.word.scientific') },
                { value: 'Simplu', label: t('brand.word.simple') },
                { value: 'Motivațional', label: t('brand.word.motivational') },
                { value: 'Elegant', label: t('brand.word.elegant') },
                { value: 'No bullshit', label: t('brand.word.noBullshit') },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => toggleArray('brandWords', option.value, 3)}
                  className={`w-full text-left px-6 py-4 rounded-lg border-2 transition-all ${
                    formData.brandWords.includes(option.value)
                      ? 'border-brand-500 bg-brand-500/10 text-white'
                      : 'border-dark-200 hover:border-dark-100 text-gray-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          {step === 7 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-white font-display">
                {t('brand.q7')}
              </h2>
              <p className="text-gray-400 text-sm">{t('brand.optionalExamples')}</p>
              <input
                type="text"
                value={formData.frequentPhrases}
                onChange={(e) => setFormData({ ...formData, frequentPhrases: e.target.value })}
                placeholder={t('brand.phrasesPlaceholder')}
                className="w-full px-4 py-3 bg-dark-300 border border-dark-200 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          )}

          {step === 8 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-white font-display">
                {t('brand.q8')}
              </h2>
              <p className="text-gray-400 text-sm">{t('brand.optional')}</p>
              {[
                { value: 'Deloc', label: t('brand.humor.none') },
                { value: 'Subtil / ironic light', label: t('brand.humor.subtle') },
                { value: 'Relatable (POV, situații)', label: t('brand.humor.relatable') },
                { value: 'Direct și mai provocator (fără jigniri)', label: t('brand.humor.direct') },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setFormData({ ...formData, humorTone: option.value })}
                  className={`w-full text-left px-6 py-4 rounded-lg border-2 transition-all ${
                    formData.humorTone === option.value
                      ? 'border-brand-500 bg-brand-500/10 text-white'
                      : 'border-dark-200 hover:border-dark-100 text-gray-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          {error && (
            <div className="mt-6 p-4 rounded-lg border border-red-500 bg-red-500/10 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between mt-8 pt-6 border-t border-dark-200">
            <Button
              variant="outline"
              onClick={() => {
                setStep(step - 1);
                setError(null);
              }}
              disabled={step === 1}
            >
              ← {t('common.back')}
            </Button>

            {step < totalSteps ? (
              <Button
                onClick={() => {
                  if (!canGoNext()) {
                    setError(t('prefs.requiredError'));
                    return;
                  }
                  setError(null);
                  setStep(step + 1);
                }}
                disabled={!canGoNext()}
              >
                {t('prefs.next')}
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? t('prefs.saving') : t('brand.save')}
              </Button>
            )}
          </div>
        </Card>

        {saveMutation.isError && (
          <Card className="mt-4 bg-red-500/10 border-red-500/50">
            <p className="text-red-400">
              {(saveMutation.error as any)?.response?.data?.error || t('prefs.saveError')}
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
