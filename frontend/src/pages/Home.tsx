import { Link } from 'react-router-dom';
import Button from '@/components/Button';
import Card from '@/components/Card';

const appFeatures = [
  {
    icon: '💡',
    title: 'Daily Idea Engine',
    description: 'Idei complete (Hook, Script, CTA) pentru Reel + Carousel + Story.',
  },
  {
    icon: '🎯',
    title: 'Niche Finder (Rapid + Descoperă)',
    description: 'Găsești nișa, clientul ideal și poziționarea prin flux rapid sau ghidat.',
  },
  {
    icon: '🗣️',
    title: 'Setare Brand Voice',
    description: 'Definești tonul, stilul și principiile ca ideile generate să sune ca tine.',
  },
  {
    icon: '🎬',
    title: 'Preferințe de creare content',
    description: 'Setezi cum filmezi natural și ce format ți se potrivește pentru idei mai realiste.',
  },
  {
    icon: '🧠',
    title: 'Idea Structurer',
    description: 'Transformi o idee brută în structură completă: Hook, Script pe secțiuni și CTA.',
  },
  {
    icon: '📊',
    title: 'Content Review AI',
    description: 'Primești scoruri de claritate, relevanță, încredere și CTA înainte de publicare.',
  },
  {
    icon: '🗂️',
    title: 'Idea History',
    description: 'Istoric complet pentru idei, feedback și iterări, ca să refolosești ce performează.',
  },
  {
    icon: '🔥',
    title: 'Dashboard & Streak Tracking',
    description: 'Vezi progresul lunar, conversia medie și menții consecvența zilnică.',
  },
  {
    icon: '🤖',
    title: 'TrainerOS Chat (Expert Marketing)',
    description: 'Asistent AI în timp real pentru hook-uri, CTA, oferte și strategii de content fitness.',
  },
  {
    icon: '📧',
    title: 'Email Marketing AI',
    description: 'Tool din dashboard pentru emailuri de nurture, vânzare și reactivare, gata de trimis.',
  },
];

