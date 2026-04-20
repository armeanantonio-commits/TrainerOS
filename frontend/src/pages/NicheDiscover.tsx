import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { nicheAPI } from '@/services/api';
import Button from '@/components/Button';
import Card from '@/components/Card';
import { useAuth } from '@/contexts/AuthContext';

interface PhaseAData {
  // A1: Gender preference
  genderPreference: string[];
  // A2: Age ranges
  ageRanges: string[];
  customAgeRange: string;
  // A3: Value situations
  valueSituations: string[];
  valueSituationsOther: string;
  // A4: Common problems
  commonProblems: string[];
  commonProblemsCustom: string;
  // A5: Primary outcome
  primaryOutcome: string;
  primaryOutcomeDetail: string;
  // A6: Avoid content
  avoidContent: string[];
  avoidContentOther: string;
}

interface PhaseCData {
  // C1: Awareness level
  awarenessLevel: string;
  // C2: Identity story
  identityStory: string;
  // C1: Main block
  emotionalBlock: string;
  emotionalBlockCustom: string;
  // C2: Dominant goals
  dominantGoals: string[];
  primaryGoal: string;
  // C3: Daily routine (2.1)
  wakeUpTime: string;
  jobType: 'sedentar' | 'activ' | 'mixt' | '';
  sittingTime: '<4h' | '4-6h' | '6-8h' | '8h+' | '';
  morning: string[];
  lunch: string[];
  evening: string[];
  // C3: Defining situations (2.2)
  definingSituations: string[];
  // C3: Conditional modules (2.3)
  kidsImpact: string[];
  activeStatus: string[];
  physicalJobIssue: string[];
  painDetails: string[];
  lifestyleSpecific: string;
}

interface NicheVariant {
  id: number;
  title: string;
  description: string;
}

interface GeneratedNicheResult {
  niche: string;
  idealClient: string;
  positioning: string;
}

function splitRichTextSections(value: string): string[] {
  return value
    .split(/\n\s*\n/)
    .map((section) => section.trim())
    .filter(Boolean);
}

