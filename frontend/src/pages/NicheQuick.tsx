import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { nicheAPI } from '@/services/api';
import Button from '@/components/Button';
import Card from '@/components/Card';
import { useAuth } from '@/contexts/AuthContext';

interface FormData {
  // Q1: Gender
  gender: 'femei' | 'barbati' | 'ambele' | '';
  // Q2: Age
  ageRanges: string[];
  customAgeRange: string;
  // Q2.1: Daily Routine
  wakeUpTime: string;
  jobType: 'sedentar' | 'activ' | 'mixt' | '';
  sittingTime: '<4h' | '4-6h' | '6-8h' | '8h+' | '';
  morning: string[];
  lunch: string[];
  evening: string[];
  // Q2.2: Defining Situations
  definingSituations: string[];
  // Q2.3: Conditional modules
  kidsImpact: string[];
  activeStatus: string[];
  physicalJobIssue: string[];
  painDetails: string[];
  lifestyleSpecific: string;
  // Q4: Main reason they seek you
  mainReasons: string[];
  primaryReason: string;
  // Q5: What doesn't work
  whatDoesntWork: string[];
  otherDoesntWork: string;
  // Q6: What blocks them (emotional)
  emotionalBlock: string;
  emotionalBlockCustom: string;
  // Q7: What they DON'T want
  whatTheyDontWant: string[];
  otherDontWant: string;
  // Q8: Relationship with sport
  sportRelationship: string;
  sportRelationshipSpecific: string;
  // Q9: How you want them to feel
  desiredFeelings: string[];
  // Q10: Differentiation (YOU axis)
  differentiation: string;
  // Q11: Internal objections
  internalObjections: string[];
}

interface GeneratedNicheResult {
  niche: string;
  idealClient: string;
  positioning: string;
}

function getResultValue(value: string | undefined, fallback: string): string {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
}