export default function Home() {
  return (
    <div className="min-h-screen console-shell">
      {/* Hero Section */}
      <section className="relative overflow-hidden px-3 pt-4 sm:px-5">
        <div className="absolute inset-0 animate-grid-drift bg-[radial-gradient(circle_at_top,rgba(114,202,255,0.18),transparent_42%),radial-gradient(circle_at_bottom,rgba(140,248,212,0.12),transparent_34%)] opacity-70" />
        <div className="absolute inset-x-10 top-8 h-[32rem] rounded-[38px] border border-white/6 bg-console-grid opacity-25" />
        <div className="absolute -top-10 left-[8%] h-56 w-56 rounded-full border border-cyan-300/25 animate-float-slow" />
        <div className="absolute top-16 right-[8%] h-40 w-40 rounded-full border border-cyan-200/20 animate-float-delay" />
        <div className="console-panel absolute bottom-10 left-[8%] hidden rounded-[22px] px-4 py-3 md:block animate-float-delay">
          <p className="console-kicker">Contor consistență content</p>
          <p className="text-white text-lg font-bold">7 zile streak</p>
        </div>
        <div className="console-panel absolute right-[8%] top-24 hidden rounded-[22px] px-4 py-3 lg:block animate-float-slow">
          <p className="console-kicker">Flux output AI</p>
          <p className="text-white text-sm">HOOK → SCRIPT → CTA</p>
        </div>
        <div className="console-panel-strong relative mx-auto max-w-7xl rounded-[38px] px-4 py-20 sm:px-6 lg:px-8">
          {/* Badge */}
          <div className="flex justify-center mb-8">
            <div className="console-badge">
              <div className="h-2 w-2 rounded-full bg-cyan-300 animate-pulse" />
              <span className="text-sm">
                Content & Client System pentru antrenori fitness
              </span>
            </div>
          </div>

          {/* Main Heading */}
          <h1 className="text-center font-display font-bold mb-6">
            <div className="text-4xl sm:text-5xl lg:text-6xl text-white mb-2">
              Sistemul de content care
            </div>
            <div className="text-4xl sm:text-5xl lg:text-6xl text-white mb-2">
              transformă postările în
            </div>
            <div className="text-5xl sm:text-6xl lg:text-7xl bg-gradient-to-r from-[#8CF8D4] via-[#72CAFF] to-[#A78BFA] bg-clip-text text-transparent">
              CLIENȚI.
            </div>
          </h1>

          {/* Subtitle */}
          <p className="mx-auto mb-10 max-w-3xl text-center text-lg text-slate-300/80 sm:text-xl">
            Pentru antrenori fitness care vor consecvență și conversii: nișă clară, idee zilnică,
            feedback pe postări și CTA-uri care duc spre clienți.
          </p>

          {/* CTA Button */}
          <div className="flex justify-center mb-8">
            <Link to="/register">
              <Button size="lg" className="text-xl px-12 py-5">
                Începe Free Trial →
              </Button>
            </Link>
          </div>

          {/* Social Proof */}
          <div className="flex items-center justify-center gap-2 text-slate-400">
            <div className="flex -space-x-2">
              {['A', 'M', 'C', 'R'].map((letter, i) => (
                <div
                  key={i}
                  className="console-panel flex h-10 w-10 items-center justify-center rounded-full border"
                >
                  <span className="font-bold text-cyan-100">{letter}</span>
                </div>
              ))}
            </div>
            <span className="text-sm">
              Folosit de <span className="text-white font-semibold">100+</span> antrenori fitness
            </span>
          </div>
        </div>
      </section>

      {/* Features Preview Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <p className="console-kicker mb-3">Module platformă</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 font-display">
            Funcționalități în TrainerOS
          </h2>
          <p className="text-slate-300/78 text-lg max-w-2xl mx-auto">
            Toate modulele disponibile acum, de la strategie până la execuție și optimizare
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {appFeatures.map((feature) => (
            <div
              key={feature.title}
              className="console-panel rounded-[26px] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-300/35"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.08]">
                <span className="text-2xl">{feature.icon}</span>
              </div>
              <h3 className="text-lg font-bold text-white mb-2 font-display">{feature.title}</h3>
              <p className="text-sm text-slate-300/74">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Daily Idea Engine Example */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <Card className="overflow-hidden relative border-cyan-300/30 bg-[linear-gradient(135deg,rgba(7,14,28,0.94),rgba(13,24,42,0.85))]">
          <div className="absolute -top-20 -right-16 w-64 h-64 rounded-full bg-cyan-300/10 blur-3xl animate-pulse-soft" />
          <div className="grid lg:grid-cols-2 gap-8 relative">
            <div>
              <div className="console-badge mb-4">
                <span>Daily Idea Engine</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4 font-display">
                Exemplu real de idee gata de filmat
              </h2>
              <p className="mb-6 text-slate-300/78">
                Nu primești doar un titlu. Primești un plan complet pe care îl poți filma astăzi în
                20-30 minute.
              </p>
              <Link to="/register">
                <Button>Vreau idei zilnice gata de postat →</Button>
              </Link>
            </div>
            <div className="space-y-4">
              <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
                <p className="console-kicker mb-2">Hook</p>
                <p className="text-white font-semibold">
                  Simți că trosnești din toate încheieturile când te ridici de pe scaun?
                </p>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
                <p className="console-kicker mb-2">Script pe Scene</p>
                <div className="space-y-4 text-sm text-slate-200">
                  <div>
                    <p className="text-white font-semibold mb-1">Scenă 1</p>
                    <p>
                      Când stai jos 8 ore, corpul tău practic „îngheață” în acea poziție.
                      Șoldurile se scurtează, iar spatele preia tot efortul când încerci să te
                      miști. De asta simți acea tensiune neplăcută în zona lombară imediat ce faci
                      primii pași prin casă după muncă.
                    </p>
                    <p className="mt-1 text-slate-400">
                      🎬 Vizual: Antrenorul stă pe un scaun de birou, se ridică greoi și își pune
                      mâna pe spate, mimând o ușoară rigiditate.
                    </p>
                  </div>
                  <div>
                    <p className="text-white font-semibold mb-1">Scenă 2</p>
                    <p>
                      Problema nu e că ai îmbătrânit brusc, ci că articulațiile tale nu primesc
                      lubrifiere. Imaginează-ți o balama care n-a fost mișcată de ani de zile. Dacă
                      tragi de ea brusc, se strică. La fel și cu corpul tău: ai nevoie de mișcări
                      circulare, blânde, nu de efort intens din prima.
                    </p>
                    <p className="mt-1 text-slate-400">
                      🎬 Vizual: Antrenorul vorbește direct la cameră, într-un cadru cald, acasă,
                      explicând calm cu gesturi ale mâinilor.
                    </p>
                  </div>
                  <div>
                    <p className="text-white font-semibold mb-1">Scenă 3</p>
                    <p>
                      Uite un exemplu: în loc să te așezi direct pe canapea, stai 2 minute într-o
                      poziție de fandare joasă, cu un genunchi pe covor. Asta deschide zona
                      inghinală și eliberează coloana. E un gest mic care îi spune creierului că e
                      sigur să se relaxeze fără să producă durere.
                    </p>
                    <p className="mt-1 text-slate-400">
                      🎬 Vizual: Demonstrație rapidă a unei fandări joase pe covorul din sufragerie,
                      menținând spatele drept și privirea înainte.
                    </p>
                  </div>
                  <div>
                    <p className="text-white font-semibold mb-1">Scenă 4</p>
                    <p>
                      Repetă asta zilnic, chiar și în timp ce fierbi apa pentru ceai. Nu ai nevoie
                      de echipament, ci doar de puțină disciplină. Scopul e să reînvățăm corpul să
                      fie mobil, fără să-l forțăm cu mișcări complexe care doar ar accentua uzura
                      pe care o simți acum.
                    </p>
                    <p className="mt-1 text-slate-400">
                      🎬 Vizual: Antrenorul revine în picioare, zâmbind prietenos, într-un cadru
                      relaxat de acasă.
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
                <p className="console-kicker mb-2">CTA Recomandat</p>
                <p className="text-slate-200">
                  Vrei să scapi de senzația de „rigiditate” în mișcări? Scrie-mi
                  <strong className="text-white"> MOBILITATE </strong>
                  în DM și îți trimit rutina mea.
                </p>
              </div>
            </div>
          </div>
        </Card>
      </section>

      {/* TrainerOS Chat Presentation */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <Card className="border-cyan-300/25 bg-[linear-gradient(135deg,rgba(9,16,30,0.92),rgba(10,22,38,0.82))]">
          <div className="grid lg:grid-cols-2 gap-8">
            <div>
              <div className="console-badge mb-4">
                <span>TrainerOS Chat</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4 font-display">
                Expertul tău AI de marketing pentru fitness
              </h2>
              <p className="mb-6 text-slate-300/78">
                Nu este un chatbot general. TrainerOS Chat te ajută strict pe strategii de
                marketing, content și conversie pentru antrenori fitness.
              </p>
              <ul className="space-y-2 text-sm text-slate-200">
                <li>✓ Hook-uri și CTA-uri care cresc conversia</li>
                <li>✓ Calendar editorial și idei pe nișa ta</li>
                <li>✓ Optimizare de ofertă, poziționare și mesaj</li>
              </ul>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
              <p className="console-kicker mb-2">Exemplu prompt</p>
              <p className="mb-4 text-sm text-slate-200">
                „Am nișa slăbit pentru mame după sarcină. Dă-mi 5 hook-uri de Reel + 3 CTA pentru
                DM keyword.”
              </p>
              <p className="console-kicker mb-2">Rezultat</p>
              <p className="text-sm text-slate-200">
                Primești răspuns în timp real, adaptat la nișa și contextul tău TrainerOS.
              </p>
              <Link to="/chat" className="inline-block mt-4">
                <Button variant="outline">Deschide TrainerOS Chat →</Button>
              </Link>
            </div>
          </div>
        </Card>
      </section>

      {/* Client Nutrition Presentation */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <Card className="border-white/10 bg-[linear-gradient(135deg,rgba(9,16,30,0.92),rgba(11,24,32,0.86))] opacity-70 grayscale">
          <div className="grid lg:grid-cols-2 gap-8">
            <div>
              <div className="console-badge mb-4">
                <span>Nutriție Client</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4 font-display">
                Planuri de nutriție clare, în curând în TrainerOS
              </h2>
              <p className="mb-6 text-slate-300/78">
                Modulul nu este încă gata pentru lansare. Lucrăm încă la experiență și la calitatea
                output-ului înainte să îl activăm pentru utilizatori.
              </p>
              <ul className="space-y-2 text-sm text-slate-200">
                <li>• Plan structurat pe mese și opțiuni simple</li>
                <li>• Adaptat la obiectiv: slăbire, masă musculară sau menținere</li>
                <li>• Recomandări ușor de trimis direct către client</li>
              </ul>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
              <p className="console-kicker mb-2">Exemplu input</p>
              <p className="mb-4 text-sm text-slate-200">
                „Clientă, 34 ani, vrea slăbire, 3 mese + 1 gustare, timp redus pentru gătit,
                preferă alimente simple.”
              </p>
              <p className="console-kicker mb-2">Rezultat</p>
              <p className="text-sm text-slate-200">
                Primești rapid un plan practic, clar și ușor de implementat în rutina clientului.
              </p>
              <div className="inline-block mt-4">
                <Button variant="outline" disabled>Funcție viitoare</Button>
              </div>
            </div>
          </div>
        </Card>
      </section>

      {/* Pricing Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <p className="console-kicker mb-3">Consolă prețuri</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 font-display">
            Prețuri simple, <span className="text-cyan-200">transparente</span>
          </h2>
          <p className="text-slate-300/78 text-lg">
            Două planuri: Pro și Max.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          <Card className="border-cyan-300/30 shadow-[0_0_28px_rgba(114,202,255,0.08)]">
            <div className="text-center mb-6">
              <div className="console-badge mb-4">
                <span>Plan Pro</span>
              </div>
              <h3 className="text-2xl font-bold text-white mb-2 font-display">TrainerOS Pro</h3>
            </div>

            <div className="text-center mb-8">
              <div className="flex items-baseline justify-center gap-2">
                <span className="text-5xl sm:text-6xl font-bold text-white">€19.9</span>
                <span className="text-slate-400 text-xl">/lună</span>
              </div>
              <p className="mt-2 text-sm text-slate-400">Prima lună €12.99, apoi €19.9/lună</p>
            </div>

            <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-6 mb-6">
              <ul className="space-y-3">
                {[
                  'Daily Idea: 100 seturi/lună',
                  'Structurează Ideea: 90/lună',
                  'Email Marketing: 60/lună',
                  'Nutriție Client: 10/lună',
                  'Chat TrainerOS: 300 întrebări/lună',
                  'Content Review: 60/lună',
                  'Niche Finder, Brand Voice, Cum vrei să creezi content',
                ].map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="mt-0.5 flex-shrink-0 text-cyan-200">✓</span>
                    <span className="text-sm text-slate-200">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <Card className="border-violet-300/28 shadow-[0_0_28px_rgba(167,139,250,0.08)]">
            <div className="text-center mb-6">
              <div className="console-badge mb-4">
                <span>Plan Max</span>
              </div>
              <h3 className="text-2xl font-bold text-white mb-2 font-display">TrainerOS Max</h3>
            </div>

            <div className="text-center mb-8">
              <div className="flex items-baseline justify-center gap-2">
                <span className="text-5xl sm:text-6xl font-bold text-white">€39.99</span>
                <span className="text-slate-400 text-xl">/lună</span>
              </div>
              <p className="mt-2 text-sm text-slate-400">sau €379.99/an</p>
            </div>

            <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-6 mb-6">
              <ul className="space-y-3">
                {[
                  'Daily Idea: 400 seturi/lună',
                  'Structurează Ideea: 450/lună',
                  'Email Marketing: 150/lună',
                  'Nutriție Client: 30/lună',
                  'Chat TrainerOS: 900 întrebări/lună',
                  'Content Review: nelimitat',
                  'Niche Finder, Brand Voice, Cum vrei să creezi content',
                ].map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="mt-0.5 flex-shrink-0 text-cyan-200">✓</span>
                    <span className="text-sm text-slate-200">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </div>

        <div className="text-center mt-6">
          <Link to="/register" className="block mb-4">
            <Button variant="primary" className="text-lg py-4 px-10">
              Începe Free Trial — 7 Zile Gratuit →
            </Button>
          </Link>
          <p className="text-center text-slate-400 text-sm">Fără card necesar.</p>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="console-panel-strong rounded-[36px] p-8 sm:p-12 text-center">
          <p className="console-kicker mb-3">Activează motorul de content</p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-4 font-display">
            Gata să transformi content-ul în clienți?
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-base text-slate-300/78 sm:text-lg">
            Începe gratuit astăzi. Fără card. Fără riscuri.
          </p>
          <Link to="/register">
            <Button variant="primary" size="lg">
              Începe Free Trial →
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
