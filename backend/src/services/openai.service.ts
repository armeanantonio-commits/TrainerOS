import OpenAI from 'openai';
import { createReadStream, readFileSync } from 'fs';
import { GEMINI_MODEL, createGeminiPartsText, createGeminiText } from '../lib/gemini.js';

let transcriptionClient: OpenAI | null = null;

function getTranscriptionClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  if (!transcriptionClient) {
    transcriptionClient = new OpenAI({
      apiKey,
    });
  }

  return transcriptionClient;
}

async function generateGeminiText(prompt: string, temperature: number, maxTokens: number): Promise<string> {
  return createGeminiText(
    [{ role: 'user', content: prompt }],
    {
      temperature,
      maxTokens,
    }
  );
}

const GEMINI_JSON_SYSTEM_PROMPT = `Return only strict valid JSON.
- No markdown
- No code fences
- Output must start with { and end with }
- Use double quotes for all property names and string values
- Escape any internal double quotes inside string values
- Escape line breaks inside string values as \\n instead of literal new lines
- Do not include commentary before or after the JSON
- Do not leave trailing commas
- If a value contains quoted speech, prefer apostrophes instead of double quotes`;

async function generateGeminiJson(prompt: string, temperature: number, maxTokens: number): Promise<string> {
  return createGeminiText(
    [{ role: 'user', content: prompt }],
    {
      system: GEMINI_JSON_SYSTEM_PROMPT,
      temperature,
      maxTokens,
    }
  );
}

async function generateGeminiTextFromMessages(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  temperature: number,
  maxTokens: number
): Promise<string> {
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join('\n\n');

  return createGeminiText(
    messages
      .filter((message): message is { role: 'user' | 'assistant'; content: string } => message.role !== 'system')
      .map((message) => ({ role: message.role, content: message.content })),
    {
      system: system || undefined,
      temperature,
      maxTokens,
    }
  );
}

function normalizeModelJson(content: string | null | undefined): string {
  const raw = (content || '{}').trim();
  const withoutCodeFence = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const firstBrace = withoutCodeFence.indexOf('{');
  const lastBrace = withoutCodeFence.lastIndexOf('}');

  const extracted =
    firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace
      ? withoutCodeFence.slice(firstBrace, lastBrace + 1)
      : withoutCodeFence;

  return extracted
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
}

function extractFirstJsonObject(content: string): string {
  let startIndex = -1;
  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (startIndex === -1) {
      if (char === '{') {
        startIndex = index;
        depth = 1;
      }
      continue;
    }

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (char === '\\') {
        isEscaped = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return content.slice(startIndex, index + 1);
      }
    }
  }

  return content;
}

function escapeInvalidJsonStringChars(content: string): string {
  let result = '';
  let inString = false;
  let isEscaped = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (inString) {
      if (isEscaped) {
        result += char;
        isEscaped = false;
        continue;
      }

      if (char === '\\') {
        result += char;
        isEscaped = true;
        continue;
      }

      if (char === '"') {
        result += char;
        inString = false;
        continue;
      }

      if (char === '\n') {
        result += '\\n';
        continue;
      }

      if (char === '\r') {
        result += '\\r';
        continue;
      }

      if (char === '\t') {
        result += '\\t';
        continue;
      }

      if (char < ' ') {
        continue;
      }

      result += char;
      continue;
    }

    result += char;

    if (char === '"') {
      inString = true;
    }
  }

  return result;
}

function applyJsonHeuristics(content: string): string {
  return content
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/([{,]\s*)'([^']+)'(\s*:)/g, '$1"$2"$3')
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3')
    .replace(/:\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_match, value) => {
      const escaped = String(value).replace(/"/g, '\\"');
      return `: "${escaped}"`;
    });
}

function previewModelResponse(content: string | null | undefined, limit = 280): string {
  const normalized = (content || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return '[empty response]';
  }

  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

async function repairModelJsonWithGemini(content: string): Promise<string> {
  const prompt = `Primești un JSON invalid generat de un model.

Repară-l astfel încât să fie JSON valid, fără să schimbi structura, cheile sau sensul valorilor.
- Escape pentru ghilimele interne din stringuri
- Escape pentru newline-uri din stringuri
- Elimină markdown/code fences
- Returnează DOAR JSON valid, fără explicații

JSON INVALID:
${content}`;

  return await generateGeminiText(prompt, 0, 2800);
}

async function repairModelJson<T>(content: string): Promise<T> {
  const repaired = await repairModelJsonWithGemini(content);
  const normalized = applyJsonHeuristics(normalizeModelJson(repaired));
  return JSON.parse(normalized) as T;
}

async function parseModelJson<T>(content: string | null | undefined): Promise<T> {
  const normalized = extractFirstJsonObject(normalizeModelJson(content));
  const sanitized = escapeInvalidJsonStringChars(normalized);
  const heuristicNormalized = applyJsonHeuristics(sanitized);

  try {
    return JSON.parse(sanitized) as T;
  } catch {
    try {
      return JSON.parse(heuristicNormalized) as T;
    } catch {
      return repairModelJson<T>(heuristicNormalized);
    }
  }
}

// ==================== NICHE FINDER ====================

export interface NicheFinderQuickInput {
  quickNiche: string;
}

export interface NicheQuickICPInput {
  gender: string;
  ageRanges: string[];
  customAgeRange?: string;
  wakeUpTime?: string;
  jobType?: string;
  sittingTime?: string;
  morning?: string[];
  lunch?: string[];
  evening?: string[];
  definingSituations?: string[];
  kidsImpact?: string[];
  activeStatus?: string[];
  physicalJobIssue?: string[];
  painDetails?: string[];
  mainReasons?: string[];
  primaryReason?: string;
  differentiation?: string;
  internalObjections?: string[];
}

export interface NicheFinderWizardInput {
  q1: string; // Cu cine îți place cel mai mult să lucrezi?
  q2: string; // Ce problemă rezolvi cel mai bine?
  q3: string; // Ce rezultate poți demonstra?
  q4: string; // Ce tip de client vrei să eviți?
  q5: string; // De ce te-ar alege pe tine?
}

export interface NicheResult {
  niche: string;
  idealClient: string;
  positioning: string;
  sources: {
    niche: 'ai' | 'fallback';
    idealClient: 'ai' | 'fallback';
    positioning: 'ai' | 'fallback';
  };
}

function joinHumanList(values: string[]): string {
  if (values.length === 0) {
    return '';
  }

  if (values.length === 1) {
    return values[0];
  }

  if (values.length === 2) {
    return `${values[0]} și ${values[1]}`;
  }

  return `${values.slice(0, -1).join(', ')} și ${values[values.length - 1]}`;
}

function normalizeTextField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeGenderForNiche(gender: string): string {
  if (gender === 'femei') {
    return 'femei';
  }

  if (gender === 'barbati') {
    return 'bărbați';
  }

  return 'persoane';
}

function normalizeAgeForNiche(input: NicheQuickICPInput): string {
  return [...(input.ageRanges || []), normalizeTextField(input.customAgeRange)]
    .filter(Boolean)
    .join(', ');
}

function buildQuickIcpFallbackNiche(input: NicheQuickICPInput): string {
  const normalizedGender = normalizeGenderForNiche(input.gender);
  const normalizedAge = normalizeAgeForNiche(input);
  const audienceParts: string[] = [];

  if (normalizedGender === 'persoane') {
    audienceParts.push('persoane');
  } else if (normalizedAge) {
    const ageDescriptor =
      normalizedAge.includes('18') || normalizedAge.includes('25')
        ? `tinere (${normalizedAge})`
        : `de ${normalizedAge}`;
    audienceParts.push(`${normalizedGender} ${ageDescriptor}`);
  } else {
    audienceParts.push(normalizedGender);
  }

  if (input.definingSituations?.includes('Au un job foarte solicitant fizic')) {
    audienceParts.push('cu joburi fizice solicitante');
  } else if (input.jobType === 'activ') {
    audienceParts.push('cu joburi active');
  } else if (input.jobType === 'sedentar') {
    audienceParts.push('cu joburi sedentare');
  }

  if (input.definingSituations?.includes('Lucrează în ture / program neregulat')) {
    audienceParts.push('și program neregulat');
  }

  const reasons = [
    ...(input.primaryReason ? [input.primaryReason] : []),
    ...((input.mainReasons || []).filter((reason) => reason !== input.primaryReason)),
  ];
  const transformedReasons = reasons.slice(0, 2).map((reason) => {
    if (reason === 'Slăbit') {
      return 'slăbire';
    }
    if (reason === 'Tonifiere / estetic') {
      return 'tonifiere';
    }
    if (reason === 'Energie / stare generală') {
      return 'mai multă energie';
    }
    if (reason === 'Disciplină / consecvență') {
      return 'mai multă consecvență';
    }
    if (reason === 'Dureri / disconfort') {
      return 'mai puțin disconfort';
    }

    return reason.toLowerCase();
  });
  const outcome =
    transformedReasons.length > 0
      ? `care vor ${joinHumanList(transformedReasons)}`
      : 'care vor rezultate sustenabile';

  return `Antrenament personalizat și flexibil pentru ${audienceParts.join(' ').replace(/\s+/g, ' ').trim()} ${outcome}.`;
}

function buildQuickIcpContextSummary(input: NicheQuickICPInput): string {
  const parts: string[] = [];
  const normalizedGender = normalizeGenderForNiche(input.gender);
  const normalizedAge = normalizeAgeForNiche(input);

  if (normalizedGender === 'persoane') {
    parts.push('persoane');
  } else if (normalizedAge) {
    parts.push(`${normalizedGender} de ${normalizedAge}`);
  } else {
    parts.push(normalizedGender);
  }

  if (input.jobType === 'activ') {
    parts.push('cu ritm activ de lucru');
  } else if (input.jobType === 'sedentar') {
    parts.push('cu muncă mai mult sedentară');
  } else if (input.jobType === 'mixt') {
    parts.push('cu program de lucru mixt');
  }

  if (input.definingSituations?.includes('Sunt deja activi / merg la sală')) {
    parts.push('care merg deja la sală');
  }

  if (input.definingSituations?.includes('Au un job foarte solicitant fizic')) {
    parts.push('care au și un job solicitant fizic');
  }

  if (input.definingSituations?.includes('Lucrează în ture / program neregulat')) {
    parts.push('cu program neregulat');
  }

  return joinHumanList(parts.filter(Boolean));
}

function buildQuickIcpNeedSummary(input: NicheQuickICPInput): string {
  const reasons = [
    ...(input.primaryReason ? [input.primaryReason] : []),
    ...((input.mainReasons || []).filter((reason) => reason !== input.primaryReason)),
  ];
  const transformedReasons = reasons.slice(0, 2).map((reason) => {
    if (reason === 'Slăbit') {
      return 'să slăbească';
    }
    if (reason === 'Tonifiere / estetic') {
      return 'să se tonifieze';
    }
    if (reason === 'Energie / stare generală') {
      return 'să aibă mai multă energie';
    }
    if (reason === 'Disciplină / consecvență') {
      return 'să fie mai consecvente';
    }
    if (reason === 'Dureri / disconfort') {
      return 'să reducă disconfortul';
    }

    return reason.toLowerCase();
  });

  if (transformedReasons.length === 0) {
    return 'au nevoie de structură clară, consecvență și rezultate sustenabile';
  }

  return `vor ${joinHumanList(transformedReasons)}`;
}

function buildQuickIcpFallbackIdealClient(input: NicheQuickICPInput, niche: string): string {
  const audience = buildQuickIcpContextSummary(input);
  const needSummary = buildQuickIcpNeedSummary(input);

  return [
    `Lucrezi cu ${audience || `oameni potriviți pentru nișa "${niche}"`}.`,
    `Au nevoie de un plan clar, realist și ușor de urmat în programul lor, fără recomandări complicate sau greu de susținut.`,
    `De obicei ${needSummary}, dar se lovesc de lipsa de structură, oboseală sau inconsistență. Reacționează bine la pași practici, explicați simplu, și la un proces care le arată progres vizibil.`,
  ].join('\n\n');
}

function buildQuickIcpFallbackPositioning(input: NicheQuickICPInput, niche: string): string {
  const needSummary = buildQuickIcpNeedSummary(input);

  return [
    `Tu ești antrenorul care transformă nișa "${niche}" într-un proces clar și aplicabil.`,
    `Nu vinzi recomandări generale. Oferi structură, adaptare la programul real și un plan care îi ajută să obțină rezultate fără să simtă că fitnessul le complică viața.`,
    `Mesajul central: pentru oamenii care ${needSummary}, tu faci lucrurile mai simple, mai clare și mai ușor de urmat.`,
  ].join('\n\n');
}

function seemsIncompleteNiche(value: string): boolean {
  const normalized = normalizeTextField(value);

  if (!normalized) {
    return true;
  }

  if (!/[.!?]$/.test(normalized)) {
    return true;
  }

  return /\b(și|sau|cu|pentru|din|de|la|în|pe|program|joburi?)\.?$/i.test(normalized);
}

function buildDiscoverAudienceSummary(input: NicheDiscoverInput): string {
  const audience =
    input.gender === 'femei'
      ? 'femei'
      : input.gender === 'barbati'
        ? 'bărbați'
        : 'persoane';
  const ages = input.ageRanges.length ? input.ageRanges.join(', ') : '';
  const parts = [ages ? `${audience} ${ages}` : audience];

  if (input.selectedNiche.toLowerCase().includes('program aglomerat')) {
    parts.push('cu program aglomerat');
  } else if (input.definingSituations?.includes('Lucrează în ture / program neregulat')) {
    parts.push('cu program neregulat');
  }

  if (input.jobType === 'activ') {
    parts.push('și ritm activ de lucru');
  } else if (input.jobType === 'sedentar') {
    parts.push('și muncă mai mult sedentară');
  }

  return parts.join(' ');
}

function buildDiscoverGoalSummary(input: NicheDiscoverInput): string {
  const goal = normalizeTextField(input.primaryGoal) || normalizeTextField(input.primaryOutcome);
  return normalizeOutcomeForSentence(goal);
}

function buildDiscoverFallbackNiche(input: NicheDiscoverInput): string {
  const selected = normalizeTextField(input.selectedNiche);
  const audience = buildDiscoverAudienceSummary(input);
  const goal = buildDiscoverGoalSummary(input);

  if (!selected) {
    return `Fitness sustenabil pentru ${audience} care vor ${goal}.`;
  }

  if (/pentru/i.test(selected)) {
    return `${selected} care vor ${goal}.`;
  }

  return `${selected} pentru ${audience} care vor ${goal}.`;
}

function buildDiscoverFallbackIdealClient(input: NicheDiscoverInput, niche: string): string {
  const audience = buildDiscoverAudienceSummary(input);
  const problem = normalizeProblemForSentence(input.commonProblems[0] || 'lipsa de claritate și consecvență');
  const block = normalizeTextField(input.clientStatement) || 'simt că nu au timp pentru ele';
  const goal = buildDiscoverGoalSummary(input);
  const routine =
    input.wakeUpTime || input.jobType || input.sittingTime
      ? `Ziua lor începe ${input.wakeUpTime ? `devreme, în jur de ${input.wakeUpTime}` : 'repede'}, continuă cu ${input.jobType ? `un program ${input.jobType}` : 'un program plin'} și le lasă puțin spațiu pentru ele la finalul zilei.`
      : 'Au un program care le consumă energia și le face greu să rămână constante.';

  return [
    `Lucrezi cu ${audience}, potriviți pentru nișa "${niche}". Nu caută extreme, ci un sistem clar care să le ajute să rămână constante și să obțină rezultate reale.`,
    routine,
    `Problema principală este ${problem}, dar în spate apare și blocajul ${block}. De multe ori știu ce ar trebui să facă, însă nu reușesc să transforme intenția într-un plan simplu și repetabil.`,
    `Își doresc ${goal}, mai mult control și senzația că pot avea grijă de ele fără să își dea viața peste cap. Rezonează cu mesajele simple, aplicabile și cu exemple care arată progres posibil în contextul lor real.`,
  ].join('\n\n');
}

function buildDiscoverFallbackPositioning(input: NicheDiscoverInput, niche: string): string {
  const goal = buildDiscoverGoalSummary(input);
  const block = normalizeTextField(input.clientStatement) || 'nu au timp pentru ele';

  return [
    `Tu poziționezi nișa "${niche}" ca o soluție clară pentru oamenii care vor ${goal}, dar simt că ${block}.`,
    `Nu promiți schimbări extreme și nici nu vinzi presiune. Mesajul tău este despre structură, adaptare la viața reală și pași practici care pot fi urmați consecvent.`,
    `Diferențiatorul tău: faci fitnessul mai ușor de înțeles, mai ușor de aplicat și mai ușor de păstrat pe termen lung.`,
  ].join('\n\n');
}

function ensureCompleteNicheResult(
  partial: Partial<NicheResult>,
  contextHint: string,
  fallbackNiche = 'Nișă fitness personalizată',
  fallbackIdealClient?: string,
  fallbackPositioning?: string
): NicheResult {
  const parsedNiche = normalizeTextField(partial.niche);
  const parsedIdealClient = normalizeTextField(partial.idealClient);
  const parsedPositioning = normalizeTextField(partial.positioning);

  const niche = seemsIncompleteNiche(parsedNiche) ? fallbackNiche : parsedNiche;
  const idealClient =
    parsedIdealClient ||
    fallbackIdealClient ||
    `Clientul ideal pentru "${niche}" este persoana care se regăsește clar în contextul descris: ${contextHint}. Are nevoie de o soluție aplicabilă, realistă și adaptată stilului ei de viață, nu de sfaturi generale. Caută claritate, progres vizibil și un plan care să poată fi urmat consecvent fără să-i complice și mai mult programul.`;
  const positioning =
    parsedPositioning ||
    fallbackPositioning ||
    `Ajut persoanele din nișa "${niche}" să obțină rezultate reale printr-o abordare clară, adaptată contextului lor zilnic și nevoilor lor reale. Focusul nu este pe recomandări generale, ci pe pași practici care pot fi aplicați consecvent și care duc la progres vizibil.`;

  return {
    niche,
    idealClient,
    positioning,
    sources: {
      niche: parsedNiche && !seemsIncompleteNiche(parsedNiche) ? 'ai' : 'fallback',
      idealClient: parsedIdealClient ? 'ai' : 'fallback',
      positioning: parsedPositioning ? 'ai' : 'fallback',
    },
  };
}

export async function generateNicheQuick(input: NicheFinderQuickInput): Promise<NicheResult> {
  const prompt = `Tu ești un expert în marketing fitness. Analizează această nișă și creează:

1. Nișa clară și specifică (1 propoziție precisă)
2. Profilul clientului ideal (demografic + psihografic, 2-3 propoziții)
3. Mesaj de poziționare (1-2 propoziții, unique value proposition)

Nișa introdusă: "${input.quickNiche}"

Răspunde DOAR în format JSON strict, fără markdown.
IMPORTANT:
- JSON valid obligatoriu
- Fără ghilimele duble ne-escape-uite în interiorul valorilor text
- Dacă ai nevoie de citare în text, folosește apostrof simplu

FORMAT:
{
  "niche": "Nișa ta specifică aici",
  "idealClient": "Profilul complet al clientului ideal",
  "positioning": "Mesajul tău de poziționare unic"
}`;

  const content = await generateGeminiJson(prompt, 0.7, 500);
  const parsed = await parseModelJson<Partial<NicheResult>>(content);
  return ensureCompleteNicheResult(parsed, input.quickNiche);
}

export async function generateNicheQuickICP(input: NicheQuickICPInput): Promise<NicheResult> {
  const prompt = `Tu ești un expert în marketing fitness. Pe baza descrierii clientului ideal, creează:

1. Nișa clară și specifică (1 propoziție precisă)
2. Profilul clientului ideal DETALIAT (demografic + psihografic + rutina zilnică + pain points, 4-5 paragrafe)
3. Mesaj de poziționare (1-2 propoziții, unique value proposition)

PROFILUL CLIENTULUI IDEAL:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👥 Gen: ${input.gender}
🎯 Vârstă: ${input.ageRanges.join(', ')}${input.customAgeRange ? ` + ${input.customAgeRange}` : ''}

RUTINA ZILNICĂ:
⏰ Trezire: ${input.wakeUpTime || 'N/A'}
💼 Job: ${input.jobType || 'N/A'}
🪑 Timp șezând: ${input.sittingTime || 'N/A'}
🌅 Dimineața: ${input.morning?.join(', ') || 'N/A'}
🍽️ Prânz: ${input.lunch?.join(', ') || 'N/A'}
🌙 Seara: ${input.evening?.join(', ') || 'N/A'}

SITUAȚII DEFINITORII:
${input.definingSituations?.join(', ') || 'N/A'}
${input.kidsImpact?.length ? `\n🧒 Impact copii: ${input.kidsImpact.join(', ')}` : ''}
${input.activeStatus?.length ? `\n💪 Status sport: ${input.activeStatus.join(', ')}` : ''}
${input.physicalJobIssue?.length ? `\n🏗️ Probleme job fizic: ${input.physicalJobIssue.join(', ')}` : ''}
${input.painDetails?.length ? `\n🩹 Dureri/limitări: ${input.painDetails.join(', ')}` : ''}
${input.differentiation ? `\n🟦 Diferențiere antrenor: ${input.differentiation}` : ''}
${input.internalObjections?.length ? `\n⚠️ Obiecții interne: ${input.internalObjections.join(', ')}` : ''}

IMPORTANT: Pentru "idealClient", scrie un profil COMPLET (4-5 paragrafe) care combină:
- Demografic (gen, vârstă)
- Rutina zilnică (job, program, mese, energie)
- Pain points și obstacole
- Situații definitorii și cum le afectează viața
- Obiecții interne dominante și cum îi țin pe loc

Răspunde DOAR în format JSON strict, fără markdown.
IMPORTANT:
- JSON valid obligatoriu
- Fără ghilimele duble ne-escape-uite în interiorul valorilor text
- Dacă ai nevoie de citare în text, folosește apostrof simplu

FORMAT:
{
  "niche": "Nișa ta specifică aici",
  "idealClient": "Profilul DETALIAT al clientului ideal (4-5 paragrafe în proză, nu bullet points)",
  "positioning": "Mesajul tău de poziționare unic"
}`;

  const content = await generateGeminiJson(prompt, 0.7, 900);
  const parsed = await parseModelJson<Partial<NicheResult>>(content);
  const contextHint = [
    `gen ${input.gender}`,
    `vârste ${input.ageRanges.join(', ')}${input.customAgeRange ? `, plus ${input.customAgeRange}` : ''}`,
    input.jobType ? `job ${input.jobType}` : '',
    input.sittingTime ? `sedentarism ${input.sittingTime}` : '',
    input.definingSituations?.length ? `situații ${input.definingSituations.join(', ')}` : '',
    input.differentiation ? `diferențiere ${input.differentiation}` : '',
  ]
    .filter(Boolean)
    .join('; ');
  const fallbackNiche = buildQuickIcpFallbackNiche(input);
  return ensureCompleteNicheResult(
    parsed,
    contextHint,
    fallbackNiche,
    buildQuickIcpFallbackIdealClient(input, fallbackNiche),
    buildQuickIcpFallbackPositioning(input, fallbackNiche)
  );
}

export async function generateNicheWizard(input: NicheFinderWizardInput): Promise<NicheResult> {
  const prompt = `Tu ești un expert în marketing fitness. Pe baza răspunsurilor antrenorului, creează:

1. Nișa clară și specifică (1 propoziție precisă)
2. Profilul clientului ideal (demografic + psihografic, 2-3 propoziții)
3. Mesaj de poziționare (1-2 propoziții, unique value proposition)

Răspunsuri antrenor:
1. Cu cine îmi place să lucrez: "${input.q1}"
2. Problema pe care o rezolv cel mai bine: "${input.q2}"
3. Rezultate pe care le pot demonstra: "${input.q3}"
4. Tip de client pe care vreau să-l evit: "${input.q4}"
5. De ce m-ar alege pe mine: "${input.q5}"

Răspunde DOAR în format JSON strict, fără markdown.
IMPORTANT:
- JSON valid obligatoriu
- Fără ghilimele duble ne-escape-uite în interiorul valorilor text
- Dacă ai nevoie de citare în text, folosește apostrof simplu

FORMAT:
{
  "niche": "Nișa ta specifică aici",
  "idealClient": "Profilul complet al clientului ideal",
  "positioning": "Mesajul tău de poziționare unic"
}`;

  const content = await generateGeminiJson(prompt, 0.7, 600);
  const parsed = await parseModelJson<Partial<NicheResult>>(content);
  const contextHint = [
    input.q1,
    input.q2,
    input.q3,
    input.q4,
    input.q5,
  ]
    .filter(Boolean)
    .join('; ');
  return ensureCompleteNicheResult(parsed, contextHint);
}

// ==================== DAILY IDEA GENERATOR ====================

export interface DailyIdeaInput {
  niche: string;
  icpProfile?: any;
  contentPreferences?: any;
  objective?: 'lead-gen' | 'engagement' | 'education';
  general?: boolean;
  recentIdeas?: {
    format: string;
    hook: string;
    cta?: string;
    createdAt?: string;
  }[];
}

export interface Scene {
  scene: number;
  text: string;
  visual: string;
}

export interface DailyIdeaResult {
  format: 'REEL' | 'CAROUSEL' | 'STORY';
  hook: string;
  script: Scene[];
  cta: string;
  objective: string;
  conversionRate: number;
  leadMagnet: string;
  dmKeyword: string;
  reasoning: string;
}

export interface MultiFormatIdeaResult {
  reel: DailyIdeaResult;
  carousel: DailyIdeaResult;
  story: DailyIdeaResult;
  source?: 'ai' | 'tagged-fallback' | 'emergency-fallback';
}

export interface StructuredIdeaSection {
  sectionTitle: string;
  text: string;
}

export interface StructuredIdeaResult {
  mainIdea: string;
  hooks: string[];
  script: StructuredIdeaSection[];
  cta: string;
  ctaStyleApplied: string;
  improvements: string[];
}

const STRUCTURED_IDEA_SECTION_TITLES = [
  'PARTEA 1 – Context',
  'PARTEA 2 – Explicație clară',
  'PARTEA 3 – Exemplu / aplicație',
  'PARTEA 4 – Principiu final',
] as const;

const STRUCTURED_IDEA_DEFAULT_IMPROVEMENTS = [
  'Mesaj clarificat',
  'Redundanță eliminată',
  'Structură adăugată',
  'Ton adaptat la nișă',
] as const;

function normalizeTextValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNumericValue(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function normalizeDailyIdeaScript(value: unknown): Scene[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      if (typeof item === 'string') {
        const text = item.trim();
        return text
          ? {
              scene: index + 1,
              text,
              visual: '',
            }
          : null;
      }

      if (!item || typeof item !== 'object') {
        return null;
      }

      const source = item as Record<string, unknown>;
      const text = normalizeTextValue(source.text) || normalizeTextValue(source.description);
      if (!text) {
        return null;
      }

      return {
        scene: normalizeNumericValue(source.scene ?? source.number, index + 1),
        text,
        visual: normalizeTextValue(source.visual),
      };
    })
    .filter((scene): scene is Scene => scene !== null);
}

