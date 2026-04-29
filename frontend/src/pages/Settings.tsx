import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import { authAPI } from '@/services/api';
import Button from '@/components/Button';
import Card from '@/components/Card';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/hooks/useI18n';

type PreferredLanguage = 'ro' | 'en';

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const { language, t } = useI18n();
  const plansRef = useRef<HTMLDivElement | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<'PRO' | 'MAX'>('PRO');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [promoCode, setPromoCode] = useState('');
  const currentLanguage: PreferredLanguage = user?.preferredLanguage === 'en' ? 'en' : 'ro';
  const PROMO_CODE = 'LAUNCH2026';
  const planOptions = {
    PRO: {
      name: 'TrainerOS Pro',
      description: t('settings.subscription.proDescription'),
      monthlyPrice: 19.9,
      yearlyPrice: 190,
      features: [
        t('settings.subscription.proFeature1'),
        t('settings.subscription.proFeature2'),
        t('settings.subscription.proFeature3'),
        t('settings.subscription.proFeature4'),
        t('settings.subscription.proFeature5'),
        t('settings.subscription.proFeature6'),
        t('settings.subscription.proFeature7'),
        t('settings.subscription.proFeature8'),
        t('settings.subscription.proFeature9'),
      ],
    },
    MAX: {
      name: 'TrainerOS Max',
      description: t('settings.subscription.maxDescription'),
      monthlyPrice: 39.99,
      yearlyPrice: 379.99,
      features: [
        t('settings.subscription.maxFeature1'),
        t('settings.subscription.maxFeature2'),
        t('settings.subscription.maxFeature3'),
        t('settings.subscription.maxFeature4'),
        t('settings.subscription.maxFeature5'),
        t('settings.subscription.maxFeature6'),
        t('settings.subscription.maxFeature7'),
        t('settings.subscription.maxFeature8'),
        t('settings.subscription.maxFeature9'),
      ],
    },
  } as const;

  // Get subscription status
  const { data: subscription } = useQuery({
    queryKey: ['subscription'],
    queryFn: async () => {
      const { data } = await api.get('/subscription/status');
      return data;
    },
    enabled: !!user, // Only run if user is logged in
    retry: 1,
  });
  const planDisplayName = (() => {
    switch (subscription?.plan) {
      case 'PRO':
        return t('settings.plan.pro');
      case 'MAX':
        return t('settings.plan.max');
      default:
        return t('settings.plan.freeTrial');
    }
  })();

  // Create Stripe checkout session
  const checkoutMutation = useMutation({
    mutationFn: async (input: { cycle: 'monthly' | 'yearly'; plan: 'PRO' | 'MAX' }) => {
      const payload: { billingCycle: 'monthly' | 'yearly'; plan: 'PRO' | 'MAX'; promoCode?: string } = {
        billingCycle: input.cycle,
        plan: input.plan,
      };
      const trimmed = promoCode.trim();
      if (trimmed) {
        payload.promoCode = trimmed;
      }
      const { data } = await api.post('/subscription/create-checkout', payload);
      return data;
    },
    onSuccess: (data) => {
      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url;
      }
    },
  });

  // Reset niche
  const resetNicheMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/niche/reset');
      return data;
    },
    onSuccess: () => {
      // Refresh page after successful reset
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    },
  });

  const languageMutation = useMutation({
    mutationFn: async (preferredLanguage: PreferredLanguage) => {
      const { data } = await authAPI.updateProfile({ preferredLanguage });
      return data;
    },
    onSuccess: async () => {
      await refreshUser();
    },
  });

  const handleUpgrade = () => {
    checkoutMutation.mutate({ cycle: billingCycle, plan: selectedPlan });
  };

  useEffect(() => {
    if (window.location.hash === '#plans') {
      plansRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  return (
    <div className="min-h-screen py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="console-hero mb-8">
          <div className="console-orb left-[-4rem] top-[-3rem] h-32 w-32 bg-cyan-300/18 animate-float-slow" />
          <div className="console-orb right-0 top-10 h-24 w-24 bg-indigo-300/16 animate-float-delay" />
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <span className="console-badge">{t('settings.badge')}</span>
          </div>
          <h1 className="mb-4 text-3xl font-bold text-white font-display sm:text-5xl">{t('settings.title')}</h1>
          <p className="max-w-2xl text-slate-300/78">
            {t('settings.subtitle')}
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <div className="rounded-full border border-white/8 bg-white/[0.04] px-4 py-2 text-slate-300">
              {user?.email}
            </div>
            <div className="rounded-full border border-white/8 bg-white/[0.04] px-4 py-2 text-slate-300">
              {t('settings.planLabel')}: <span className="font-semibold text-console-accent">{planDisplayName}</span>
            </div>
            {subscription?.trialEndsAt && (
              <div className="rounded-full border border-white/8 bg-white/[0.04] px-4 py-2 text-slate-300">
                {t('settings.trial')}: {new Date(subscription.trialEndsAt).toLocaleDateString(language === 'en' ? 'en-US' : 'ro-RO')}
              </div>
            )}
            {subscription?.planExpiresAt && (
              <div className="rounded-full border border-white/8 bg-white/[0.04] px-4 py-2 text-slate-300">
                {t('settings.expires')}: {new Date(subscription.planExpiresAt).toLocaleDateString(language === 'en' ? 'en-US' : 'ro-RO')}
              </div>
            )}
          </div>
        </div>

        <Card className="mb-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="mb-2 text-xl font-semibold text-white">{t('settings.languageTitle')}</h2>
              <p className="max-w-2xl text-sm text-slate-300/72">
                {t('settings.languageText')}
              </p>
            </div>
            <div className="flex rounded-2xl border border-white/10 bg-white/[0.04] p-1">
              {([
                ['ro', t('settings.language.ro')],
                ['en', t('settings.language.en')],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => languageMutation.mutate(value)}
                  disabled={languageMutation.isPending || currentLanguage === value}
                  className={`min-w-[104px] rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    currentLanguage === value
                      ? 'bg-[linear-gradient(135deg,#8CF8D4,#72CAFF)] text-slate-950'
                      : 'text-slate-300 hover:bg-white/[0.06]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {languageMutation.isSuccess ? (
            <p className="mt-4 text-sm text-green-400">{t('settings.languageSaved')}</p>
          ) : null}
          {languageMutation.isError ? (
            <p className="mt-4 text-sm text-red-400">
              {(languageMutation.error as any)?.response?.data?.error || t('settings.languageError')}
            </p>
          ) : null}
        </Card>

        {/* Subscription */}
        <div ref={plansRef}>
          <Card>
            <h2 className="text-xl font-semibold text-white mb-4">{t('settings.subscription.title')}</h2>
          
            <div className="rounded-[28px] border border-white/8 bg-white/[0.03] p-6 mb-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                {(Object.entries(planOptions) as Array<[keyof typeof planOptions, (typeof planOptions)[keyof typeof planOptions]]>).map(([key, plan]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedPlan(key)}
                    className={`rounded-[24px] border p-5 text-left transition ${
                      selectedPlan === key
                        ? 'border-cyan-300/60 bg-cyan-300/[0.08] shadow-[0_0_24px_rgba(110,231,255,0.12)]'
                        : 'border-white/10 bg-white/[0.03]'
                    }`}
                  >
                    <div className="mb-3 flex items-start justify-between gap-4">
                      <div>
                        <p className="text-white font-semibold">{plan.name}</p>
                        <p className="text-xs text-slate-300/72">
                          €{plan.monthlyPrice}{t('settings.subscription.perMonth')} {t('settings.subscription.or')} €{plan.yearlyPrice}{t('settings.subscription.perYear')}
                        </p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${selectedPlan === key ? 'bg-cyan-300/20 text-cyan-100' : 'bg-white/10 text-slate-300'}`}>
                        {key}
                      </span>
                    </div>
                    <p className="mb-4 text-sm text-slate-300/72">{plan.description}</p>
                    <ul className="space-y-2 text-sm text-gray-300">
                      {plan.features.map((feature) => (
                        <li key={feature}>✅ {feature}</li>
                      ))}
                    </ul>
                  </button>
                ))}
              </div>

            {/* Billing Cycle Toggle */}
            <div className="flex items-center justify-center gap-4 mb-6">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`rounded-2xl px-4 py-2 font-medium transition-colors ${
                  billingCycle === 'monthly'
                    ? 'bg-[linear-gradient(135deg,#8CF8D4,#72CAFF)] text-slate-950'
                    : 'bg-white/[0.05] text-slate-300/72'
                }`}
              >
                {t('settings.subscription.monthly')}
              </button>
              <button
                onClick={() => setBillingCycle('yearly')}
                className={`rounded-2xl px-4 py-2 font-medium transition-colors ${
                  billingCycle === 'yearly'
                    ? 'bg-[linear-gradient(135deg,#8CF8D4,#72CAFF)] text-slate-950'
                    : 'bg-white/[0.05] text-slate-300/72'
                }`}
              >
                {t('settings.subscription.yearly')} <span className="text-xs">{t('settings.subscription.discountBadge')}</span>
              </button>
            </div>

            {/* Pricing */}
            <div className="text-center mb-6">
              <div className="text-4xl font-bold text-white mb-2">
                €{billingCycle === 'monthly' ? planOptions[selectedPlan].monthlyPrice : planOptions[selectedPlan].yearlyPrice}
                <span className="text-xl text-gray-400">{billingCycle === 'monthly' ? t('settings.subscription.perMonth') : t('settings.subscription.perYear')}</span>
              </div>
              {billingCycle === 'monthly' && (
                <p className="text-sm text-console-accent">
                  €{planOptions[selectedPlan].monthlyPrice}{t('settings.subscription.perMonth')}
                </p>
              )}
              {billingCycle === 'yearly' && (
                <p className="text-sm text-console-accent">
                  {t('settings.subscription.save')} €
                  {(planOptions[selectedPlan].monthlyPrice * 12 - planOptions[selectedPlan].yearlyPrice).toFixed(2)}
                  {t('settings.subscription.yearlyVsMonthly')}
                </p>
              )}
            </div>

            {/* Promo Code */}
            <div className="mb-4">
              {selectedPlan === 'PRO' ? (
                <div className="mb-3 rounded-[22px] border border-green-500/30 bg-green-500/10 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-green-400 text-sm font-semibold">
                      {t('settings.subscription.promoAvailable')} <span className="font-mono bg-green-500/20 px-2 py-1 rounded">{PROMO_CODE}</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => setPromoCode(PROMO_CODE)}
                      className="rounded-xl bg-green-500/20 px-3 py-1 text-xs font-semibold text-green-300 hover:bg-green-500/30"
                    >
                      {t('settings.subscription.applyCode')}
                    </button>
                  </div>
                  <p className="text-gray-300 text-xs mt-2">
                    {t('settings.subscription.promoHint')}
                  </p>
                </div>
              ) : null}
              <label className="block text-sm text-gray-400 mb-2" htmlFor="promo-code">
                {t('settings.subscription.promoLabel')}
              </label>
              <input
                id="promo-code"
                type="text"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                placeholder={t('settings.subscription.promoPlaceholder')}
                className="console-input"
              />
              <p className="text-gray-500 text-xs mt-2">
                {t('settings.subscription.promoAutoApply')}
              </p>
            </div>

            <Button
              onClick={handleUpgrade}
              disabled={checkoutMutation.isPending}
              className="w-full"
            >
              {checkoutMutation.isPending
                ? t('settings.subscription.redirecting')
                : `${t('settings.subscription.upgradeTo')} ${planOptions[selectedPlan].name} ${billingCycle === 'monthly' ? t('settings.subscription.monthly') : t('settings.subscription.yearly')} →`}
            </Button>

            <p className="text-gray-400 text-xs text-center mt-4">
              {t('settings.subscription.securePayment')}
            </p>
          </div>

            {checkoutMutation.isError && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 text-red-500 text-sm">
                {(checkoutMutation.error as any)?.response?.data?.error ||
                  t('settings.subscription.genericError')}
              </div>
            )}
          </Card>
        </div>

        {/* Niche Reset */}
        <Card className="mt-8 border-orange-500/30">
          <h2 className="mb-4 text-xl font-semibold text-orange-400">{t('settings.resetNiche.title')}</h2>
          <p className="text-gray-400 text-sm mb-4">
            {t('settings.resetNiche.text')}
          </p>
          <Button
            variant="outline"
            className="border-orange-500/50 bg-orange-500/5 text-orange-300 hover:bg-orange-500/10"
            onClick={() => {
              if (confirm(t('settings.resetNiche.confirm'))) {
                resetNicheMutation.mutate();
              }
            }}
            disabled={resetNicheMutation.isPending}
          >
            {resetNicheMutation.isPending ? t('settings.resetNiche.resetting') : t('settings.resetNiche.button')}
          </Button>
          {resetNicheMutation.isSuccess && (
            <p className="text-green-500 text-sm mt-3">
              {t('settings.resetNiche.success')}
            </p>
          )}
          {resetNicheMutation.isError && (
            <p className="text-red-500 text-sm mt-3">
              {t('settings.resetNiche.error')}
            </p>
          )}
        </Card>

        {/* Danger Zone */}
        <Card className="mt-8 border-red-500/30">
          <h2 className="mb-4 text-xl font-semibold text-red-400">{t('settings.danger.title')}</h2>
          <p className="text-gray-400 text-sm mb-4">
            {t('settings.danger.text')}
          </p>
          <Button variant="outline" className="border-red-500 text-red-500 hover:bg-red-500/10">
            {t('settings.danger.deleteAccount')}
          </Button>
        </Card>
      </div>
    </div>
  );
}