export default function NicheDiscover() {
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();
  const normalizeText = (value: string) =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  const mapGenderPreference = (prefs: string[]) => {
    const normalized = prefs.map(normalizeText);
    const hasWomen = normalized.some((value) => value.includes('femei'));
    const hasMen = normalized.some((value) => value.includes('barbati'));
    const hasBoth = normalized.some((value) => value.includes('ambele'));
    if (hasBoth || (hasWomen && hasMen)) return 'ambele';
    if (hasWomen) return 'femei';
    if (hasMen) return 'barbati';
    return '';
  };

  const buildPhaseAPayload = (data: PhaseAData) => {
    const ageRanges = [...data.ageRanges];
    const customAge = data.customAgeRange.trim();
    if (customAge) ageRanges.push(customAge);

    const valueSituations = [...data.valueSituations];
    const valueOther = data.valueSituationsOther.trim();
    if (valueOther) valueSituations.push(valueOther);

    const commonProblems = [...data.commonProblems];
    const commonCustom = data.commonProblemsCustom.trim();
    if (commonCustom) commonProblems.push(commonCustom);

    const avoidContent = [...data.avoidContent];
    const avoidOther = data.avoidContentOther.trim();
    if (avoidOther) avoidContent.push(avoidOther);

    const primaryOutcomeBase = data.primaryOutcome.trim() || data.primaryOutcomeDetail.trim();
    const primaryOutcomeDetail = data.primaryOutcomeDetail.trim();
    const primaryOutcome =
      primaryOutcomeBase && primaryOutcomeDetail && data.primaryOutcome.trim()
        ? `${data.primaryOutcome.trim()} (${primaryOutcomeDetail})`
        : primaryOutcomeBase;

    return {
      gender: mapGenderPreference(data.genderPreference) || 'ambele',
      ageRanges,
      valueSituations,
      commonProblems,
      primaryOutcome,
      avoidContent,
    };
  };

  const [phase, setPhase] = useState<'A' | 'B' | 'C' | 'D'>('A');
  const [stepA, setStepA] = useState(1); // 6 steps in Phase A
  const [stepC, setStepC] = useState(1); // 7 steps in Phase C
  const [phaseAError, setPhaseAError] = useState<string | null>(null);
  const [phaseCError, setPhaseCError] = useState<string | null>(null);
  
  const [phaseAData, setPhaseAData] = useState<PhaseAData>({
    genderPreference: [],
    ageRanges: [],
    customAgeRange: '',
    valueSituations: [],
    valueSituationsOther: '',
    commonProblems: [],
    commonProblemsCustom: '',
    primaryOutcome: '',
    primaryOutcomeDetail: '',
    avoidContent: [],
    avoidContentOther: '',
  });

  const [nicheVariants, setNicheVariants] = useState<NicheVariant[]>([
    { id: 1, title: 'Varianta 1', description: 'Loading...' },
    { id: 2, title: 'Varianta 2', description: 'Loading...' },
    { id: 3, title: 'Varianta 3', description: 'Loading...' },
  ]);
  const [selectedVariant, setSelectedVariant] = useState<number | null>(null);
  const [generatedResult, setGeneratedResult] = useState<GeneratedNicheResult | null>(null);

  const [phaseCData, setPhaseCData] = useState<PhaseCData>({
    awarenessLevel: '',
    identityStory: '',
    emotionalBlock: '',
    emotionalBlockCustom: '',
    dominantGoals: [],
    primaryGoal: '',
    wakeUpTime: '',
    jobType: '',
    sittingTime: '',
    morning: [],
    lunch: [],
    evening: [],
    definingSituations: [],
    kidsImpact: [],
    activeStatus: [],
    physicalJobIssue: [],
    painDetails: [],
    lifestyleSpecific: '',
  });

  const idealClientSections = generatedResult
    ? splitRichTextSections(generatedResult.idealClient)
    : [];
  const positioningSections = generatedResult
    ? splitRichTextSections(generatedResult.positioning)
    : [];
  const idealClientLabels = [
    'Cine este',
    'Cum arată ziua ei',
    'Ce o blochează',
    'Ce își dorește',
    'De ce nu au mers alte soluții',
    'Ce o face diferită',
  ];
  const positioningLabels = [
    'Mesaj central',
    'Cum te diferențiezi',
    'Promisiunea ta',
  ];

  const extractVariants = (response: any): NicheVariant[] =>
    (Array.isArray(response?.data?.variants) ? response.data.variants : [])
      .map((variant: { variant?: string; title?: string; description?: string }, index: number) => ({
        id: index + 1,
        title: (variant.variant || variant.title || '').trim() || `Varianta ${index + 1}`,
        description: (variant.description || '').trim(),
      }))
      .filter((variant: NicheVariant) => variant.title.length > 0)
      .slice(0, 3);

  const variantsMutation = useMutation({
    mutationFn: async (data: PhaseAData) => {
      const payload = buildPhaseAPayload(data);
      return nicheAPI.generateVariants(payload);
    },
    onSuccess: (response) => {
      const mapped = extractVariants(response);
      const padded = [...mapped];

      while (padded.length < 3) {
        const index = padded.length + 1;
        padded.push({
          id: index,
          title: `Varianta ${index}`,
          description: 'Nu am primit descrierea completă pentru această variantă, dar o poți selecta și rafina mai departe.',
        });
      }

      if (!padded.length) {
        setPhaseAError('Nu am primit variante valide. Încearcă din nou.');
        return;
      }
      setSelectedVariant(null);
      setNicheVariants(padded);
      setPhase('B');
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (data: any) => {
      return nicheAPI.generateDiscover({
        ...data,
        saveToProfile: true,
      });
    },
    onSuccess: async (response) => {
      await refreshUser();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['user-me'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] }),
      ]);
      setGeneratedResult(response.data);
      setPhase('D');
    },
  });

  const toggleArrayA = (field: keyof PhaseAData, value: string) => {
    const current = phaseAData[field] as string[];
    if (current.includes(value)) {
      setPhaseAData({ ...phaseAData, [field]: current.filter((v) => v !== value) });
    } else {
      setPhaseAData({ ...phaseAData, [field]: [...current, value] });
    }
  };

  const toggleArrayC = (field: keyof PhaseCData, value: string) => {
    const current = phaseCData[field] as string[];
    if (current.includes(value)) {
      setPhaseCData({ ...phaseCData, [field]: current.filter((v) => v !== value) });
    } else {
      setPhaseCData({ ...phaseCData, [field]: [...current, value] });
    }
  };

  const handlePhaseAComplete = () => {
    const payload = buildPhaseAPayload(phaseAData);
    if (!payload.gender) {
      setPhaseAError('Selectează cu cine rezonezi cel mai mult (femei, bărbați sau ambele).');
      return;
    }
    if (!payload.ageRanges.length) {
      setPhaseAError('Selectează cel puțin un interval de vârstă.');
      return;
    }
    if (!payload.valueSituations.length) {
      setPhaseAError('Selectează cel puțin o situație unde aduci valoare.');
      return;
    }
    if (!payload.commonProblems.length) {
      setPhaseAError('Selectează cel puțin o problemă comună.');
      return;
    }
    if (!payload.primaryOutcome || payload.primaryOutcome.length < 2) {
      setPhaseAError('Alege un obiectiv principal sau completează câmpul opțional.');
      return;
    }

    setPhaseAError(null);
    setGeneratedResult(null);
    variantsMutation.mutate(phaseAData);
  };

  const handleSelectVariant = () => {
    if (selectedVariant === null) {
      alert('Alege o variantă');
      return;
    }
    setPhase('C');
    setStepC(1);
    setPhaseCError(null);
  };

  const handlePhaseCNext = () => {
    if (stepC === 1 && !phaseCData.awarenessLevel) {
      setPhaseCError('Selectează nivelul dominant de awareness.');
      return;
    }
    if (stepC === 2 && !phaseCData.identityStory) {
      setPhaseCError('Selectează povestea dominantă pe care și-o spun.');
      return;
    }
    if (stepC === 4 && phaseCData.dominantGoals.length === 0) {
      setPhaseCError('Selectează cel puțin un obiectiv dominant.');
      return;
    }

    setPhaseCError(null);
    setStepC(stepC + 1);
  };

  const handleSubmit = () => {
    if (selectedVariant === null) {
      alert('Alege o variantă');
      return;
    }

    const phaseAPayload = buildPhaseAPayload(phaseAData);
    const selected = nicheVariants[selectedVariant - 1];
    if (!phaseCData.awarenessLevel) {
      setPhaseCError('Selectează nivelul dominant de awareness.');
      return;
    }
    if (!phaseCData.identityStory) {
      setPhaseCError('Selectează povestea dominantă de identitate.');
      return;
    }
    if (phaseCData.dominantGoals.length === 0) {
      setPhaseCError('Selectează cel puțin un obiectiv dominant.');
      return;
    }

    const clientStatement =
      phaseCData.identityStory.trim() ||
      phaseCData.emotionalBlockCustom.trim() ||
      phaseCData.emotionalBlock.trim();
    const primaryGoal =
      phaseCData.primaryGoal.trim() || phaseCData.dominantGoals[0] || '';

    const notesParts: string[] = [];
    if (phaseCData.kidsImpact.length) {
      notesParts.push(`Impact copii: ${phaseCData.kidsImpact.join(', ')}`);
    }
    if (phaseCData.activeStatus.length) {
      notesParts.push(`Status activ: ${phaseCData.activeStatus.join(', ')}`);
    }
    if (phaseCData.physicalJobIssue.length) {
      notesParts.push(`Job fizic: ${phaseCData.physicalJobIssue.join(', ')}`);
    }
    if (phaseCData.painDetails.length) {
      notesParts.push(`Dureri/limitări: ${phaseCData.painDetails.join(', ')}`);
    }
    if (phaseCData.lifestyleSpecific.trim()) {
      notesParts.push(`Lifestyle: ${phaseCData.lifestyleSpecific.trim()}`);
    }

    const payload = {
      ...phaseAPayload,
      selectedNiche: selected?.title || '',
      awarenessLevel: phaseCData.awarenessLevel,
      identityStory: phaseCData.identityStory,
      clientStatement,
      dominantGoals: phaseCData.dominantGoals,
      primaryGoal,
      wakeUpTime: phaseCData.wakeUpTime || undefined,
      jobType: phaseCData.jobType || undefined,
      sittingTime: phaseCData.sittingTime || undefined,
      morning: phaseCData.morning,
      lunch: phaseCData.lunch,
      evening: phaseCData.evening,
      definingSituations: phaseCData.definingSituations,
      notes: notesParts.length ? notesParts.join('\n') : undefined,
    };

    generateMutation.mutate(payload);
  };

  const showKidsModule = phaseCData.definingSituations.includes('Au copii');
  const showActiveModule = phaseCData.definingSituations.includes('Sunt deja activi / merg la sală');
  const showPhysicalJobModule =
    phaseCData.definingSituations.includes('Au un job foarte solicitant fizic') ||
    phaseCData.definingSituations.includes('Lucrează în ture / program neregulat');
  const showPainModule = phaseCData.definingSituations.includes('Au dureri / limitări fizice');

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [phase, stepA, stepC]);

  return (
    <div className="min-h-screen bg-dark-400 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-4 font-display">
            Află Nișa Ta
          </h1>
          <p className="text-gray-300">
            Descoperă direcția perfectă pentru tine — pas cu pas
          </p>
        </div>

        {/* Phase Indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-center gap-4">
            <div className={`flex items-center gap-2 ${phase === 'A' ? 'text-brand-500' : phase === 'B' || phase === 'C' || phase === 'D' ? 'text-green-500' : 'text-gray-500'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${phase === 'A' ? 'border-brand-500 bg-brand-500/20' : phase === 'B' || phase === 'C' || phase === 'D' ? 'border-green-500 bg-green-500/20' : 'border-gray-500'}`}>
                A
              </div>
              <span className="font-semibold">Descoperire</span>
            </div>
            <div className="w-8 h-0.5 bg-gray-600" />
            <div className={`flex items-center gap-2 ${phase === 'B' ? 'text-brand-500' : phase === 'C' || phase === 'D' ? 'text-green-500' : 'text-gray-500'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${phase === 'B' ? 'border-brand-500 bg-brand-500/20' : phase === 'C' || phase === 'D' ? 'border-green-500 bg-green-500/20' : 'border-gray-500'}`}>
                B
              </div>
              <span className="font-semibold">Propunere</span>
            </div>
            <div className="w-8 h-0.5 bg-gray-600" />
            <div className={`flex items-center gap-2 ${phase === 'C' || phase === 'D' ? 'text-brand-500' : 'text-gray-500'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${phase === 'C' || phase === 'D' ? 'border-brand-500 bg-brand-500/20' : 'border-gray-500'}`}>
                C
              </div>
              <span className="font-semibold">Rafinare</span>
            </div>
          </div>
        </div>

        {/* Progress Bar - Phase A */}
        {phase === 'A' && (
          <div className="mb-8">
            <div className="w-full h-2 bg-dark-300 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-500 transition-all duration-500"
                style={{ width: `${(stepA / 6) * 100}%` }}
              />
            </div>
            <p className="text-center text-gray-500 mt-2 text-sm">Faza A - Pas {stepA} din 6</p>
          </div>
        )}

        {/* Progress Bar - Phase C */}
        {phase === 'C' && (
          <div className="mb-8">
            <div className="w-full h-2 bg-dark-300 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-500 transition-all duration-500"
                style={{ width: `${(stepC / 7) * 100}%` }}
              />
            </div>
            <p className="text-center text-gray-500 mt-2 text-sm">Faza C - Pas {stepC} din 7</p>
          </div>
        )}

        <Card>
          {/* ===== PHASE A: DISCOVERY ===== */}
          {phase === 'A' && (
            <>
              {phaseAError && (
                <div className="mb-6 rounded-lg border border-red-500 bg-red-500/10 p-4 text-sm text-red-300">
                  {phaseAError}
                </div>
              )}
              {/* A1: Gender Preference */}
              {stepA === 1 && (
                <div>
                  <h2 className="text-2xl font-bold text-white mb-6">
                    A1. Cu ce tip de oameni simți că rezonezi cel mai natural când lucrezi?
                  </h2>
                  <div className="space-y-3">
                    {['Femei', 'Bărbați', 'Rezonez la fel cu ambele'].map((option) => (
                      <label
                        key={option}
                        className="flex items-center gap-3 p-4 bg-dark-300 rounded-lg cursor-pointer hover:bg-dark-200"
                      >
                        <input
                          type="checkbox"
                          checked={phaseAData.genderPreference.includes(option)}
                          onChange={() => toggleArrayA('genderPreference', option)}
                          className="w-5 h-5"
                        />
                        <span className="text-white">{option}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* A2: Age Ranges */}
              {stepA === 2 && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-white mb-6">
                    A2. Când lucrurile merg bine cu clienții tăi, cam ce vârstă au?
                  </h2>
                  <div className="space-y-3">
                    {['18–25', '25–35', '35–45', '45+'].map((age) => (
                      <label
                        key={age}
                        className="flex items-center gap-3 p-4 bg-dark-300 rounded-lg cursor-pointer hover:bg-dark-200"
                      >
                        <input
                          type="checkbox"
                          checked={phaseAData.ageRanges.includes(age)}
                          onChange={() => toggleArrayA('ageRanges', age)}
                          className="w-5 h-5"
                        />
                        <span className="text-white">{age}</span>
                      </label>
                    ))}
                  </div>
                  <div>
                    <label className="block text-gray-300 mb-2 text-sm">
                      Alt interval de vârstă (opțional)
                    </label>
                    <input
                      type="text"
                      value={phaseAData.customAgeRange}
                      onChange={(e) =>
                        setPhaseAData({ ...phaseAData, customAgeRange: e.target.value })
                      }
                      className="w-full bg-dark-300 text-white rounded-lg p-3"
                      placeholder="ex: 30-40"
                    />
                  </div>
                </div>
              )}

              {/* A3: Value Situations */}
              {stepA === 3 && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-white mb-6">
                    A3. În ce situații simți că aduci cea mai mare valoare ca antrenor?
                  </h2>
                  <div className="space-y-3">
                    {[
                      'Când oamenii sunt ocupați și dezorganizați',
                      'Când vor estetic, dar nu se țin',
                      'Când sunt la început și au nevoie de ghidaj',
                      'Când știu ce să facă, dar nu au structură',
                      'Când au dureri sau limitări și le e frică să înceapă',
                    ].map((situation) => (
                      <label
                        key={situation}
                        className="flex items-center gap-3 p-4 bg-dark-300 rounded-lg cursor-pointer hover:bg-dark-200"
                      >
                        <input
                          type="checkbox"
                          checked={phaseAData.valueSituations.includes(situation)}
                          onChange={() => toggleArrayA('valueSituations', situation)}
                          className="w-5 h-5"
                        />
                        <span className="text-white">{situation}</span>
                      </label>
                    ))}
                  </div>
                  <div>
                    <label className="block text-gray-300 mb-2 text-sm">
                      Alt tip de situație în care te simți foarte util? (opțional)
                    </label>
                    <input
                      type="text"
                      value={phaseAData.valueSituationsOther}
                      onChange={(e) =>
                        setPhaseAData({ ...phaseAData, valueSituationsOther: e.target.value })
                      }
                      className="w-full bg-dark-300 text-white rounded-lg p-3"
                      placeholder="ex: când au încercat multe și nimic nu a funcționat..."
                    />
                  </div>
                </div>
              )}

              {/* A4: Common Problems */}
              {stepA === 4 && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-white mb-6">
                    A4. Ce problemă explici cel mai des oamenilor, aproape zilnic?
                  </h2>
                  <div className="space-y-3">
                    {[
                      'Lipsa de consecvență',
                      'Lipsa de energie',
                      'Confuzia (nu știu ce să fac)',
                      'Alimentația haotică',
                      'Frica / rușinea de sală',
                    ].map((problem) => (
                      <label
                        key={problem}
                        className="flex items-center gap-3 p-4 bg-dark-300 rounded-lg cursor-pointer hover:bg-dark-200"
                      >
                        <input
                          type="checkbox"
                          checked={phaseAData.commonProblems.includes(problem)}
                          onChange={() => toggleArrayA('commonProblems', problem)}
                          className="w-5 h-5"
                        />
                        <span className="text-white">{problem}</span>
                      </label>
                    ))}
                  </div>
                  <div>
                    <label className="block text-gray-300 mb-2 text-sm">
                      Cum o spui tu, pe scurt? (opțional)
                    </label>
                    <input
                      type="text"
                      value={phaseAData.commonProblemsCustom}
                      onChange={(e) =>
                        setPhaseAData({ ...phaseAData, commonProblemsCustom: e.target.value })
                      }
                      className="w-full bg-dark-300 text-white rounded-lg p-3"
                      placeholder="ex: nu știu cum să își organizeze mesele..."
                    />
                  </div>
                </div>
              )}

              {/* A5: Primary Outcome */}
              {stepA === 5 && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-white mb-6">
                    A5. Dacă ai putea rezolva UN singur lucru pentru oameni în următoarele 2–3 luni, care ar fi?
                  </h2>
                  <div className="space-y-3">
                    {[
                      'Să se țină constant',
                      'Să slăbească',
                      'Să se tonifieze / să arate mai bine',
                      'Să aibă mai multă energie',
                      'Să scape de dureri',
                    ].map((outcome) => (
                      <label
                        key={outcome}
                        className="flex items-center gap-3 p-4 bg-dark-300 rounded-lg cursor-pointer hover:bg-dark-200"
                      >
                        <input
                          type="radio"
                          name="primaryOutcome"
                          value={outcome}
                          checked={phaseAData.primaryOutcome === outcome}
                          onChange={(e) =>
                            setPhaseAData({ ...phaseAData, primaryOutcome: e.target.value })
                          }
                          className="w-5 h-5"
                        />
                        <span className="text-white">{outcome}</span>
                      </label>
                    ))}
                  </div>
                  <div>
                    <label className="block text-gray-300 mb-2 text-sm">
                      Ce ar însemna «rezolvat» pentru tine? (opțional)
                    </label>
                    <input
                      type="text"
                      value={phaseAData.primaryOutcomeDetail}
                      onChange={(e) =>
                        setPhaseAData({ ...phaseAData, primaryOutcomeDetail: e.target.value })
                      }
                      className="w-full bg-dark-300 text-white rounded-lg p-3"
                      placeholder="ex: să nu mai sară peste mese..."
                    />
                  </div>
                </div>
              )}

              {/* A6: Avoid Content */}
              {stepA === 6 && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-white mb-6">
                    A6. Ce tip de content NU vrei să faci, chiar dacă ar prinde?
                  </h2>
                  <div className="space-y-3">
                    {[
                      'Promisiuni rapide / rezultate peste noapte',
                      'Motivare agresivă / rușinare',
                      'Conținut extrem (dietă, antrenamente)',
                      'Prea tehnic / rigid',
                      'Prea soft, fără rezultate reale',
                    ].map((content) => (
                      <label
                        key={content}
                        className="flex items-center gap-3 p-4 bg-dark-300 rounded-lg cursor-pointer hover:bg-dark-200"
                      >
                        <input
                          type="checkbox"
                          checked={phaseAData.avoidContent.includes(content)}
                          onChange={() => toggleArrayA('avoidContent', content)}
                          className="w-5 h-5"
                        />
                        <span className="text-white">{content}</span>
                      </label>
                    ))}
                  </div>
                  <div>
                    <label className="block text-gray-300 mb-2 text-sm">
                      Alt lucru care nu te reprezintă? (opțional)
                    </label>
                    <input
                      type="text"
                      value={phaseAData.avoidContentOther}
                      onChange={(e) =>
                        setPhaseAData({ ...phaseAData, avoidContentOther: e.target.value })
                      }
                      className="w-full bg-dark-300 text-white rounded-lg p-3"
                      placeholder="ex: postări cu muzică puternică..."
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {/* ===== PHASE B: NICHE PROPOSAL ===== */}
          {phase === 'B' && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-4">
                Pe baza răspunsurilor tale, asta pare direcția cea mai potrivită pentru tine acum:
              </h2>
              <p className="text-gray-300 mb-8">
                Alege varianta care crezi că se potrivește cel mai bine pentru tine. Nu e o decizie
                finală. Hai să o rafinăm rapid ca să pot crea content foarte precis.
              </p>

              {variantsMutation.isPending && (
                <div className="text-center py-12">
                  <div className="animate-spin w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full mx-auto mb-4" />
                  <p className="text-gray-300">Generez cele 3 variante de nișă...</p>
                </div>
              )}

              {!variantsMutation.isPending && (
                <div className="space-y-4">
                  {nicheVariants.map((variant) => (
                    <label
                      key={variant.id}
                      className={`block p-6 rounded-lg border-2 cursor-pointer transition-all ${
                        selectedVariant === variant.id
                          ? 'border-brand-500 bg-brand-500/10'
                          : 'border-dark-200 bg-dark-300 hover:border-brand-500/50'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <input
                          type="radio"
                          name="nicheVariant"
                          value={variant.id}
                          checked={selectedVariant === variant.id}
                          onChange={() => setSelectedVariant(variant.id)}
                          className="mt-1 w-5 h-5"
                        />
                        <div className="flex-1">
                          <h3 className="text-xl font-bold text-white mb-2">{variant.title}</h3>
                          <p className="text-gray-300">{variant.description}</p>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ===== PHASE C: REFINEMENT ===== */}
          {phase === 'C' && (
            <>
              {phaseCError && (
                <div className="mb-6 rounded-lg border border-red-500 bg-red-500/10 p-4 text-sm text-red-300">
                  {phaseCError}
                </div>
              )}
              {/* C1: Awareness */}
              {stepC === 1 && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-white mb-6">
                    C1. Cât de conștienți sunt de problema lor?
                  </h2>
                  <div className="space-y-3">
                    {[
                      'Știu ce greșesc, dar nu aplică',
                      'Știu că au o problemă, dar nu știu soluția',
                      'Cred că fac bine, dar nu au rezultate',
                      'Nu știu exact unde greșesc',
                    ].map((option) => (
                      <label
                        key={option}
                        className="flex items-center gap-3 p-4 bg-dark-300 rounded-lg cursor-pointer hover:bg-dark-200"
                      >
                        <input
                          type="radio"
                          name="awarenessLevel"
                          value={option}
                          checked={phaseCData.awarenessLevel === option}
                          onChange={(e) =>
                            setPhaseCData({ ...phaseCData, awarenessLevel: e.target.value })
                          }
                          className="w-5 h-5"
                        />
                        <span className="text-white">{option}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* C2: Identity */}
              {stepC === 2 && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-white mb-6">
                    C2. Ce poveste își spun despre ei când vine vorba de fitness?
                  </h2>
                  <div className="space-y-3">
                    {[
                      'Nu sunt disciplinat.',
                      'Nu am voință.',
                      'Nu am timp pentru mine.',
                      'Nu sunt genul care reușește.',
                      'Mă las mereu.',
                    ].map((story) => (
                      <label
                        key={story}
                        className="flex items-center gap-3 p-4 bg-dark-300 rounded-lg cursor-pointer hover:bg-dark-200"
                      >
                        <input
                          type="radio"
                          name="identityStory"
                          value={story}
                          checked={phaseCData.identityStory === story}
                          onChange={(e) =>
                            setPhaseCData({ ...phaseCData, identityStory: e.target.value })
                          }
                          className="w-5 h-5"
                        />
                        <span className="text-white">„{story}”</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* C1: Emotional Block */}
              {stepC === 3 && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-white mb-6">
                    C3. Care afirmație sună CEL MAI mult ca ei?
                  </h2>
                  <div className="space-y-3">
                    {[
                      '„Știu ce ar trebui să fac, dar nu mă țin."',
                      '„Simt că m-am lăsat."',
                      '„Am mai încercat și m-am oprit."',
                      '„Nu mai am energie pentru mine."',
                    ].map((statement) => (
                      <label
                        key={statement}
                        className="flex items-center gap-3 p-4 bg-dark-300 rounded-lg cursor-pointer hover:bg-dark-200"
                      >
                        <input
                          type="radio"
                          name="emotionalBlock"
                          value={statement}
                          checked={phaseCData.emotionalBlock === statement}
                          onChange={(e) =>
                            setPhaseCData({ ...phaseCData, emotionalBlock: e.target.value })
                          }
                          className="w-5 h-5"
                        />
                        <span className="text-white">{statement}</span>
                      </label>
                    ))}
                  </div>
                  <div>
                    <label className="block text-gray-300 mb-2 text-sm">
                      Spune asta în cuvintele tale. (opțional)
                    </label>
                    <input
                      type="text"
                      value={phaseCData.emotionalBlockCustom}
                      onChange={(e) =>
                        setPhaseCData({ ...phaseCData, emotionalBlockCustom: e.target.value })
                      }
                      className="w-full bg-dark-300 text-white rounded-lg p-3"
                      placeholder="ex: simt că nu mai am timp pentru mine..."
                    />
                  </div>
                </div>
              )}

              {/* C2: Dominant Goals */}
              {stepC === 4 && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-white mb-6">
                    C4. Te caută pentru: (poți alege mai multe)
                  </h2>
                  <div className="space-y-3">
                    {[
                      'Slăbit',
                      'Tonifiere / estetic',
                      'Energie',
                      'Disciplină / consecvență',
                      'Dureri / disconfort',
                    ].map((goal) => (
                      <label
                        key={goal}
                        className="flex items-center gap-3 p-4 bg-dark-300 rounded-lg cursor-pointer hover:bg-dark-200"
                      >
                        <input
                          type="checkbox"
                          checked={phaseCData.dominantGoals.includes(goal)}
                          onChange={() => toggleArrayC('dominantGoals', goal)}
                          className="w-5 h-5"
                        />
                        <span className="text-white">{goal}</span>
                      </label>
                    ))}
                  </div>

                  {phaseCData.dominantGoals.length > 1 && (
                    <div className="mt-6 pt-6 border-t border-dark-200">
                      <label className="block text-gray-300 mb-3 font-semibold">
                        Dacă ar fi să alegi UNUL principal acum?
                      </label>
                      <div className="space-y-2">
                        {phaseCData.dominantGoals.map((goal) => (
                          <label
                            key={goal}
                            className="flex items-center gap-3 p-3 bg-dark-300 rounded-lg cursor-pointer hover:bg-dark-200"
                          >
                            <input
                              type="radio"
                              name="primaryGoal"
                              value={goal}
                              checked={phaseCData.primaryGoal === goal}
                              onChange={(e) =>
                                setPhaseCData({ ...phaseCData, primaryGoal: e.target.value })
                              }
                              className="w-5 h-5"
                            />
                            <span className="text-white text-sm">{goal}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* C3.1: Daily Routine */}
              {stepC === 5 && (
                <div className="space-y-8">
                  <h2 className="text-2xl font-bold text-white mb-6">
                    Cum arată, în general, o zi obișnuită pentru clientul tău ideal:
                  </h2>

                  <div>
                    <label className="block text-gray-300 mb-2">Ora de trezire</label>
                    <input
                      type="text"
                      value={phaseCData.wakeUpTime}
                      onChange={(e) =>
                        setPhaseCData({ ...phaseCData, wakeUpTime: e.target.value })
                      }
                      className="w-full bg-dark-300 text-white rounded-lg p-3"
                      placeholder="ex: 06:30"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-300 mb-3">Tip de job</label>
                    <div className="space-y-2">
                      {[
                        { value: 'sedentar', label: 'Sedentar' },
                        { value: 'activ', label: 'Activ' },
                        { value: 'mixt', label: 'Mixt' },
                      ].map((option) => (
                        <label
                          key={option.value}
                          className="flex items-center gap-3 p-3 bg-dark-300 rounded-lg cursor-pointer hover:bg-dark-200"
                        >
                          <input
                            type="radio"
                            name="jobType"
                            value={option.value}
                            checked={phaseCData.jobType === option.value}
                            onChange={(e) =>
                              setPhaseCData({ ...phaseCData, jobType: e.target.value as any })
                            }
                            className="w-5 h-5"
                          />
                          <span className="text-white">{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-gray-300 mb-3">Timp petrecut jos</label>
                    <div className="space-y-2">
                      {['<4h', '4-6h', '6-8h', '8h+'].map((time) => (
                        <label
                          key={time}
                          className="flex items-center gap-3 p-3 bg-dark-300 rounded-lg cursor-pointer hover:bg-dark-200"
                        >
                          <input
                            type="radio"
                            name="sittingTime"
                            value={time}
                            checked={phaseCData.sittingTime === time}
                            onChange={(e) =>
                              setPhaseCData({ ...phaseCData, sittingTime: e.target.value as any })
                            }
                            className="w-5 h-5"
                          />
                          <span className="text-white">{time}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-gray-300 mb-2">Dimineața:</label>
                    <div className="space-y-2">
                      {['mănâncă acasă', 'cafea pe stomacul gol', 'snack rapid / patiserie'].map(
                        (option) => (
                          <label
                            key={option}
                            className="flex items-center gap-3 p-3 bg-dark-300 rounded-lg cursor-pointer hover:bg-dark-200"
                          >
                            <input
                              type="checkbox"
                              checked={phaseCData.morning.includes(option)}
                              onChange={() => toggleArrayC('morning', option)}
                              className="w-5 h-5"
                            />
                            <span className="text-white text-sm">{option}</span>
                          </label>
                        )
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-gray-300 mb-2">Prânz:</label>
                    <div className="space-y-2">
                      {['gătit', 'comandă', 'mănâncă pe fugă'].map((option) => (
                        <label
                          key={option}
                          className="flex items-center gap-3 p-3 bg-dark-300 rounded-lg cursor-pointer hover:bg-dark-200"
                        >
                          <input
                            type="checkbox"
                            checked={phaseCData.lunch.includes(option)}
                            onChange={() => toggleArrayC('lunch', option)}
                            className="w-5 h-5"
                          />
                          <span className="text-white text-sm">{option}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-gray-300 mb-2">Seara:</label>
                    <div className="space-y-2">
                      {[
                        'prea obosiți pentru sală',
                        'au timp, dar fără energie',
                        'se antrenează rar',
                      ].map((option) => (
                        <label
                          key={option}
                          className="flex items-center gap-3 p-3 bg-dark-300 rounded-lg cursor-pointer hover:bg-dark-200"
                        >
                          <input
                            type="checkbox"
                            checked={phaseCData.evening.includes(option)}
                            onChange={() => toggleArrayC('evening', option)}
                            className="w-5 h-5"
                          />
                          <span className="text-white text-sm">{option}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* C3.2: Defining Situations */}
              {stepC === 6 && (
                <div>
                  <h2 className="text-2xl font-bold text-white mb-6">
                    Există una sau mai multe situații care îi definesc clar?
                  </h2>
                  <div className="space-y-3">
                    {[
                      'Au copii',
                      'Sunt deja activi / merg la sală',
                      'Au un job foarte solicitant fizic',
                      'Lucrează în ture / program neregulat',
                      'Au dureri / limitări fizice',
                      'Niciuna dintre cele de mai sus',
                    ].map((situation) => (
                      <label
                        key={situation}
                        className="flex items-center gap-3 p-4 bg-dark-300 rounded-lg cursor-pointer hover:bg-dark-200"
                      >
                        <input
                          type="checkbox"
                          checked={phaseCData.definingSituations.includes(situation)}
                          onChange={() => toggleArrayC('definingSituations', situation)}
                          className="w-5 h-5"
                        />
                        <span className="text-white">{situation}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* C3.3: Conditional Modules */}
              {stepC === 7 && (
                <div className="space-y-8">
                  <h2 className="text-2xl font-bold text-white mb-6">
                    Mai multe detalii despre situația lor
                  </h2>

                  {/* Kids Module */}
                  {showKidsModule && (
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-6">
                      <h3 className="text-xl font-bold text-white mb-4">
                        🧩 Cum le influențează copiii programul?
                      </h3>
                      <div className="space-y-2">
                        {[
                          'se trezesc foarte devreme',
                          'mesele sunt haotice',
                          'timpul pentru ei e seara târziu',
                          'oboseala e principalul obstacol',
                        ].map((impact) => (
                          <label
                            key={impact}
                            className="flex items-center gap-3 p-3 bg-dark-300 rounded-lg cursor-pointer hover:bg-dark-200"
                          >
                            <input
                              type="checkbox"
                              checked={phaseCData.kidsImpact.includes(impact)}
                              onChange={() => toggleArrayC('kidsImpact', impact)}
                              className="w-5 h-5"
                            />
                            <span className="text-white text-sm">{impact}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Active Module */}
                  {showActiveModule && (
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-6">
                      <h3 className="text-xl font-bold text-white mb-4">
                        🧩 Cum se raportează la sport acum?
                      </h3>
                      <div className="space-y-2">
                        {[
                          'merg constant, dar fără rezultate',
                          'merg haotic',
                          'știu exercițiile, dar nu structura',
                          'se plafonează ușor',
                        ].map((status) => (
                          <label
                            key={status}
                            className="flex items-center gap-3 p-3 bg-dark-300 rounded-lg cursor-pointer hover:bg-dark-200"
                          >
                            <input
                              type="checkbox"
                              checked={phaseCData.activeStatus.includes(status)}
                              onChange={() => toggleArrayC('activeStatus', status)}
                              className="w-5 h-5"
                            />
                            <span className="text-white text-sm">{status}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Physical Job Module */}
                  {showPhysicalJobModule && (
                    <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-6">
                      <h3 className="text-xl font-bold text-white mb-4">
                        🧩 Care e cea mai mare problemă pentru ei?
                      </h3>
                      <div className="space-y-2">
                        {[
                          'oboseală cronică',
                          'dureri',
                          'program imprevizibil',
                          'alimentație dezorganizată',
                        ].map((issue) => (
                          <label
                            key={issue}
                            className="flex items-center gap-3 p-3 bg-dark-300 rounded-lg cursor-pointer hover:bg-dark-200"
                          >
                            <input
                              type="checkbox"
                              checked={phaseCData.physicalJobIssue.includes(issue)}
                              onChange={() => toggleArrayC('physicalJobIssue', issue)}
                              className="w-5 h-5"
                            />
                            <span className="text-white text-sm">{issue}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pain Module */}
                  {showPainModule && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6">
                      <h3 className="text-xl font-bold text-white mb-4">
                        🧩 Unde apar cel mai des?
                      </h3>
                      <div className="space-y-2">
                        {['spate', 'genunchi', 'umeri', 'șolduri'].map((detail) => (
                          <label
                            key={detail}
                            className="flex items-center gap-3 p-3 bg-dark-300 rounded-lg cursor-pointer hover:bg-dark-200"
                          >
                            <input
                              type="checkbox"
                              checked={phaseCData.painDetails.includes(detail)}
                              onChange={() => toggleArrayC('painDetails', detail)}
                              className="w-5 h-5"
                            />
                            <span className="text-white text-sm">{detail}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Lifestyle Specific */}
                  <div>
                    <label className="block text-gray-300 mb-2 text-sm">
                      Mai e ceva specific la stilul lor de viață care contează? (opțional)
                    </label>
                    <input
                      type="text"
                      value={phaseCData.lifestyleSpecific}
                      onChange={(e) =>
                        setPhaseCData({ ...phaseCData, lifestyleSpecific: e.target.value })
                      }
                      className="w-full bg-dark-300 text-white rounded-lg p-3"
                      placeholder="ex: lucrează remote, călătoresc des..."
                    />
                  </div>

                  {!showKidsModule &&
                    !showActiveModule &&
                    !showPhysicalJobModule &&
                    !showPainModule && (
                      <div className="text-center text-gray-400 py-8">
                        <p>Nu ai selectat nicio situație specifică la pasul anterior.</p>
                        <p className="text-sm mt-2">Poți continua mai departe.</p>
                      </div>
                    )}
                </div>
              )}
            </>
          )}

          {phase === 'D' && generatedResult && (
            <div className="space-y-4">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-200">
                Niche Builder generat și salvat automat în cont.
              </div>
              <div className="rounded-lg border border-dark-200 bg-dark-300 p-5">
                <h3 className="mb-2 text-sm font-bold uppercase text-slate-300/72">Nișa</h3>
                <p className="text-lg font-semibold text-white">{generatedResult.niche}</p>
              </div>
              <div className="rounded-lg border border-dark-200 bg-dark-300 p-5">
                <h3 className="mb-2 text-sm font-bold uppercase text-slate-300/72">Client Ideal</h3>
                <div className="space-y-3">
                  {idealClientSections.map((section, index) => (
                    <div
                      key={`${idealClientLabels[index] || 'client'}-${index}`}
                      className="rounded-lg border border-dark-200 bg-dark-400/70 p-4"
                    >
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        {idealClientLabels[index] || `Punctul ${index + 1}`}
                      </p>
                      <p className="whitespace-pre-line text-white">{section}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-dark-200 bg-dark-300 p-5">
                <h3 className="mb-2 text-sm font-bold uppercase text-slate-300/72">Poziționare</h3>
                <div className="space-y-3">
                  {positioningSections.map((section, index) => (
                    <div
                      key={`${positioningLabels[index] || 'positioning'}-${index}`}
                      className="rounded-lg border border-dark-200 bg-dark-400/70 p-4"
                    >
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        {positioningLabels[index] || `Punctul ${index + 1}`}
                      </p>
                      <p className="whitespace-pre-line text-white">{section}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-4 mt-8">
            {/* Back Button */}
            {phase === 'A' && stepA > 1 && (
              <Button variant="secondary" onClick={() => setStepA(stepA - 1)}>
                Înapoi
              </Button>
            )}
            {phase === 'C' && stepC > 1 && (
              <Button
                variant="secondary"
                onClick={() => {
                  setPhaseCError(null);
                  setStepC(stepC - 1);
                }}
              >
                Înapoi
              </Button>
            )}
            {phase === 'B' && (
              <Button variant="secondary" onClick={() => setPhase('A')}>
                Înapoi la Faza A
              </Button>
            )}

            {/* Next/Continue Button */}
            {phase === 'A' && stepA < 6 && (
              <Button variant="primary" onClick={() => setStepA(stepA + 1)} className="ml-auto">
                Continuă
              </Button>
            )}
            {phase === 'A' && stepA === 6 && (
              <Button
                variant="primary"
                onClick={handlePhaseAComplete}
                disabled={variantsMutation.isPending}
                className="ml-auto"
              >
                {variantsMutation.isPending ? 'Generez variante...' : 'Generează Variante →'}
              </Button>
            )}
            {phase === 'B' && (
              <Button
                variant="primary"
                onClick={handleSelectVariant}
                disabled={selectedVariant === null}
                className="ml-auto"
              >
                Continuă cu Această Variantă →
              </Button>
            )}
            {phase === 'C' && stepC < 7 && (
              <Button variant="primary" onClick={handlePhaseCNext} className="ml-auto">
                Continuă
              </Button>
            )}
          {phase === 'C' && stepC === 7 && (
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={generateMutation.isPending}
              className="ml-auto"
            >
              {generateMutation.isPending ? 'Generez Niche Builder Final...' : 'Generează Niche Builder →'}
            </Button>
          )}
          {phase === 'D' && (
            <Button variant="secondary" onClick={() => setPhase('A')}>
              Reia Quizul
            </Button>
          )}
        </div>

          {/* Error Messages */}
          {variantsMutation.isError && (
            <p className="text-red-500 mt-4">
              Eroare la generare variante:{' '}
              {(variantsMutation.error as any)?.response?.data?.error || 'Ceva nu a mers bine'}
            </p>
          )}
          {generateMutation.isError && (
            <p className="text-red-500 mt-4">
              Eroare:{' '}
              {(generateMutation.error as any)?.response?.data?.error || 'Ceva nu a mers bine'}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
