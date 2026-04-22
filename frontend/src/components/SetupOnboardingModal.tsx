import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import Button from '@/components/Button';

interface SetupOnboardingModalProps {
  isOpen: boolean;
  hasNiche: boolean;
  hasBrandVoice: boolean;
  hasContentCreationPreferences: boolean;
  onClose: () => void;
}

type SetupStep = {
  key: 'niche' | 'brandVoice' | 'contentCreation';
  title: string;
  description: string;
  path: string;
};

const setupSteps: SetupStep[] = [
  {
    key: 'niche',
    title: '1) Setează nișa',
    description: 'Completează Niche Finder ca să avem context clar pentru toate generările.',
    path: '/niche-finder',
  },
  {
    key: 'brandVoice',
    title: '2) Configurează Brand Voice',
    description: 'Stabilește tonul și stilul tău pentru scripturi care sună ca tine.',
    path: '/content-preferences',
  },
  {
    key: 'contentCreation',
    title: '3) Cum vrei să creezi content',
    description: 'Alege formatul tău de livrare ca ideile să fie ușor de executat.',
    path: '/cum-vrei-sa-creezi-content',
  },
];

export default function SetupOnboardingModal({
  isOpen,
  hasNiche,
  hasBrandVoice,
  hasContentCreationPreferences,
  onClose,
}: SetupOnboardingModalProps) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const { body, documentElement } = document;
    const scrollY = window.scrollY;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyPosition = body.style.position;
    const previousBodyTop = body.style.top;
    const previousBodyWidth = body.style.width;
    const previousHtmlOverflow = documentElement.style.overflow;

    documentElement.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';

    return () => {
      documentElement.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      body.style.position = previousBodyPosition;
      body.style.top = previousBodyTop;
      body.style.width = previousBodyWidth;
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  const status = useMemo(
    () => ({
      niche: hasNiche,
      brandVoice: hasBrandVoice,
      contentCreation: hasContentCreationPreferences,
    }),
    [hasNiche, hasBrandVoice, hasContentCreationPreferences]
  );

  const nextStep = useMemo(
    () => setupSteps.find((step) => !status[step.key]),
    [status]
  );

  if (!isOpen || !nextStep) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:px-4 sm:py-4">
      <div className="w-full max-w-[22rem] rounded-2xl border border-brand-500/40 bg-dark-300 shadow-2xl shadow-black/40 sm:max-w-2xl">
        <div className="p-4 sm:p-8">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-brand-500 text-sm font-semibold">Onboarding Setup</p>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
              aria-label="Închide onboarding"
            >
              ✕
            </button>
          </div>
          <h2 className="mb-2 text-[1.35rem] font-display font-bold leading-tight text-white sm:mb-3 sm:text-3xl">
            Înainte să începi, setează contul în 3 pași
          </h2>
          <p className="mb-4 text-sm text-gray-300 sm:mb-6 sm:text-base">
            Parcurge pașii în ordine ca TrainerOS să personalizeze corect ideile și strategiile.
          </p>

          <div className="mb-5 space-y-2.5 sm:mb-8 sm:space-y-3">
            {setupSteps.map((step) => {
              const completed = status[step.key];
              const active = step.key === nextStep.key;
              return (
                <div
                  key={step.key}
                  className={`rounded-lg border p-3 sm:p-4 ${
                    completed
                      ? 'border-green-500/40 bg-green-500/10'
                      : active
                        ? 'border-brand-500/50 bg-brand-500/10'
                        : 'border-dark-200 bg-dark-400/60'
                  }`}
                >
                  <p className="text-sm font-semibold text-white sm:text-base">{step.title}</p>
                  <p className="text-gray-300 text-sm mt-1">{step.description}</p>
                  <p className="text-xs mt-2 font-semibold">
                    {completed ? (
                      <span className="text-green-400">Completat</span>
                    ) : active ? (
                      <span className="text-brand-500">Pas curent</span>
                    ) : (
                      <span className="text-gray-500">Blocat până termini pasul anterior</span>
                    )}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end gap-2.5 sm:gap-3">
            <Button variant="outline" size="sm" onClick={onClose}>
              Închide
            </Button>
            <Button size="sm" onClick={() => navigate(nextStep.path)}>
              Next →
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
