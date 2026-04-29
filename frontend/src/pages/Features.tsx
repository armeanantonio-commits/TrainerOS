import { Link } from 'react-router-dom';
import Button from '@/components/Button';
import Card from '@/components/Card';

const featureCards = [
  { icon: '💡', title: 'Daily Idea', description: 'Idei zilnice gata de publicat.' },
  { icon: '🎯', title: 'Niche Finder', description: 'Nișă clară în câteva minute.' },
  { icon: '📊', title: 'Content Review', description: 'Verifici postarea înainte de publicare.' },
  { icon: '🗣️', title: 'Brand Voice', description: 'Păstrezi un ton coerent.' },
  {
    icon: '🧩',
    title: 'Structurează Ideea',
    description: 'Tu vii cu ideea, AI-ul o dezvoltă în hook, script și CTA.',
  },
  { icon: '📧', title: 'Email Marketing', description: 'Scrii emailuri care duc spre acțiune.' },
  { icon: '🤖', title: 'TrainerOS Chat', description: 'Primești răspunsuri rapide pe marketing.' },
  { icon: '🔥', title: 'Dashboard', description: 'Vezi progresul și ritmul tău.' },
];

const differentiationCards = [
  {
    title: 'Nu mai pierzi timp',
    description: 'Mai puțin brainstorming. Mai mult content gata de folosit.',
  },
  {
    title: 'Totul într-un singur loc',
    description: 'Strategie, idei, review și email, în același flow.',
  },
  {
    title: 'Gândit pentru antrenori',
    description: 'TrainerOS nu este generic. Este făcut pentru fitness.',
  },
];

const previewScenes = [
  {
    label: 'Scenă 1',
    value:
      "Când stai jos 8 ore, corpul tău practic 'îngheață' în acea poziție. Șoldurile se scurtează, iar spatele preia tot efortul când încerci să te miști. De asta simți acea tensiune neplăcută în zona lombară imediat ce faci primii pași prin casă după muncă.",
    visual:
      '🎬 Vizual: Antrenorul stă pe un scaun de birou, se ridică greoi și își pune mâna pe spate, mimând o ușoară rigiditate.',
  },
  {
    label: 'Scenă 2',
    value:
      'Problema nu e că ai îmbătrânit brusc, ci că articulațiile tale nu primesc lubrifiere. Imaginați-vă o balama care n-a fost mișcată de ani de zile. Dacă tragi de ea brusc, se strică. La fel și cu corpul tău: ai nevoie de mișcări circulare, blânde, nu de efort intens din prima.',
    visual:
      '🎬 Vizual: Antrenorul vorbește direct la cameră, într-un cadru cald, acasă, explicând calm cu gesturi ale mâinilor.',
  },
  {
    label: 'Scenă 3',
    value: '...',
    visual: '',
  },
  {
    label: 'Scenă 4',
    value: '...',
    visual: '',
  },
];