export default function NicheQuick() {
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();
  const [step, setStep] = useState(1);
  const totalSteps = 12;
  
  const [formData, setFormData] = useState<FormData>({
    gender: '',
    ageRanges: [],
    customAgeRange: '',
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
    mainReasons: [],
    primaryReason: '',
    whatDoesntWork: [],
    otherDoesntWork: '',
    emotionalBlock: '',
    emotionalBlockCustom: '',
    whatTheyDontWant: [],
    otherDontWant: '',
    sportRelationship: '',
    sportRelationshipSpecific: '',
    desiredFeelings: [],
    differentiation: '',
    internalObjections: [],
  });

  const generateMutation = useMutation({
    mutationFn: async (data: FormData) => {
      return nicheAPI.generateQuickICP({
        ...data,
        gender: data.gender as 'femei' | 'barbati' | 'ambele',
        jobType: data.jobType || undefined,
        sittingTime: data.sittingTime || undefined,
        saveToProfile: true,
      });
    },
    onSuccess: async () => {
      await refreshUser();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['user-me'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] }),
      ]);
    },
  });

  const generatedResult = generateMutation.data?.data as GeneratedNicheResult | undefined;

  const toggleArray = (field: keyof FormData, value: string) => {
    const current = formData[field] as string[];
    if (current.includes(value)) {
      setFormData({ ...formData, [field]: current.filter((v) => v !== value) });
    } else {
      setFormData({ ...formData, [field]: [...current, value] });
    }
  };

  const handleSubmit = () => {
    if (!formData.gender || formData.ageRanges.length === 0 || !formData.differentiation.trim()) {
      alert('Te rog completează câmpurile obligatorii');
      return;
    }
    generateMutation.mutate(formData);
  };

  const showKidsModule = formData.definingSituations.includes('Au copii');
  const showActiveModule = formData.definingSituations.includes('Sunt deja activi / merg la sală');
  const showPhysicalJobModule =
    formData.definingSituations.includes('Au un job foarte solicitant fizic') ||
    formData.definingSituations.includes('Lucrează în ture / program neregulat');
  const showPainModule = formData.definingSituations.includes('Au dureri / limitări fizice');

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  return (
    <div className="min-h-screen bg-dark-400 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-4 font-display">
            Spune-mi Nișa Ta
          </h1>
          <p className="text-gray-300">
            Descrie clientul tău ideal — AI-ul va crea Niche Builder-ul complet
          </p>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <div className="w-full h-2 bg-dark-300 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-500 transition-all duration-500"
              style={{ width: `${(step / totalSteps) * 100}%` }}
            />
          </div>
          <p className="text-center text-gray-500 mt-2 text-sm">Pas {step} din {totalSteps}</p>
        </div>

        <Card>
          {/* Step 1: Gender */}
          {step === 1 && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-6">
                1⃣ Cu ce tip de persoane vrei să lucrezi?
              </h2>
              <div className="space-y-3">
                {[
                  { value: 'barbati', label: 'Bărbați' },
                  { value: 'femei', label: 'Femei' },
                  { value: 'ambele', label: 'Ambele' },
                ].map((option) => (
                  <label
                    key={option.value}
                    className="flex items-center gap-3 p-4 bg-dark-300 rounded-lg cursor-pointer hover:bg-dark-200"
                  >
                    <input
                      type="radio"
                      name="gender"
                      value={option.value}
                      checked={formData.gender === option.value}
                      onChange={(e) =>
                        setFormData({ ...formData, gender: e.target.value as any })
                      }
                      className="w-5 h-5"
                    />
                    <span className="text-white">{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Age */}
          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-white mb-6">2⃣ Ce vârstă au, în general?</h2>
              <div className="space-y-3">
                {['18–25', '25–35', '35–45', '45+'].map((age) => (
                  <label
                    key={age}
                    className="flex items-center gap-3 p-4 bg-dark-300 rounded-lg cursor-pointer hover:bg-dark-200"
                  >
                    <input
                      type="checkbox"
                      checked={formData.ageRanges.includes(age)}
                      onChange={() => toggleArray('ageRanges', age)}
                      className="w-5 h-5"
                    />
                    <span className="text-white">{age}</span>
                  </label>
                ))}
              </div>
              <div>
                <label className="block text-gray-300 mb-2 text-sm">
                  Spune-mi alt interval de vârstă (opțional)
                </label>
                <input
                  type="text"
                  value={formData.customAgeRange}
                  onChange={(e) => setFormData({ ...formData, customAgeRange: e.target.value })}
                  className="w-full bg-dark-300 text-white rounded-lg p-3"
                  placeholder="ex: 30-40"
                />
              </div>
            </div>
          )}

          {/* Step 3: Daily Routine (2.1) */}
          {step === 3 && (
            <div className="space-y-8">
              <h2 className="text-2xl font-bold text-white mb-6">
                Cum arată, în general, o zi obișnuită pentru clientul tău ideal:
              </h2>

              <div>
                <label className="block text-gray-300 mb-2">Ora de trezire</label>
                <input
                  type="text"
                  value={formData.wakeUpTime}
                  onChange={(e) => setFormData({ ...formData, wakeUpTime: e.target.value })}
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
                        checked={formData.jobType === option.value}
                        onChange={(e) =>
                          setFormData({ ...formData, jobType: e.target.value as any })
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
                        checked={formData.sittingTime === time}
                        onChange={(e) =>
                          setFormData({ ...formData, sittingTime: e.target.value as any })
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
                          checked={formData.morning.includes(option)}
                          onChange={() => toggleArray('morning', option)}
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
                        checked={formData.lunch.includes(option)}
                        onChange={() => toggleArray('lunch', option)}
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
                        checked={formData.evening.includes(option)}
                        onChange={() => toggleArray('evening', option)}
                        className="w-5 h-5"
                      />
                      <span className="text-white text-sm">{option}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Defining Situations (2.2) */}
          {step === 4 && (
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
                      checked={formData.definingSituations.includes(situation)}
                      onChange={() => toggleArray('definingSituations', situation)}
                      className="w-5 h-5"
                    />
                    <span className="text-white">{situation}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Step 5: Conditional Modules (2.3) */}
          {step === 5 && (
            <div className="space-y-8">
              <h2 className="text-2xl font-bold text-white mb-6">
                Mai multe detalii despre situația lor
              </h2>

              {/* Conditional Module: Kids */}
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
                          checked={formData.kidsImpact.includes(impact)}
                          onChange={() => toggleArray('kidsImpact', impact)}
                          className="w-5 h-5"
                        />
                        <span className="text-white text-sm">{impact}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Conditional Module: Active */}
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
                          checked={formData.activeStatus.includes(status)}
                          onChange={() => toggleArray('activeStatus', status)}
                          className="w-5 h-5"
                        />
                        <span className="text-white text-sm">{status}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Conditional Module: Physical Job */}
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
                          checked={formData.physicalJobIssue.includes(issue)}
                          onChange={() => toggleArray('physicalJobIssue', issue)}
                          className="w-5 h-5"
                        />
                        <span className="text-white text-sm">{issue}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Conditional Module: Pain */}
              {showPainModule && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6">
                  <h3 className="text-xl font-bold text-white mb-4">
                    🧩 Unde apar cel mai des?
                  </h3>
                  <div className="space-y-2">
                    {[
                      'spate',
                      'genunchi',
                      'umeri',
                      'șolduri',
                      'istoric de accidentare',
                      'se tem să nu agraveze',
                    ].map((detail) => (
                      <label
                        key={detail}
                        className="flex items-center gap-3 p-3 bg-dark-300 rounded-lg cursor-pointer hover:bg-dark-200"
                      >
                        <input
                          type="checkbox"
                          checked={formData.painDetails.includes(detail)}
                          onChange={() => toggleArray('painDetails', detail)}
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
                  value={formData.lifestyleSpecific}
                  onChange={(e) => setFormData({ ...formData, lifestyleSpecific: e.target.value })}
                  className="w-full bg-dark-300 text-white rounded-lg p-3"
                  placeholder="ex: lucrează remote, călătoresc des..."
                />
              </div>

              {!showKidsModule && !showActiveModule && !showPhysicalJobModule && !showPainModule && (
                <div className="text-center text-gray-400 py-8">
                  <p>Nu ai selectat nicio situație specifică la pasul anterior.</p>
                  <p className="text-sm mt-2">Poți continua mai departe.</p>
                </div>
              )}
            </div>
          )}

          {/* Step 6: Main Reason (Q4) */}
          {step === 6 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-white mb-6">
                4⃣ Pentru ce motiv te caută cel mai des?
              </h2>
              <p className="text-gray-300 text-sm mb-4">Poți alege mai multe:</p>
              <div className="space-y-3">
                {[
                  'Slăbit',
                  'Tonifiere / estetic',
                  'Energie / stare generală',
                  'Disciplină / consecvență',
                  'Dureri / disconfort',
                ].map((reason) => (
                  <label
                    key={reason}
                    className="flex items-center gap-3 p-4 bg-dark-300 rounded-lg cursor-pointer hover:bg-dark-200"
                  >
                    <input
                      type="checkbox"
                      checked={formData.mainReasons.includes(reason)}
                      onChange={() => toggleArray('mainReasons', reason)}
                      className="w-5 h-5"
                    />
                    <span className="text-white">{reason}</span>
                  </label>
                ))}
              </div>

              {formData.mainReasons.length > 1 && (
                <div className="mt-6 pt-6 border-t border-dark-200">
                  <label className="block text-gray-300 mb-3 font-semibold">
                    Dacă ar fi să alegi UNUL principal?
                  </label>
                  <div className="space-y-2">
                    {formData.mainReasons.map((reason) => (
                      <label
                        key={reason}
                        className="flex items-center gap-3 p-3 bg-dark-300 rounded-lg cursor-pointer hover:bg-dark-200"
                      >
                        <input
                          type="radio"
                          name="primaryReason"
                          value={reason}
                          checked={formData.primaryReason === reason}
                          onChange={(e) =>
                            setFormData({ ...formData, primaryReason: e.target.value })
                          }
                          className="w-5 h-5"
                        />
                        <span className="text-white text-sm">{reason}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 7: What Doesn't Work (Q5) */}
          {step === 7 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-white mb-6">
                5⃣ Ce NU funcționează pentru ei acum?
              </h2>
              <div className="space-y-3">
                {[
                  'Încep bine și se opresc',
                  'Nu au energie după muncă',
                  'Mănâncă ok câteva zile, apoi scapă controlul',
                  'Nu văd rezultate și se demotivează',
                ].map((issue) => (
                  <label
                    key={issue}
                    className="flex items-center gap-3 p-4 bg-dark-300 rounded-lg cursor-pointer hover:bg-dark-200"
                  >
                    <input
                      type="checkbox"
                      checked={formData.whatDoesntWork.includes(issue)}
                      onChange={() => toggleArray('whatDoesntWork', issue)}
                      className="w-5 h-5"
                    />
                    <span className="text-white">{issue}</span>
                  </label>
                ))}
              </div>

              <div className="mt-6">
                <label className="block text-gray-300 mb-2 text-sm">
                  Alt lucru care apare des la ei? (opțional)
                </label>
                <input
                  type="text"
                  value={formData.otherDoesntWork}
                  onChange={(e) => setFormData({ ...formData, otherDoesntWork: e.target.value })}
                  className="w-full bg-dark-300 text-white rounded-lg p-3"
                  placeholder="ex: nu știu să gătească sănătos..."
                />
              </div>
            </div>
          )}

          {/* Step 8: Emotional Block (Q6) */}
          {step === 8 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-white mb-6">
                6⃣ Ce îi blochează CU ADEVĂRAT?
              </h2>
              <p className="text-gray-300 text-sm mb-4">Care afirmație sună cel mai mult ca ei?</p>
              <div className="space-y-3">
                {[
                  '„Știu ce ar trebui să fac, dar nu mă țin"',
                  '„Simt că m-am lăsat"',
                  '„Am mai încercat și m-am oprit"',
                  '„Nu mai am energie pentru mine"',
                ].map((block) => (
                  <label
                    key={block}
                    className="flex items-center gap-3 p-4 bg-dark-300 rounded-lg cursor-pointer hover:bg-dark-200"
                  >
                    <input
                      type="radio"
                      name="emotionalBlock"
                      value={block}
                      checked={formData.emotionalBlock === block}
                      onChange={(e) =>
                        setFormData({ ...formData, emotionalBlock: e.target.value })
                      }
                      className="w-5 h-5"
                    />
                    <span className="text-white">{block}</span>
                  </label>
                ))}
              </div>

              <div className="mt-6">
                <label className="block text-gray-300 mb-2 text-sm">
                  Dacă ai spune asta în cuvintele tale? (opțional)
                </label>
                <input
                  type="text"
                  value={formData.emotionalBlockCustom}
                  onChange={(e) =>
                    setFormData({ ...formData, emotionalBlockCustom: e.target.value })
                  }
                  className="w-full bg-dark-300 text-white rounded-lg p-3"
                  placeholder="ex: simt că nu mai am timp pentru mine..."
                />
              </div>
            </div>
          )}

          {/* Step 9: What They Don't Want (Q7) */}
          {step === 9 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-white mb-6">
                7⃣ Ce NU vor sub nicio formă?
              </h2>
              <div className="space-y-3">
                {[
                  'Diete extreme',
                  'Antrenamente prea complicate',
                  'Fitness fake / promisiuni exagerate',
                  'Limbaj prea tehnic',
                ].map((dontWant) => (
                  <label
                    key={dontWant}
                    className="flex items-center gap-3 p-4 bg-dark-300 rounded-lg cursor-pointer hover:bg-dark-200"
                  >
                    <input
                      type="checkbox"
                      checked={formData.whatTheyDontWant.includes(dontWant)}
                      onChange={() => toggleArray('whatTheyDontWant', dontWant)}
                      className="w-5 h-5"
                    />
                    <span className="text-white">{dontWant}</span>
                  </label>
                ))}
              </div>

              <div className="mt-6">
                <label className="block text-gray-300 mb-2 text-sm">
                  Alt lucru care îi respinge din start? (opțional)
                </label>
                <input
                  type="text"
                  value={formData.otherDontWant}
                  onChange={(e) => setFormData({ ...formData, otherDontWant: e.target.value })}
                  className="w-full bg-dark-300 text-white rounded-lg p-3"
                  placeholder="ex: tone de story-uri pe zi..."
                />
              </div>
            </div>
          )}

          {/* Step 10: Relationship with Sport (Q8) + Desired Feelings (Q9) */}
          {step === 10 && (
            <div className="space-y-10">
              {/* Q8 */}
              <div className="space-y-6">
                <h2 className="text-2xl font-bold text-white mb-6">
                  8⃣ Cum e relația lor cu sportul?
                </h2>
                <div className="space-y-3">
                  {[
                    'Începători',
                    'Intermitenți',
                    'Activi, dar fără rezultate',
                    'Au mai făcut sport, dar s-au lăsat',
                  ].map((relationship) => (
                    <label
                      key={relationship}
                      className="flex items-center gap-3 p-4 bg-dark-300 rounded-lg cursor-pointer hover:bg-dark-200"
                    >
                      <input
                        type="radio"
                        name="sportRelationship"
                        value={relationship}
                        checked={formData.sportRelationship === relationship}
                        onChange={(e) =>
                          setFormData({ ...formData, sportRelationship: e.target.value })
                        }
                        className="w-5 h-5"
                      />
                      <span className="text-white">{relationship}</span>
                    </label>
                  ))}
                </div>

                <div>
                  <label className="block text-gray-300 mb-2 text-sm">
                    Ce e specific la relația lor cu sportul? (opțional)
                  </label>
                  <input
                    type="text"
                    value={formData.sportRelationshipSpecific}
                    onChange={(e) =>
                      setFormData({ ...formData, sportRelationshipSpecific: e.target.value })
                    }
                    className="w-full bg-dark-300 text-white rounded-lg p-3"
                    placeholder="ex: au făcut sală înainte, dar nu cardio..."
                  />
                </div>
              </div>

              {/* Q9 */}
              <div className="space-y-6 pt-6 border-t border-dark-200">
                <h2 className="text-2xl font-bold text-white mb-6">
                  9⃣ Cum vrei TU să se simtă când te urmăresc?
                </h2>
                <p className="text-gray-300 text-sm mb-4">Alege maxim 2:</p>
                <div className="space-y-3">
                  {[
                    'Înțeleși',
                    'Motivați',
                    'Liniștiți',
                    'Provocați',
                    '„Pot și eu"',
                  ].map((feeling) => (
                    <label
                      key={feeling}
                      className="flex items-center gap-3 p-4 bg-dark-300 rounded-lg cursor-pointer hover:bg-dark-200"
                    >
                      <input
                        type="checkbox"
                        checked={formData.desiredFeelings.includes(feeling)}
                        onChange={() => {
                          if (formData.desiredFeelings.includes(feeling)) {
                            toggleArray('desiredFeelings', feeling);
                          } else if (formData.desiredFeelings.length < 2) {
                            toggleArray('desiredFeelings', feeling);
                          }
                        }}
                        disabled={
                          !formData.desiredFeelings.includes(feeling) &&
                          formData.desiredFeelings.length >= 2
                        }
                        className="w-5 h-5"
                      />
                      <span className="text-white">{feeling}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 11: Differentiation (YOU axis) */}
          {step === 11 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-white mb-6">
                🔵 1⃣ De ce te-ar alege pe tine și nu pe alt antrenor?
              </h2>
              <p className="text-gray-300 text-sm">
                Răspuns scurt, clar (maxim 2 rânduri).
              </p>
              <textarea
                value={formData.differentiation}
                onChange={(e) => setFormData({ ...formData, differentiation: e.target.value })}
                rows={2}
                maxLength={220}
                className="w-full bg-dark-300 text-white rounded-lg p-3 resize-none"
                placeholder="ex: Pentru că simplific complet procesul pentru oameni ocupați și construiesc un plan realist pe termen lung."
              />
            </div>
          )}

          {/* Step 12: Internal Objections */}
          {step === 12 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-white mb-6">
                2⃣ Ce îi face să ezite chiar și când știu că ar trebui să înceapă?
              </h2>
              <p className="text-gray-300 text-sm mb-4">Alege maxim 2:</p>
              <div className="space-y-3">
                {[
                  'Frica de eșec',
                  'Frica de judecată',
                  'Au mai încercat și au eșuat',
                  'Se simt copleșiți',
                  'Nu cred că pot',
                ].map((objection) => (
                  <label
                    key={objection}
                    className="flex items-center gap-3 p-4 bg-dark-300 rounded-lg cursor-pointer hover:bg-dark-200"
                  >
                    <input
                      type="checkbox"
                      checked={formData.internalObjections.includes(objection)}
                      onChange={() => {
                        if (formData.internalObjections.includes(objection)) {
                          toggleArray('internalObjections', objection);
                        } else if (formData.internalObjections.length < 2) {
                          toggleArray('internalObjections', objection);
                        }
                      }}
                      disabled={
                        !formData.internalObjections.includes(objection) &&
                        formData.internalObjections.length >= 2
                      }
                      className="w-5 h-5"
                    />
                    <span className="text-white">{objection}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-4 mt-8">
            {step > 1 && (
              <Button variant="secondary" onClick={() => setStep(step - 1)}>
                Înapoi
              </Button>
            )}
            {step < totalSteps ? (
              <Button
                variant="primary"
                onClick={() => setStep(step + 1)}
                disabled={
                  (step === 1 && !formData.gender) ||
                  (step === 2 && formData.ageRanges.length === 0) ||
                  (step === 11 && !formData.differentiation.trim())
                }
                className="ml-auto"
              >
                Continuă
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={handleSubmit}
                disabled={generateMutation.isPending}
                className="ml-auto"
              >
                {generateMutation.isPending ? 'Generez Niche Builder...' : 'Generează Niche Builder →'}
              </Button>
            )}
          </div>

          {generateMutation.isError && (
            <p className="text-red-500 mt-4">
              Eroare:{' '}
              {(generateMutation.error as any)?.response?.data?.error || 'Ceva nu a mers bine'}
            </p>
          )}
        </Card>

        {generatedResult && (
          <Card className="mt-6">
            <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-200">
              Niche Builder salvat automat în cont.
            </div>
            <div className="space-y-4">
              <div className="rounded-lg border border-dark-200 bg-dark-300 p-5">
                <h3 className="mb-2 text-sm font-bold uppercase text-slate-300/72">Nișa</h3>
                <p className="text-white">
                  {getResultValue(generatedResult.niche, 'Nișa nu a fost generată complet.')}
                </p>
              </div>
              <div className="rounded-lg border border-dark-200 bg-dark-300 p-5">
                <h3 className="mb-2 text-sm font-bold uppercase text-slate-300/72">Client Ideal</h3>
                <p className="whitespace-pre-line text-white">
                  {getResultValue(
                    generatedResult.idealClient,
                    'Clientul ideal nu a fost returnat complet. Reîncearcă generarea pentru profilul complet.'
                  )}
                </p>
              </div>
              <div className="rounded-lg border border-dark-200 bg-dark-300 p-5">
                <h3 className="mb-2 text-sm font-bold uppercase text-slate-300/72">Poziționare</h3>
                <p className="whitespace-pre-line text-white">
                  {getResultValue(
                    generatedResult.positioning,
                    'Mesajul de poziționare nu a fost returnat complet. Reîncearcă generarea.'
                  )}
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