function buildDailyIdeaDefaultKeyword(expectedFormat: DailyIdeaResult['format']): string {
  if (expectedFormat === 'CAROUSEL') {
    return 'ECHILIBRU';
  }

  if (expectedFormat === 'STORY') {
    return 'START';
  }

  return 'ENERGIE';
}

function buildDailyIdeaDefaultLeadMagnet(expectedFormat: DailyIdeaResult['format']): string {
  if (expectedFormat === 'CAROUSEL') {
    return 'Checklist simplu cu pași clari pentru mai multă energie și mai puțin disconfort peste zi.';
  }

  if (expectedFormat === 'STORY') {
    return 'Mini ghid rapid cu pași ușor de aplicat pentru mai multă energie și mai puțină tensiune în corp.';
  }

  return 'Mini ghid practic cu pași simpli pentru mai multă energie și mai puțin disconfort.';
}

function buildDailyIdeaDefaultCta(expectedFormat: DailyIdeaResult['format'], keyword: string): string {
  if (expectedFormat === 'CAROUSEL') {
    return `Scrie ${keyword} în DM și îți trimit checklistul simplu de aplicat.`;
  }

  if (expectedFormat === 'STORY') {
    return `Scrie ${keyword} în DM și îți trimit varianta scurtă și clară.`;
  }

  return `Scrie ${keyword} în DM și îți trimit pașii de bază.`;
}

function buildDailyIdeaDefaultReasoning(expectedFormat: DailyIdeaResult['format']): string {
  if (expectedFormat === 'CAROUSEL') {
    return 'Ideea funcționează pentru că organizează clar problema și soluția în pași ușor de urmărit. Publicul înțelege repede unde greșește și ce poate schimba imediat. CTA-ul cere un gest mic și oferă un beneficiu clar.';
  }

  if (expectedFormat === 'STORY') {
    return 'Ideea funcționează pentru că mesajul este scurt, clar și ușor de consumat. Problema este recognoscibilă, iar soluția pare realistă pentru cineva cu program încărcat. CTA-ul este simplu și direct.';
  }

  return 'Ideea funcționează pentru că pornește dintr-o problemă recognoscibilă și oferă pași clari, ușor de aplicat. Structura menține atenția, iar CTA-ul duce natural către următorul pas.';
}

function normalizeDailyIdeaResult(
  value: unknown,
  expectedFormat: DailyIdeaResult['format']
): DailyIdeaResult {
  if (!value || typeof value !== 'object') {
    throw new Error(`AI returned invalid ${expectedFormat} payload.`);
  }

  const source = value as Record<string, unknown>;
  const hook = normalizeTextValue(source.hook);
  const script = normalizeDailyIdeaScript(source.script ?? source.scenes ?? source.slides);
  const format = normalizeTextValue(source.format).toUpperCase() || expectedFormat;
  const keyword = normalizeTextValue(source.dmKeyword) || buildDailyIdeaDefaultKeyword(expectedFormat);
  const cta = normalizeTextValue(source.cta) || buildDailyIdeaDefaultCta(expectedFormat, keyword);
  const reasoning = normalizeTextValue(source.reasoning) || buildDailyIdeaDefaultReasoning(expectedFormat);
  const leadMagnet = normalizeTextValue(source.leadMagnet) || buildDailyIdeaDefaultLeadMagnet(expectedFormat);

  if (hook.length === 0 || script.length === 0) {
    throw new Error(`AI returned incomplete ${expectedFormat} content.`);
  }

  return {
    format: (['REEL', 'CAROUSEL', 'STORY'].includes(format) ? format : expectedFormat) as DailyIdeaResult['format'],
    hook,
    script,
    cta,
    objective: normalizeTextValue(source.objective) || 'Generare lead-uri',
    conversionRate: normalizeNumericValue(source.conversionRate, 0),
    leadMagnet,
    dmKeyword: keyword,
    reasoning,
  };
}

function normalizeMultiFormatIdeaResult(value: unknown): MultiFormatIdeaResult {
  if (!value || typeof value !== 'object') {
    throw new Error('AI returned an invalid multi-format payload.');
  }

  const source = value as Record<string, unknown>;

  return {
    reel: normalizeDailyIdeaResult(source.reel, 'REEL'),
    carousel: normalizeDailyIdeaResult(source.carousel, 'CAROUSEL'),
    story: normalizeDailyIdeaResult(source.story, 'STORY'),
    source:
      source.source === 'tagged-fallback' || source.source === 'emergency-fallback'
        ? source.source
        : 'ai',
  };
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeTextValue(item)).filter(Boolean);
  }

  const singleValue = normalizeTextValue(value);
  return singleValue ? [singleValue] : [];
}

function collectStructuredIdeaText(value: unknown): string[] {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized ? [normalized] : [];
  }

  if (Array.isArray(value)) {
    return value
      .flatMap((item) => collectStructuredIdeaText(item))
      .filter(Boolean);
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  const source = value as Record<string, unknown>;
  const preferredKeys = [
    'text',
    'content',
    'body',
    'scriptText',
    'description',
    'sectionContent',
    'copy',
    'paragraph',
    'paragraphs',
    'value',
    'contentText',
    'script',
    'details',
  ];

  for (const key of preferredKeys) {
    const extracted = collectStructuredIdeaText(source[key]);
    if (extracted.length > 0) {
      return extracted;
    }
  }

  return Object.entries(source)
    .filter(([key]) => !['sectionTitle', 'title', 'heading', 'name', 'label'].includes(key))
    .flatMap(([, nestedValue]) => collectStructuredIdeaText(nestedValue))
    .filter(Boolean);
}

function normalizeStructuredIdeaTitle(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return '';
  }

  const source = value as Record<string, unknown>;
  return (
    normalizeTextValue(source.sectionTitle) ||
    normalizeTextValue(source.title) ||
    normalizeTextValue(source.heading) ||
    normalizeTextValue(source.name) ||
    normalizeTextValue(source.label)
  );
}

function normalizeStructuredIdeaScript(value: unknown): StructuredIdeaSection[] {
  const rawScript = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.values(value as Record<string, unknown>)
      : [];
  const fallbackScript = STRUCTURED_IDEA_SECTION_TITLES.map((defaultTitle) => ({
    sectionTitle: defaultTitle,
    text: '',
  }));

  if (!rawScript.length) {
    return fallbackScript;
  }

  return rawScript.map((part, index) => {
    const textParts = collectStructuredIdeaText(part);

    return {
      sectionTitle:
        normalizeStructuredIdeaTitle(part) ||
        STRUCTURED_IDEA_SECTION_TITLES[index] ||
        `PARTEA ${index + 1}`,
      text: textParts.join('\n\n').trim(),
    };
  });
}

function normalizeStructuredIdeaSectionText(section: Record<string, unknown>): string {
  return collectStructuredIdeaText(section).join('\n\n').trim();
}

function looksLikeStructuredIdeaPlaceholder(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return (
    normalized === 'string' ||
    normalized === 'text' ||
    normalized === 'placeholder' ||
    /^partea\s+\d+\s*[–-]\s*/i.test(normalized) ||
    normalized.startsWith('hook') ||
    normalized.startsWith('cta')
  );
}

function normalizeStructuredIdeaResult(
  value: unknown,
  fallbackCtaStyle: string
): StructuredIdeaResult {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const hooks = normalizeStringArray(source.hooks).slice(0, 2);
  const script = normalizeStructuredIdeaScript(source.script);

  const improvements = normalizeStringArray(source.improvements).slice(0, 4);

  return {
    mainIdea: normalizeTextValue(source.mainIdea),
    hooks:
      hooks.length > 0
        ? [...hooks, ...Array.from({ length: Math.max(0, 2 - hooks.length) }, () => '')]
        : ['', ''],
    script,
    cta: normalizeTextValue(source.cta),
    ctaStyleApplied: normalizeTextValue(source.ctaStyleApplied) || fallbackCtaStyle,
    improvements:
      improvements.length > 0
        ? [
            ...improvements,
            ...STRUCTURED_IDEA_DEFAULT_IMPROVEMENTS.slice(improvements.length),
          ].slice(0, 4)
        : [...STRUCTURED_IDEA_DEFAULT_IMPROVEMENTS],
  };
}

function isStructuredIdeaResultIncomplete(result: StructuredIdeaResult): boolean {
  if (!result.mainIdea || looksLikeStructuredIdeaPlaceholder(result.mainIdea)) {
    return true;
  }

  if (result.hooks.length < 2 || result.hooks.some((hook) => looksLikeStructuredIdeaPlaceholder(hook))) {
    return true;
  }

  if (
    result.script.length < STRUCTURED_IDEA_SECTION_TITLES.length ||
    result.script.some((section) => {
      const text = section.text.trim();
      return !text || looksLikeStructuredIdeaPlaceholder(text) || text.split(/\s+/).length < 40;
    })
  ) {
    return true;
  }

  return !result.cta || looksLikeStructuredIdeaPlaceholder(result.cta);
}

function buildStructuredIdeaPrompt(input: {
  ideaText: string;
  niche: string;
  contentPreferences?: any;
}): { prompt: string; ctaStyle: string } {
  const brandVoiceSection = buildBrandVoiceSection(input.contentPreferences);
  const ctaStyle = input.contentPreferences?.brandVoice?.ctaStyle || 'Mix';

  const prompt = `Tu ești un expert în content fitness și copywriting conversațional pentru Reels.

TASK:
Primești o idee brută scrisă de utilizator. NU doar reformulezi.
Trebuie să:
1) Identifici ideea principală
2) Clarifici mesajul fără să schimbi sensul
3) Elimini redundanța
4) Adaptezi la nișă
5) Creezi structură Hook -> Conținut -> CTA
6) Îmbunătățești formularea
7) Păstrezi vocea utilizatorului

CONTEXT:
📍 NIȘĂ: "${input.niche}"
🗣️ BRAND VOICE:
${brandVoiceSection}
🎯 STIL CTA PREFERAT: ${ctaStyle}

IDEEA BRUTĂ UTILIZATOR:
"""
${input.ideaText}
"""

REGULI OBLIGATORII:
- Sună conversațional, natural, ca într-un Reel (30-60 secunde), nu ca articol.
- Nu folosi formulări rigide, academice, corporatiste sau sloganistice.
- Nu adăuga informații complet noi dacă nu sunt necesare.
- Păstrează ideea originală a utilizatorului.
- Respectă nișa.
- Nu returna placeholder-e precum "string", titluri simple sau secțiuni goale.
- Fiecare câmp text trebuie să conțină conținut complet, nu etichete.

OUTPUT CERUT:
1) mainIdea: ideea principală (1 propoziție clară)
2) hooks: exact 2 variante de hook (specifice nișei, 8-14 cuvinte fiecare)
3) script: 4 secțiuni:
   - "PARTEA 1 – Context"
   - "PARTEA 2 – Explicație clară"
   - "PARTEA 3 – Exemplu / aplicație"
   - "PARTEA 4 – Principiu final"
4) cta: CTA adaptat stilului CTA preferat
5) ctaStyleApplied: stilul CTA aplicat
6) improvements: listă cu EXACT 4 itemi:
   - "Mesaj clarificat"
   - "Redundanță eliminată"
   - "Structură adăugată"
   - "Ton adaptat la nișă"

LUNGIME OBLIGATORIE (IMPORTANT):
- Script total: 500-800 cuvinte.
- Fiecare secțiune din script: minimum 110-170 cuvinte.
- Fiecare secțiune trebuie să fie completă, fluentă, fără bullets.
- CTA: minimum 30-55 cuvinte, clar și acționabil.

CALITATE OBLIGATORIE:
- Text conversațional, natural, fără formulări rigide.
- Fiecare secțiune trebuie să conțină explicație concretă, nu doar afirmații.
- Menține ideea utilizatorului, dar o dezvoltă clar și coerent.

Răspunde DOAR JSON strict.
IMPORTANT:
- JSON valid obligatoriu
- Fără ghilimele duble ne-escape-uite în interiorul valorilor text
- Fără newline-uri literale în valorile string; folosește \\n doar dacă este necesar
- Dacă ai nevoie de citare în text, folosește apostrof simplu

FORMAT:
{
  "mainIdea": "string",
  "hooks": ["string", "string"],
  "script": [
    {"sectionTitle": "PARTEA 1 – Context", "text": "string"},
    {"sectionTitle": "PARTEA 2 – Explicație clară", "text": "string"},
    {"sectionTitle": "PARTEA 3 – Exemplu / aplicație", "text": "string"},
    {"sectionTitle": "PARTEA 4 – Principiu final", "text": "string"}
  ],
  "cta": "string",
  "ctaStyleApplied": "string",
  "improvements": [
    "Mesaj clarificat",
    "Redundanță eliminată",
    "Structură adăugată",
    "Ton adaptat la nișă"
  ]
}`;

  return { prompt, ctaStyle };
}

