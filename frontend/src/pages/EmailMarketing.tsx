import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { emailAPI } from '@/services/api';
import { copyToClipboard } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';

type Objective = 'lead-magnet' | 'nurture' | 'sales' | 'reengagement';
type EmailType = 'single' | 'welcome' | 'promo' | 'newsletter';
type Tone = 'direct' | 'empathetic' | 'authoritative' | 'friendly';
type Language = 'ro' | 'en';

interface EmailResult {
  subjectOptions: string[];
  previewText: string;
  body: string;
  cta: string;
  angles: string[];
}

function useTypingPlaceholder(samples: string[], speed = 55, hold = 1100) {
  const [sampleIndex, setSampleIndex] = useState(0);
  const [text, setText] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const sample = samples[sampleIndex % samples.length];

    const timer = window.setTimeout(
      () => {
        if (!deleting) {
          const next = sample.slice(0, text.length + 1);
          setText(next);
          if (next === sample) {
            window.setTimeout(() => setDeleting(true), hold);
          }
        } else {
          const next = sample.slice(0, Math.max(0, text.length - 1));
          setText(next);
          if (!next) {
            setDeleting(false);
            setSampleIndex((current) => current + 1);
          }
        }
      },
      deleting ? speed * 0.55 : speed
    );

    return () => window.clearTimeout(timer);
  }, [deleting, hold, sampleIndex, samples, speed, text]);

  return text;
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-5">
      <h2 className="bg-gradient-to-r from-white to-slate-400 bg-clip-text text-2xl font-semibold text-transparent">
        {title}
      </h2>
      {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300/78">{description}</p> : null}
    </div>
  );
}

function NeonInput({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-100">{label}</span>
      <div
        className={`relative overflow-hidden rounded-[22px] p-[1px] transition duration-300 ${
          focused
            ? 'bg-[conic-gradient(from_180deg_at_50%_50%,rgba(93,92,255,0.85),rgba(76,201,240,0.92),rgba(168,85,247,0.88),rgba(93,92,255,0.85))] shadow-[0_0_28px_rgba(76,201,240,0.18)]'
            : 'bg-white/10'
        }`}
      >
        <div className="rounded-[21px] bg-black/40 backdrop-blur-xl">
          {multiline ? (
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={placeholder}
              className="min-h-[112px] w-full resize-none rounded-[21px] bg-transparent px-4 py-3 text-sm text-white outline-none placeholder:text-slate-400/60"
            />
          ) : (
            <input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={placeholder}
              className="h-12 w-full rounded-[21px] bg-transparent px-4 text-sm text-white outline-none placeholder:text-slate-400/60"
            />
          )}
        </div>
      </div>
    </label>
  );
}

