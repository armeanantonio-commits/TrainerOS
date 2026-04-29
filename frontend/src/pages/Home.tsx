import { Link } from 'react-router-dom';
import Button from '@/components/Button';
import Card from '@/components/Card';
import { useI18n } from '@/hooks/useI18n';

export default function Home() {
  const { language } = useI18n();
  const isEn = language === 'en';
  const appFeatures = isEn
    ? [
        { icon: '💡', title: 'Daily Idea Engine', description: 'Complete ideas (Hook, Script, CTA) for Reel + Carousel + Story.' },
        { icon: '🎯', title: 'Niche Finder (Quick + Discover)', description: 'Find your niche, ideal client, and positioning through quick or guided flows.' },
        { icon: '🗣️', title: 'Brand Voice Setup', description: 'Define tone, style, and principles so generated ideas sound like you.' },
        { icon: '🎬', title: 'Content Creation Preferences', description: 'Set how you naturally film and what format fits you for more realistic ideas.' },
        { icon: '🧠', title: 'Idea Structurer', description: 'Turn a raw idea into a complete structure: Hook, scene-by-scene script, and CTA.' },
        { icon: '📊', title: 'AI Content Review', description: 'Get clarity, relevance, trust, and CTA scores before publishing.' },
        { icon: '🗂️', title: 'Idea History', description: 'Full history for ideas, feedback, and iterations so you can reuse what performs.' },
        { icon: '🔥', title: 'Dashboard & Streak Tracking', description: 'Track monthly progress, average conversion, and keep daily consistency.' },
        { icon: '🤖', title: 'TrainerOS Chat (Marketing Expert)', description: 'Real-time AI assistant for hooks, CTAs, offers, and fitness content strategy.' },
        { icon: '📧', title: 'AI Email Marketing', description: 'Dashboard tool for nurture, sales, and reactivation emails ready to send.' },
      ]
    : [
        { icon: '💡', title: 'Daily Idea Engine', description: 'Idei complete (Hook, Script, CTA) pentru Reel + Carousel + Story.' },
        { icon: '🎯', title: 'Niche Finder (Rapid + Descoperă)', description: 'Găsești nișa, clientul ideal și poziționarea prin flux rapid sau ghidat.' },
        { icon: '🗣️', title: 'Setare Brand Voice', description: 'Definești tonul, stilul și principiile ca ideile generate să sune ca tine.' },
        { icon: '🎬', title: 'Preferințe de creare content', description: 'Setezi cum filmezi natural și ce format ți se potrivește pentru idei mai realiste.' },
        { icon: '🧠', title: 'Idea Structurer', description: 'Transformi o idee brută în structură completă: Hook, Script pe secțiuni și CTA.' },
        { icon: '📊', title: 'Content Review AI', description: 'Primești scoruri de claritate, relevanță, încredere și CTA înainte de publicare.' },
        { icon: '🗂️', title: 'Idea History', description: 'Istoric complet pentru idei, feedback și iterări, ca să refolosești ce performează.' },
        { icon: '🔥', title: 'Dashboard & Streak Tracking', description: 'Vezi progresul lunar, conversia medie și menții consecvența zilnică.' },
        { icon: '🤖', title: 'TrainerOS Chat (Expert Marketing)', description: 'Asistent AI în timp real pentru hook-uri, CTA, oferte și strategii de content fitness.' },
        { icon: '📧', title: 'Email Marketing AI', description: 'Tool din dashboard pentru emailuri de nurture, vânzare și reactivare, gata de trimis.' },
      ];

  return (
    <div className="min-h-screen console-shell">
      {/* Hero Section */}
      <section className="relative overflow-hidden px-3 pt-4 sm:px-5">
        <div className="absolute inset-0 animate-grid-drift bg-[radial-gradient(circle_at_top,rgba(114,202,255,0.18),transparent_42%),radial-gradient(circle_at_bottom,rgba(140,248,212,0.12),transparent_34%)] opacity-70" />
        <div className="absolute inset-x-10 top-8 h-[32rem] rounded-[38px] border border-white/6 bg-console-grid opacity-25" />
        <div className="absolute -top-10 left-[8%] h-56 w-56 rounded-full border border-cyan-300/25 animate-float-slow" />
        <div className="absolute top-16 right-[8%] h-40 w-40 rounded-full border border-cyan-200/20 animate-float-delay" />
        <div className="console-panel absolute bottom-10 left-[8%] hidden rounded-[22px] px-4 py-3 md:block animate-float-delay">
          <p className="console-kicker">{isEn ? 'Content consistency counter' : 'Contor consistență content'}</p>
          <p className="text-white text-lg font-bold">{isEn ? '7-day streak' : '7 zile streak'}</p>
        </div>
        <div className="console-panel absolute right-[8%] top-24 hidden rounded-[22px] px-4 py-3 lg:block animate-float-slow">
          <p className="console-kicker">{isEn ? 'AI output flow' : 'Flux output AI'}</p>
          <p className="text-white text-sm">HOOK → SCRIPT → CTA</p>
        </div>
        <div className="console-panel-strong relative mx-auto max-w-7xl rounded-[38px] px-4 py-20 sm:px-6 lg:px-8">
          {/* Badge */}
          <div className="flex justify-center mb-8">
            <div className="console-badge">
              <div className="h-2 w-2 rounded-full bg-cyan-300 animate-pulse" />
              <span className="text-sm">
                {isEn ? 'Content & Client System for fitness coaches' : 'Content & Client System pentru antrenori fitness'}
              </span>
            </div>
          </div>

          {/* Main Heading */}
          <h1 className="text-center font-display font-bold mb-6">
            <div className="text-4xl sm:text-5xl lg:text-6xl text-white mb-2">
              {isEn ? 'The content system that' : 'Sistemul de content care'}
            </div>
            <div className="text-4xl sm:text-5xl lg:text-6xl text-white mb-2">
              {isEn ? 'turns your posts into' : 'transformă postările în'}
            </div>
            <div className="text-5xl sm:text-6xl lg:text-7xl bg-gradient-to-r from-[#8CF8D4] via-[#72CAFF] to-[#A78BFA] bg-clip-text text-transparent">
              {isEn ? 'CLIENTS.' : 'CLIENȚI.'}
            </div>
          </h1>

          {/* Subtitle */}
          <p className="mx-auto mb-10 max-w-3xl text-center text-lg text-slate-300/80 sm:text-xl">
            {isEn
              ? 'For fitness coaches who want consistency and conversions: clear niche, daily ideas, post feedback, and CTAs that bring clients.'
              : 'Pentru antrenori fitness care vor consecvență și conversii: nișă clară, idee zilnică, feedback pe postări și CTA-uri care duc spre clienți.'}
          </p>

          {/* CTA Button */}
          <div className="flex justify-center mb-8">
            <Link to="/register">
              <Button size="lg" className="text-xl px-12 py-5">
                {isEn ? 'Start Free Trial →' : 'Începe Free Trial →'}
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
              {isEn ? 'Used by ' : 'Folosit de '}<span className="text-white font-semibold">100+</span>{isEn ? ' fitness coaches' : ' antrenori fitness'}
            </span>
          </div>
        </div>
      </section>

      {/* Features Preview Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <p className="console-kicker mb-3">{isEn ? 'Platform modules' : 'Module platformă'}</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 font-display">
            {isEn ? 'Features in TrainerOS' : 'Funcționalități în TrainerOS'}
          </h2>
          <p className="text-slate-300/78 text-lg max-w-2xl mx-auto">
            {isEn
              ? 'All modules available now, from strategy to execution and optimization'
              : 'Toate modulele disponibile acum, de la strategie până la execuție și optimizare'}
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
                {isEn ? 'Real example of an idea ready to film' : 'Exemplu real de idee gata de filmat'}
              </h2>
              <p className="mb-6 text-slate-300/78">
                {isEn
                  ? 'You do not get just a title. You get a complete plan you can film today in 20-30 minutes.'
                  : 'Nu primești doar un titlu. Primești un plan complet pe care îl poți filma astăzi în 20-30 minute.'}
              </p>
              <Link to="/register">
                <Button>{isEn ? 'I want daily ideas ready to post →' : 'Vreau idei zilnice gata de postat →'}</Button>
              </Link>
            </div>
            <div className="space-y-4">
              <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
                <p className="console-kicker mb-2">Hook</p>
                <p className="text-white font-semibold">
                  {isEn
                    ? 'Do your joints crack everywhere when you stand up from your chair?'
                    : 'Simți că trosnești din toate încheieturile când te ridici de pe scaun?'}
                </p>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
                <p className="console-kicker mb-2">{isEn ? 'Scene-by-scene script' : 'Script pe Scene'}</p>
                <div className="space-y-4 text-sm text-slate-200">
                  <div>
                    <p className="text-white font-semibold mb-1">{isEn ? 'Scene 1' : 'Scenă 1'}</p>
                    <p>
                      {isEn
                        ? 'When you sit for 8 hours, your body basically "freezes" in that position. Your hips shorten, and your back takes over the effort when you try to move. That is why you feel that unpleasant lower-back tension as soon as you take your first steps after work.'
                        : 'Când stai jos 8 ore, corpul tău practic „îngheață” în acea poziție. Șoldurile se scurtează, iar spatele preia tot efortul când încerci să te miști. De asta simți acea tensiune neplăcută în zona lombară imediat ce faci primii pași prin casă după muncă.'}
                    </p>
                    <p className="mt-1 text-slate-400">
                      {isEn
                        ? '🎬 Visual: The coach sits in an office chair, stands up stiffly, and places a hand on the lower back.'
                        : '🎬 Vizual: Antrenorul stă pe un scaun de birou, se ridică greoi și își pune mâna pe spate, mimând o ușoară rigiditate.'}
                    </p>
                  </div>
                  <div>
                    <p className="text-white font-semibold mb-1">{isEn ? 'Scene 2' : 'Scenă 2'}</p>
                    <p>
                      {isEn
                        ? 'The issue is not sudden aging, but that your joints are not getting lubrication. Think of a hinge that has not moved for years. If you force it suddenly, it fails. Your body works the same way: it needs gentle circular movement, not intense effort from minute one.'
                        : 'Problema nu e că ai îmbătrânit brusc, ci că articulațiile tale nu primesc lubrifiere. Imaginează-ți o balama care n-a fost mișcată de ani de zile. Dacă tragi de ea brusc, se strică. La fel și cu corpul tău: ai nevoie de mișcări circulare, blânde, nu de efort intens din prima.'}
                    </p>
                    <p className="mt-1 text-slate-400">
                      {isEn
                        ? '🎬 Visual: The coach speaks directly to camera at home, calmly explaining with hand gestures.'
                        : '🎬 Vizual: Antrenorul vorbește direct la cameră, într-un cadru cald, acasă, explicând calm cu gesturi ale mâinilor.'}
                    </p>
                  </div>
                  <div>
                    <p className="text-white font-semibold mb-1">{isEn ? 'Scene 3' : 'Scenă 3'}</p>
                    <p>
                      {isEn
                        ? 'For example: instead of going straight to the couch, stay 2 minutes in a low lunge with one knee on the floor. This opens the hip area and releases the spine. It is a small action that tells the brain it is safe to relax without pain.'
                        : 'Uite un exemplu: în loc să te așezi direct pe canapea, stai 2 minute într-o poziție de fandare joasă, cu un genunchi pe covor. Asta deschide zona inghinală și eliberează coloana. E un gest mic care îi spune creierului că e sigur să se relaxeze fără să producă durere.'}
                    </p>
                    <p className="mt-1 text-slate-400">
                      {isEn
                        ? '🎬 Visual: Quick demonstration of a low lunge on the living room rug, back straight, eyes forward.'
                        : '🎬 Vizual: Demonstrație rapidă a unei fandări joase pe covorul din sufragerie, menținând spatele drept și privirea înainte.'}
                    </p>
                  </div>
                  <div>
                    <p className="text-white font-semibold mb-1">{isEn ? 'Scene 4' : 'Scenă 4'}</p>
                    <p>
                      {isEn
                        ? 'Repeat this daily, even while water is boiling. You do not need equipment, just consistency. The goal is to teach your body to move again, without forcing complex moves that increase the stiffness you already feel.'
                        : 'Repetă asta zilnic, chiar și în timp ce fierbi apa pentru ceai. Nu ai nevoie de echipament, ci doar de puțină disciplină. Scopul e să reînvățăm corpul să fie mobil, fără să-l forțăm cu mișcări complexe care doar ar accentua uzura pe care o simți acum.'}
                    </p>
                    <p className="mt-1 text-slate-400">
                      {isEn
                        ? '🎬 Visual: The coach returns standing, smiling, in a relaxed home setup.'
                        : '🎬 Vizual: Antrenorul revine în picioare, zâmbind prietenos, într-un cadru relaxat de acasă.'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
                <p className="console-kicker mb-2">{isEn ? 'Recommended CTA' : 'CTA Recomandat'}</p>
                <p className="text-slate-200">
                  {isEn ? 'Want to get rid of that "stiff" feeling? Send me' : 'Vrei să scapi de senzația de „rigiditate” în mișcări? Scrie-mi'}
                  <strong className="text-white"> MOBILITATE </strong>
                  {isEn ? 'in DM and I will send my routine.' : 'în DM și îți trimit rutina mea.'}
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
                {isEn ? 'Your AI marketing expert for fitness' : 'Expertul tău AI de marketing pentru fitness'}
              </h2>
              <p className="mb-6 text-slate-300/78">
                {isEn
                  ? 'This is not a generic chatbot. TrainerOS Chat helps specifically with marketing, content, and conversion strategies for fitness coaches.'
                  : 'Nu este un chatbot general. TrainerOS Chat te ajută strict pe strategii de marketing, content și conversie pentru antrenori fitness.'}
              </p>
              <ul className="space-y-2 text-sm text-slate-200">
                <li>{isEn ? '✓ Hooks and CTAs that improve conversion' : '✓ Hook-uri și CTA-uri care cresc conversia'}</li>
                <li>{isEn ? '✓ Editorial calendar and ideas for your niche' : '✓ Calendar editorial și idei pe nișa ta'}</li>
                <li>{isEn ? '✓ Offer, positioning, and messaging optimization' : '✓ Optimizare de ofertă, poziționare și mesaj'}</li>
              </ul>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
              <p className="console-kicker mb-2">{isEn ? 'Prompt example' : 'Exemplu prompt'}</p>
              <p className="mb-4 text-sm text-slate-200">
                {isEn
                  ? '"My niche is weight loss for moms after pregnancy. Give me 5 Reel hooks + 3 DM keyword CTAs."'
                  : '„Am nișa slăbit pentru mame după sarcină. Dă-mi 5 hook-uri de Reel + 3 CTA pentru DM keyword.”'}
              </p>
              <p className="console-kicker mb-2">{isEn ? 'Result' : 'Rezultat'}</p>
              <p className="text-sm text-slate-200">
                {isEn
                  ? 'Get a real-time response tailored to your TrainerOS niche and context.'
                  : 'Primești răspuns în timp real, adaptat la nișa și contextul tău TrainerOS.'}
              </p>
              <Link to="/chat" className="inline-block mt-4">
                <Button variant="outline">{isEn ? 'Open TrainerOS Chat →' : 'Deschide TrainerOS Chat →'}</Button>
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
                <span>{isEn ? 'Client Nutrition' : 'Nutriție Client'}</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4 font-display">
                {isEn ? 'Clear nutrition plans, coming soon in TrainerOS' : 'Planuri de nutriție clare, în curând în TrainerOS'}
              </h2>
              <p className="mb-6 text-slate-300/78">
                {isEn
                  ? 'This module is not yet ready for launch. We are still working on the experience and output quality before enabling it for users.'
                  : 'Modulul nu este încă gata pentru lansare. Lucrăm încă la experiență și la calitatea output-ului înainte să îl activăm pentru utilizatori.'}
              </p>
              <ul className="space-y-2 text-sm text-slate-200">
                <li>{isEn ? '• Meal-structured plan with simple options' : '• Plan structurat pe mese și opțiuni simple'}</li>
                <li>{isEn ? '• Adapted to goal: weight loss, muscle gain, or maintenance' : '• Adaptat la obiectiv: slăbire, masă musculară sau menținere'}</li>
                <li>{isEn ? '• Recommendations easy to send directly to the client' : '• Recomandări ușor de trimis direct către client'}</li>
              </ul>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
              <p className="console-kicker mb-2">{isEn ? 'Input example' : 'Exemplu input'}</p>
              <p className="mb-4 text-sm text-slate-200">
                {isEn
                  ? '"Female client, 34, wants weight loss, 3 meals + 1 snack, limited cooking time, prefers simple foods."'
                  : '„Clientă, 34 ani, vrea slăbire, 3 mese + 1 gustare, timp redus pentru gătit, preferă alimente simple.”'}
              </p>
              <p className="console-kicker mb-2">{isEn ? 'Result' : 'Rezultat'}</p>
              <p className="text-sm text-slate-200">
                {isEn
                  ? 'Get a practical, clear plan quickly, easy to implement in the client routine.'
                  : 'Primești rapid un plan practic, clar și ușor de implementat în rutina clientului.'}
              </p>
              <div className="inline-block mt-4">
                <Button variant="outline" disabled>{isEn ? 'Upcoming feature' : 'Funcție viitoare'}</Button>
              </div>
            </div>
          </div>
        </Card>
      </section>

      {/* Pricing Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <p className="console-kicker mb-3">{isEn ? 'Pricing console' : 'Consolă prețuri'}</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 font-display">
            {isEn ? 'Simple, ' : 'Prețuri simple, '}<span className="text-cyan-200">{isEn ? 'transparent' : 'transparente'}</span>
          </h2>
          <p className="text-slate-300/78 text-lg">
            {isEn ? 'Two plans: Pro and Max.' : 'Două planuri: Pro și Max.'}
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
                <span className="text-slate-400 text-xl">{isEn ? '/month' : '/lună'}</span>
              </div>
              <p className="mt-2 text-sm text-slate-400">{isEn ? 'First month €12.99, then €19.9/month' : 'Prima lună €12.99, apoi €19.9/lună'}</p>
            </div>

            <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-6 mb-6">
              <ul className="space-y-3">
                {[
                  isEn ? 'Daily Idea: 100 sets/month' : 'Daily Idea: 100 seturi/lună',
                  isEn ? 'Idea Structurer: 90/month' : 'Structurează Ideea: 90/lună',
                  isEn ? 'Email Marketing: 60/month' : 'Email Marketing: 60/lună',
                  isEn ? 'Client Nutrition: 10/month' : 'Nutriție Client: 10/lună',
                  isEn ? 'TrainerOS Chat: 300 questions/month' : 'Chat TrainerOS: 300 întrebări/lună',
                  isEn ? 'Content Review: 60/month' : 'Content Review: 60/lună',
                  isEn ? 'Niche Finder, Brand Voice, Content Creation Preferences' : 'Niche Finder, Brand Voice, Cum vrei să creezi content',
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
                <span className="text-slate-400 text-xl">{isEn ? '/month' : '/lună'}</span>
              </div>
              <p className="mt-2 text-sm text-slate-400">{isEn ? 'or €379.99/year' : 'sau €379.99/an'}</p>
            </div>

            <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-6 mb-6">
              <ul className="space-y-3">
                {[
                  isEn ? 'Daily Idea: 400 sets/month' : 'Daily Idea: 400 seturi/lună',
                  isEn ? 'Idea Structurer: 450/month' : 'Structurează Ideea: 450/lună',
                  isEn ? 'Email Marketing: 150/month' : 'Email Marketing: 150/lună',
                  isEn ? 'Client Nutrition: 30/month' : 'Nutriție Client: 30/lună',
                  isEn ? 'TrainerOS Chat: 900 questions/month' : 'Chat TrainerOS: 900 întrebări/lună',
                  isEn ? 'Content Review: unlimited' : 'Content Review: nelimitat',
                  isEn ? 'Niche Finder, Brand Voice, Content Creation Preferences' : 'Niche Finder, Brand Voice, Cum vrei să creezi content',
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
              {isEn ? 'Start Free Trial — 7 Days Free →' : 'Începe Free Trial — 7 Zile Gratuit →'}
            </Button>
          </Link>
          <p className="text-center text-slate-400 text-sm">{isEn ? 'No card required.' : 'Fără card necesar.'}</p>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="console-panel-strong rounded-[36px] p-8 sm:p-12 text-center">
          <p className="console-kicker mb-3">{isEn ? 'Activate the content engine' : 'Activează motorul de content'}</p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-4 font-display">
            {isEn ? 'Ready to turn content into clients?' : 'Gata să transformi content-ul în clienți?'}
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-base text-slate-300/78 sm:text-lg">
            {isEn ? 'Start free today. No card. No risk.' : 'Începe gratuit astăzi. Fără card. Fără riscuri.'}
          </p>
          <Link to="/register">
            <Button variant="primary" size="lg">
              {isEn ? 'Start Free Trial →' : 'Începe Free Trial →'}
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