async function generateStructuredIdeaFallback(
  input: {
    ideaText: string;
    niche: string;
    contentPreferences?: any;
  },
  partialResult: StructuredIdeaResult,
  fallbackCtaStyle: string
): Promise<StructuredIdeaResult> {
  const brandVoiceSection = buildBrandVoiceSection(input.contentPreferences);
  const sectionsSnapshot = partialResult.script
    .map((section, index) => `${index + 1}. ${section.sectionTitle}: ${section.text || '[LIPSĂ]'}`)
    .join('\n');

  const prompt = `Completezi un răspuns JSON incomplet pentru structurarea unei idei de Reel.

NIȘĂ: "${input.niche}"
BRAND VOICE:
${brandVoiceSection}
STIL CTA: ${fallbackCtaStyle}

IDEA UTILIZATOR:
"""
${input.ideaText}
"""

RĂSPUNS INCOMPLET ACTUAL:
{
  "mainIdea": ${JSON.stringify(partialResult.mainIdea)},
  "hooks": ${JSON.stringify(partialResult.hooks)},
  "script": ${JSON.stringify(partialResult.script)},
  "cta": ${JSON.stringify(partialResult.cta)},
  "ctaStyleApplied": ${JSON.stringify(partialResult.ctaStyleApplied)},
  "improvements": ${JSON.stringify(partialResult.improvements)}
}

SECȚIUNI DETECTATE:
${sectionsSnapshot}

TASK:
- Rescrie răspunsul complet în același format JSON.
- Păstrează ideea și tonul.
- Umple toate câmpurile lipsă sau slabe.
- Fiecare secțiune din script trebuie să aibă 110-170 cuvinte și conținut concret.
- Nu lăsa texte precum "string", titluri simple sau secțiuni goale.
- Returnează exact 4 secțiuni de script și exact 4 itemi la improvements.

Returnează DOAR JSON valid.`;

  const content = await generateGeminiJson(prompt, 0.35, 3200);
  const result = await parseModelJson<StructuredIdeaResult>(content);
  return normalizeStructuredIdeaResult(result, fallbackCtaStyle);
}

function extractTaggedValue(content: string, tag: string): string {
  const pattern = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = content.match(pattern);
  return match?.[1]?.trim() || '';
}

function normalizeIdeaSeedText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function buildStructuredIdeaEmergencyHooks(seed: string, niche: string): string[] {
  const compactSeed = normalizeIdeaSeedText(seed);
  const compactNiche = normalizeIdeaSeedText(niche);
  const focus = compactSeed.replace(/[.?!]+$/g, '');

  return [
    `De ce ${focus.toLowerCase()} contează mai mult decât crezi`,
    `${compactNiche.split('—')[0].trim()}: ${focus.toLowerCase()}, explicat clar`,
  ].map((hook) => hook.slice(0, 120).trim());
}

function buildStructuredIdeaEmergencyResult(input: {
  ideaText: string;
  niche: string;
  contentPreferences?: any;
}): StructuredIdeaResult {
  const ideaSeed = normalizeIdeaSeedText(input.ideaText);
  const nicheSeed = normalizeIdeaSeedText(input.niche);
  const ctaStyle = input.contentPreferences?.brandVoice?.ctaStyle || 'Mix';
  const hooks = buildStructuredIdeaEmergencyHooks(ideaSeed, nicheSeed);

  return {
    mainIdea: ideaSeed,
    hooks,
    script: [
      {
        sectionTitle: STRUCTURED_IDEA_SECTION_TITLES[0],
        text: `Mulți oameni din nișa ${nicheSeed} pornesc exact din punctul descris de tine: ${ideaSeed}. Problema este că ideea rămâne, de multe ori, la nivel de observație generală și nu ajunge să fie înțeleasă clar de omul care te urmărește. În partea de context trebuie să numești situația concretă, frustrarea pe care o simte persoana și motivul pentru care subiectul apare atât de des în viața ei. Așa creezi atenție și faci publicul să simtă imediat că vorbești despre realitatea lui, nu despre un sfat generic.`,
      },
      {
        sectionTitle: STRUCTURED_IDEA_SECTION_TITLES[1],
        text: `După context, mesajul trebuie explicat simplu și logic. Pleci de la ideea ta, ${ideaSeed}, și arăți ce se întâmplă în practică, pas cu pas. Important este să explici de ce apare comportamentul respectiv, ce greșeală se repetă și ce ar trebui înțeles diferit. Fără jargon și fără propoziții vagi, partea aceasta trebuie să traducă ideea într-un limbaj clar, conversațional și util. Când omul înțelege mecanismul, nu mai percepe conținutul doar ca pe o părere, ci ca pe o explicație care îl ajută să acționeze mai bine.`,
      },
      {
        sectionTitle: STRUCTURED_IDEA_SECTION_TITLES[2],
        text: `Ca să devină memorabil, mesajul are nevoie de un exemplu ușor de recunoscut. Poți lua o situație frecventă din nișa ${nicheSeed} și să arăți cum arată problema într-o zi normală: ce face omul, unde se blochează și de ce renunță sau repetă aceeași greșeală. Apoi legi exemplul direct de ideea ta și îi arăți ce ar schimba concret. Partea aceasta face trecerea de la teorie la aplicare și îl ajută pe urmăritor să se vadă în poveste, ceea ce crește mult claritatea și relevanța mesajului.`,
      },
      {
        sectionTitle: STRUCTURED_IDEA_SECTION_TITLES[3],
        text: `La final, ideea trebuie închisă într-un principiu simplu și puternic. Nu repeți ce ai spus, ci formulezi concluzia într-un mod care rămâne în mintea omului: schimbarea nu vine din perfecțiune, ci din înțelegere și aplicare consecventă. Raportat la ${ideaSeed}, principiul final trebuie să transmită că progresul apare când simplifici mesajul, îl conectezi la realitatea omului și oferi o direcție clară. Asta lasă publicul cu senzația că a primit ceva util, coerent și imediat aplicabil, nu doar un text bine formulat.`,
      },
    ],
    cta: `Dacă vrei, îți transform ideea într-un script complet, clar și adaptat pentru nișa ta. Trimite-mi un mesaj și plecăm exact de la subiectul acesta, ca să-l facem mai ușor de înțeles și mai ușor de pus în practică.`,
    ctaStyleApplied: ctaStyle,
    improvements: [...STRUCTURED_IDEA_DEFAULT_IMPROVEMENTS],
  };
}

function buildEmergencyAudienceLabel(niche: string): string {
  const normalized = normalizeIdeaSeedText(niche);

  const ageMatch = normalized.match(/(\d{1,2})\s*[–-]\s*(\d{1,2})/);
  if (ageMatch) {
    return `tineri între ${ageMatch[1]} și ${ageMatch[2]} de ani`;
  }

  if (/persoane/i.test(normalized)) {
    return 'persoane active';
  }

  return 'oameni cu program încărcat';
}

function buildEmergencyLeadMagnet(audienceLabel: string): string {
  return `Mini ghid practic pentru ${audienceLabel}, cu pași simpli pentru mai multă energie, mai puțin disconfort și o rutină ușor de ținut.`;
}

function buildEmergencyHook(angle: string): string {
  return angle.slice(0, 120).trim();
}

function buildEmergencyScenes(lines: string[], visualPrefix: string): Scene[] {
  return lines.map((text, index) => ({
    scene: index + 1,
    text,
    visual: `${visualPrefix} ${index + 1}`,
  }));
}

function buildMultiFormatIdeaEmergencyResult(input: DailyIdeaInput): MultiFormatIdeaResult {
  const audienceLabel = buildEmergencyAudienceLabel(input.niche);
  const baseLeadMagnet = buildEmergencyLeadMagnet(audienceLabel);

  return {
    reel: {
      format: 'REEL',
      hook: buildEmergencyHook('3 greșeli care îți scad energia fără să-ți dai seama'),
      script: buildEmergencyScenes(
        [
          `Dacă te trezești obosit și simți disconfort încă de dimineață, problema nu e doar lipsa de chef. Pentru mulți ${audienceLabel}, ziua începe deja cu tensiune în corp, stat mult cocoșat și prea puțină mișcare reală.`,
          `Prima greșeală este să sari direct în ritmul zilei fără două minute de activare. Câteva mișcări simple pentru gât, umeri și șolduri schimbă felul în care pornește corpul și reduc senzația că ești deja blocat înainte să începi.`,
          `A doua greșeală este să stai mult în aceeași poziție și să confunzi oboseala cu lipsa de motivație. De multe ori, corpul îți cere o pauză scurtă și circulație mai bună, nu încă o oră de stat strâns în aceeași postură.`,
          `A treia greșeală este să crezi că ai nevoie de un plan complicat. Ai nevoie de o rutină simplă, repetabilă și clară. Dacă vrei varianta mea scurtă, scrie ENERGIE în DM și îți trimit pașii de bază.`,
        ],
        'Cadru REEL'
      ),
      cta: 'Scrie ENERGIE în DM și îți trimit rutina simplă pentru mai multă energie și mai puțin disconfort.',
      objective: 'Generare lead-uri',
      conversionRate: 0,
      leadMagnet: baseLeadMagnet,
      dmKeyword: 'ENERGIE',
      reasoning: `Acest Reel funcționează pentru că pornește dintr-o problemă foarte recognoscibilă pentru ${audienceLabel}: oboseală, rigiditate și disconfort în rutina zilnică. Structura pe greșeli creează claritate și retenție, iar soluțiile sunt suficient de simple încât să pară imediat aplicabile. CTA-ul leagă direct problema de un pas concret, fără să ceară efort mare din partea utilizatorului.`,
    },
    carousel: {
      format: 'CAROUSEL',
      hook: buildEmergencyHook('Ce să schimbi azi ca să nu mai tragi de tine'),
      script: buildEmergencyScenes(
        [
          `Slide-ul acesta deschide problema clar: dacă ai puțină energie și corpul îți dă semnale de disconfort, nu înseamnă că trebuie să te forțezi mai tare. Pentru mulți ${audienceLabel}, de multe ori lipsește structura de bază, nu voința.`,
          `Primul lucru pe care merită să-l schimbi este începutul zilei. Un start mai calm, cu puțină mobilitate și o trecere mai bună către efort, îți poate schimba complet nivelul de energie din următoarele ore.`,
          `Al doilea punct este felul în care îți împarți mișcarea peste zi. Dacă stai mult și apoi încerci să recuperezi totul dintr-odată, corpul intră ușor în tensiune și oboseala se simte și mai tare.`,
          `Al treilea lucru este să reduci așteptarea că ai nevoie de perfecțiune. Pentru publicul acesta, progresul vine mai repede din pași simpli și constanți decât din perioade scurte în care tragi foarte tare și apoi cazi complet.`,
        ],
        'Slide CAROUSEL'
      ),
      cta: 'Scrie ECHILIBRU în DM și îți trimit schema simplă cu pașii de bază.',
      objective: 'Generare lead-uri',
      conversionRate: 0,
      leadMagnet: baseLeadMagnet,
      dmKeyword: 'ECHILIBRU',
      reasoning: `Carousel-ul funcționează pentru că organizează informația într-o formă ușor de parcurs și de salvat. Publicul vede clar unde greșește și ce poate ajusta fără să simtă că primește o soluție complicată. Hook-ul promite claritate, iar CTA-ul cere un gest mic, cu beneficiu imediat și relevant.`,
    },
    story: {
      format: 'STORY',
      hook: buildEmergencyHook('Dacă te doare tot și n-ai energie, oprește-te un minut'),
      script: buildEmergencyScenes(
        [
          `Dacă simți că te trezești deja fără energie, nu e ceva ce trebuie ignorat. La mulți ${audienceLabel}, combinația dintre stres, stat mult și lipsa unei rutine simple se simte direct în corp.`,
          `Nu începe cu planuri mari. Începe cu puțină mobilitate, mai multă atenție la postură și câteva pauze scurte care să te scoată din rigiditate.`,
          `Când faci asta constant, nu doar că scade disconfortul, dar începi să simți că ai mai mult control peste zi. Asta îți crește și energia, și încrederea că poți rămâne consecvent.`,
          `Dacă vrei varianta mea scurtă și clară, scrie START în DM și ți-o trimit imediat.`,
        ],
        'Cadru STORY'
      ),
      cta: 'Scrie START în DM și îți trimit pașii simpli pentru o zi cu mai puțin disconfort.',
      objective: 'Generare lead-uri',
      conversionRate: 0,
      leadMagnet: baseLeadMagnet,
      dmKeyword: 'START',
      reasoning: `Story-ul merge bine pentru că mesajul este direct, ușor de consumat și are urgență naturală. Problema este formulată simplu, fără jargon, iar soluția pare realistă pentru cineva cu program încărcat. CTA-ul este scurt și foarte ușor de executat.`,
    },
    source: 'emergency-fallback',
  };
}

function buildMultiFormatTaggedSceneArray(prefix: string, content: string): Scene[] {
  return Array.from({ length: 4 }, (_, index) => {
    const sceneNumber = index + 1;
    const text = extractTaggedValue(content, `${prefix}Scene${sceneNumber}`);
    const visual = extractTaggedValue(content, `${prefix}Visual${sceneNumber}`);

    if (!text) {
      return null;
    }

    return {
      scene: sceneNumber,
      text,
      visual,
    };
  }).filter((scene): scene is Scene => scene !== null);
}

async function generateMultiFormatIdeaTaggedFallback(
  input: DailyIdeaInput
): Promise<MultiFormatIdeaResult> {
  const objective = input.objective || 'lead-gen';
  const isGeneralIdea = input.general === true;
  const recentIdeasSection = buildRecentIdeasSection(input.recentIdeas);
  const brandVoiceSection = buildBrandVoiceSection(input.contentPreferences);
  const contentCreationSection = buildContentCreationSection(input.contentPreferences);

  const prompt = `Generează 3 idei de content complete pentru un antrenor fitness din România.

NIȘĂ: "${input.niche}"
MOD: ${isGeneralIdea ? 'general' : 'specific pe nișă'}
OBIECTIV: ${objective}

BRAND VOICE:
${brandVoiceSection}

PREFERINȚE DE CREARE CONTENT:
${contentCreationSection}

ISTORIC IDEI RECENTE:
${recentIdeasSection}

REGULI:
- Totul exclusiv în română naturală.
- Cele 3 idei trebuie să fie clar diferite între ele.
- Hook-ul trebuie să fie specific și complet.
- Fiecare scenă trebuie să fie clară și utilă.
- CTA-ul trebuie să includă un keyword DM și un beneficiu clar.
- Fără markdown. Fără JSON. Fără explicații extra.
- Returnează EXACT tag-urile de mai jos.

FORMAT EXACT:
<reelHook>...</reelHook>
<reelScene1>...</reelScene1>
<reelVisual1>...</reelVisual1>
<reelScene2>...</reelScene2>
<reelVisual2>...</reelVisual2>
<reelScene3>...</reelScene3>
<reelVisual3>...</reelVisual3>
<reelScene4>...</reelScene4>
<reelVisual4>...</reelVisual4>
<reelCta>...</reelCta>
<reelLeadMagnet>...</reelLeadMagnet>
<reelDmKeyword>...</reelDmKeyword>
<reelReasoning>...</reelReasoning>

<carouselHook>...</carouselHook>
<carouselScene1>...</carouselScene1>
<carouselVisual1>...</carouselVisual1>
<carouselScene2>...</carouselScene2>
<carouselVisual2>...</carouselVisual2>
<carouselScene3>...</carouselScene3>
<carouselVisual3>...</carouselVisual3>
<carouselScene4>...</carouselScene4>
<carouselVisual4>...</carouselVisual4>
<carouselCta>...</carouselCta>
<carouselLeadMagnet>...</carouselLeadMagnet>
<carouselDmKeyword>...</carouselDmKeyword>
<carouselReasoning>...</carouselReasoning>

<storyHook>...</storyHook>
<storyScene1>...</storyScene1>
<storyVisual1>...</storyVisual1>
<storyScene2>...</storyScene2>
<storyVisual2>...</storyVisual2>
<storyScene3>...</storyScene3>
<storyVisual3>...</storyVisual3>
<storyScene4>...</storyScene4>
<storyVisual4>...</storyVisual4>
<storyCta>...</storyCta>
<storyLeadMagnet>...</storyLeadMagnet>
<storyDmKeyword>...</storyDmKeyword>
<storyReasoning>...</storyReasoning>`;

  const content = await generateGeminiText(prompt, 0.35, 3600);

  return normalizeMultiFormatIdeaResult({
    reel: {
      format: 'REEL',
      hook: extractTaggedValue(content, 'reelHook'),
      script: buildMultiFormatTaggedSceneArray('reel', content),
      cta: extractTaggedValue(content, 'reelCta'),
      objective: 'Generare lead-uri',
      conversionRate: 0,
      leadMagnet: extractTaggedValue(content, 'reelLeadMagnet'),
      dmKeyword: extractTaggedValue(content, 'reelDmKeyword'),
      reasoning: extractTaggedValue(content, 'reelReasoning'),
    },
    carousel: {
      format: 'CAROUSEL',
      hook: extractTaggedValue(content, 'carouselHook'),
      script: buildMultiFormatTaggedSceneArray('carousel', content),
      cta: extractTaggedValue(content, 'carouselCta'),
      objective: 'Generare lead-uri',
      conversionRate: 0,
      leadMagnet: extractTaggedValue(content, 'carouselLeadMagnet'),
      dmKeyword: extractTaggedValue(content, 'carouselDmKeyword'),
      reasoning: extractTaggedValue(content, 'carouselReasoning'),
    },
    story: {
      format: 'STORY',
      hook: extractTaggedValue(content, 'storyHook'),
      script: buildMultiFormatTaggedSceneArray('story', content),
      cta: extractTaggedValue(content, 'storyCta'),
      objective: 'Generare lead-uri',
      conversionRate: 0,
      leadMagnet: extractTaggedValue(content, 'storyLeadMagnet'),
      dmKeyword: extractTaggedValue(content, 'storyDmKeyword'),
      reasoning: extractTaggedValue(content, 'storyReasoning'),
    },
    source: 'tagged-fallback',
  });
}