function FanDropdown<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <span className="mb-2 block text-sm font-medium text-slate-100">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-12 w-full items-center justify-between rounded-[22px] border border-white/10 bg-black/40 px-4 text-sm text-white backdrop-blur-xl transition hover:border-cyan-300/40 hover:shadow-[0_0_24px_rgba(76,201,240,0.12)]"
      >
        <span>{options.find((option) => option.value === value)?.label}</span>
        <span className={`transition ${open ? 'rotate-180 text-cyan-200' : 'text-slate-400'}`}>⌄</span>
      </button>

      <div
        className={`absolute z-20 mt-3 w-full origin-top overflow-hidden rounded-[22px] border border-cyan-300/20 bg-[#07111f]/96 p-2 shadow-[0_15px_55px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-all duration-200 ${
          open ? 'pointer-events-auto translate-y-0 scale-100 opacity-100' : 'pointer-events-none -translate-y-2 scale-95 opacity-0'
        }`}
        style={{ transformStyle: 'preserve-3d' }}
      >
        <div className="space-y-2">
          {options.map((option, index) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`block w-full rounded-[18px] border px-3 py-3 text-left text-sm transition hover:shadow-[0_0_22px_rgba(76,201,240,0.16)] ${
                value === option.value
                  ? 'border-cyan-300/45 bg-cyan-300/10 text-white'
                  : 'border-white/8 bg-white/[0.035] text-slate-300/82 hover:border-cyan-200/30 hover:text-white'
              }`}
              style={{
                transform: open ? `rotateX(0deg) translateY(0px)` : `rotateX(-12deg) translateY(-8px)`,
                transitionDelay: `${index * 35}ms`,
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function OutputIdle({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex min-h-[560px] flex-col items-center justify-center py-10 text-center">
      <div className="relative mb-7 h-[250px] w-[260px] animate-[floatInbox_4.8s_ease-in-out_infinite]">
        <div className="absolute left-7 top-14 h-[140px] w-[190px] rounded-[26px] border border-cyan-300/25 bg-[#111827]/80 shadow-[0_25px_45px_rgba(0,0,0,0.28)]" />
        <div className="absolute left-12 top-8 h-[140px] w-[180px] rounded-[24px] border border-white/10 bg-[#172235]/80 backdrop-blur-xl shadow-[0_0_35px_rgba(76,201,240,0.12)]" />
        <div className="absolute left-16 top-16 h-[86px] w-[150px] rounded-[18px] border border-violet-300/25 bg-violet-300/[0.08]" />
        <div className="absolute left-20 top-28 h-2 w-20 rounded-full bg-cyan-200/60" />
        <div className="absolute left-20 top-40 h-2 w-28 rounded-full bg-slate-300/35" />
      </div>
      <h3 className="text-[22px] font-semibold text-white">{title}</h3>
      <p className="mt-2 animate-pulse text-sm leading-6 text-slate-300/80">
        {text}
      </p>
    </div>
  );
}

export default function EmailMarketing() {
  const { language: platformLanguage, t } = useI18n();
  const [topic, setTopic] = useState('');
  const [objective, setObjective] = useState<Objective>('nurture');
  const [emailType, setEmailType] = useState<EmailType>('single');
  const [tone, setTone] = useState<Tone>('friendly');
  const [language, setLanguage] = useState<Language>(platformLanguage);
  const [offer, setOffer] = useState('');
  const [audiencePain, setAudiencePain] = useState('');
  const [ctaGoal, setCtaGoal] = useState('');
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [scanActive, setScanActive] = useState(false);
  const [showFab, setShowFab] = useState(false);

  const topicPlaceholder = useTypingPlaceholder([
    t('email.placeholder.topic1'),
    t('email.placeholder.topic2'),
  ]);
  const offerPlaceholder = useTypingPlaceholder([
    t('email.placeholder.offer1'),
    t('email.placeholder.offer2'),
  ]);
  const painPlaceholder = useTypingPlaceholder([
    t('email.placeholder.pain1'),
    t('email.placeholder.pain2'),
  ]);

  useEffect(() => {
    setLanguage(platformLanguage);
  }, [platformLanguage]);

  useEffect(() => {
    const onScroll = () => {
      setShowFab(window.scrollY > 260);
    };

    onScroll();
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data } = await emailAPI.generate({
        topic,
        objective,
        emailType,
        tone,
        language,
        offer: offer.trim() || undefined,
        audiencePain: audiencePain.trim() || undefined,
        ctaGoal: ctaGoal.trim() || undefined,
      });
      return data as EmailResult;
    },
    onMutate: () => {
      setScanActive(true);
      window.setTimeout(() => setScanActive(false), 1100);
    },
  });

  const result = generateMutation.data;

  const outputCards = useMemo(
    () =>
      result
        ? [
            { id: 'subjects', title: t('email.subjectOptions'), body: result.subjectOptions.join('\n') },
            { id: 'preview', title: t('email.previewText'), body: result.previewText },
            { id: 'body', title: t('email.fullBody'), body: result.body },
            { id: 'cta', title: 'CTA', body: result.cta },
            { id: 'angles', title: t('email.angles'), body: result.angles.join('\n') },
          ]
        : [],
    [result, t]
  );

  const handleCopy = async (text: string, label: string) => {
    try {
      await copyToClipboard(text);
      setCopyStatus(t('email.copied', { label }));
      window.setTimeout(() => setCopyStatus(null), 1500);
    } catch {
      setCopyStatus(t('email.copyError'));
      window.setTimeout(() => setCopyStatus(null), 1500);
    }
  };

  const handleCopyAll = () => {
    if (!result) return;

    const payload = [
      'SUBJECT OPTIONS',
      result.subjectOptions.join('\n'),
      '',
      'PREVIEW TEXT',
      result.previewText,
      '',
      'BODY',
      result.body,
      '',
      'CTA',
      result.cta,
      '',
      'ANGLES',
      result.angles.join('\n'),
    ].join('\n');

    void handleCopy(payload, t('email.allEmail'));
  };

  const handleSend = () => {
    if (!result) return;
    const subject = encodeURIComponent(result.subjectOptions[0] || 'Generated Email');
    const body = encodeURIComponent(`${result.previewText}\n\n${result.body}\n\nCTA: ${result.cta}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  return (
    <div
      className="relative min-h-screen overflow-hidden bg-[#0D1117] py-10 text-white"
      style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}
    >
      <style>{`
        @keyframes particleFloat {
          0%, 100% { transform: translate3d(0, 0, 0); opacity: .14; }
          50% { transform: translate3d(0, -16px, 0); opacity: .7; }
        }
        @keyframes floatInbox {
          0%, 100% { transform: translateY(0px) rotate(-2deg); }
          50% { transform: translateY(-12px) rotate(1deg); }
        }
        @keyframes ctaPlasma {
          0%, 100% { transform: translateX(-12%) scale(1); opacity: .52; }
          50% { transform: translateX(14%) scale(1.08); opacity: .94; }
        }
        @keyframes resultRise {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes binaryFlow {
          0% { transform: translateX(-20%) translateY(0); opacity: 0; }
          20% { opacity: .8; }
          100% { transform: translateX(115%) translateY(-8px); opacity: 0; }
        }
      `}</style>

      <div className="absolute inset-0 bg-[linear-gradient(140deg,#1A1A1A_0%,#141826_35%,#0D1117_100%)]" />
      <div className="absolute -left-20 top-[-110px] h-[360px] w-[360px] rounded-full bg-[#4CC9F0]/12 blur-3xl" />
      <div className="absolute right-[-80px] top-[120px] h-[420px] w-[420px] rounded-full bg-[#8B5CF6]/12 blur-3xl" />
      {Array.from({ length: 18 }).map((_, index) => (
        <span
          key={index}
          className="absolute h-1 w-1 rounded-full bg-[#d1f8ff]"
          style={{
            left: `${(index * 6.2 + 4) % 100}%`,
            top: `${(index * 8.9 + 6) % 100}%`,
            animation: `particleFloat ${4 + index * 0.18}s ease-in-out ${index * 0.15}s infinite`,
          }}
        />
      ))}

      <div className="relative mx-auto max-w-[1480px] px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#4CC9F044] bg-[#4CC9F018] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.32em] text-[#7FDBFF]">
            Email Marketing AI
          </div>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-tight sm:text-5xl">{t('email.title')}</h1>
        </div>

        <div className="relative grid gap-8 xl:grid-cols-[1.06fr_0.94fr]">
          {scanActive && (
            <>
              <div className="pointer-events-none absolute left-4 top-0 z-20 h-14 w-[calc(50%-1rem)] rounded-2xl border border-[#4CC9F066] bg-[#4CC9F01A] shadow-[0_0_35px_rgba(76,201,240,0.28)] animate-[resultRise_0.8s_ease]" />
              <div className="pointer-events-none absolute left-[40%] top-[46%] z-20 hidden h-10 w-[24%] overflow-hidden rounded-full border border-violet-300/25 bg-violet-300/10 xl:block">
                <div className="absolute inset-0 text-[10px] font-semibold tracking-[0.3em] text-cyan-100/80 animate-[binaryFlow_0.9s_linear_infinite]">101101 001011 110010 010101</div>
              </div>
            </>
          )}

          <div className="relative overflow-visible rounded-[32px] border border-[#4CC9F055] bg-black/40 p-5 shadow-[0_0_0_1px_rgba(76,201,240,0.08),0_25px_80px_rgba(0,0,0,0.36)] backdrop-blur-xl">
            <SectionHeader
              title={t('email.brief')}
              description=""
            />

            <div className="space-y-5">
              <NeonInput label={t('email.topic')} value={topic} onChange={setTopic} placeholder={topicPlaceholder || ' '} />

              <div className="grid gap-4 md:grid-cols-2">
                <FanDropdown
                  label={t('email.objective')}
                  value={objective}
                  onChange={setObjective}
                  options={[
                    { value: 'nurture', label: t('email.objective.nurture') },
                    { value: 'lead-magnet', label: t('email.objective.leadMagnet') },
                    { value: 'sales', label: t('email.objective.sales') },
                    { value: 'reengagement', label: t('email.objective.reengagement') },
                  ]}
                />
                <FanDropdown
                  label={t('email.type')}
                  value={emailType}
                  onChange={setEmailType}
                  options={[
                    { value: 'single', label: t('email.type.single') },
                    { value: 'welcome', label: t('email.type.welcome') },
                    { value: 'promo', label: t('email.type.promo') },
                    { value: 'newsletter', label: t('email.type.newsletter') },
                  ]}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <FanDropdown
                  label={t('email.tone')}
                  value={tone}
                  onChange={setTone}
                  options={[
                    { value: 'friendly', label: t('email.tone.friendly') },
                    { value: 'empathetic', label: t('email.tone.empathetic') },
                    { value: 'authoritative', label: t('email.tone.authoritative') },
                    { value: 'direct', label: t('email.tone.direct') },
                  ]}
                />
                <FanDropdown
                  label={t('email.language')}
                  value={language}
                  onChange={setLanguage}
                  options={[
                    { value: 'ro', label: 'Română' },
                    { value: 'en', label: 'English' },
                  ]}
                />
              </div>

              <NeonInput label={t('email.offer')} value={offer} onChange={setOffer} placeholder={offerPlaceholder || ' '} />
              <NeonInput label={t('email.audiencePain')} value={audiencePain} onChange={setAudiencePain} placeholder={painPlaceholder || ' '} />
              <NeonInput label={t('email.ctaGoal')} value={ctaGoal} onChange={setCtaGoal} placeholder={t('email.placeholder.cta')} />

              <button
                type="button"
                onClick={() => generateMutation.mutate()}
                disabled={topic.trim().length < 5 || generateMutation.isPending}
                className="group relative w-full overflow-hidden rounded-[24px] border border-cyan-300/55 bg-[#08121f] p-[1px] text-left transition hover:scale-[1.01] hover:shadow-[0_0_34px_rgba(76,201,240,0.22)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="relative overflow-hidden rounded-[23px] bg-[linear-gradient(135deg,rgba(10,19,31,0.96),rgba(6,12,18,0.92))] px-6 py-5">
                  <div className="absolute inset-y-[-18%] left-[-18%] w-[42%] rounded-full bg-[#4CC9F055] blur-2xl" style={{ animation: 'ctaPlasma 4.8s ease-in-out infinite' }} />
                  <div className="absolute inset-y-[-18%] right-[-18%] w-[36%] rounded-full bg-[#8B5CF655] blur-2xl" style={{ animation: 'ctaPlasma 5.6s ease-in-out infinite reverse' }} />
                  <div className="relative">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[#7FDBFF]">{t('email.energySurge')}</div>
                  <div className="mt-1 text-[28px] font-semibold leading-tight text-white">
                    {generateMutation.isPending ? t('email.generating') : t('email.generate')}
                  </div>
                </div>
              </div>
            </button>
            </div>
          </div>

          <div className="relative rounded-[32px] border border-[#4CC9F055] bg-black/40 p-5 shadow-[0_0_0_1px_rgba(76,201,240,0.08),0_25px_80px_rgba(0,0,0,0.36)] backdrop-blur-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <SectionHeader
                title={t('email.output')}
                description={t('email.outputDescription')}
              />
              {copyStatus ? <span className="shrink-0 text-xs text-[#7FDBFF]">{copyStatus}</span> : null}
            </div>

            {!result && !generateMutation.isPending ? <OutputIdle title={t('email.idleTitle')} text={t('email.idleText')} /> : null}

            {generateMutation.isPending && (
              <div className="flex min-h-[560px] flex-col items-center justify-center text-center">
                <div className="relative mb-6 h-40 w-40 rounded-full border border-[#4CC9F044] bg-[#4CC9F014]">
                  <div className="absolute inset-5 rounded-full border border-cyan-300/35 animate-pulse" />
                  <div className="absolute inset-0 rounded-full border border-white/10 animate-pulse [animation-delay:180ms]" />
                </div>
                <h3 className="text-[22px] font-semibold text-white">{t('email.loadingTitle')}</h3>
                <p className="mt-2 max-w-md text-sm leading-6 text-slate-300/78">
                  {t('email.loadingText')}
                </p>
              </div>
            )}

            {generateMutation.isError && (
              <div className="rounded-[22px] border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-200">
                {(generateMutation.error as any)?.response?.data?.error || t('email.error')}
              </div>
            )}

            {result && (
              <div className="space-y-4">
                {outputCards.map((card, index) => (
                  <div
                    key={card.title}
                    className="rounded-[24px] border border-white/10 bg-white/[0.045] p-5"
                    style={{ animation: `resultRise .38s ease ${index * 0.1}s both` }}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#7FDBFF]">{card.title}</div>
                      <button
                        type="button"
                        onClick={() => handleCopy(card.body, card.title)}
                        className="rounded-full border border-white/10 px-3 py-1 text-[11px] text-slate-300 transition hover:border-cyan-300/35 hover:text-white"
                      >
                        {t('common.copy')}
                      </button>
                    </div>

                    {card.id === 'subjects' ? (
                      <div className="space-y-2 text-sm leading-6 text-slate-100/88">
                        {result.subjectOptions.map((subject, subjectIndex) => (
                          <div key={`${subject}-${subjectIndex}`} className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3">
                            {subjectIndex + 1}. {subject}
                          </div>
                        ))}
                      </div>
                    ) : card.id === 'body' ? (
                      <pre className="whitespace-pre-wrap text-sm leading-7 text-slate-100/88">{card.body}</pre>
                    ) : (
                      <div className="text-sm leading-7 text-slate-100/88 whitespace-pre-wrap">{card.body}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showFab && result && (
        <div className="fixed bottom-6 right-6 z-30 flex flex-col gap-3">
          <button
            type="button"
            onClick={handleCopyAll}
            className="grid h-14 w-14 place-items-center rounded-full border border-cyan-300/50 bg-[#08121f]/90 text-xl text-white shadow-[0_0_28px_rgba(76,201,240,0.18)] transition hover:scale-105 hover:shadow-[0_0_36px_rgba(76,201,240,0.3)] active:scale-95"
            title="Copy all"
          >
            ⧉
          </button>
          <button
            type="button"
            onClick={handleSend}
            className="grid h-14 w-14 place-items-center rounded-full border border-violet-300/50 bg-[#0d1120]/90 text-xl text-white shadow-[0_0_28px_rgba(139,92,246,0.18)] transition hover:scale-105 hover:shadow-[0_0_36px_rgba(139,92,246,0.28)] active:scale-95"
            title="One-click send"
          >
            ✉
          </button>
        </div>
      )}
    </div>
  );
}
