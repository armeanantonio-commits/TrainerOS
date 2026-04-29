import { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '@/components/Button';
import Card from '@/components/Card';
import PricingToggle from '@/components/PricingToggle';

export default function Pricing() {
  const [isAnnual, setIsAnnual] = useState(false);

  const plans = [
    {
      name: 'TrainerOS Pro',
      description: 'Plan PRO cu limite zilnice/lunare pentru workflow complet',
      monthlyPrice: 19.9,
      annualPrice: 190,
      badge: 'POPULAR',
      showLaunchPromo: true,
      features: [
        'Daily Idea: 100 seturi/lună',
        'Structurează Ideea: 90/lună',
        'Email Marketing: 60/lună',
        'Generare Nutriție Client: 10/lună',
        'Chat TrainerOS: 300 întrebări/lună',
        'Content Review: 60/lună',
        'Niche Finder',
        'Brand Voice',
        'Cum vrei să creezi content',
      ],
    },
    {
      name: 'TrainerOS Max',
      description: 'Plan MAX cu volume ridicate și Content Review nelimitat',
      monthlyPrice: 39.99,
      annualPrice: 379.99,
      badge: 'PREMIUM',
      showLaunchPromo: false,
      features: [
        'Daily Idea: 400 seturi/lună',
        'Structurează Ideea: 450/lună',
        'Email Marketing: 150/lună',
        'Generare Nutriție Client: 30/lună',
        'Chat TrainerOS: 900 întrebări/lună',
        'Content Review: nelimitat',
        'Niche Finder',
        'Brand Voice',
        'Cum vrei să creezi content',
      ],
    },
  ] as const;

  return (
    <div className="min-h-screen bg-dark-400 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4 font-display">
            Membership-uri TrainerOS.{' '}
            <span className="text-gradient">Alege planul potrivit.</span>
          </h1>
          <p className="text-brand-500 text-lg mt-2 font-semibold">
            7 zile trial gratuit • Plăți securizate Stripe
          </p>
        </div>

        {/* Info Banner */}
        <div className="max-w-2xl mx-auto mb-8">
          <Card className="text-center bg-gradient-to-r from-brand-500/10 to-brand-600/10 border-brand-500/50">
            <p className="text-white font-semibold text-lg mb-2">💎 Planuri PRO și MAX</p>
            <p className="text-gray-300 text-sm">Plată lunară sau anuală, cu upgrade instant în aplicație</p>
          </Card>
        </div>

        {/* Pricing Toggle */}
        <PricingToggle isAnnual={isAnnual} onToggle={setIsAnnual} />

        <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto mb-16">
          {plans.map((plan) => (
            <Card key={plan.name} className="border-brand-500 shadow-lg shadow-brand-500/30">
              <div className="mb-6 flex justify-center">
                <span className="inline-flex rounded-full bg-brand-500 px-4 py-1 text-xs font-bold text-dark-400">
                  ⭐ {plan.badge}
                </span>
              </div>

              <div className="text-center mb-6">
                <h3 className="text-3xl font-bold text-white mb-2 font-display">{plan.name}</h3>
                <p className="text-gray-400">{plan.description}</p>
              </div>

              <div className="text-center mb-8">
                <div className="flex items-baseline justify-center gap-2">
                  <span className="text-6xl font-bold text-white">
                    €{isAnnual ? plan.annualPrice : plan.monthlyPrice}
                  </span>
                  <span className="text-gray-400 text-xl">{isAnnual ? '/an' : '/lună'}</span>
                </div>
                {isAnnual ? (
                  <p className="text-brand-500 text-sm mt-3 font-semibold">
                    Economisești €{(plan.monthlyPrice * 12 - plan.annualPrice).toFixed(2)}/an vs planul lunar
                  </p>
                ) : (
                  <p className="text-gray-400 text-sm mt-3">Facturare recurentă lunară</p>
                )}

                {plan.showLaunchPromo ? (
                  <div className="mt-6 bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                    <p className="text-green-400 font-semibold text-sm">
                      🎉 Cod promoțional disponibil:{' '}
                      <span className="font-mono bg-green-500/20 px-2 py-1 rounded">LAUNCH2026</span>
                    </p>
                    <p className="text-gray-300 text-xs mt-1">
                      Prima lună €12.99 în loc de €19.9 • Introdu codul la checkout
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="bg-dark-300 rounded-lg p-6 mb-8">
                <ul className="space-y-4">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="text-brand-500 text-xl flex-shrink-0 mt-0.5">✓</span>
                      <span className="text-gray-200">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <Link to="/register" className="block mb-4">
                <Button variant="primary" className="w-full text-lg py-4">
                  Începe Free Trial — 7 Zile Gratuit →
                </Button>
              </Link>

              <p className="text-center text-gray-400 text-sm">Fără card necesar. Poți anula oricând.</p>
            </Card>
          ))}
        </div>

        {/* Social Proof */}
        <div className="text-center mb-16">
          <p className="text-gray-400 mb-4">Folosit de peste 100+ antrenori fitness</p>
          <div className="flex justify-center gap-8 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-3xl">⭐⭐⭐⭐⭐</span>
              <span className="text-gray-300">4.9/5</span>
            </div>
            <div className="text-gray-300">
              💰 Rambursare în 14 zile
            </div>
            <div className="text-gray-300">
              🔒 Plată securizată via Stripe
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-8 font-display">
            Întrebări frecvente
          </h2>
          <div className="space-y-4">
            <Card>
              <h3 className="text-white font-semibold mb-2">
                Cum aleg între Pro și Max?
              </h3>
              <p className="text-gray-300 text-sm">
                Pro este potrivit pentru majoritatea antrenorilor. Max este pentru cei care au nevoie de suport
                premium și workflow-uri intensive.
              </p>
            </Card>

            <Card>
              <h3 className="text-white font-semibold mb-2">
                Chiar nu trebuie să introduc cardul pentru Free Trial?
              </h3>
              <p className="text-gray-300 text-sm">
                Corect. Trial-ul de 7 zile este 100% gratuit, fără card. După ce expiră, poți decide dacă vrei să continui.
              </p>
            </Card>

            <Card>
              <h3 className="text-white font-semibold mb-2">
                Ce se întâmplă după ce expiră trial-ul?
              </h3>
              <p className="text-gray-300 text-sm">
                Aplicația îți va cere să te abonezi pentru a continua. Poți alege plata lunară sau anuală (cu 20% discount).
                Dacă nu te abonezi, contul rămâne activ dar nu mai poți genera conținut nou.
              </p>
            </Card>

            <Card>
              <h3 className="text-white font-semibold mb-2">
                Pot să anulez oricând?
              </h3>
              <p className="text-gray-300 text-sm">
                Da, absolut. Fără contracte pe termen lung. Anulezi cu un click, fără penalizări. În plus, ai garanție
                de rambursare 14 zile.
              </p>
            </Card>

            <Card>
              <h3 className="text-white font-semibold mb-2">
                Oferiți rambursare?
              </h3>
              <p className="text-gray-300 text-sm">
                Da. Dacă în primele 14 zile simți că TrainerOS nu e pentru tine, îți returnăm toți banii, fără întrebări.
              </p>
            </Card>

            <Card>
              <h3 className="text-white font-semibold mb-2">
                Ce metode de plată acceptați?
              </h3>
              <p className="text-gray-300 text-sm">
                Plățile sunt procesate securizat prin Stripe. Acceptăm Visa, Mastercard, American Express și alte carduri majore.
              </p>
            </Card>
          </div>
        </div>

        {/* Final CTA */}
        <div className="text-center mt-16">
          <Link to="/register">
            <Button size="lg" className="text-xl px-12 py-5">
              Începe Free Trial Acum — 7 Zile Gratuit →
            </Button>
          </Link>
          <p className="text-gray-400 text-sm mt-4">
            💳 Fără card • ⚡ Setup în 2 minute • 🔒 Date protejate
          </p>
        </div>
      </div>
    </div>
  );
}