async function generateStructuredIdeaTaggedFallback(
  input: {
    ideaText: string;
    niche: string;
    contentPreferences?: any;
  },
  fallbackCtaStyle: string
): Promise<StructuredIdeaResult> {
  const brandVoiceSection = buildBrandVoiceSection(input.contentPreferences);
  const prompt = `Rescrie ideea utilizatorului ca output structurat pentru un Reel.

NIȘĂ: "${input.niche}"
BRAND VOICE:
${brandVoiceSection}
STIL CTA: ${fallbackCtaStyle}

IDEA UTILIZATOR:
"""
${input.ideaText}
"""

Returnează DOAR text cu tag-urile de mai jos, fără markdown și fără explicații extra.
- Păstrează tonul conversațional.
- Fiecare secțiune trebuie să fie clară, completă și utilă.
- Fiecare secțiune trebuie să aibă aproximativ 90-140 cuvinte.
- CTA-ul trebuie să fie clar și acționabil.
- improvements trebuie să fie exact cele 4 itemi din format.

FORMAT EXACT:
<mainIdea>...</mainIdea>
<hook1>...</hook1>
<hook2>...</hook2>
<section1>...</section1>
<section2>...</section2>
<section3>...</section3>
<section4>...</section4>
<cta>...</cta>
<ctaStyle>${fallbackCtaStyle}</ctaStyle>
<improvements>
Mesaj clarificat
Redundanță eliminată
Structură adăugată
Ton adaptat la nișă
</improvements>`;

  const generateTaggedContent = async () => generateGeminiText(prompt, 0.25, 2200);
  let content: string;

  try {
    content = await generateTaggedContent();
  } catch (error) {
    console.warn('Structured idea tagged fallback failed on first attempt, retrying once:', error);
    content = await generateTaggedContent();
  }

  const improvements = extractTaggedValue(content, 'improvements')
    .split('\n')
    .map((item) => item.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 4);

  return normalizeStructuredIdeaResult(
    {
      mainIdea: extractTaggedValue(content, 'mainIdea'),
      hooks: [
        extractTaggedValue(content, 'hook1'),
        extractTaggedValue(content, 'hook2'),
      ],
      script: [
        {
          sectionTitle: STRUCTURED_IDEA_SECTION_TITLES[0],
          text: extractTaggedValue(content, 'section1'),
        },
        {
          sectionTitle: STRUCTURED_IDEA_SECTION_TITLES[1],
          text: extractTaggedValue(content, 'section2'),
        },
        {
          sectionTitle: STRUCTURED_IDEA_SECTION_TITLES[2],
          text: extractTaggedValue(content, 'section3'),
        },
        {
          sectionTitle: STRUCTURED_IDEA_SECTION_TITLES[3],
          text: extractTaggedValue(content, 'section4'),
        },
      ],
      cta: extractTaggedValue(content, 'cta'),
      ctaStyleApplied: extractTaggedValue(content, 'ctaStyle') || fallbackCtaStyle,
      improvements,
    },
    fallbackCtaStyle
  );
}

function buildRecentIdeasSection(recentIdeas?: DailyIdeaInput['recentIdeas']): string {
  if (!recentIdeas || recentIdeas.length === 0) {
    return 'Nu exista idei anterioare in context.';
  }

  const compact = recentIdeas
    .slice(0, 12)
    .map((idea, index) => {
      const hook = (idea.hook || '').replace(/\s+/g, ' ').trim();
      const cta = (idea.cta || '').replace(/\s+/g, ' ').trim();
      return `${index + 1}. [${idea.format}] Hook: "${hook}" | CTA: "${cta}"`;
    })
    .join('\n');

  return compact;
}

function buildBrandVoiceSection(contentPreferences?: DailyIdeaInput['contentPreferences']): string {
  const brandVoice = contentPreferences?.brandVoice;
  if (!brandVoice) {
    return 'Nu există Brand Voice setat.';
  }

  const list = (value: unknown) =>
    Array.isArray(value) && value.length ? value.join(', ') : 'N/A';

  return [
    `Percepție dorită: ${list(brandVoice.perception)}`,
    `Stil natural de vorbire: ${brandVoice.naturalStyle || 'N/A'}`,
    `Nu vrea niciodată în content: ${list(brandVoice.neverDo)}`,
    `Principii constante: ${list(brandVoice.principles)}${brandVoice.customPrinciple ? ` + ${brandVoice.customPrinciple}` : ''}`,
    `Stil CTA: ${brandVoice.ctaStyle || 'N/A'}`,
    `Cuvinte brand: ${list(brandVoice.brandWords)}`,
    `Expresii naturale: ${brandVoice.frequentPhrases || 'N/A'}`,
    `Nuanță umor: ${brandVoice.humorTone || 'Deloc / nesetat'}`,
  ].join('\n');
}

function buildContentCreationSection(contentPreferences?: DailyIdeaInput['contentPreferences']): string {
  const contentCreation = contentPreferences?.contentCreation;
  if (!contentCreation) {
    return 'Nu există preferințe "Cum vrei să creezi content?" setate.';
  }

  const list = (value: unknown) =>
    Array.isArray(value) && value.length ? value.join(', ') : 'N/A';

  return [
    `Loc filmare preferat: ${contentCreation.filmingLocation || 'N/A'}`,
    `Tipuri naturale de content: ${list(contentCreation.naturalContentTypes)}`,
    `Alt format reprezentativ: ${contentCreation.otherNaturalFormat || 'N/A'}`,
    `Stiluri de livrare preferate: ${list(contentCreation.deliveryStyles)}`,
  ].join('\n');
}

const DAILY_IDEA_ADVANCED_RULES = `
Update Prompt
🇷🇴 ROMÂNĂ NATIVĂ, NU TRADUSĂ (CRITIC – OBLIGATORIU)
Tot output-ul trebuie scris DIRECT în română, ca un antrenor român care vorbește cu oameni din România.
Nu traduce idei din engleză în română.
Nu gândi în engleză și apoi reformula.
Nu folosi formulări care sună importate, copiate sau localizate prost.

REGULI ABSOLUTE:
- Scrie exclusiv în română naturală.
- Folosește gramatică română corectă și firească.
- Folosește exprimări pe care un român le-ar înțelege din prima, fără să stea să decodeze textul.
- Dacă există o formulare simplă și românească, alege-o pe aceea în locul uneia moderne, hibride sau traduse.
- Folosește jargon românesc de sală și de lifestyle doar când sună natural pentru România.
- Când dai exemple, situații sau contexte, prioritizează comportamente, obiceiuri și situații reale pe care oamenii din România le recunosc imediat.

EXEMPLE DE DIRECȚIE CORECTĂ:
- vorbește ca într-o sală din România, nu ca într-un ebook american tradus
- explică simplu, direct și familiar
- folosește exemple pe care oamenii le recunosc în viața de zi cu zi: muncă, program haotic, mâncat pe fugă, sală, acasă, copii, ture, oboseală, lipsă de chef, „mă ia foamea seara”, „ajung rupt(ă)”, „trag de mine”

EXEMPLE DE EVITAT:
- termeni englezești băgați doar ca să pară moderni
- structuri de tip copywriting american traduse literal
- expresii care sună „corect” gramatical, dar nefiresc pentru română vorbită
- jargon fitness englezesc când există o variantă clară în română

TEST FINAL DE LIMBĂ:
După fiecare hook, scenă și CTA, verifică:
1. Sună ca româna vorbită de un antrenor român real?
2. Ar înțelege imediat un om din România ce vrei să spui?
3. Sună natural, nu tradus?
4. Este corect gramatical și ușor de spus?
Dacă NU la oricare dintre ele, rescrie.

TEST FINAL DE SENS ȘI COERENȚĂ:
După fiecare hook, scenă și CTA, verifică:
1. Propoziția are sens complet de una singură?
2. Este clar la ce se referă fiecare cuvânt-cheie?
3. Evită contraste incomplete sau formulări rupte?
4. Nu există cuvinte puse doar pentru impact, fără sens clar?
5. Ar spune un român nativ: "da, asta are logică"?
Dacă NU la oricare dintre ele, rescrie complet.

EXEMPLU DE EVITAT:
❌ „Îți tremură mâinile la sală? Nu e «slabă», e simplu.”
De ce e greșit:
- „slabă” nu are referent clar
- propoziția nu are logică internă
- „e simplu” nu spune nimic concret
- sună ca o traducere stricată sau o idee neterminată

EXEMPLE MAI BUNE:
✅ „Îți tremură mâinile la sală? Problema poate fi ce faci înainte.”
✅ „Rămâi fără energie din primele minute? Uită-te la ce faci înainte de antrenament.”
✅ „Te ia amețeala la sală? De multe ori, problema începe înainte să intri.”

REGULĂ ABSOLUTĂ:
Nu folosi niciodată structuri de tip:
- „nu e X, e simplu”
- „nu e X, e altceva” fără să spui clar acel altceva
- „nu e asta” fără concluzie clară
- propoziții care par puternice, dar nu spun nimic concret

󰐬 LIMBAJ NATIV (CRITIC – OBLIGATORIU)
Scrie ca un antrenor român real care vorbește pe cameră.
Nu traduce din engleză. Nu gândi în engleză.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
1⃣ GÂNDIRE DIRECT ÎN ROMÂNĂ
Generează propozițiile ca și cum:
- vorbești cu un client în sală
- explici pe loc, fără să „formulezi frumos”
❌ INTERZIS:
- structuri care sună traduse
- propoziții construite artificial
- formulări „prea corecte” dar nenaturale
Dacă propoziția pare gândită în engleză → rescrie.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
2⃣ LIMBAJ VORBIT, NU SCRIS
Scriptul trebuie să sune ca vorbire, nu ca text.
❌ INTERZIS:
- formulări de tip articol / curs
- propoziții lungi și complexe
- explicații „prea elegante”
✅ FOLOSEȘTE:
- fraze scurte
- ritm natural
- exprimare directă
EXEMPLU:
❌ „Primul tău obiectiv este să îți activezi musculatura”
✅ „Începe ușor, ca să intri în ritm”
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
3⃣ FĂRĂ TRADUCERI SAU CALCHIERI
❌ INTERZIS COMPLET:
-
„modul X” (modul avion, modul economie etc.)
-
„combo”
-
„te urcă și te lasă”
-
„intră în”
-
„bateria ta”
-
„îți pornești sistemul”
- orice expresie care pare tradusă
Dacă sună „ca din engleză”
→ rescrie simplu.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
4⃣ SIMPLIFICARE FORȚATĂ
Dacă o propoziție:
- sună complicat
- are prea multe cuvinte
- pare „smart”
→ simplific-o.
Regulă:
👉 dacă poate fi spus mai simplu, rescrie.
EXEMPLU:
❌ „corpul tău intră într-un mecanism de compensare”
✅ „corpul începe să compenseze”
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
5⃣ TEST DE SALĂ (OBLIGATORIU)
După fiecare propoziție, verifică:
👉 „Aș spune asta exact așa unui client, față în față?”
Dacă răspunsul este:
-
„nu chiar”
-
„sună ciudat”
-
„sună prea formulat”
→ RESCRIE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
6⃣ FĂRĂ „SUNĂ DEȘTEPT”
❌ INTERZIS:
- formulări care sună bine, dar nu sunt naturale
- metafore inutile
- exprimări creative forțate
👉 Nu încerca să suni inteligent.
👉 Sună clar și natural.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
7⃣ RITM DE VORBIRE REAL
Fiecare propoziție trebuie să:
- poată fi spusă ușor
- nu te încurce când o citești
- nu aibă pauze forțate
Dacă e greu de spus → rescrie.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
🔁 REGULĂ FINALĂ (CRITICĂ):
Pentru fiecare propoziție:
1. Scrie varianta inițială
2. Rescrie-o mai simplu
3. Alege varianta care sună cel mai natural
Nu păstra prima variantă dacă nu sună 100% real.
💣 HOOK ENGINE (CRITIC – STOP SCROLL)
🎯 OBIECTIV:
Hook-ul trebuie să oprească scroll-ul în PRIMELE 1-2 secunde.
Dacă este doar „ok”
, nu este acceptat.
Hook-ul trebuie să creeze reacție instant.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
1⃣ DIRECT > POLITICOS
Hook-ul trebuie să fie direct, nu soft.
❌ INTERZIS:
- formulări blânde
- întrebări neutre
- hook-uri „safe”
EX:
❌ „Ajungi la sală fără chef?”
✅ „Pierzi 10 minute în sală fără să faci nimic?”
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
2⃣ CONCRET > GENERAL
Hook-ul trebuie să fie specific.
❌ INTERZIS:
-
„nu ai energie”
-
„nu vezi rezultate”
-
„nu ai chef”
✅ FOLOSEȘTE:
- situații clare
EX:
✅ „Te uiți 10 minute la aparate fără să începi?”
✅ „Te doare spatele după fiecare antrenament?”
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
3⃣ PROBLEMĂ CLARĂ (OBLIGATORIU)
Hook-ul trebuie să atingă o problemă reală.
Utilizatorul trebuie să spună instant:
👉 „asta sunt eu”
Dacă nu creează identificare → rescrie.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
4⃣ TENSIUNE / DISCONFORT (CRITIC)
Hook-ul trebuie să creeze o mică „lovitură” mentală:
- frustrare
- vinovăție
- confuzie
- realizare
EX:
„Faci asta zilnic și te ține pe loc”
„Crezi că e corect, dar te sabotează”
Dacă nu creează reacție → rescrie.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
5⃣ CURIOSITY GAP
Nu spune tot.
Lasă un „gap”:
👉 „ok… și de ce?”
❌ INTERZIS:
- să dai soluția în hook
EX:
❌ „Nu ai energie pentru că nu mănânci proteină”
✅ „Problema nu e la antrenament. E înainte.
”
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
6⃣ FĂRĂ CLIȘEE
❌ INTERZIS:
-
„nu e lene”
-
„nu e voință”
-
„uite ce faci greșit”
-
„probabil faci asta”
👉 sunt supra-folosite și ignorate
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
7⃣ MAXIM 12–14 CUVINTE
- scurt
- rapid
- ușor de procesat
Dacă e lung → scade impactul
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
8⃣ STRUCTURI PERFORMANTE (OBLIGATORIU)
Folosește UNA din aceste structuri:
A. CONCRET + PROBLEMĂ
„Pierzi 10 minute în sală fără să începi?”
B. REZULTAT GREȘIT
„Te antrenezi, dar nu vezi nimic?”
C. CONTRAST
„Faci asta zilnic, dar te ține pe loc”
D. DEMONTARE
„Nu exercițiile sunt problema”
E. TRIGGER DIRECT
„Te doare spatele după sală?”
NU combina structuri.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
9⃣ LIMBAJ NATURAL (OBLIGATORIU)
Trebuie să sune vorbit.
❌ INTERZIS:
- expresii traduse
- formulări „deștepte”
Dacă sună ca text scris → rescrie.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
9.1⃣ LIMBAJ CU SENS COMPLET (OBLIGATORIU)
Hook-ul trebuie să aibă sens complet și clar în română.
❌ INTERZIS:
- cuvinte izolate fără referent clar
- adjective fără subiect clar
- formulări „misterioase” care nu spun nimic concret
- propoziții care par intense, dar sunt ilogice
✅ REGULĂ:
Dacă hook-ul nu poate fi explicat simplu, înseamnă că nu e bun.
Trebuie să fie clar, direct și logic din prima citire.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
🔁 REGULĂ DE RESCRIERE (CRITICĂ):
1. Generează 3 variante de hook (intern)
2. Alege varianta cea mai:
- clară
- directă
- impactantă
3. Dacă niciuna nu e „wow”
→ rescrie
NU te opri la prima variantă corectă.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
💣 TEST FINAL:
Hook-ul trebuie să treacă testul:
□ oprește scroll-ul?
□ este specific?
□ creează reacție?
□ sună natural?
□ nu este clișeu?
Dacă NU → rescrie.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
🧠 REGULĂ DE IMPACT:
Hook-ul nu trebuie să fie „frumos”
.
Trebuie să fie:
- clar
- direct
- ușor incomod
- real
🚫 INTERZIS COMPLET – LIMBAJ ARTIFICIAL / TRADUS / FORȚAT
(CRITIC)
Scopul este ca textul să sune ca vorbire reală, naturală, spusă de un
antrenor român pe cameră.
Dacă o formulare pare:
- tradusă din engleză
- prea „deșteaptă”
- prea creativă
- prea scrisă
- nefiresc de dramatică
- metaforică fără rost
- nenaturală pentru vorbirea din fitness în română
→ RESCRIE-O SIMPLU.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
1⃣ NU FOLOSI EXPRESII CARE SUNĂ TRADUSE
❌ INTERZIS:
-
„combo-ul care te sabotează”
-
„modul X”
-
„modul avion”
-
„economy mode”
-
„bateria ta”
-
„îți pornești sistemul”
-
„te urcă și te lasă”
-
„intră în modul...
”
-
„gaura de energie”
-
„starter stabil”
-
„micro-pauză de energie”
-
„blocaj de start”
-
„disciplina calmă”
-
-
-
-
-
„pe avarie”
„îți aprinde energia”
„îți pornește corpul”
„îți activezi sistemul”
„îți resetezi corpul” dacă sună forțat
✅ ÎNLOCUIEȘTE CU:
-
„problema e aici”
-
„aici greșești”
-
„de asta te simți așa”
-
„începe ușor”
-
„mișcă-te puțin înainte”
-
„intri mai ușor în antrenament”
-
„îți revii mai repede”
-
„te simți mai ok”
-
„îți e mai ușor să începi”
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
2⃣ NU FOLOSI METAFORĂ DACĂ POȚI SPUNE DIRECT
Regulă:
Dacă ideea poate fi spusă simplu și direct, NU folosi metaforă.
❌ INTERZIS:
-
„corpul intră pe scurtătură”
-
„spatele fură mișcarea”
-
„creierul zice mai bine stau”
-
„corpul e în modul șezut”
-
„energia cade în gol”
-
„te lovește somnul” dacă sună teatral
-
„îți moare antrenamentul înainte să înceapă”
-
„intri pe pilot automat” dacă e forțat
✅ MAI BUN:
-
„corpul începe să compenseze”
-
-
-
-
-
„simți mai mult spatele decât fesierii”
„amâni să începi”
„te miști greu la început”
„ți se face somn”
„nu ai chef să începi”
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
3⃣ NU SCRIE CA ÎNTR-UN ARTICOL
Textul nu trebuie să sune ca:
- blog
- curs
- ebook
- material educațional scris
❌ INTERZIS:
-
„ce se întâmplă practic”
-
„următoarea etapă”
-
„acest proces”
-
„obiectivul principal”
-
„mecanismul din spate”
-
„factor determinant”
-
„în acest context”
-
„în majoritatea cazurilor”
-
„în mod frecvent”
-
„de multe ori” repetat excesiv
-
„în mod ideal”
✅ FOLOSEȘTE:
-
„uite unde e problema”
-
„aici greșești”
-
„de asta se întâmplă”
-
„fă asta în schimb”
-
„uite cum o rezolvi”
-
„începe așa”
-
-
„mai simplu de atât”
„asta te ajută pentru că...
”
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
4⃣ NU ÎNCERCA SĂ SUNI „SMART”
Dacă o propoziție sună:
- prea formulată
- prea elegantă
- prea „copywriter”
- prea construită
→ simplific-o imediat.
❌ INTERZIS:
- formulări care impresionează, dar nu sună real
- jocuri de cuvinte inutile
- expresii pseudo-motivaționale
- contraste dramatice artificiale
EXEMPLE PROASTE:
-
„nu te pedepsești, te repoziționezi”
-
„variat e viața ta, nu planul”
-
„nu negocia 30 de minute cu tine”
-
„cheia e să intri în ritm metabolic”
-
„pornește-ți corpul”
-
„rescrie-ți startul”
✅ EXEMPLE BUNE:
-
„nu intra direct în cel mai greu exercițiu”
-
„începe cu ceva simplu”
-
„fă primul pas ușor”
-
„nu complica”
-
„ține-l simplu”
-
„așa îți e mai ușor să continui”
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
5⃣ NU FOLOSI DRAMATIZARE FORȚATĂ
Hook-urile și scripturile pot fi directe și puternice, dar nu teatrale.
❌ INTERZIS:
-
„ghici cine se plânge după?”
-
„și de aici începe dezastrul”
-
„asta te distruge”
-
„asta te sabotează” folosit excesiv
-
„normal că ești terminată”
-
„îți cade tot”
-
„corpul tău cedează”
-
„intră în panică”
-
„ești pe modul supraviețuire” dacă sună tradus
✅ MAI BUN:
-
„de asta ajungi să simți spatele”
-
„de asta ți se pare totul mai greu”
-
„de asta pornești prost antrenamentul”
-
„de asta nu ai energie”
-
„de asta nu simți exercițiul unde trebuie”
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
6⃣ NU FOLOSI ROMGLEZĂ SAU FORMULĂRI HIBRIDE DUBIOASE
❌ INTERZIS:
- combinații română-engleză care nu sunt naturale
- termeni englezești băgați doar ca să sune modern
- formulări hibride gen „start ritual”
, „reset protocol”
, „energy drop”
, dacă
nu sunt absolut necesare
✅ REGULĂ:
Dacă există o variantă simplă și naturală în română, folosește-o.
Ex:
❌ „start ritual”
✅ „o rutină simplă de început”
❌ „reset”
✅ „un start simplu” / „o rutină scurtă”
❌ „energy crash”
✅ „cădere de energie” / „ți se taie energia”
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
7⃣ TEST DE NATURALEȚE (OBLIGATORIU)
După fiecare hook și fiecare propoziție importantă, verifică:
- Aș auzi un antrenor român spunând asta exact așa?
- Sună ca vorbire reală?
- Sună simplu și direct?
- E clar din prima?
- Are sens fără să o recitesc?
Dacă răspunsul este NU la oricare dintre ele → RESCRIE.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
8⃣ REGULĂ DE RESCRIERE SIMPLĂ
Dacă o propoziție sună artificial, rescrie-o astfel:
Pas 1: scoate metafora
Pas 2: scoate dramatizarea
Pas 3: scoate orice cuvânt „smart”
Pas 4: spune ideea cât mai simplu, ca pentru un client
Exemplu:
❌ „Combo-ul care te sabotează îți omoară energia înainte de sală.
”
✅ „Problema e ce faci înainte de sală.
”
❌ „Corpul intră pe scurtătură și lombarul preia controlul.
”
✅ „Corpul începe să compenseze și simți mai mult spatele.
”
❌ „Ai bateria la 3% și intri pe economy mode.
”
✅ „Ești obosită și îți e greu să începi.
”
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
9⃣ REGULĂ FINALĂ
Mai bine simplu și foarte natural
decât creativ și ciudat.
Mai bine direct
decât „deștept”
.
Mai bine clar
decât memorabil forțat.
🗣 FILTRU FINAL DE UMANITATE (CRITIC – OBLIGATORIU)
Tot output-ul trebuie să sune ca vorbire reală.
Scrie ca și cum:
- vorbești direct cu un client
- în sală sau pe cameră
- spontan, clar și natural
- fără să încerci să „scrii frumos”
Scopul NU este să sune impresionant.
Scopul este să sune uman, firesc și ușor de spus.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
1⃣ TESTUL DE VORBIRE REALĂ
Fiecare hook, scenă și CTA trebuie să treacă testul:
👉 „Aș putea spune asta exact așa, cu voce tare, unui client real?”
Dacă răspunsul este:
-
„sună puțin scris”
-
„sună prea formulat”
-
„sună prea explicat”
-
„sună ca text, nu ca vorbire”
→ RESCRIE
Nu livra nicio propoziție care sună bine doar pe ecran, dar prost când e
spusă.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
2⃣ SUNĂ CA OM, NU CA TEXT
Output-ul trebuie să sune ca un om care vorbește, nu ca un text
redactat.
❌ INTERZIS:
- formulări de tip articol
- explicații prea ordonate și rigide
- propoziții „perfect construite”
, dar nenaturale
- fraze care par scrise pentru citit, nu pentru vorbit
✅ FOLOSEȘTE:
- fraze care curg natural
- exprimare simplă
- propoziții scurte sau medii
- ton cald, direct, natural
EXEMPLU:
❌ „Obiectivul acestei rutine este să optimizeze intrarea în
antrenament.
”
✅ „Scopul e simplu: să-ți fie mai ușor să începi.
”
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
3⃣ FĂRĂ VOCE DE ARTICOL / CURS / EBOOK
Dacă textul sună ca:
- articol de blog
- PDF
- material educațional scris
- curs
- text explicativ lung
- caption prea redactat
→ RESCRIE
❌ INTERZIS:
-
„în acest context”
-
„obiectivul principal”
-
„mecanismul din spate”
-
„următoarea etapă”
-
„acest proces”
-
„în majoritatea cazurilor”
-
„este important să”
-
-
„se recomandă”
„în mod ideal”
✅ MAI UMAN:
-
„uite unde e problema”
-
„aici greșești”
-
„de asta ți se întâmplă”
-
„fă asta în schimb”
-
„mai simplu”
-
„începe așa”
-
„asta te ajută pentru că…
”
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
4⃣ FĂRĂ EXPLICAȚII LUNGI SAU GREOAIE
Dacă o propoziție are:
- prea multe idei
- prea multe detalii
- prea multe paranteze mentale
- prea multe explicații într-o singură frază
→ RUPE-O sau SIMPLIFIC-O
Regulă:
O propoziție bună trebuie să fie înțeleasă din prima, fără recitire.
❌ INTERZIS:
- fraze lungi care par „bine scrise”
, dar greu de urmărit
- propoziții încărcate cu explicații tehnice + exemple + justificări
✅ FOLOSEȘTE:
- 1 idee clară per propoziție
- 1 direcție clară per scenă
- explicație simplă, apoi exemplu
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
5⃣ TESTUL DE SALĂ (OBLIGATORIU)
Imaginează-ți că ești:
- lângă aparat
- între 2 seturi
- sau filmezi un Reel rapid
Întreabă-te:
👉 „Aș spune asta așa, natural, fără să mă opresc?”
Dacă nu, rescrie până sună natural.
Textul trebuie să sune ca o explicație pe care o dai repede și clar, nu ca
una pregătită pentru citit.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
6⃣ FĂRĂ SUNET DE AI SAU COPYWRITER
Dacă textul sună:
- prea „smart”
- prea bine ambalat
- prea dramatic
- prea metaforic
- prea perfect
→ RESCRIE
❌ INTERZIS:
- formulări care vor să impresioneze
- expresii pseudo-profonde
- propoziții care „sună bine”
, dar nu ar fi spuse real
- jocuri de cuvinte inutile
- contraste artificiale
✅ PREFERĂ:
- clar
- direct
- simplu
- uman
- util
Regulă:
Mai bine puțin mai simplu decât puțin prea „scris”
.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
7⃣ RITM DE VORBIRE NATURAL
Output-ul trebuie să aibă ritm de vorbire real.
Asta înseamnă:
- curge natural
- nu sare brusc între idei
- nu pare listă
- nu pare rigid
- nu se împiedică în formulare
Dacă textul pare:
- prea compact
- prea grăbit
- prea explicativ
- prea tăios fără flow
→ rescrie
Scriptul trebuie să se simtă ca o conversație scurtă, nu ca o schemă
tehnică.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
8⃣ UMAN > PERFECT
Nu încerca să sune „perfect”
.
Încearcă să sune REAL.
Un antrenor real:
- nu vorbește ca într-un manual
- nu explică excesiv
- nu alege mereu formularea cea mai elegantă
- spune lucrurile simplu și clar
Preferă:
- vorbire reală
- exprimare firească
- formulări pe care le-ai folosi spontan
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
9⃣ TESTUL DE NATURALEȚE (OBLIGATORIU)
După ce generezi textul, verifică pentru fiecare parte:
□ Sună ca și cum e spusă, nu scrisă?
□ Ai auzi un antrenor român spunând asta exact așa?
□ Se înțelege din prima?
□ Curge natural când o citești cu voce tare?
□ E suficient de simplă?
□ Nu pare articol, caption sau ebook?
□ Nu pare prea „deșteaptă” sau prea formulată?
Dacă NU la oricare → RESCRIE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━
🔁 REGULĂ FINALĂ DE RESCRIERE
Pentru fiecare hook, scenă și CTA:
1. Scrie varianta inițială
2. Citește-o mental ca și cum ar fi spusă cu voce tare
3. Taie tot ce sună:
- prea scris
- prea lung
- prea elegant
- prea explicativ
4. Rescrie-o mai simplu
5. Păstrează varianta cea mai umană
Nu livra varianta care sună „bine scris”
.
Livrează varianta care sună cel mai uman.
Dacă textul sună bine ca scris, dar prost ca vorbit, nu este bun.
Natural > elegant
Uman > perfect
Vorbit > redactat
Clar > impresionant
`;