export default function Features() {
  return (
    <div className="console-shell min-h-screen px-3 pb-20 pt-4 sm:px-5">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="console-panel-strong relative overflow-hidden rounded-[38px] px-5 py-16 sm:px-8 lg:px-12">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(114,202,255,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(140,248,212,0.14),transparent_32%)]" />
          <div className="console-orb -left-8 top-10 h-40 w-40 bg-cyan-300/18" />
          <div className="console-orb bottom-6 right-0 h-52 w-52 bg-emerald-300/14" />

          <div className="relative grid gap-8 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
            <div>
              <div className="console-badge mb-6">
                <div className="h-2 w-2 rounded-full bg-cyan-300 animate-pulse" />
                <span>TrainerOS pentru antrenori fitness</span>
              </div>

              <h1 className="max-w-3xl font-display text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">
                Tot marketingul tău fitness într-un singur loc
              </h1>

              <p className="mt-5 max-w-2xl text-lg text-slate-300/80 sm:text-xl">
                TrainerOS te ajută să-ți clarifici nișa, să creezi content mai rapid și să optimizezi
                ce publici.
              </p>

              <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                <Link to="/register">
                  <Button size="lg" className="w-full sm:w-auto">
                    Intră în aplicație
                  </Button>
                </Link>
                <Link to="/pricing">
                  <Button variant="outline" size="lg" className="w-full sm:w-auto">
                    Vezi prețurile
                  </Button>
                </Link>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="min-h-[160px] border-cyan-300/20 bg-[linear-gradient(180deg,rgba(12,21,38,0.94),rgba(8,14,28,0.88))]">
                <p className="console-kicker mb-3">Flow</p>
                <h2 className="text-2xl font-bold text-white font-display">Nișă → Content → Review</h2>
                <p className="mt-3 text-sm text-slate-300/72">Un sistem clar, nu tool-uri separate.</p>
              </Card>
              <Card className="min-h-[160px] border-emerald-300/18 bg-[linear-gradient(180deg,rgba(12,21,38,0.94),rgba(8,14,28,0.88))]">
                <p className="console-kicker mb-3">Output</p>
                <h2 className="text-2xl font-bold text-white font-display">Hook, Script și CTA</h2>
                <p className="mt-3 text-sm text-slate-300/72">Mai puțină improvizație, mai multă claritate.</p>
              </Card>
              <Card className="min-h-[160px] border-white/10 bg-[linear-gradient(180deg,rgba(12,21,38,0.94),rgba(8,14,28,0.88))] sm:col-span-2">
                <div className="flex flex-wrap gap-3">
                  {['Niche Finder', 'Daily Idea', 'Content Review', 'Email Marketing'].map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-slate-200"
                    >
                      {item}
                    </span>
                  ))}
                </div>
                <p className="mt-5 text-sm text-slate-300/72">
                  Totul păstrează același context: nișa ta, tonul tău și obiectivul tău.
                </p>
              </Card>
            </div>
          </div>
        </section>

        <section className="space-y-5">
          <div className="px-1">
            <p className="console-kicker mb-3">Module</p>
            <h2 className="font-display text-3xl font-bold text-white sm:text-4xl">
              Funcționalități esențiale
            </h2>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {featureCards.map((feature) => (
              <Card
                key={feature.title}
                hover
                className="group min-h-[200px] border-white/10 bg-[linear-gradient(180deg,rgba(11,19,35,0.96),rgba(8,14,28,0.9))]"
              >
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-[20px] border border-cyan-300/18 bg-cyan-300/[0.08] text-3xl">
                    {feature.icon}
                  </div>
                </div>
                <h3 className="text-xl font-bold text-white font-display">{feature.title}</h3>
                <p className="mt-3 text-sm text-slate-300/72">{feature.description}</p>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <Card className="relative overflow-hidden border-cyan-300/20 bg-[linear-gradient(180deg,rgba(8,14,28,0.94),rgba(5,10,20,0.92))]">
            <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-cyan-300/10 blur-3xl" />
            <div className="relative mx-auto w-full max-w-5xl rounded-[34px] border border-white/10 bg-[#071120] p-3 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
              <div className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(10,19,34,0.98),rgba(7,13,25,0.95))] p-4 sm:p-6">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Daily Idea</p>
                    <p className="text-sm font-semibold text-white">Preview TrainerOS</p>
                  </div>
                  <div className="flex gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-cyan-300" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-[18px] border border-white/10 bg-white/[0.04] p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Hook</p>
                      <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] font-medium text-slate-200">
                        Copiază
                      </span>
                    </div>
                    <p className="text-base font-semibold text-white">
                      Simți că trosnești din toate încheieturile când te ridici de pe scaun?
                    </p>
                  </div>

                  <div className="rounded-[18px] border border-white/10 bg-white/[0.04] p-4">
                    <p className="mb-4 text-xs uppercase tracking-[0.16em] text-slate-400">
                      Script pe scene
                    </p>
                    <div className="space-y-4">
                      {previewScenes.map((scene, index) => (
                        <div key={scene.label} className="rounded-[18px] border border-white/10 bg-[#0a1628] p-4">
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-sm font-semibold text-white">{scene.label}</p>
                            <span className="text-xs text-cyan-200">0{index + 1}</span>
                          </div>
                          <p className="text-sm leading-6 text-slate-100">{scene.value}</p>
                          {scene.visual ? (
                            <p className="mt-3 text-sm leading-6 text-slate-400">{scene.visual}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[18px] border border-white/10 bg-white/[0.04] p-4">
                    <p className="mb-3 text-xs uppercase tracking-[0.16em] text-slate-400">CTA recomandat</p>
                    <p className="text-sm leading-6 text-slate-100">
                      Vrei să scapi de senzația de &quot;rigiditate&quot; în mișcări? Scrie-mi
                      <span className="font-semibold text-white"> MOBILITATE </span>
                      în DM și îți trimit rutina mea.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </section>

        <section className="space-y-5">
          <div className="px-1">
            <p className="console-kicker mb-3">De ce TrainerOS</p>
            <h2 className="font-display text-3xl font-bold text-white sm:text-4xl">
              Simplu de înțeles. Puternic în execuție.
            </h2>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {differentiationCards.map((card) => (
              <Card
                key={card.title}
                hover
                className="min-h-[180px] border-white/10 bg-[linear-gradient(180deg,rgba(11,19,35,0.96),rgba(8,14,28,0.9))]"
              >
                <h3 className="text-2xl font-bold text-white font-display">{card.title}</h3>
                <p className="mt-4 max-w-sm text-sm text-slate-300/74">{card.description}</p>
              </Card>
            ))}
          </div>
        </section>

        <section className="console-panel-strong relative overflow-hidden rounded-[38px] px-6 py-12 text-center sm:px-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(114,202,255,0.12),transparent_38%),radial-gradient(circle_at_bottom,rgba(140,248,212,0.1),transparent_32%)]" />
          <div className="relative">
            <p className="console-kicker mb-3">Start</p>
            <h2 className="font-display text-3xl font-bold text-white sm:text-4xl">
              Începe acum cu TrainerOS
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm text-slate-300/74 sm:text-base">
              Intră în aplicație și vezi cum arată un flow complet de marketing făcut pentru antrenori.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
              <Link to="/register">
                <Button size="lg" className="w-full sm:w-auto">
                  Începe acum
                </Button>
              </Link>
              <Link to="/dashboard">
                <Button variant="outline" size="lg" className="w-full sm:w-auto">
                  Vezi aplicația
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
