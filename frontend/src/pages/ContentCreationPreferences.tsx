import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '@/services/api';
import Button from '@/components/Button';
import Card from '@/components/Card';
import { useI18n } from '@/hooks/useI18n';

interface ContentCreationData {
  filmingLocation: string;
  naturalContentTypes: string[];
  otherNaturalFormat: string;
  deliveryStyles: string[];
}

const totalSteps = 3;

const filmingLocationOptions = [
  'Acasă',
  'La sală',
  'Ambele (în funcție de zi)',
];

const naturalContentTypeOptions = [
  'Educațional – nutriție',
  'Educațional – exerciții / antrenamente',
  'Relatable / funny',
  'Story / experiență personală',
];

const deliveryStyleOptions = [
  'Vorbit direct la cameră',
  'Voice-over peste video',
  'Text + B-roll (fără vorbit)',
  'Mix, în funcție de zi',
];

export default function ContentCreationPreferences() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<ContentCreationData>({
    filmingLocation: '',
    naturalContentTypes: [],
    otherNaturalFormat: '',
    deliveryStyles: [],
  });

  const preferencesQuery = useQuery({
    queryKey: ['content-preferences'],
    queryFn: async () => {
      const { data } = await api.get('/niche/content-preferences');
      return data;
    },
  });

  useEffect(() => {
    const payload = preferencesQuery.data?.contentPreferences?.contentCreation;
    if (!payload) return;
    setFormData({
      filmingLocation: payload.filmingLocation || '',
      naturalContentTypes: payload.naturalContentTypes || [],
      otherNaturalFormat: payload.otherNaturalFormat || '',
      deliveryStyles: payload.deliveryStyles || [],
    });
  }, [preferencesQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async (data: ContentCreationData) => {
      return api.post('/niche/content-preferences', {
        type: 'content-creation',
        version: 1,
        completedAt: new Date().toISOString(),
        contentCreation: data,
      });
    },
    onSuccess: () => {
      try {
        sessionStorage.setItem('traineros:setup-completed', '1');
      } catch {
        // Ignore sessionStorage write issues.
      }
      void queryClient.invalidateQueries({ queryKey: ['content-preferences'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      void queryClient.invalidateQueries({ queryKey: ['user-me'] });
      navigate('/dashboard');
    },
  });

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  const toggleMulti = (field: 'naturalContentTypes' | 'deliveryStyles', value: string) => {
    const current = formData[field];
    const updated = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    setFormData({ ...formData, [field]: updated });
    setError(null);
  };

  const canGoNext = () => {
    if (step === 1) return !!formData.filmingLocation;
    if (step === 2) return formData.naturalContentTypes.length > 0;
    if (step === 3) return formData.deliveryStyles.length > 0;
    return true;
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
            <span className="text-sm text-brand-500 font-semibold">{t('prefs.durationCreation')}</span>
          </div>
          <div className="w-full bg-dark-200 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-500 to-brand-600 transition-all duration-300"
              style={{ width: `${(step / totalSteps) * 100}%` }}
            />
          </div>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-3 font-display">
            {t('creation.title')}
          </h1>
          <p className="text-gray-300 text-lg">
            {t('creation.subtitle')}
          </p>
        </div>

        <Card>
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-white font-display">
                {t('creation.q1')}
              </h2>
              <p className="text-gray-400 text-sm">{t('creation.singleSelect')}</p>
              {[
                { value: filmingLocationOptions[0], label: t('creation.location.home') },
                { value: filmingLocationOptions[1], label: t('creation.location.gym') },
                { value: filmingLocationOptions[2], label: t('creation.location.both') },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    setFormData({ ...formData, filmingLocation: option.value });
                    setError(null);
                  }}
                  className={`w-full text-left px-6 py-4 rounded-lg border-2 transition-all ${
                    formData.filmingLocation === option.value
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
              <h2 className="text-xl font-bold text-white font-display">
                {t('creation.q2')}
              </h2>
              <p className="text-gray-400 text-sm">{t('creation.multiSelect')}</p>
              {[
                { value: naturalContentTypeOptions[0], label: t('creation.type.nutrition') },
                { value: naturalContentTypeOptions[1], label: t('creation.type.training') },
                { value: naturalContentTypeOptions[2], label: t('creation.type.relatable') },
                { value: naturalContentTypeOptions[3], label: t('creation.type.story') },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => toggleMulti('naturalContentTypes', option.value)}
                  className={`w-full text-left px-6 py-4 rounded-lg border-2 transition-all ${
                    formData.naturalContentTypes.includes(option.value)
                      ? 'border-brand-500 bg-brand-500/10 text-white'
                      : 'border-dark-200 hover:border-dark-100 text-gray-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}

              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  {t('creation.otherFormat')}
                </label>
                <input
                  type="text"
                  value={formData.otherNaturalFormat}
                  onChange={(e) => setFormData({ ...formData, otherNaturalFormat: e.target.value })}
                  placeholder={t('creation.otherPlaceholder')}
                  className="w-full px-4 py-3 bg-dark-300 border border-dark-200 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-white font-display">
                {t('creation.q3')}
              </h2>
              <p className="text-gray-400 text-sm">{t('creation.multiSelect')}</p>
              {[
                { value: deliveryStyleOptions[0], label: t('creation.delivery.camera') },
                { value: deliveryStyleOptions[1], label: t('creation.delivery.voiceover') },
                { value: deliveryStyleOptions[2], label: t('creation.delivery.broll') },
                { value: deliveryStyleOptions[3], label: t('creation.delivery.mix') },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => toggleMulti('deliveryStyles', option.value)}
                  className={`w-full text-left px-6 py-4 rounded-lg border-2 transition-all ${
                    formData.deliveryStyles.includes(option.value)
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
                {saveMutation.isPending ? t('prefs.saving') : t('creation.save')}
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