export async function generateDailyIdea(input: DailyIdeaInput): Promise<DailyIdeaResult> {
  const objective = input.objective || 'lead-gen';
  const recentIdeasSection = buildRecentIdeasSection(input.recentIdeas);
  const brandVoiceSection = buildBrandVoiceSection(input.contentPreferences);
  const contentCreationSection = buildContentCreationSection(input.contentPreferences);
  const icpProfileText =
    input.icpProfile == null
      ? 'Nu există profil de client ideal salvat. Folosește exclusiv nișa pentru specificitate și nu inventa detalii foarte precise despre client.'
      : typeof input.icpProfile === 'string'
        ? input.icpProfile
        : JSON.stringify(input.icpProfile);
  
  const prompt = `Tu ești un expert în content marketing fitness cu focus pe conversii reale.

TOT OUTPUT-UL TREBUIE SĂ FIE EXCLUSIV ÎN ROMÂNĂ NATURALĂ, CORECTĂ GRAMATICAL ȘI UȘOR DE ÎNȚELES PENTRU OAMENI DIN ROMÂNIA.
NU traduce din engleză. NU folosi jargon englezesc dacă există variantă clară în română. Scrie ca un antrenor român real, pentru public român.

CONTEXT CLIENT (CITEȘTE CU ATENȚIE - TOATE IDEILE TREBUIE SĂ FIE DESPRE ACEASTĂ NIȘĂ):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 NIȘA EXACTĂ: "${input.niche}"
👤 CLIENT IDEAL: ${icpProfileText}
🎯 OBIECTIV: ${objective === 'lead-gen' ? 'generare lead-uri prin DM' : objective}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BRAND VOICE (OBLIGATORIU - SCRIPTUL TREBUIE SĂ SUNE CA ANTRENORUL):
${brandVoiceSection}

PREFERINȚE "CUM VREI SĂ CREEZI CONTENT?" (CONTEXT GLOBAL):
${contentCreationSection}

REGULI DE APLICARE PENTRU PREFERINȚELE DE CREARE CONTENT:
1. Dacă există preferințe de filmare/livrare, adaptează ideea la ele.
2. Când propui scene/visual-uri, prioritizează contextul de filmare selectat.
3. Formatele și stilul de exprimare trebuie să țină cont de ce îi vine natural creatorului.
4. Dacă există "Mix, în funcție de zi", poți combina stilurile, dar păstrează coerența.

REGULI BRAND VOICE (OBLIGATORIU):
1. Tonul, formulările și energia trebuie să respecte Brand Voice-ul de mai sus.
2. Evită explicit stilurile marcate la "Nu vrea niciodată în content".
3. Folosește natural 1-2 expresii din lista antrenorului (dacă există).
4. CTA-ul trebuie să respecte stilul CTA selectat.
5. Umorul (dacă apare) respectă nuanța setată.

REGULI AVANSATE HOOK + SCRIPT + CTA (OBLIGATORIU):
${DAILY_IDEA_ADVANCED_RULES}

🔵 REGULA CORECTĂ
Exercițiile recomandate trebuie să fie corecte tehnic și adaptate specific la ideea generată, potrivite pentru nivelul, contextul și limitările definite de nișă.

⚠️ IMPORTANT - CITEȘTE ÎNAINTE DE A GENERA:
Această idee TREBUIE să fie 100% specifică nisei: "${input.niche}"
NU genera content generic despre fitness/slăbit - vorbește EXACT despre nișa de mai sus!

ISTORIC IDEI RECENTE (TREBUIE EVITATE REPETIȚIILE):
${recentIdeasSection}

REGULI DE UNICITATE (OBLIGATORIU):
1. Propune o idee cu unghi NOU față de istoricul de mai sus.
2. NU reutiliza hook-uri, teme, structuri narative sau CTA-uri similare cu ideile recente.
3. Dacă observi pattern-uri repetitive în istoric, schimbă explicit:
   - mecanismul/problema abordată
   - promisiunea principală
   - tipul de exemplu practic
4. Ideea trebuie să fie distinctă semantic, nu doar reformulată.

Generează o idee completă de postare Instagram/TikTok care:
1. Hook-ul TREBUIE să menționeze direct problema/audiența din nișă (ex: pentru "mame după sarcină" → hook despre mame, nu generic)
2. Script-ul rezolvă PROBLEMA SPECIFICĂ a clientului ideal descris mai sus
3. CTA-ul oferă un lead magnet RELEVANT pentru nișă
4. Fiecare scenă vorbește DIRECT către clientul ideal
5. Evită orice generalizări - fii SPECIFIC și TARGETAT

REGULI STRICTE:
✗ NU folosi hook-uri generice ("Vrei să slăbești?", "3 trucuri pentru...")
✓ Folosește hook-uri specifice nisei ("Mamă după sarcină? Acestea sunt greșelile care te blochează...")
✗ NU oferi sfaturi generale de fitness
✓ Oferă soluții EXACTE pentru problema clientului ideal
✗ NU crea lead magnets generice
✓ Creează lead magnets care rezolvă EXACT problema nisei

Format: Alege între REEL (30-60 sec, 4-6 scene), CAROUSEL (6-9 slide-uri) sau STORY (15 sec, 3-4 scene).

REGULĂ LINGVISTICĂ FINALĂ:
- hook-ul, scriptul, CTA-ul, lead magnetul și reasoning-ul trebuie să fie în română nativă
- fără romgleză inutilă
- fără traduceri literale
- fără formulări care sună „americanizate”
- fără expresii care ar confuza un public român
- dacă o formulare nu ar fi spusă natural într-o conversație reală în România, rescrie-o
- dacă un hook nu are sens complet de unul singur, rescrie-l
- dacă o propoziție pare „puternică”, dar nu spune clar ceva concret, rescrie-o
- claritatea și logica sunt obligatorii, nu opționale

IMPORTANT PENTRU SCRIPT - CERINȚE DETALIATE:
- Pentru fiecare scenă/slide, câmpul "text" trebuie să fie FOARTE DETALIAT și COMPLET
- Minim 4-6 propoziții per scenă (≈ 80-150 de cuvinte), în română naturală și conversațională
- Include:
  * Tranziții naturale ("Acum să-ți arăt...", "Uite ce se întâmplă...", "De ce funcționează?", "Hai să vorbim despre...")
  * Exemple SPECIFICE și CONCRETE din nișă (nu generalizări)
  * Detalii tehnice relevante (ex: "30 de minute dimineața, înainte de cafea")
  * Storytelling elements (metafore, comparații, micro-story)
  * Pain points și soluții explicite
- Pentru REEL: 5-7 scene (nu 4-6)
- Pentru CAROUSEL: 8-10 slide-uri (nu 6-9)
- Reasoning: 4-5 propoziții DETALIATE cu psihologie și strategie marketing

Răspunde DOAR în format JSON strict, fără markdown.
IMPORTANT:
- JSON valid obligatoriu
- Fără ghilimele duble ne-escape-uite în interiorul valorilor text
- Fără newline-uri literale în valorile string; folosește \\n doar dacă este necesar
- Dacă ai nevoie de citare în text, folosește apostrof simplu

FORMAT:
{
  "format": "REEL",
  "hook": "Hook vizual scurt, foarte natural și SPECIFIC (ideal 8-14 cuvinte, maxim 16)",
  "script": [
    {"scene": 1, "text": "Text DETALIAT cu 4-6 propoziții (80-150 cuvinte) - include context, tranziții, exemple specifice, storytelling", "visual": "Cadru/visual concret și descriptiv"},
    {"scene": 2, "text": "Text DETALIAT cu 4-6 propoziții (80-150 cuvinte) - include detalii tehnice, pain points, soluții clare", "visual": "Cadru/visual concret și descriptiv"},
    {"scene": 3, "text": "Text DETALIAT cu 4-6 propoziții (80-150 cuvinte)", "visual": "Visual"}
  ],
  "cta": "CTA direct, scurt și conversațional cu keyword DM + beneficiu simplu și clar",
  "objective": "Generare lead-uri",
  "conversionRate": 45.5,
  "leadMagnet": "Lead magnet FOARTE specific și detaliat pentru nișă (descrie EXACT ce primește)",
  "dmKeyword": "Keyword-ul din DM",
  "reasoning": "De ce funcționează această idee - 4-5 propoziții DETALIATE, scrise în română clară și naturală, care explică psihologia, pattern-urile de conversie, și de ce rezonează cu ICP-ul specific"
}`;

  console.log(`🎯 Generating idea for niche: "${input.niche}"`);
  console.log(`👤 ICP: ${icpProfileText.substring(0, 100)}...`);

  const content = await generateGeminiJson(prompt, 0.8, 3500);
  console.log(`✅ Gemini response received (${content.length} chars) [model=${GEMINI_MODEL}]`);
  const parsed = await parseModelJson<DailyIdeaResult>(content);
  const result = normalizeDailyIdeaResult(parsed, 'REEL');
  
  console.log(`📝 Generated idea - Format: ${result.format}, Hook: "${result.hook.substring(0, 50)}..."`);
  
  return result;
}

export async function generateMultiFormatIdea(input: DailyIdeaInput): Promise<MultiFormatIdeaResult> {
  const objective = input.objective || 'lead-gen';
  const isGeneralIdea = input.general === true;
  const recentIdeasSection = buildRecentIdeasSection(input.recentIdeas);
  const brandVoiceSection = buildBrandVoiceSection(input.contentPreferences);
  const contentCreationSection = buildContentCreationSection(input.contentPreferences);
  const icpProfileText =
    input.icpProfile == null
      ? 'Nu există profil de client ideal salvat. Folosește exclusiv nișa pentru specificitate și nu inventa detalii foarte precise despre client.'
      : typeof input.icpProfile === 'string'
        ? input.icpProfile
        : JSON.stringify(input.icpProfile);
  
  const prompt = `Generezi 3 idei de content pentru un antrenor fitness din România.

Scrie exclusiv în română naturală. Fără romgleză. Fără markdown. Fără explicații în afara JSON-ului.

CONTEXT:
- Mod: ${isGeneralIdea ? 'general' : 'bazat pe nișă'}
- Nișă: "${input.niche}"
- Client ideal: ${isGeneralIdea ? 'Public larg din România interesat de fitness, energie mai bună și obiceiuri sănătoase.' : icpProfileText}
- Obiectiv: ${objective === 'lead-gen' ? 'generare lead-uri prin DM' : objective}

BRAND VOICE:
${brandVoiceSection}

PREFERINȚE DE CREARE CONTENT:
${contentCreationSection}

ISTORIC IDEI RECENTE:
${recentIdeasSection}

REGULI:
- Cele 3 idei trebuie să fie clar diferite între ele.
- Nu reutiliza hook-uri, CTA-uri sau aceeași problemă principală din istoric.
- Toate ideile trebuie să fie specifice contextului dat.
- Hook-urile trebuie să fie complete, clare și naturale.
- CTA-ul trebuie să includă keyword DM și beneficiu clar.
- Visual-urile trebuie să fie scurte și filmabile.
- Evită formulările vagi, academice sau traduse prost.

STRUCTURĂ:
- REEL: 4 scene, 30-55 cuvinte per scenă, 1 hook, 1 CTA
- CAROUSEL: 4 scene/slides, 45-70 cuvinte per scenă, 1 hook, 1 CTA
- STORY: 4 scene, 20-45 cuvinte per scenă, 1 hook, 1 CTA

Răspunde DOAR în JSON valid.
- Folosește doar ghilimele duble corect escapate.
- Nu include newline-uri literale în stringuri.
- Nu include trailing commas.

FORMAT:
{
  "reel": {
    "format": "REEL",
    "hook": "Hook scurt și specific",
    "script": [
      {"scene": 1, "text": "Scena 1", "visual": "Vizual 1"},
      {"scene": 2, "text": "Scena 2", "visual": "Vizual 2"},
      {"scene": 3, "text": "Scena 3", "visual": "Vizual 3"},
      {"scene": 4, "text": "Scena 4", "visual": "Vizual 4"}
    ],
    "cta": "CTA cu keyword DM și beneficiu clar",
    "objective": "Generare lead-uri",
    "conversionRate": 45,
    "leadMagnet": "Lead magnet specific",
    "dmKeyword": "KEYWORD",
    "reasoning": "Explicație scurtă de ce funcționează"
  },
  "carousel": {
    "format": "CAROUSEL",
    "hook": "Hook scurt și specific",
    "script": [
      {"scene": 1, "text": "Slide 1", "visual": "Vizual 1"},
      {"scene": 2, "text": "Slide 2", "visual": "Vizual 2"},
      {"scene": 3, "text": "Slide 3", "visual": "Vizual 3"},
      {"scene": 4, "text": "Slide 4", "visual": "Vizual 4"}
    ],
    "cta": "CTA cu keyword DM și beneficiu clar",
    "objective": "Generare lead-uri",
    "conversionRate": 42,
    "leadMagnet": "Lead magnet specific",
    "dmKeyword": "KEYWORD",
    "reasoning": "Explicație scurtă de ce funcționează"
  },
  "story": {
    "format": "STORY",
    "hook": "Hook scurt și specific",
    "script": [
      {"scene": 1, "text": "Scena 1", "visual": "Vizual 1"},
      {"scene": 2, "text": "Scena 2", "visual": "Vizual 2"},
      {"scene": 3, "text": "Scena 3", "visual": "Vizual 3"},
      {"scene": 4, "text": "Scena 4", "visual": "Vizual 4"}
    ],
    "cta": "CTA cu keyword DM și beneficiu clar",
    "objective": "Generare lead-uri",
    "conversionRate": 38,
    "leadMagnet": "Lead magnet specific",
    "dmKeyword": "KEYWORD",
    "reasoning": "Explicație scurtă de ce funcționează"
  }
}`;

  console.log(`🎯 Generating multi-format ideas for niche: "${input.niche}"`);

  const parseResponse = async () => {
    const content = await generateGeminiJson(prompt, 0.8, 6000);
    console.log(`✅ Gemini multi-format response received (${content.length} chars) [model=${GEMINI_MODEL}]`);

    try {
      const parsed = await parseModelJson<MultiFormatIdeaResult>(content);
      return normalizeMultiFormatIdeaResult(parsed);
    } catch (error) {
      console.warn(`Gemini multi-format raw preview: ${previewModelResponse(content)}`);
      throw error;
    }
  };

  let result: MultiFormatIdeaResult;
  try {
    result = await parseResponse();
  } catch (error) {
    console.warn('Multi-format idea parsing failed on first attempt, switching to tagged fallback:', error);

    try {
      result = await generateMultiFormatIdeaTaggedFallback(input);
      console.log(`✅ Gemini multi-format tagged fallback succeeded [model=${GEMINI_MODEL}]`);
    } catch (fallbackError) {
      console.warn('Multi-format tagged fallback failed, using emergency local fallback:', fallbackError);
      result = buildMultiFormatIdeaEmergencyResult(input);
      console.log('✅ Multi-format emergency local fallback succeeded');
    }
  }

  result.source = result.source || 'ai';
  
  console.log(`📝 Generated 3 formats - REEL: "${result.reel.hook.substring(0, 30)}..." | CAROUSEL: "${result.carousel.hook.substring(0, 30)}..." | STORY: "${result.story.hook.substring(0, 30)}..."`);
  
  return result;
}

export async function structureUserIdea(input: {
  ideaText: string;
  niche: string;
  contentPreferences?: any;
}): Promise<StructuredIdeaResult> {
  const { prompt, ctaStyle } = buildStructuredIdeaPrompt(input);
  let normalizedResult: StructuredIdeaResult;
  const resolveGuaranteedStructuredIdea = async (): Promise<StructuredIdeaResult> => {
    try {
      const taggedFallback = await generateStructuredIdeaTaggedFallback(input, ctaStyle);
      return isStructuredIdeaResultIncomplete(taggedFallback)
        ? buildStructuredIdeaEmergencyResult(input)
        : taggedFallback;
    } catch (error) {
      console.warn('Structured idea tagged fallback failed, using emergency fallback:', error);
      return buildStructuredIdeaEmergencyResult(input);
    }
  };

  const parsePrimaryStructuredIdea = async (): Promise<StructuredIdeaResult> => {
    const content = await generateGeminiJson(prompt, 0.45, 3400);
    return normalizeStructuredIdeaResult(
      await parseModelJson<StructuredIdeaResult>(content),
      ctaStyle
    );
  };

  try {
    try {
      normalizedResult = await parsePrimaryStructuredIdea();
    } catch (error) {
      console.warn('Structured idea primary parsing failed on first attempt, retrying once:', error);
      normalizedResult = await parsePrimaryStructuredIdea();
    }
  } catch (error) {
    console.warn('Structured idea JSON parsing failed, switching to tagged fallback:', error);
    return resolveGuaranteedStructuredIdea();
  }

  if (!isStructuredIdeaResultIncomplete(normalizedResult)) {
    return normalizedResult;
  }

  try {
    const completedResult = await generateStructuredIdeaFallback(input, normalizedResult, ctaStyle);
    return isStructuredIdeaResultIncomplete(completedResult)
      ? await resolveGuaranteedStructuredIdea()
      : completedResult;
  } catch (error) {
    console.warn('Structured idea completion fallback failed, switching to tagged fallback:', error);
    return resolveGuaranteedStructuredIdea();
  }
}

// ==================== WHISPER TRANSCRIPTION ====================

export interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
}

function getAudioMimeType(audioFilePath: string): string {
  const normalizedPath = audioFilePath.toLowerCase();

  if (normalizedPath.endsWith('.mp3')) {
    return 'audio/mpeg';
  }

  if (normalizedPath.endsWith('.wav')) {
    return 'audio/wav';
  }

  if (normalizedPath.endsWith('.m4a')) {
    return 'audio/mp4';
  }

  if (normalizedPath.endsWith('.ogg')) {
    return 'audio/ogg';
  }

  return 'application/octet-stream';
}

async function transcribeAudioWithGemini(audioFilePath: string): Promise<TranscriptionResult> {
  const audioBase64 = readFileSync(audioFilePath).toString('base64');
  const content = await createGeminiPartsText(
    [
      {
        text:
          'Transcribe this audio in Romanian. Return only the spoken words, without commentary, labels, timestamps, or formatting cleanup beyond normal punctuation.',
      },
      {
        inline_data: {
          mime_type: getAudioMimeType(audioFilePath),
          data: audioBase64,
        },
      },
    ],
    {
      temperature: 0,
      maxTokens: 4096,
    }
  );

  return {
    text: content.trim(),
    language: 'ro',
  };
}

export async function transcribeAudio(audioFilePath: string): Promise<TranscriptionResult> {
  try {
    console.log(`🎙️ Transcribing audio from: ${audioFilePath}`);

    if (process.env.OPENAI_API_KEY) {
      const transcription = await getTranscriptionClient().audio.transcriptions.create({
        file: createReadStream(audioFilePath),
        model: 'whisper-1',
        language: 'ro',
        response_format: 'verbose_json',
      });

      console.log(`✅ OpenAI transcription complete: ${transcription.text.substring(0, 100)}...`);

      return {
        text: transcription.text,
        language: transcription.language,
        duration: transcription.duration,
      };
    }

    const transcription = await transcribeAudioWithGemini(audioFilePath);
    console.log(`✅ Gemini transcription complete: ${transcription.text.substring(0, 100)}...`);
    return transcription;
  } catch (error: any) {
    console.error('❌ Audio transcription failed:', error);
    throw new Error(`Transcription failed: ${error.message}`);
  }
}

// ==================== CONTENT FEEDBACK ====================

export interface ContentFeedbackInput {
  fileType: 'video' | 'image';
  fileUrl: string;
  duration?: number;
  niche?: string; // Optional context
  transcription?: string; // Whisper transcription for video
}

export interface Suggestion {
  type: 'error' | 'warning' | 'success';
  category: string;
  text: string;
}

export interface ContentFeedbackResult {
  clarityScore: number;
  relevanceScore: number;
  trustScore: number;
  ctaScore: number;
  overallScore: number;
  suggestions: Suggestion[];
  summary: string;
  transcription?: string; // Return transcription for video
}

function clampScore(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeSuggestion(entry: any): Suggestion | null {
  const type = entry?.type;
  const category = typeof entry?.category === 'string' ? entry.category.trim() : '';
  const text = typeof entry?.text === 'string' ? entry.text.trim() : '';

  if (!text) {
    return null;
  }

  return {
    type: type === 'error' || type === 'warning' || type === 'success' ? type : 'warning',
    category: category || 'general',
    text,
  };
}

function buildFeedbackFallbackSummary(input: ContentFeedbackInput, suggestions: Suggestion[]): string {
  const context = input.transcription
    ? 'Analiza s-a bazat pe transcripția audio extrasă din video.'
    : 'Analiza s-a bazat pe best practices generale pentru acest tip de conținut.';
  const topSuggestion = suggestions[0]?.text
    ? `Prima prioritate: ${suggestions[0].text}`
    : 'Prima prioritate: clarifică mesajul, adaugă dovadă socială și încheie cu un CTA explicit.';

  return `${context} Conținutul are nevoie de îmbunătățiri pe claritate, încredere și conversie. ${topSuggestion}`;
}

function normalizeContentFeedbackResult(
  parsed: Partial<ContentFeedbackResult> | null | undefined,
  input: ContentFeedbackInput
): ContentFeedbackResult {
  const suggestions = Array.isArray(parsed?.suggestions)
    ? parsed.suggestions.map((entry) => normalizeSuggestion(entry)).filter((entry): entry is Suggestion => Boolean(entry))
    : [];

  const fallbackSuggestions: Suggestion[] = [
    {
      type: 'warning',
      category: 'clarity',
      text: 'Mesajul principal nu este încă suficient de clar. Spune explicit din prima propoziție cui te adresezi și ce rezultat promiți.',
    },
    {
      type: 'warning',
      category: 'trust',
      text: 'Adaugă un element de credibilitate: exemplu personal, rezultat concret sau dovadă socială.',
    },
    {
      type: 'error',
      category: 'cta',
      text: 'Încheie cu un CTA specific și acționabil, nu cu o formulare vagă sau implicită.',
    },
  ];

  const normalizedSuggestions: Suggestion[] =
    suggestions.length > 0
      ? suggestions.slice(0, 5)
      : fallbackSuggestions;

  const summary =
    typeof parsed?.summary === 'string' && parsed.summary.trim().length > 0
      ? parsed.summary.trim()
      : buildFeedbackFallbackSummary(input, normalizedSuggestions);

  return {
    clarityScore: clampScore(parsed?.clarityScore),
    relevanceScore: clampScore(parsed?.relevanceScore),
    trustScore: clampScore(parsed?.trustScore),
    ctaScore: clampScore(parsed?.ctaScore),
    overallScore: clampScore(parsed?.overallScore),
    suggestions: normalizedSuggestions,
    summary,
    transcription: parsed?.transcription,
  };
}

export async function analyzeFeedback(input: ContentFeedbackInput): Promise<ContentFeedbackResult> {
  console.log(`🔍 analyzeFeedback called with:`, {
    fileType: input.fileType,
    hasNiche: !!input.niche,
    niche: input.niche?.substring(0, 50),
    hasTranscription: !!input.transcription,
    transcriptionLength: input.transcription?.length || 0,
    transcriptionPreview: input.transcription?.substring(0, 100),
  });

  const prompt = `Tu ești un expert în analiza content-ului fitness pe social media.

Analizează acest ${input.fileType === 'video' ? 'VIDEO/REEL' : 'imagine/carousel'} pentru content fitness.

${input.niche ? `📍 NIȘA: "${input.niche}"` : ''}
${input.duration ? `⏱️ DURATĂ VIDEO: ${input.duration} secunde` : ''}

${input.transcription ? `
🎙️ TRANSCRIPTION COMPLETĂ (din Whisper AI):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${input.transcription}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ IMPORTANT: TRANSCRIPȚIA DE MAI SUS ESTE CONȚINUTUL REAL AL VIDEO-ULUI!
Analizează transcripția word-by-word și evaluează calitatea conținutului video bazat pe ce se spune efectiv.
NU spune că nu ai primit video-ul - transcripția este conținutul complet audio extras din video.
` : `
⚠️ ATENȚIE: Nu există transcription pentru acest ${input.fileType}.
${input.fileType === 'video' ? 'Transcripția audio a eșuat. ' : ''}
Oferă o analiză generică bazată pe best practices.
`}

Evaluează pe 4 criterii (0-100)${input.transcription ? ' BAZAT PE TRANSCRIPȚIA DE MAI SUS' : ''}:

1. CLARITATE (0-100): 
   ${input.transcription ? `
   - Citește transcripția și evaluează dacă mesajul este clar
   - Verifică structura logică a cuvintelor spuse
   - Hook-ul din primele 3-5 secunde oprește scroll-ul?
   - Livrarea este clară și ușor de urmărit?
   ` : `
   - Mesajul este ușor de înțeles? 
   - Structura este logică?
   - Hook-ul oprește scroll-ul?
   `}

2. RELEVANȚĂ (0-100):
   - Vorbește direct problemelor audienței fitness?
   - Este specific pentru nișă?
   - Pain points clare și reale?
   ${input.transcription ? '- Limbajul folosit rezonează cu audiența?' : ''}

3. ÎNCREDERE (0-100):
   - Include dovezi sociale, rezultate reale, autoritate?
   - Tonul inspiră încredere?
   - Evită promisiuni exagerate?
   ${input.transcription ? '- Autenticitate în livrare?' : ''}

4. CTA (0-100):
   - Call-to-action clar, specific, acționabil?
   - Este conectat natural la conținut?
   - Oferă beneficiu clar?
   ${input.transcription ? '- CTA-ul apare în transcripție?' : ''}

IMPORTANT: Dă 3-5 sugestii CONCRETE și ACȚIONABILE bazate pe ${input.transcription ? 'transcripția reală' : 'tipul de conținut'}:
- "error": Problemă MAJORĂ care blochează conversia (ex: lipsă CTA, mesaj confuz)
- "warning": Oportunitate ratată care ar putea dubla performanța
- "success": Ceva care funcționează FOARTE bine și trebuie păstrat

Răspunde DOAR în format JSON strict, fără markdown:
{
  "clarityScore": 82,
  "relevanceScore": 91,
  "trustScore": 68,
  "ctaScore": 45,
  "overallScore": 72,
  "suggestions": [
    {
      "type": "error",
      "category": "cta",
      "text": "Sugestie concretă și acționabilă bazată pe conținutul real"
    },
    {
      "type": "warning",
      "category": "hook",
      "text": "Sugestie concretă pentru îmbunătățire"
    },
    {
      "type": "success",
      "category": "relevance",
      "text": "Ce funcționează foarte bine"
    }
  ],
  "summary": "Rezumat în 2-3 propoziții: ce funcționează, ce lipsește, și impactul potențial după îmbunătățiri"
}`;

  console.log(`🤖 Analyzing content with Gemini${input.transcription ? ' (with Whisper transcription)' : ''}...`);
  
  const messages = input.transcription ? [
    { 
      role: 'system' as const, 
      content: 'You are analyzing fitness content. When a transcription is provided, it represents the COMPLETE audio content of the video. Analyze it thoroughly and provide specific feedback based on what was actually said. DO NOT say you did not receive the content - the transcription IS the content.' 
    },
    { role: 'user' as const, content: prompt }
  ] : [
    { role: 'user' as const, content: prompt }
  ];

  const content =
    (await generateGeminiTextFromMessages(messages, 0.6, 1500)) || '{}';
  console.log(`🧾 Raw content analysis preview: ${previewModelResponse(content, 200)}`);
  const parsed = await parseModelJson<Partial<ContentFeedbackResult>>(content);
  const result = normalizeContentFeedbackResult(parsed, input);
  
  // Include transcription in response
  if (input.transcription) {
    result.transcription = input.transcription;
  }
  
  console.log(`✅ Analysis complete - Overall: ${result.overallScore}/100`);
  return result;
}

// ==================== QUESTIONNAIRE: DISCOVER NICHE (PHASE A) ====================

export interface NicheDiscoverPhaseAInput {
  gender: string;
  ageRanges: string[];
  valueSituations: string[];
  commonProblems: string[];
  primaryOutcome: string;
  avoidContent: string[];
}

export interface NicheVariant {
  variant: string;
  description: string;
}

export interface PresetNicheOption {
  niche: string;
  description: string;
}

function buildPresetNicheDescription(niche: string): string {
  const normalized = niche.toLowerCase();

  if (normalized.includes('post-partum') || normalized.includes('postpartum') || normalized.includes('post-natal')) {
    return 'Pentru femei care vor să revină în formă după sarcină, cu un plan sigur, realist și adaptat perioadei post-partum.';
  }

  if (normalized.includes('femei')) {
    return 'Pentru femei care vor rezultate vizibile printr-un proces clar, sustenabil și ușor de urmat.';
  }

  if (normalized.includes('bărbați') || normalized.includes('barbati')) {
    return 'Pentru bărbați care vor să slăbească, să arate mai bine și să urmeze un plan simplu, fără complicații inutile.';
  }

  if (normalized.includes('35+') || normalized.includes('40+') || normalized.includes('persoane 35')) {
    return 'Pentru adulți care vor mai multă energie, mai puțină grăsime și un program potrivit ritmului lor de viață.';
  }

  if (normalized.includes('începători') || normalized.includes('incepatori') || normalized.includes('sedentari')) {
    return 'Pentru persoane care pornesc de la zero și au nevoie de pași clari ca să capete consistență și rezultate reale.';
  }

  return `Pentru persoane interesate de ${niche.toLowerCase()}, cu focus pe rezultate clare și un proces ușor de urmat.`;
}

const PRESET_NICHE_FALLBACKS: PresetNicheOption[] = [
  {
    niche: 'Slăbire pentru femei ocupate 30-45',
    description:
      'Pentru femei care vor să slăbească sustenabil, fără diete extreme, chiar dacă au un program aglomerat.',
  },
  {
    niche: 'Tonifiere și revenire post-natală',
    description:
      'Pentru mame care vor să-și recapete energia, tonusul și încrederea după sarcină, cu pași siguri și realiști.',
  },
  {
    niche: 'Transformare pentru bărbați ocupați',
    description:
      'Pentru bărbați care vor să dea jos grăsimea abdominală și să arate mai bine, fără să petreacă ore în sală.',
  },
  {
    niche: 'Fitness pentru începători sedentari',
    description:
      'Pentru persoane care pornesc de la zero și au nevoie de un plan simplu ca să slăbească și să prindă consistență.',
  },
  {
    niche: 'Recompunere corporală pentru persoane 35+',
    description:
      'Pentru adulți care vor să piardă grăsime, să-și păstreze masa musculară și să aibă mai multă energie după 35 de ani.',
  },
];

function normalizeNicheVariantEntry(value: unknown, index: number): NicheVariant | null {
  if (typeof value === 'string') {
    const variant = value.trim();
    return variant ? sanitizeNicheVariant({ variant, description: '' }, index) : null;
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const source = value as Record<string, unknown>;
  const variant = normalizeTextValue(
    source.variant ?? source.title ?? source.niche ?? source.name ?? source.option
  );
  const description = normalizeTextValue(
    source.description ?? source.details ?? source.reasoning ?? source.summary
  );

  if (!variant) {
    return null;
  }

  return sanitizeNicheVariant({
    variant,
    description: description || `Varianta ${index + 1}`,
  }, index);
}

function normalizeDiscoverAudience(input: NicheDiscoverPhaseAInput): string {
  if (input.gender === 'femei') {
    return 'femei';
  }

  if (input.gender === 'barbati') {
    return 'bărbați';
  }

  return 'persoane';
}

function normalizeDiscoverAge(input: NicheDiscoverPhaseAInput): string {
  return input.ageRanges.length ? input.ageRanges.join(', ') : '25-45';
}

function normalizeOutcomeForTitle(value: string): string {
  const normalized = normalizeTextValue(value);
  if (!normalized) {
    return 'Rezultate sustenabile';
  }

  if (/^să\s+/i.test(normalized)) {
    const lower = normalized.toLowerCase();
    if (lower.includes('slabeasca')) return 'Slăbire sustenabilă';
    if (lower.includes('tonifieze')) return 'Tonifiere și formă fizică';
    if (lower.includes('energie')) return 'Mai multă energie și echilibru';
    return 'Progres clar și sustenabil';
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function normalizeOutcomeForSentence(value: string): string {
  const normalized = normalizeTextValue(value);
  if (!normalized) {
    return 'rezultate sustenabile';
  }

  const lower = normalized.toLowerCase();
  if (lower.startsWith('să ')) {
    return lower;
  }
  if (lower.includes('slăb')) return 'să slăbească într-un mod sustenabil';
  if (lower.includes('tonifi')) return 'să se tonifieze fără extreme';
  if (lower.includes('energie')) return 'să aibă mai multă energie și control';
  if (lower.includes('durer') || lower.includes('disconfort')) {
    return 'să scape de durere și disconfort';
  }
  return `să obțină ${normalized.toLowerCase()}`;
}

function normalizeProblemForSentence(value: string): string {
  const normalized = normalizeTextValue(value);
  if (!normalized) {
    return 'lipsa de claritate și consecvență';
  }

  const lower = normalized.toLowerCase();
  if (lower.startsWith('lipsa de ')) {
    return normalized.toLowerCase();
  }

  return normalized.charAt(0).toLowerCase() + normalized.slice(1);
}

function normalizeSituationForSentence(value: string): string {
  const normalized = normalizeTextValue(value);
  if (!normalized) {
    return 'au nevoie de o abordare realistă';
  }

  return normalized
    .replace(/^c[âa]nd\s+/i, '')
    .replace(/^că\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[A-ZĂÂÎȘȚ]/, (char) => char.toLowerCase());
}

function buildVariantDescriptionFromTitle(title: string): string {
  const normalized = normalizeTextValue(title);
  if (!normalized) {
    return 'O direcție clară, cu un public bine definit, o problemă centrală recognoscibilă și o promisiune care poate fi rafinată mai departe în pasul următor.';
  }

  return `O direcție clară pentru ${normalized.toLowerCase()}, cu un public bine conturat și un mesaj ușor de rafinat mai departe. Varianta scoate în evidență problema principală a clientului și tipul de rezultat pe care îl urmărește, fără să alunece în promisiuni exagerate.`;
}

function sanitizeNicheVariant(variant: NicheVariant, index: number): NicheVariant {
  const fallbackTitle = `Varianta ${index + 1}`;
  const cleanedTitle = normalizeTextValue(variant.variant)
    .replace(/^să\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const rawDescription = normalizeTextValue(variant.description)
    .replace(/spre să /gi, 'spre ')
    .replace(/către să /gi, 'către ')
    .replace(/că când /gi, 'că ')
    .replace(/\s+/g, ' ')
    .trim();
  const cleanedDescription =
    /^varianta\s+\d+$/i.test(rawDescription) || /^loading\.\.\.$/i.test(rawDescription)
      ? ''
      : rawDescription;

  return {
    variant: cleanedTitle || fallbackTitle,
    description: cleanedDescription || buildVariantDescriptionFromTitle(cleanedTitle || fallbackTitle),
  };
}

function buildFallbackNicheVariants(input: NicheDiscoverPhaseAInput): NicheVariant[] {
  const audience = normalizeDiscoverAudience(input);
  const ages = normalizeDiscoverAge(input);
  const topSituation = normalizeSituationForSentence(input.valueSituations[0] || '');
  const topProblem = normalizeProblemForSentence(input.commonProblems[0] || '');
  const topOutcomeTitle = normalizeOutcomeForTitle(input.primaryOutcome || '');
  const topOutcomeSentence = normalizeOutcomeForSentence(input.primaryOutcome || '');

  return [
    sanitizeNicheVariant({
      variant: `${topOutcomeTitle} pentru ${audience} ${ages}`,
      description: `Pentru ${audience} de ${ages} care ${topSituation}. Varianta vorbește despre un proces clar, realist și ușor de urmat pentru cei care vor ${topOutcomeSentence}. Se potrivește bine dacă vrei să comunici ghidaj, claritate și progres vizibil, fără presiune inutilă sau soluții extreme.`,
    }, 0),
    sanitizeNicheVariant({
      variant: `Fitness sustenabil pentru ${audience} cu program aglomerat`,
      description: `Pentru ${audience} care vor rezultate vizibile, dar se lovesc constant de ${topProblem}. Aici accentul cade pe soluții aplicabile într-un program plin, nu pe perfecțiune. Este o variantă bună dacă vrei să poziționezi antrenamentul ca ceva sustenabil, adaptat vieții reale și ușor de păstrat pe termen lung.`,
    }, 1),
    sanitizeNicheVariant({
      variant: `Transformare realistă pentru ${audience} care vor consecvență`,
      description: `Pentru ${audience} care au nevoie de structură, claritate și pași aplicabili în viața de zi cu zi. Direcția pune accent pe consecvență, încredere și rezultate sustenabile, nu pe schimbări rapide. Funcționează bine dacă vrei un mesaj mai matur, mai stabil și mai orientat spre progres pe termen lung.`,
    }, 2),
  ];
}

export async function generateNicheVariants(input: NicheDiscoverPhaseAInput): Promise<{ variants: NicheVariant[] }> {
  const prompt = `Tu ești un expert în marketing fitness. Pe baza răspunsurilor antrenorului, propune EXACT 3 variante de nișă.

RĂSPUNSURI ANTRENOR:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👥 Gen preferă să lucreze cu: ${input.gender}
🎯 Vârsta clienților care merg bine: ${input.ageRanges.join(', ')}
💡 Situații unde aduce valoare: ${input.valueSituations.join(', ')}
🚨 Problemă explicată cel mai des: ${input.commonProblems.join(', ')}
✅ Ce vrea să rezolve în 2-3 luni: ${input.primaryOutcome}
❌ Content de evitat: ${input.avoidContent.join(', ') || 'N/A'}

Creează EXACT 3 variante de nișă diferite. Fiecare variantă:
- "variant": Titlul nișei (1 propoziție scurtă, specifică)
- "description": Descriere mai detaliată (3-4 propoziții)

Pentru fiecare "description":
- explică clar cui i se potrivește varianta
- arată ce problemă principală rezolvă
- explică ce tip de rezultat promite
- spune ce unghi de mesaj sau poziționare transmite
- scrie în română naturală, clară, fără formulări corporatiste sau propoziții incomplete

Răspunde DOAR în format JSON strict, fără markdown.
IMPORTANT:
- JSON valid obligatoriu
- Fără ghilimele duble ne-escape-uite în interiorul valorilor text
- Dacă ai nevoie de citare în text, folosește apostrof simplu

FORMAT:
{
  "variants": [
    {"variant": "Titlu nișă 1", "description": "Descriere detaliată 1"},
    {"variant": "Titlu nișă 2", "description": "Descriere detaliată 2"},
    {"variant": "Titlu nișă 3", "description": "Descriere detaliată 3"}
  ]
}`;

  const content = await generateGeminiJson(prompt, 0.8, 700);
  const parsed = await parseModelJson<any>(content);
  const rawVariants = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.variants)
      ? parsed.variants
      : Array.isArray(parsed?.options)
        ? parsed.options
        : [];

  const variants = rawVariants
    .map((variant: unknown, index: number) => normalizeNicheVariantEntry(variant, index))
    .filter((variant: NicheVariant | null): variant is NicheVariant => Boolean(variant))
    .slice(0, 3);

  const usedTitles = new Set(variants.map((variant: NicheVariant) => variant.variant.toLowerCase()));
  for (const fallback of buildFallbackNicheVariants(input)) {
    if (variants.length >= 3) {
      break;
    }

    if (usedTitles.has(fallback.variant.toLowerCase())) {
      continue;
    }

    variants.push(fallback);
    usedTitles.add(fallback.variant.toLowerCase());
  }

  if (!variants.length) {
    throw new Error('No niche variants were generated');
  }

  return { variants };
}

export async function generatePresetNicheOptions(): Promise<{ niches: PresetNicheOption[] }> {
  const prompt = `Tu ești un expert în marketing fitness pentru antrenori din România.

Generează EXACT 5 nișe prestabilite în limba română pe care un fitness coach din România le-ar putea alege rapid.

CERINȚE:
- Fiecare nișă trebuie să fie clară, specifică și realistă pentru un antrenor de fitness.
- Evită formulări prea generale sau corporate.
- Variază publicul și rezultatul promis.
- "niche" = titlu scurt, clar, ușor de ales dintr-un click.
- "description" = 1-2 propoziții despre cui se adresează și ce rezultat urmărește.
- Tot output-ul trebuie să fie exclusiv în română naturală.

Răspunde DOAR în JSON strict.

FORMAT:
{
  "niches": [
    { "niche": "string", "description": "string" },
    { "niche": "string", "description": "string" },
    { "niche": "string", "description": "string" },
    { "niche": "string", "description": "string" },
    { "niche": "string", "description": "string" }
  ]
}`;

  const content = await generateGeminiJson(prompt, 0.7, 900);
  const parsed = await parseModelJson<any>(content);
  const rawNiches = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.niches)
      ? parsed.niches
      : Array.isArray(parsed?.variants)
        ? parsed.variants
        : [];

  const niches = rawNiches
    .map((entry: any) => {
      const niche = normalizeTextValue(
        entry?.niche ?? entry?.variant ?? entry?.title ?? entry?.name
      );
      const description = normalizeTextValue(
        entry?.description ?? entry?.details ?? entry?.summary
      );

      if (!niche) {
        return null;
      }

      return {
        niche,
        description: description || buildPresetNicheDescription(niche),
      };
    })
    .filter((entry: PresetNicheOption | null): entry is PresetNicheOption => Boolean(entry))
    .slice(0, 5);

  const usedTitles = new Set(niches.map((entry: PresetNicheOption) => entry.niche.toLowerCase()));

  for (const fallback of PRESET_NICHE_FALLBACKS) {
    if (niches.length >= 5) {
      break;
    }

    if (usedTitles.has(fallback.niche.toLowerCase())) {
      continue;
    }

    niches.push(fallback);
    usedTitles.add(fallback.niche.toLowerCase());
  }

  return { niches };
}

// ==================== QUESTIONNAIRE: DISCOVER NICHE (PHASE C - REFINEMENT) ====================

export interface NicheDiscoverInput {
  // Phase A answers
  gender: string;
  ageRanges: string[];
  valueSituations: string[];
  commonProblems: string[];
  primaryOutcome: string;
  avoidContent: string[];
  // Selected niche variant
  selectedNiche: string;
  // Phase C (refinement) answers
  awarenessLevel?: string;
  identityStory?: string;
  clientStatement: string;
  dominantGoals: string[];
  primaryGoal: string;
  wakeUpTime?: string;
  jobType?: string;
  sittingTime?: string;
  morning?: string[];
  lunch?: string[];
  evening?: string[];
  definingSituations?: string[];
  notes?: string;
}

export async function generateNicheDiscover(input: NicheDiscoverInput): Promise<NicheResult> {
  const prompt = `Tu ești un expert în marketing fitness. Antrenorul a ales nișa "${input.selectedNiche}" și acum vrei să o rafinezi pe baza răspunsurilor detaliate.

Creează:
1. Nișa RAFINATĂ și specifică (1 propoziție precisă, bazată pe "${input.selectedNiche}" dar mai precizată)
2. Profilul clientului ideal ULTRA-DETALIAT (5-6 paragrafe care combină tot ce știi)
3. Mesaj de poziționare puternic (2-3 propoziții, unique value proposition)

CONTEXTUL INIȚIAL (Faza A):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👥 Gen: ${input.gender}
🎯 Vârstă: ${input.ageRanges.join(', ')}
💡 Situații valoare: ${input.valueSituations.join(', ')}
🚨 Problemă frecventă: ${input.commonProblems.join(', ')}
✅ Obiectiv 2-3 luni: ${input.primaryOutcome}
❌ Content de evitat: ${input.avoidContent.join(', ') || 'N/A'}

NIȘA ALEASĂ (Faza B):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 "${input.selectedNiche}"

RAFINARE (Faza C):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 Nivel awareness: "${input.awarenessLevel || 'N/A'}"
🪞 Poveste identitate: "${input.identityStory || 'N/A'}"
🚧 Blocaj principal: "${input.clientStatement}"
🎯 Obiective: ${input.dominantGoals.join(', ')}
⭐ Obiectiv principal: ${input.primaryGoal}

ZIUA TIPICĂ A CLIENTULUI:
⏰ Trezire: ${input.wakeUpTime || 'N/A'}
💼 Job: ${input.jobType || 'N/A'}
🪑 Timp șezând: ${input.sittingTime || 'N/A'}
🌅 Dimineața: ${input.morning?.join(', ') || 'N/A'}
🍽️ Prânz: ${input.lunch?.join(', ') || 'N/A'}
🌙 Seara: ${input.evening?.join(', ') || 'N/A'}
⭐ Situații: ${input.definingSituations?.join(', ') || 'N/A'}
${input.notes ? `📝 Note: ${input.notes}` : ''}

INSTRUCȚIUNI:
- "niche": Rafinează nișa aleasă să fie SUPER precisă (include vârsta, situația, obiectivul principal)
- "idealClient": Scrie 5-6 paragrafe DETALIATE în proză (nu bullet points):
  * Paragraf 1: Cine sunt (demografic + situație de viață)
  * Paragraf 2: Rutina zilnică (de la trezire la culcare)
  * Paragraf 3: Pain points și frustrări (awareness + identitate + blocaje)
  * Paragraf 4: Obiective și motivații (ce vor cu adevărat)
  * Paragraf 5-6: De ce alte soluții nu au funcționat + ce îi face unici
- "positioning": Mesaj puternic care vorbește direct despre problema lor principală

Răspunde DOAR în format JSON strict, fără markdown.
IMPORTANT:
- JSON valid obligatoriu
- Fără ghilimele duble ne-escape-uite în interiorul valorilor text
- Dacă ai nevoie de citare în text, folosește apostrof simplu

FORMAT:
{
  "niche": "Nișa ta RAFINATĂ aici",
  "idealClient": "Profilul ULTRA-DETALIAT (5-6 paragrafe în proză)",
  "positioning": "Mesajul tău de poziționare puternic"
}`;

  const content = await generateGeminiJson(prompt, 0.7, 1200);
  const parsed = await parseModelJson<Partial<NicheResult>>(content);
  const contextHint = [
    `nișa selectată ${input.selectedNiche}`,
    `gen ${input.gender}`,
    `vârste ${input.ageRanges.join(', ')}`,
    `probleme ${input.commonProblems.join(', ')}`,
    `obiectiv ${input.primaryOutcome}`,
    `blocaj ${input.clientStatement}`,
    `obiectiv principal ${input.primaryGoal}`,
  ]
    .filter(Boolean)
    .join('; ');
  const fallbackNiche = buildDiscoverFallbackNiche(input);
  return ensureCompleteNicheResult(
    parsed,
    contextHint,
    fallbackNiche,
    buildDiscoverFallbackIdealClient(input, fallbackNiche),
    buildDiscoverFallbackPositioning(input, fallbackNiche)
  );
}

// ==================== QUESTIONNAIRE: ICP DAY ====================

export interface ICPDayInput {
  gender: string;
  ageRanges: string[];
  wakeUpTime?: string;
  jobType?: string;
  sittingTime?: string;
  morning?: string[];
  lunch?: string[];
  evening?: string[];
  definingSituations?: string[];
  notes?: string;
}

export async function generateICPDay(input: ICPDayInput): Promise<{ icpProfile: string }> {
  const prompt = `Tu ești un expert în marketing fitness. Pe baza informațiilor despre ziua tipică a clientului ideal, creează un profil ICP detaliat (3-4 paragrafe) care descrie:

1. Demografic (gen, vârstă)
2. Rutina zilnică (job, program, mese)
3. Pain points și obstacole
4. Situații definitorii

INFORMAȚII CLIENT IDEAL:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👥 Gen: ${input.gender}
🎯 Vârstă: ${input.ageRanges.join(', ')}
⏰ Trezire: ${input.wakeUpTime || 'N/A'}
💼 Tip job: ${input.jobType || 'N/A'}
🪑 Timp șezând: ${input.sittingTime || 'N/A'}
🌅 Dimineața: ${input.morning?.join(', ') || 'N/A'}
🍽️ Prânz: ${input.lunch?.join(', ') || 'N/A'}
🌙 Seara: ${input.evening?.join(', ') || 'N/A'}
⭐ Situații definitorii: ${input.definingSituations?.join(', ') || 'N/A'}
${input.notes ? `📝 Note: ${input.notes}` : ''}

Scrie un profil de client ideal natural, în română, 3-4 paragrafe. NU folosi bullet points, doar proză.

Răspunde DOAR cu textul profilului (fără JSON, fără markdown).`;

  const icpProfile = (await generateGeminiText(prompt, 0.7, 700)) || '';
  return { icpProfile };
}

// ==================== TEXT CONTENT FEEDBACK ====================

export interface TextContentFeedbackInput {
  text: string;
  format: string; // 'reel', 'carousel', 'story', 'general'
  niche?: string;
  icpProfile?: any;
  positioningMessage?: string;
  toneOfVoice?: string;
}

export async function analyzeTextContent(input: TextContentFeedbackInput): Promise<ContentFeedbackResult> {
  const formatInstructions = {
    reel: 'REEL (30-60 secunde, 4-6 scene): Hook dinamic, script energic, vizual puternic',
    carousel: 'CAROUSEL (6-9 slide-uri): Hook intrigant, fiecare slide = un pas/idee, perfect pentru liste',
    story: 'STORY (15 secunde, 3-4 scene): Hook instant, mesaj concentrat, urgență maximă',
    general: 'POST general: Claritateși mesaj clar',
  };

  const formatGuide = formatInstructions[input.format as keyof typeof formatInstructions] || formatInstructions.general;

  // Build personalized context
  let contextSection = '';
  if (input.niche) {
    contextSection += `📍 NIȘA TA: "${input.niche}"\n`;
  }
  if (input.icpProfile) {
    const icpText = typeof input.icpProfile === 'string' ? input.icpProfile : JSON.stringify(input.icpProfile);
    contextSection += `👤 CLIENTUL TĂU IDEAL: ${icpText.substring(0, 300)}${icpText.length > 300 ? '...' : ''}\n`;
  }
  if (input.positioningMessage) {
    contextSection += `🎯 OFERTA TA: "${input.positioningMessage}"\n`;
  }
  if (input.toneOfVoice) {
    contextSection += `🗣️ TON: "${input.toneOfVoice}"\n`;
  }

  const prompt = `Tu ești un expert în analiza content-ului fitness pe social media specializat în conversii.

${contextSection ? `CONTEXTUL TĂU PERSONAL:\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${contextSection}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` : ''}FORMAT POSTARE: ${formatGuide}

TEXTUL POSTAT:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${input.text}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Analizează acest conținut și evaluează pe 4 criterii (0-100):

1. **CLARITATE (0-100)**: 
   - Hook-ul captează atenția în primele 3 secunde/cuvinte?
   - Mesajul e clar și ușor de înțeles?
   - Structura e logică (problemă → agitație → soluție → CTA)?
   ${contextSection ? `- Vorbește direct către CLIENTUL TĂU IDEAL din profilul de mai sus?` : ''}

2. **RELEVANȚĂ (0-100)**: 
   - Conținutul vorbește despre problemele reale ale audienței fitness?
   ${input.niche ? `- E specific pentru nișa "${input.niche}"?` : ''}
   ${input.icpProfile ? `- Se adresează direct pain points-urilor clientului tău ideal?` : ''}
   - Evită generalizări și e targetat?

3. **ÎNCREDERE (0-100)**: 
   - Include dovezi sociale (rezultate, testimoniale, statistici)?
   - Antrenorul apare credibil și autoritar?
   - Are social proof sau proof of results?
   ${input.positioningMessage ? `- Reflectă unique value proposition-ul: "${input.positioningMessage}"?` : ''}

4. **CTA (0-100)**: 
   - Call-to-action este clar, specific și acționabil?
   - Include keyword pentru DM (ex: "Scrie PLAN în DM")?
   - Oferă un lead magnet relevant?
   ${input.niche ? `- Lead magnet-ul rezolvă problema specifică nișei?` : ''}

IMPORTANT: Generează 5-8 sugestii ULTRA-SPECIFICE, DETALIATE și ACȚIONABILE:
- **"error"** (roșu): Problemă MAJORĂ care blochează conversia - trebuie fixată imediat
  ${contextSection ? `Exemplu COMPLET: "Hook-ul e generic și nu captează atenția nișei tale. Pentru '${input.niche}', înlocuiește hook-ul actual cu: '[hook specific și COMPLET adaptat nișei - 2-3 propoziții cu exemplu concret]'. Asta va crește retention cu 35-40% pentru că vorbește direct către pain point-ul principal al clientului tău ideal: [pain point specific din ICP]."` : 'Exemplu COMPLET: "Lipsește CTA-ul complet, ceea ce blochează 60-70% din conversii potențiale. Adaugă la final (după scenă/slide X): \'Scrie KEYWORD în DM acum și primești [descriere COMPLETĂ lead magnet cu beneficii specifice]\'. Fără CTA clar, pierzi lead-urile chiar dacă content-ul e bun."'}
- **"warning"** (galben): Oportunitate ratată care ar putea dubla performanța - include explicație DETALIATĂ
  ${input.icpProfile ? `Exemplu COMPLET: "Nu menționezi [pain point SPECIFIC din ICP]. În scenă/slide 2-3, adaugă: '[soluție COMPLETĂ și SPECIFICĂ cu pași concreți - 3-4 propoziții]'. Asta rezonează direct cu clientul tău ideal care se confruntă zilnic cu [situație specifică din ICP]. Ar putea crește engagement-ul cu 45-50%."` : 'Exemplu COMPLET: "Lipsă social proof = oportunitate URIAȘĂ ratată. Adaugă în scenă 3: \'Rezultate reale: [nume client] a slăbit X kg în Y zile, [alt client] și-a redus [metric specific] cu Z%. Vezi testimoniale complete la [link/bio].\' Social proof-ul poate crește trustul cu 60-80% și conversiile cu 30-40%."'}
- **"success"** (verde): Ceva care funcționează FOARTE bine - continuă așa! Include explicație psihologică DETALIATĂ
  Exemplu COMPLET: "Hook-ul captează PERFECT atenția cu pattern interrupt puternic - folosești [tehnică specifică] care oprește scroll-ul instantaneu. Rezultat: retention de 40-50% în primele 3 secunde (vs. media de 15-20%). Continuă cu această strategie pentru toate postările - funcționează exceptional pentru nișa ta pentru că [explicație psihologică detaliată 2-3 propoziții]."

${contextSection ? `\n⚠️ CRITICI BRUTALE: Fii EXTREM de specific și detaliat - folosește COMPLET contextul personal (nișa, profilul clientului detaliat, positioning, ton) pentru sugestii ULTRA-PERSONALIZATE cu exemple COMPLETE. NU da sfaturi generice de 1 rând! Fiecare sugestie = 4-6 propoziții cu:
  1. Ce e problema/oportunitatea EXACT
  2. Ce să facă CONCRET (cu exemplu COMPLET de text/script)
  3. DE CE funcționează (psihologie, date, impact pe conversie)
  4. Cum se leagă de nișa/ICP-ul său SPECIFIC` : '\n⚠️ Fiecare sugestie trebuie să fie FOARTE DETALIATĂ (4-6 propoziții) cu exemple COMPLETE de ce să adauge/schimbe.'}

Categorii pentru sugestii: "hook", "clarity", "social-proof", "cta", "structure", "relevance", "trust", "format", "storytelling", "pain-points", "positioning"

Răspunde DOAR în format JSON strict, fără markdown:
{
  "clarityScore": 82,
  "relevanceScore": 91,
  "trustScore": 68,
  "ctaScore": 45,
  "overallScore": 72,
  "suggestions": [
    {
      "type": "error",
      "category": "cta",
      "text": "Sugestie ULTRA-DETALIATĂ cu 4-6 propoziții: problema exact, ce să facă CONCRET cu exemplu COMPLET de text, de ce funcționează (psihologie + date), cum se leagă de nișa/ICP specific"
    },
    {
      "type": "warning",
      "category": "social-proof",
      "text": "Sugestie ULTRA-DETALIATĂ cu 4-6 propoziții: oportunitatea, exemplu COMPLET de ce să adauge, impact pe conversie, legătură cu audiența specifică"
    },
    {
      "type": "success",
      "category": "hook",
      "text": "Ce funcționează FOARTE bine - 4-6 propoziții DETALIATE: ce anume e bun, de ce funcționează (psihologie detaliată), rezultate așteptate, cum să replice strategia"
    },
    {
      "type": "warning",
      "category": "pain-points",
      "text": "Sugestie ULTRA-DETALIATĂ 4-6 propoziții"
    },
    {
      "type": "error",
      "category": "relevance",
      "text": "Sugestie ULTRA-DETALIATĂ 4-6 propoziții"
    }
  ],
  "summary": "Rezumat DETALIAT în 4-6 propoziții: (1) Ce funcționează bine și de ce, (2) Top 2-3 probleme PRIORITARE cu impact pe conversie, (3) Ce să îmbunătățească EXACT (cu pași concreți) pentru +X puncte overall, (4) Cum să folosească mai bine nișa și profilul clientului specific${contextSection ? ` - include referințe DIRECTE la '${input.niche}' și la pain points-urile din ICP` : ''}"
}`;

  console.log(`📝 Analyzing ${input.format} text content (${input.text.length} chars)${input.niche ? ` for niche: "${input.niche}"` : ''}...`);

  const content = (await generateGeminiText(prompt, 0.6, 3000)) || '{}';
  console.log(`✅ Text analysis completed (${content.length} chars response)`);
  
  const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
  const result = JSON.parse(cleaned);
  
  console.log(`📊 Scores: Clarity ${result.clarityScore}, Relevance ${result.relevanceScore}, Trust ${result.trustScore}, CTA ${result.ctaScore} → Overall ${result.overallScore}`);
  
  return result;
}

// ==================== EMAIL MARKETING ====================

export interface GenerateMarketingEmailInput {
  topic: string;
  objective: 'lead-magnet' | 'nurture' | 'sales' | 'reengagement';
  emailType: 'single' | 'welcome' | 'promo' | 'newsletter';
  tone: 'direct' | 'empathetic' | 'authoritative' | 'friendly';
  offer?: string;
  audiencePain?: string;
  ctaGoal?: string;
  language: 'ro' | 'en';
  userContext: {
    name?: string;
    niche?: string;
    icpProfile?: unknown;
    positioningMessage?: string;
    contentPreferences?: unknown;
  };
}

export interface MarketingEmailResult {
  subjectOptions: string[];
  previewText: string;
  body: string;
  cta: string;
  angles: string[];
}

export async function generateMarketingEmail(
  input: GenerateMarketingEmailInput
): Promise<MarketingEmailResult> {
  const icp =
    typeof input.userContext.icpProfile === 'string'
      ? input.userContext.icpProfile
      : JSON.stringify(input.userContext.icpProfile || {});
  const contentPrefs = JSON.stringify(input.userContext.contentPreferences || {});

  const prompt = `Tu ești un expert senior în email marketing pentru antrenori fitness.

Generează un email marketing care convertește folosind contextul global al utilizatorului.

CONTEXT GLOBAL UTILIZATOR:
- Nume: ${input.userContext.name || 'N/A'}
- Nișă: ${input.userContext.niche || 'N/A'}
- ICP: ${icp || 'N/A'}
- Poziționare: ${input.userContext.positioningMessage || 'N/A'}
- Content preferences: ${contentPrefs || 'N/A'}

BRIEF EMAIL:
- Topic: ${input.topic}
- Objective: ${input.objective}
- Email type: ${input.emailType}
- Tone: ${input.tone}
- Offer: ${input.offer || 'N/A'}
- Audience pain: ${input.audiencePain || 'N/A'}
- CTA goal: ${input.ctaGoal || 'N/A'}
- Language: ${input.language}

CERINȚE:
1) Emailul trebuie să fie specific nișei și ICP-ului, NU generic.
2) Include mecanisme de conversie: hook, relevanță, proof, CTA clar.
3) Body în format plain text, ușor de trimis prin orice provider.
4) Evită promisiuni nerealiste.
5) Subject options să fie scurte și clare (max ~60 caractere).
6) Preview text max ~120 caractere.
7) Body max 350 cuvinte.

Răspunde DOAR JSON strict:
{
  "subjectOptions": ["subiect 1", "subiect 2", "subiect 3"],
  "previewText": "preview",
  "body": "corpul complet al emailului",
  "cta": "cta final clar",
  "angles": ["unghi 1", "unghi 2", "unghi 3"]
}`;

  const content = (await generateGeminiText(prompt, 0.65, 1800)) || '{}';
  const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
  const parsed = JSON.parse(cleaned);

  return {
    subjectOptions: Array.isArray(parsed.subjectOptions)
      ? parsed.subjectOptions.slice(0, 3)
      : [],
    previewText: parsed.previewText || '',
    body: parsed.body || '',
    cta: parsed.cta || '',
    angles: Array.isArray(parsed.angles) ? parsed.angles.slice(0, 5) : [],
  };
}

// ==================== CLIENT NUTRITION ====================

export interface GenerateClientNutritionPlanInput {
  calories: number;
  proteinGrams: number;
  fatGrams: number;
  carbsGrams: number;

  mealsPerDayType: '3' | '3+1' | '4' | '5' | 'custom';
  customMealsPerDay?: number;

  macroDistributionType:
    | 'equal'
    | 'around-workout'
    | 'more-evening-carbs'
    | 'low-carb-breakfast'
    | 'custom';
  customMacroDistribution?: string;

  wakeUpTime: string;
  sleepTime: string;
  hasTraining: boolean;
  trainingTime?: string;
  workProgram?: 'fixed' | 'shifts' | 'flexible' | 'mostly-home';

  mealLocations: ('home' | 'office' | 'delivery' | 'canteen' | 'on-the-go')[];
  cookingLevel: 'daily' | 'meal-prep' | 'rare' | 'almost-never';
  foodBudget: 'low' | 'medium' | 'high';

  dietaryRestrictions: (
    | 'lactose-free'
    | 'gluten-free'
    | 'vegetarian'
    | 'vegan'
    | 'intermittent-fasting'
    | 'religious-fasting'
    | 'allergies'
  )[];
  allergiesDetails?: string;
  excludedFoodsAndPreferences?: string;

  planStyle:
    | 'exact-grams'
    | 'macros-plus-examples'
    | 'flexible-template'
    | 'full-day-with-alternatives';
}

export interface NutritionMealFood {
  food: string;
  grams: number;
  protein: number;
  fat: number;
  carbs: number;
  calories: number;
  notes?: string;
}

export interface NutritionMeal {
  name: string;
  time: string;
  targetMacros: {
    protein: number;
    fat: number;
    carbs: number;
    calories: number;
  };
  foods: NutritionMealFood[];
}

export interface NutritionPlanResult {
  summary: string;
  dailyTotals: {
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
  };
  mealsPerDay: number;
  schedule: NutritionMeal[];
  alternatives: {
    forMeal: string;
    options: string[];
  }[];
  prepTips: string[];
  complianceRules: string[];
}

function getMealsPerDay(input: GenerateClientNutritionPlanInput): number {
  if (input.mealsPerDayType === 'custom') {
    return input.customMealsPerDay || 3;
  }

  if (input.mealsPerDayType === '3+1') {
    return 4;
  }

  return Number(input.mealsPerDayType);
}

export async function generateClientNutritionPlan(
  input: GenerateClientNutritionPlanInput
): Promise<NutritionPlanResult> {
  const mealsPerDay = getMealsPerDay(input);

  const prompt = `Tu ești un nutriționist sportiv senior pentru clienți fitness.

Generează un plan alimentar zilnic care respectă STRICT valorile totale introduse.

Planul alimentar trebuie să respecte următoarele principii:
- Include o varietate mare de alimente.
- Evită repetarea excesivă a acelorași ingrediente sau combinații de mese.
- Sursele de macronutrienți trebuie să fie variate între mese.
- Mesele principale trebuie să fie echilibrate nutrițional.
- Planul alimentar trebuie să includă diferite tipuri de preparate și structuri de mese.
- Mesele trebuie să fie simple, realiste și ușor de pregătit.
- Planul alimentar trebuie să respecte toate datele introduse de utilizator, inclusiv obiectivul, necesarul caloric și distribuția macronutrienților.
La fiecare generare, creează un plan alimentar nou și variat.
Evită reutilizarea acelorași tipare de meniu sau a acelorași combinații alimentare din planurile generate anterior.

DATE CLIENT:
- Calorii: ${input.calories}
- Proteină (g): ${input.proteinGrams}
- Grăsimi (g): ${input.fatGrams}
- Carbohidrați (g): ${input.carbsGrams}
- Mese/zi: ${mealsPerDay}
- Distribuție macro: ${input.macroDistributionType}${input.customMacroDistribution ? ` | custom: ${input.customMacroDistribution}` : ''}
- Trezire: ${input.wakeUpTime}
- Culcare: ${input.sleepTime}
- Se antrenează: ${input.hasTraining ? 'da' : 'nu'}
- Ora antrenament: ${input.trainingTime || 'N/A'}
- Program lucru: ${input.workProgram || 'Nespecificat'}
- Unde mănâncă: ${input.mealLocations.join(', ')}
- Nivel gătit: ${input.cookingLevel}
- Buget: ${input.foodBudget}
- Restricții: ${input.dietaryRestrictions.length ? input.dietaryRestrictions.join(', ') : 'fără'}
- Alergii detalii: ${input.allergiesDetails || 'N/A'}
- Alimente excluse/preferințe: ${input.excludedFoodsAndPreferences || 'N/A'}
- Stil plan: ${input.planStyle}

REGULĂ OBLIGATORIE:
1) Respectă strict totalurile:
   - calories = ${input.calories}
   - protein = ${input.proteinGrams}
   - fat = ${input.fatGrams}
   - carbs = ${input.carbsGrams}
2) Nu modifica aceste valori.
3) Ajustează distribuția pe mese astfel încât suma finală să fie EXACTĂ (rotunjire ±1 permisă pe fiecare macro și calorii).
4) Folosește alimente realiste pentru contextul clientului (program, buget, gătit, restricții).
5) Evită alimentele din restricții / preferințe excluse.
6) Fiecare masă trebuie să conțină:
   - target macro masă
   - lista alimentelor cu gramaj și macro estimat.

Răspunde DOAR JSON valid, fără markdown:
{
  "summary": "2-4 propoziții în limba română",
  "dailyTotals": {
    "calories": ${input.calories},
    "protein": ${input.proteinGrams},
    "fat": ${input.fatGrams},
    "carbs": ${input.carbsGrams}
  },
  "mealsPerDay": ${mealsPerDay},
  "schedule": [
    {
      "name": "Masa 1",
      "time": "08:00",
      "targetMacros": { "protein": 40, "fat": 15, "carbs": 55, "calories": 515 },
      "foods": [
        {
          "food": "aliment",
          "grams": 100,
          "protein": 10,
          "fat": 5,
          "carbs": 20,
          "calories": 165,
          "notes": "optional"
        }
      ]
    }
  ],
  "alternatives": [
    {
      "forMeal": "Masa 1",
      "options": ["variantă 1", "variantă 2"]
    }
  ],
  "prepTips": ["sfat 1", "sfat 2", "sfat 3"],
  "complianceRules": ["regulă 1", "regulă 2", "regulă 3"]
}`;

  const content = (await generateGeminiText(prompt, 0.35, 2600)) || '{}';
  const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
  const parsed = JSON.parse(cleaned);

  return {
    summary: parsed.summary || '',
    dailyTotals: {
      calories: Number(parsed?.dailyTotals?.calories ?? input.calories),
      protein: Number(parsed?.dailyTotals?.protein ?? input.proteinGrams),
      fat: Number(parsed?.dailyTotals?.fat ?? input.fatGrams),
      carbs: Number(parsed?.dailyTotals?.carbs ?? input.carbsGrams),
    },
    mealsPerDay: Number(parsed.mealsPerDay ?? mealsPerDay),
    schedule: Array.isArray(parsed.schedule) ? parsed.schedule : [],
    alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives : [],
    prepTips: Array.isArray(parsed.prepTips) ? parsed.prepTips : [],
    complianceRules: Array.isArray(parsed.complianceRules) ? parsed.complianceRules : [],
  };
}

export default {
  generateNicheQuick,
  generateNicheQuickICP,
  generateNicheWizard,
  generateNicheVariants,
  generateNicheDiscover,
  generateICPDay,
  generateDailyIdea,
  generateMultiFormatIdea,
  structureUserIdea,
  analyzeFeedback,
  analyzeTextContent,
  generateMarketingEmail,
  generateClientNutritionPlan,
};
