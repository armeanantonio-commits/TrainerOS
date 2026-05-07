import OpenAI from 'openai';
import { createReadStream, readFileSync } from 'fs';
import { GEMINI_MODEL, createGeminiPartsText, createGeminiText } from '../lib/gemini.js';
import type { GenerationPromptContext } from '../lib/generation-history.js';
import { buildAntiRepeatPromptSection } from '../lib/generation-history.js';
import { buildAiLanguageInstruction, normalizeLanguage, type SupportedLanguage } from '../lib/language.js';

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
  language?: SupportedLanguage;
  generationContext?: GenerationPromptContext;
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
  language?: SupportedLanguage;
  generationContext?: GenerationPromptContext;
}

export interface NicheFinderWizardInput {
  q1: string; // Cu cine îți place cel mai mult să lucrezi?
  q2: string; // Ce problemă rezolvi cel mai bine?
  q3: string; // Ce rezultate poți demonstra?
  q4: string; // Ce tip de client vrei să eviți?
  q5: string; // De ce te-ar alege pe tine?
  language?: SupportedLanguage;
  generationContext?: GenerationPromptContext;
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
  debug?: {
    quickIcp?: {
      firstResponsePreview: string;
      retryResponsePreview?: string;
      firstParsed: {
        nicheLength: number;
        idealClientLength: number;
        positioningLength: number;
      };
      retryParsed?: {
        nicheLength: number;
        idealClientLength: number;
        positioningLength: number;
      };
      missingCoreFieldsAfterFirstParse: boolean;
    };
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

function joinHumanListWithLanguage(values: string[], language: SupportedLanguage): string {
  if (language !== 'en') {
    return joinHumanList(values);
  }

  if (values.length === 0) {
    return '';
  }

  if (values.length === 1) {
    return values[0];
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`;
}

function normalizeTextField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stripModelReasoningLeakage(value: string): string {
  const text = normalizeTextField(value);
  if (!text) {
    return '';
  }

  const leakageMarkers = [
    '\nTHOUGHT:',
    ' THOUGHT:',
    '\nThought:',
    ' Thought:',
    '\nThe user wants me',
    ' The user wants me',
    '\nI need to',
    ' I need to',
    '\nRules:',
    '\nPARTIAL TEXT:',
  ];

  let cutIndex = -1;
  for (const marker of leakageMarkers) {
    const index = text.indexOf(marker);
    if (index !== -1 && (cutIndex === -1 || index < cutIndex)) {
      cutIndex = index;
    }
  }

  return (cutIndex === -1 ? text : text.slice(0, cutIndex)).trim();
}

function isLikelyIncompleteGeneratedText(value: string, language: SupportedLanguage): boolean {
  const text = stripModelReasoningLeakage(value);
  if (!text) {
    return true;
  }

  if (!/[.!?]"?$/.test(text)) {
    return true;
  }

  const trailingFragmentPattern =
    language === 'en'
      ? /\b(and|or|with|for|to|of|in|who|that|which|but|yet|their|the|a|an)\s*["']?$/i
      : /\b(și|sau|cu|pentru|de|din|în|pe|care|dar|iar|lor|un|o)\s*["']?$/i;

  return trailingFragmentPattern.test(text);
}

function hasMinimumUsefulLength(value: string, field: 'idealClient' | 'positioning'): boolean {
  const text = stripModelReasoningLeakage(value);
  if (!text) {
    return false;
  }

  if (field === 'idealClient') {
    return text.length >= 120;
  }

  return text.length >= 45;
}

function isAcceptableQuickIcpFieldText(
  value: string,
  field: 'idealClient' | 'positioning',
  language: SupportedLanguage
): boolean {
  return hasMinimumUsefulLength(value, field) && !isLikelyIncompleteGeneratedText(value, language);
}

function mergeContinuedText(baseText: string, continuation: string): string {
  const base = stripModelReasoningLeakage(baseText);
  const extra = stripModelReasoningLeakage(continuation)
    .replace(/^["'`\s]+/, '')
    .replace(/^(and|or|but|și|sau|dar)\b[\s,]*/i, (match) => match.trim().toLowerCase() + ' ');

  if (!base) {
    return extra;
  }

  if (!extra) {
    return base;
  }

  return `${base}${/\s$/.test(base) ? '' : ' '}${extra}`.replace(/\s+/g, ' ').trim();
}

function normalizeClientBlockForLanguage(value: string, language: SupportedLanguage): string {
  const normalized = normalizeTextField(value);
  if (!normalized) {
    return language === 'en' ? 'they do not have time for themselves' : 'nu au timp pentru ele';
  }

  if (language !== 'en') {
    return normalized;
  }

  const lower = normalized.toLowerCase();
  if (lower.includes('nu am timp')) return 'they do not have time for themselves';
  if (lower.includes('nu sunt disciplin')) return 'they are not disciplined';
  if (lower.includes('nu am voin')) return 'they do not have enough willpower';
  if (lower.includes('ma las') || lower.includes('mă las')) return 'they always end up quitting';
  if (lower.includes('nu sunt genul')) return 'they do not feel like the kind of person who succeeds at this';

  return normalized;
}

function pickFirstTextField(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = normalizeTextField(source[key]);
    if (value) return value;
  }
  return '';
}

function normalizeNicheResultAliases(raw: unknown): Partial<NicheResult> {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const source = raw as Record<string, unknown>;
  return {
    niche: pickFirstTextField(source, ['niche', 'nisa', 'nișa', 'variant', 'titluNisa', 'titluNișa']),
    idealClient: pickFirstTextField(source, [
      'idealClient',
      'clientIdeal',
      'profilClient',
      'profilClientIdeal',
      'avatarClient',
    ]),
    positioning: pickFirstTextField(source, [
      'positioning',
      'pozitionare',
      'poziționare',
      'mesajPozitionare',
      'mesajPoziționare',
    ]),
  };
}

async function generateQuickIcpFieldText(args: {
  field: 'idealClient' | 'positioning';
  niche: string;
  input: NicheQuickICPInput;
  language: SupportedLanguage;
  languageInstruction: string;
  strictLanguageReminder: string;
}): Promise<string> {
  const { field, niche, input, languageInstruction, strictLanguageReminder } = args;
  const fieldPrompt =
    field === 'idealClient'
      ? `Scrie DOAR profilul clientului ideal pentru nișa ${JSON.stringify(niche)}.

Cerințe:
- 2 paragrafe compacte, 90-140 cuvinte total
- fără bullet points
- include demografic, rutină, obstacole, motivații și context real
- text natural, complet și specific`
      : `Scrie DOAR mesajul de poziționare pentru nișa ${JSON.stringify(niche)}.

Cerințe:
- 2-3 propoziții, 35-70 cuvinte total
- clar, specific, fără formulări vagi
- explică pentru cine este și de ce abordarea antrenorului este diferită`;

  const prompt = `Tu ești un expert în marketing fitness.

${languageInstruction}
${strictLanguageReminder ? `\n${strictLanguageReminder}` : ''}

${fieldPrompt}

CONTEXT:
👥 Gen: ${input.gender}
🎯 Vârstă: ${input.ageRanges.join(', ')}${input.customAgeRange ? ` + ${input.customAgeRange}` : ''}
⏰ Trezire: ${input.wakeUpTime || 'N/A'}
💼 Job: ${input.jobType || 'N/A'}
🪑 Timp șezând: ${input.sittingTime || 'N/A'}
🌅 Dimineața: ${input.morning?.join(', ') || 'N/A'}
🍽️ Prânz: ${input.lunch?.join(', ') || 'N/A'}
🌙 Seara: ${input.evening?.join(', ') || 'N/A'}
⭐ Situații: ${input.definingSituations?.join(', ') || 'N/A'}
🟦 Diferențiere: ${input.differentiation || 'N/A'}
⚠️ Obiecții interne: ${input.internalObjections?.join(', ') || 'N/A'}

Răspunde DOAR cu textul final, fără JSON, fără markdown, fără titlu de secțiune.`;

  const maxTokens = field === 'idealClient' ? 900 : 400;
  let content = stripModelReasoningLeakage(normalizeTextField(await generateGeminiText(prompt, 0.45, maxTokens)));

  if (isLikelyIncompleteGeneratedText(content, args.language)) {
    const continuationPrompt = `Continue and finish this text naturally in the same language and tone.

Rules:
- Return ONLY the missing continuation, not the full text again.
- Start with the next word directly.
- Finish the thought completely.
- End with a proper sentence ending.

PARTIAL TEXT:
${JSON.stringify(content)}`;
    const continuation = stripModelReasoningLeakage(normalizeTextField(
      await generateGeminiText(continuationPrompt, 0.3, Math.max(180, Math.floor(maxTokens / 2)))
    ));
    content = mergeContinuedText(content, continuation);
  }

  if (isLikelyIncompleteGeneratedText(content, args.language)) {
    const completionPrompt = `${prompt}

IMPORTANT:
- Textul trebuie să fie complet.
- Ultima propoziție trebuie terminată corect.
- Nu te opri în mijlocul unei idei.
- Răspunde doar cu varianta finală completă.`;
    content = stripModelReasoningLeakage(normalizeTextField(await generateGeminiText(completionPrompt, 0.35, maxTokens)));
  }

  if (isLikelyIncompleteGeneratedText(content, args.language)) {
    const finalContinuationPrompt = `Finish this partial text with one short, complete continuation.

Rules:
- Return ONLY the continuation.
- Do not restart the text.
- Close the final sentence properly.

PARTIAL TEXT:
${JSON.stringify(content)}`;
    const finalContinuation = stripModelReasoningLeakage(normalizeTextField(
      await generateGeminiText(finalContinuationPrompt, 0.2, field === 'idealClient' ? 220 : 120)
    ));
    content = mergeContinuedText(content, finalContinuation);
  }

  if (!isAcceptableQuickIcpFieldText(content, field, args.language)) {
    const strictRewritePrompt = `${prompt}

IMPORTANT FINAL RULES:
- Return a COMPLETE final answer, not a draft.
- Do not stop in the middle of a sentence.
- Respect the requested length fully.
- If the answer is too short, expand it before stopping.
- Return only the final text.`;
    content = stripModelReasoningLeakage(normalizeTextField(await generateGeminiText(strictRewritePrompt, 0.3, maxTokens + 200)));
  }

  return content;
}

async function generateNicheFieldFromContext(args: {
  field: 'idealClient' | 'positioning';
  niche: string;
  contextHint: string;
  language: SupportedLanguage;
  languageInstruction: string;
  strictLanguageReminder?: string;
}): Promise<string> {
  const { field, niche, contextHint, language, languageInstruction, strictLanguageReminder } = args;
  const fieldPrompt =
    field === 'idealClient'
      ? `Scrie DOAR profilul clientului ideal pentru nișa ${JSON.stringify(niche)}.

Cerințe:
- 2 paragrafe compacte, 90-150 cuvinte total
- clar, natural, specific și aplicabil
- include context real + ce soluție practică urmează`
      : `Scrie DOAR mesajul de poziționare pentru nișa ${JSON.stringify(niche)}.

Cerințe:
- 2-3 propoziții, 45-95 cuvinte total
- include diferențiator clar + mini-plan practic (pas/frecvență/indicator)
- ton natural, fără jargon`;

  const prompt = `Tu ești un expert în marketing fitness.

${languageInstruction}
${strictLanguageReminder ? `\n${strictLanguageReminder}` : ''}

${fieldPrompt}

CONTEXT:
${contextHint}

Răspunde DOAR cu textul final, fără JSON, fără markdown, fără bullets.`;

  const maxTokens = field === 'idealClient' ? 900 : 520;
  let content = stripModelReasoningLeakage(normalizeTextField(await generateGeminiText(prompt, 0.4, maxTokens)));

  if (isLikelyIncompleteGeneratedText(content, language)) {
    const retryPrompt = `${prompt}

IMPORTANT:
- text complet și finalizat, fără truncare.
- nu te opri la mijlocul propoziției.
- returnează doar textul final.`;
    content = stripModelReasoningLeakage(normalizeTextField(await generateGeminiText(retryPrompt, 0.3, maxTokens + 120)));
  }

  return repairPossiblyTruncatedText(content, '');
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

function buildQuickIcpFallbackNiche(input: NicheQuickICPInput, language: SupportedLanguage): string {
  if (language === 'en') {
    const reasons = [
      ...(input.primaryReason ? [input.primaryReason] : []),
      ...((input.mainReasons || []).filter((reason) => reason !== input.primaryReason)),
    ];
    const transformedReasons = reasons.slice(0, 2).map((reason) => {
      if (reason === 'Slăbit') return 'lose fat';
      if (reason === 'Tonifiere / estetic') return 'tone up';
      if (reason === 'Energie / stare generală') return 'have more energy';
      if (reason === 'Disciplină / consecvență') return 'be more consistent';
      if (reason === 'Dureri / disconfort') return 'reduce discomfort';
      return reason.toLowerCase();
    });
    const outcome =
      transformedReasons.length > 0
        ? `who want to ${joinHumanListWithLanguage(transformedReasons, language)}`
        : 'who want sustainable results';
    return `Personalized and flexible training for people with active schedules ${outcome}.`;
  }

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

function buildQuickIcpContextSummary(input: NicheQuickICPInput, language: SupportedLanguage): string {
  if (language === 'en') {
    const parts: string[] = [];
    const normalizedAge = normalizeAgeForNiche(input);
    if (input.gender === 'barbati') {
      parts.push(normalizedAge ? `men aged ${normalizedAge}` : 'men');
    } else if (input.gender === 'femei') {
      parts.push(normalizedAge ? `women aged ${normalizedAge}` : 'women');
    } else {
      parts.push(normalizedAge ? `people aged ${normalizedAge}` : 'people');
    }

    if (input.jobType === 'activ') {
      parts.push('with an active work rhythm');
    } else if (input.jobType === 'sedentar') {
      parts.push('with mostly sedentary jobs');
    } else if (input.jobType === 'mixt') {
      parts.push('with a mixed work schedule');
    }

    if (input.definingSituations?.includes('Sunt deja activi / merg la sală')) {
      parts.push('who already go to the gym');
    }

    if (input.definingSituations?.includes('Au un job foarte solicitant fizic')) {
      parts.push('and physically demanding jobs');
    }

    if (input.definingSituations?.includes('Lucrează în ture / program neregulat')) {
      parts.push('with irregular shifts');
    }

    return joinHumanListWithLanguage(parts.filter(Boolean), language);
  }

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

function buildQuickIcpNeedSummary(input: NicheQuickICPInput, language: SupportedLanguage): string {
  const reasons = [
    ...(input.primaryReason ? [input.primaryReason] : []),
    ...((input.mainReasons || []).filter((reason) => reason !== input.primaryReason)),
  ];
  const transformedReasons = reasons.slice(0, 2).map((reason) => {
    if (language === 'en') {
      if (reason === 'Slăbit') return 'lose fat';
      if (reason === 'Tonifiere / estetic') return 'tone up';
      if (reason === 'Energie / stare generală') return 'have more energy';
      if (reason === 'Disciplină / consecvență') return 'be more consistent';
      if (reason === 'Dureri / disconfort') return 'reduce discomfort';
      return reason.toLowerCase();
    }

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
    if (language === 'en') {
      return 'need clear structure, consistency, and sustainable results';
    }
    return 'au nevoie de structură clară, consecvență și rezultate sustenabile';
  }

  if (language === 'en') {
    return `want to ${joinHumanListWithLanguage(transformedReasons, language)}`;
  }
  return `vor ${joinHumanList(transformedReasons)}`;
}

function buildQuickIcpFallbackIdealClient(input: NicheQuickICPInput, niche: string, language: SupportedLanguage): string {
  const audience = buildQuickIcpContextSummary(input, language);
  const needSummary = buildQuickIcpNeedSummary(input, language);

  if (language === 'en') {
    return [
      `You work with ${audience || `people who clearly fit the niche "${niche}"`}.`,
      'They need a clear, realistic, easy-to-follow plan that fits their schedule, without complicated recommendations they cannot sustain.',
      `Most of the time they ${needSummary}, but they struggle with lack of structure, fatigue, or inconsistency. They respond well to practical, clearly explained steps and to a process that shows visible progress.`,
    ].join('\n\n');
  }

  return [
    `Lucrezi cu ${audience || `oameni potriviți pentru nișa "${niche}"`}.`,
    `Au nevoie de un plan clar, realist și ușor de urmat în programul lor, fără recomandări complicate sau greu de susținut.`,
    `De obicei ${needSummary}, dar se lovesc de lipsa de structură, oboseală sau inconsistență. Reacționează bine la pași practici, explicați simplu, și la un proces care le arată progres vizibil.`,
  ].join('\n\n');
}

function buildQuickIcpFallbackPositioning(input: NicheQuickICPInput, niche: string, language: SupportedLanguage): string {
  const needSummary = buildQuickIcpNeedSummary(input, language);

  if (language === 'en') {
    return [
      `You are the coach who turns the niche "${niche}" into a clear and actionable process.`,
      'You do not sell generic advice. You provide structure, adaptation to real schedules, and a plan that helps people get results without making fitness feel more complicated.',
      `Core message: for people who ${needSummary}, you make the process simpler, clearer, and easier to follow.`,
    ].join('\n\n');
  }

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

function buildDiscoverAudienceSummary(input: NicheDiscoverInput, language: SupportedLanguage): string {
  const audience =
    input.gender === 'femei'
      ? language === 'en' ? 'women' : 'femei'
      : input.gender === 'barbati'
        ? language === 'en' ? 'men' : 'bărbați'
        : language === 'en' ? 'people' : 'persoane';
  const ages = input.ageRanges.length ? input.ageRanges.join(', ') : '';
  const parts = [ages ? `${audience} ${ages}` : audience];

  if (input.selectedNiche.toLowerCase().includes('program aglomerat')) {
    parts.push(language === 'en' ? 'with a busy schedule' : 'cu program aglomerat');
  } else if (input.definingSituations?.includes('Lucrează în ture / program neregulat')) {
    parts.push(language === 'en' ? 'with an irregular schedule' : 'cu program neregulat');
  }

  if (input.jobType === 'activ') {
    parts.push(language === 'en' ? 'with a physically active work rhythm' : 'și ritm activ de lucru');
  } else if (input.jobType === 'sedentar') {
    parts.push(language === 'en' ? 'with mostly sedentary work' : 'și muncă mai mult sedentară');
  }

  return parts.join(' ');
}

function buildDiscoverGoalSummary(input: NicheDiscoverInput, language: SupportedLanguage): string {
  const goal = normalizeTextField(input.primaryGoal) || normalizeTextField(input.primaryOutcome);
  if (language === 'en') {
    const lower = goal.toLowerCase();
    if (!goal) return 'get better results in a realistic, sustainable way';
    if (lower.includes('slăb') || lower.includes('slab')) return 'lose fat sustainably';
    if (lower.includes('tonifi')) return 'tone up without extremes';
    if (lower.includes('energie')) return 'have more energy and control';
    if (lower.includes('durer') || lower.includes('disconfort')) return 'reduce pain and discomfort';
    if (lower.includes('disciplin') || lower.includes('consecven')) return 'be more consistent';
    return goal;
  }
  return normalizeOutcomeForSentence(goal);
}

function buildDiscoverFallbackNiche(input: NicheDiscoverInput, language: SupportedLanguage): string {
  const selected = normalizeTextField(input.selectedNiche);
  const audience = buildDiscoverAudienceSummary(input, language);
  const goal = buildDiscoverGoalSummary(input, language);

  if (!selected) {
    return language === 'en'
      ? `Sustainable fitness for ${audience} who want to ${goal}.`
      : `Fitness sustenabil pentru ${audience} care vor ${goal}.`;
  }

  if (/pentru/i.test(selected)) {
    return language === 'en'
      ? `${selected} for people who want to ${goal}.`
      : `${selected} care vor ${goal}.`;
  }

  return language === 'en'
    ? `${selected} for ${audience} who want to ${goal}.`
    : `${selected} pentru ${audience} care vor ${goal}.`;
}

function buildDiscoverFallbackIdealClient(input: NicheDiscoverInput, niche: string, language: SupportedLanguage): string {
  const audience = buildDiscoverAudienceSummary(input, language);
  const problem = normalizeProblemForSentence(input.commonProblems[0] || 'lipsa de claritate și consecvență', language);
  const block = normalizeClientBlockForLanguage(input.clientStatement, language);
  const goal = buildDiscoverGoalSummary(input, language);
  const routine =
    input.wakeUpTime || input.jobType || input.sittingTime
      ? language === 'en'
        ? `Their day starts ${input.wakeUpTime ? `early, around ${input.wakeUpTime}` : 'early'}, continues with ${input.jobType ? `a ${input.jobType} work routine` : 'a packed schedule'}, and leaves very little room for themselves by the end of the day.`
        : `Ziua lor începe ${input.wakeUpTime ? `devreme, în jur de ${input.wakeUpTime}` : 'repede'}, continuă cu ${input.jobType ? `un program ${input.jobType}` : 'un program plin'} și le lasă puțin spațiu pentru ele la finalul zilei.`
      : language === 'en'
        ? 'They have a schedule that drains their energy and makes consistency hard to maintain.'
        : 'Au un program care le consumă energia și le face greu să rămână constante.';

  if (language === 'en') {
    return [
      `You work with ${audience}, a strong fit for the niche "${niche}". They are not looking for extremes, but for a clear system that helps them stay consistent and get real results.`,
      routine,
      `Their main problem is ${problem}, but underneath that sits the deeper block: ${block}. They often know what they should do, yet they struggle to turn intention into a simple plan they can actually repeat.`,
      `What they really want is to ${goal}, feel more in control, and believe they can take care of themselves without turning the rest of their life upside down. They respond to simple, practical messaging and examples that feel realistic in their actual context.`,
    ].join('\n\n');
  }

  return [
    `Lucrezi cu ${audience}, potriviți pentru nișa "${niche}". Nu caută extreme, ci un sistem clar care să le ajute să rămână constante și să obțină rezultate reale.`,
    routine,
    `Problema principală este ${problem}, dar în spate apare și blocajul ${block}. De multe ori știu ce ar trebui să facă, însă nu reușesc să transforme intenția într-un plan simplu și repetabil.`,
    `Își doresc ${goal}, mai mult control și senzația că pot avea grijă de ele fără să își dea viața peste cap. Rezonează cu mesajele simple, aplicabile și cu exemple care arată progres posibil în contextul lor real.`,
  ].join('\n\n');
}

function buildDiscoverFallbackPositioning(input: NicheDiscoverInput, niche: string, language: SupportedLanguage): string {
  const goal = buildDiscoverGoalSummary(input, language);
  const block = normalizeClientBlockForLanguage(input.clientStatement, language);

  if (language === 'en') {
    return [
      `You position the niche "${niche}" as a clear solution for people who want to ${goal}, but feel that ${block}.`,
      `You do not promise extreme changes or sell pressure. Your message is about structure, adaptation to real life, and practical steps people can follow consistently.`,
      `Your differentiator: you make fitness easier to understand, easier to apply, and easier to sustain over the long term.`,
    ].join('\n\n');
  }

  return [
    `Tu poziționezi nișa "${niche}" ca o soluție clară pentru oamenii care vor ${goal}, dar simt că ${block}.`,
    `Nu promiți schimbări extreme și nici nu vinzi presiune. Mesajul tău este despre structură, adaptare la viața reală și pași practici care pot fi urmați consecvent.`,
    `Diferențiatorul tău: faci fitnessul mai ușor de înțeles, mai ușor de aplicat și mai ușor de păstrat pe termen lung.`,
  ].join('\n\n');
}

function ensureCompleteNicheResult(
  partial: Partial<NicheResult>,
  contextHint: string,
  language: SupportedLanguage = 'ro',
  fallbackNiche = getLocalizedNicheUi(language).customFitnessNiche,
  fallbackIdealClient?: string,
  fallbackPositioning?: string
): NicheResult {
  const parsedNiche = cleanNicheTextArtifacts(stripModelReasoningLeakage(normalizeTextField(partial.niche)));
  const parsedIdealClient = cleanNicheTextArtifacts(stripModelReasoningLeakage(normalizeTextField(partial.idealClient)));
  const parsedPositioning = cleanNicheTextArtifacts(stripModelReasoningLeakage(normalizeTextField(partial.positioning)));
  const idealClientIsUsable = isAcceptableQuickIcpFieldText(parsedIdealClient, 'idealClient', language);
  const positioningIsUsable = isAcceptableQuickIcpFieldText(parsedPositioning, 'positioning', language);

  const niche = seemsIncompleteNiche(parsedNiche) ? fallbackNiche : parsedNiche;
  const idealClientBase =
    (idealClientIsUsable ? parsedIdealClient : '') ||
    fallbackIdealClient ||
    (language === 'en'
      ? `The ideal client for "${niche}" clearly fits this context: ${contextHint}. They need a realistic, practical solution that fits their lifestyle, not generic advice. They are looking for clarity, visible progress, and a plan they can follow consistently without making their schedule even harder.`
      : `Clientul ideal pentru "${niche}" este persoana care se regăsește clar în contextul descris: ${contextHint}. Are nevoie de o soluție aplicabilă, realistă și adaptată stilului ei de viață, nu de sfaturi generale. Caută claritate, progres vizibil și un plan care să poată fi urmat consecvent fără să-i complice și mai mult programul.`);
  const positioningBase =
    (positioningIsUsable ? parsedPositioning : '') ||
    fallbackPositioning ||
    (language === 'en'
      ? `I help people in the "${niche}" niche get real results through a clear approach adapted to their daily context and real needs. The focus is not on generic advice, but on practical steps they can apply consistently to create visible progress.`
      : `Ajut persoanele din nișa "${niche}" să obțină rezultate reale printr-o abordare clară, adaptată contextului lor zilnic și nevoilor lor reale. Focusul nu este pe recomandări generale, ci pe pași practici care pot fi aplicați consecvent și care duc la progres vizibil.`);

  const ensurePracticalNicheText = (value: string, field: 'idealClient' | 'positioning'): string => {
    const safe = cleanNicheTextArtifacts(
      repairPossiblyTruncatedText(value, field === 'idealClient' ? idealClientBase : positioningBase)
    );
    const normalized = normalizeLooseComparisonText(safe);
    const hasPracticalSignals =
      /\b(pasi|pas|plan|rutina|frecventa|step|steps|plan|routine|frequency|aplica|apply|repet|repeat)\b/.test(
        normalized
      );
    if (hasPracticalSignals) {
      return safe;
    }

    const practicalSuffix =
      language === 'en'
        ? field === 'idealClient'
          ? ' Practical plan they follow best: 1) one clear action per day (10-15 minutes), 2) the same routine repeated 4-5 days/week, 3) one weekly check-in to adjust the next step.'
          : ' Practical plan: 1) define one daily non-negotiable action, 2) repeat it on a fixed weekly schedule, 3) track one measurable indicator weekly and adjust based on results.'
        : field === 'idealClient'
          ? ' Plan practic pe care îl urmează cel mai bine: 1) o acțiune clară pe zi (10-15 minute), 2) aceeași rutină repetată 4-5 zile/săptămână, 3) un check-in săptămânal pentru ajustarea pasului următor.'
          : ' Plan practic: 1) definești o acțiune zilnică non-negociabilă, 2) o repeți într-un program fix săptămânal, 3) urmărești săptămânal un indicator măsurabil și ajustezi în funcție de rezultat.';

    return `${safe}${practicalSuffix}`.trim();
  };

  const idealClient = cleanNicheTextArtifacts(ensurePracticalNicheText(idealClientBase, 'idealClient'));
  const positioning = cleanNicheTextArtifacts(ensurePracticalNicheText(positioningBase, 'positioning'));

  return {
    niche,
    idealClient,
    positioning,
    sources: {
      niche: parsedNiche && !seemsIncompleteNiche(parsedNiche) ? 'ai' : 'fallback',
      idealClient: idealClientIsUsable ? 'ai' : 'fallback',
      positioning: positioningIsUsable ? 'ai' : 'fallback',
    },
  };
}

export async function generateNicheQuick(input: NicheFinderQuickInput): Promise<NicheResult> {
  const antiRepeatSection = buildAntiRepeatPromptSection(input.generationContext);
  const language = normalizeLanguage(input.language);
  const languageInstruction = buildAiLanguageInstruction(language);
  const strictLanguageReminder =
    language === 'en'
      ? [
          'CRITICAL LANGUAGE RULE:',
          '- The final values for "niche", "idealClient", and "positioning" must be in English only.',
          '- Do not answer in Romanian.',
        ].join('\n')
      : '';
  const prompt = `Tu ești un expert în marketing fitness. Analizează această nișă și creează:

1. Nișa clară și specifică (1 propoziție precisă)
2. Profilul clientului ideal (demografic + psihografic, 2-3 propoziții)
3. Mesaj de poziționare (1-2 propoziții, unique value proposition)

Nișa introdusă: "${input.quickNiche}"

${languageInstruction}
${strictLanguageReminder ? `\n\n${strictLanguageReminder}` : ''}

${antiRepeatSection}

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
  const normalizedNiche = normalizeTextField(parsed.niche) || input.quickNiche;
  const contextHint = input.quickNiche;

  if (!isAcceptableQuickIcpFieldText(normalizeTextField(parsed.positioning), 'positioning', language)) {
    const regenerated = await generateNicheFieldFromContext({
      field: 'positioning',
      niche: normalizedNiche,
      contextHint,
      language,
      languageInstruction,
      strictLanguageReminder,
    });
    if (regenerated) {
      parsed.positioning = regenerated;
    }
  }

  if (!isAcceptableQuickIcpFieldText(normalizeTextField(parsed.idealClient), 'idealClient', language)) {
    const regenerated = await generateNicheFieldFromContext({
      field: 'idealClient',
      niche: normalizedNiche,
      contextHint,
      language,
      languageInstruction,
      strictLanguageReminder,
    });
    if (regenerated) {
      parsed.idealClient = regenerated;
    }
  }

  return ensureCompleteNicheResult(parsed, input.quickNiche, language);
}

export async function generateNicheQuickICP(input: NicheQuickICPInput): Promise<NicheResult> {
  const antiRepeatSection = buildAntiRepeatPromptSection(input.generationContext);
  const normalizedLanguage = normalizeLanguage(input.language);
  const languageInstruction = buildAiLanguageInstruction(normalizedLanguage);
  const strictLanguageReminder =
    normalizedLanguage === 'en'
      ? [
          'CRITICAL LANGUAGE RULE:',
          '- The final values for "niche", "idealClient", and "positioning" must be in English only.',
          '- The profile context below may be written in Romanian, but that does not change the output language.',
          '- Do not answer in Romanian.',
        ].join('\n')
      : '';
  const prompt = `Tu ești un expert în marketing fitness. Pe baza descrierii clientului ideal, creează:

1. Nișa clară și specifică (1 propoziție precisă)
2. Profilul clientului ideal DETALIAT (demografic + psihografic + rutina zilnică + pain points, 2 paragrafe consistente)
3. Mesaj de poziționare (2-3 propoziții, unique value proposition)

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

${languageInstruction}
${strictLanguageReminder ? `\n\n${strictLanguageReminder}` : ''}

${antiRepeatSection}

IMPORTANT: Pentru "idealClient", scrie un profil COMPLET și compact (2 paragrafe) care combină:
- Demografic (gen, vârstă)
- Rutina zilnică (job, program, mese, energie)
- Pain points și obstacole
- Situații definitorii și cum le afectează viața
- Obiecții interne dominante și cum îi țin pe loc

IMPORTANT DE LUNGIME:
- "idealClient" trebuie să aibă 90-140 cuvinte.
- "positioning" trebuie să aibă 35-70 cuvinte.
- Păstrează răspunsul complet, dar suficient de compact încât să încapă integral în JSON.

Răspunde DOAR în format JSON strict, fără markdown.
IMPORTANT:
- JSON valid obligatoriu
- Fără ghilimele duble ne-escape-uite în interiorul valorilor text
- Dacă ai nevoie de citare în text, folosește apostrof simplu

FORMAT:
{
  "niche": "Nișa ta specifică aici",
  "idealClient": "Profilul DETALIAT al clientului ideal (2 paragrafe în proză, nu bullet points)",
  "positioning": "Mesajul tău de poziționare unic"
}`;

  const content = await generateGeminiJson(prompt, 0.7, 1600);
  let parsed = normalizeNicheResultAliases(await parseModelJson<Partial<NicheResult>>(content));
  const quickIcpDebug: NonNullable<NonNullable<NicheResult['debug']>['quickIcp']> = {
    firstResponsePreview: previewModelResponse(content, 500),
    firstParsed: {
      nicheLength: normalizeTextField(parsed.niche).length,
      idealClientLength: normalizeTextField(parsed.idealClient).length,
      positioningLength: normalizeTextField(parsed.positioning).length,
    },
    missingCoreFieldsAfterFirstParse: false,
  };

  const missingCoreFields =
    !normalizeTextField(parsed.idealClient) ||
    !normalizeTextField(parsed.positioning) ||
    isLikelyIncompleteGeneratedText(normalizeTextField(parsed.idealClient), normalizedLanguage) ||
    isLikelyIncompleteGeneratedText(normalizeTextField(parsed.positioning), normalizedLanguage);
  quickIcpDebug.missingCoreFieldsAfterFirstParse = missingCoreFields;
  if (missingCoreFields) {
    const nicheForFollowUp =
      normalizeTextField(parsed.niche) || buildQuickIcpFallbackNiche(input, normalizedLanguage);
    const retryPrompt = `Tu completezi un răspuns JSON pentru un fitness coach.

Ai deja nișa finală:
- niche: ${JSON.stringify(nicheForFollowUp)}

Generează DOAR câmpurile lipsă de mai jos, pe baza aceluiași context:
- "idealClient": 2 paragrafe în proză, 90-140 cuvinte total
- "positioning": 2-3 propoziții, 35-70 cuvinte total

CONTEXT:
👥 Gen: ${input.gender}
🎯 Vârstă: ${input.ageRanges.join(', ')}${input.customAgeRange ? ` + ${input.customAgeRange}` : ''}
⏰ Trezire: ${input.wakeUpTime || 'N/A'}
💼 Job: ${input.jobType || 'N/A'}
🪑 Timp șezând: ${input.sittingTime || 'N/A'}
🌅 Dimineața: ${input.morning?.join(', ') || 'N/A'}
🍽️ Prânz: ${input.lunch?.join(', ') || 'N/A'}
🌙 Seara: ${input.evening?.join(', ') || 'N/A'}
⭐ Situații: ${input.definingSituations?.join(', ') || 'N/A'}
🟦 Diferențiere: ${input.differentiation || 'N/A'}
⚠️ Obiecții interne: ${input.internalObjections?.join(', ') || 'N/A'}

${languageInstruction}
${strictLanguageReminder ? `\n\n${strictLanguageReminder}` : ''}

RETRY RULES:
- Return strict JSON only.
- Both fields are mandatory and non-empty.
- Do not return the "niche" field again.
- Do not use bullet points.

FORMAT:
{
  "idealClient": "string",
  "positioning": "string"
}`;
    const retryContent = await generateGeminiJson(retryPrompt, 0.4, 1400);
    const retryParsed = normalizeNicheResultAliases(await parseModelJson<Partial<NicheResult>>(retryContent));
    quickIcpDebug.retryResponsePreview = previewModelResponse(retryContent, 500);
    quickIcpDebug.retryParsed = {
      nicheLength: normalizeTextField(retryParsed.niche).length,
      idealClientLength: normalizeTextField(retryParsed.idealClient).length,
      positioningLength: normalizeTextField(retryParsed.positioning).length,
    };
    parsed = {
      ...parsed,
      niche: normalizeTextField(retryParsed.niche) || parsed.niche,
      idealClient: normalizeTextField(retryParsed.idealClient) || parsed.idealClient,
      positioning: normalizeTextField(retryParsed.positioning) || parsed.positioning,
    };
  }
  const nicheForFollowUp =
    normalizeTextField(parsed.niche) || buildQuickIcpFallbackNiche(input, normalizedLanguage);
  if (isLikelyIncompleteGeneratedText(normalizeTextField(parsed.idealClient), normalizedLanguage)) {
    const generatedIdealClient = await generateQuickIcpFieldText({
      field: 'idealClient',
      niche: nicheForFollowUp,
      input,
      language: normalizedLanguage,
      languageInstruction,
      strictLanguageReminder,
    });
    if (generatedIdealClient) {
      parsed.idealClient = generatedIdealClient;
      quickIcpDebug.retryParsed = {
        nicheLength: normalizeTextField(parsed.niche).length,
        idealClientLength: normalizeTextField(parsed.idealClient).length,
        positioningLength: normalizeTextField(parsed.positioning).length,
      };
    }
  }
  if (isLikelyIncompleteGeneratedText(normalizeTextField(parsed.positioning), normalizedLanguage)) {
    const generatedPositioning = await generateQuickIcpFieldText({
      field: 'positioning',
      niche: nicheForFollowUp,
      input,
      language: normalizedLanguage,
      languageInstruction,
      strictLanguageReminder,
    });
    if (generatedPositioning) {
      parsed.positioning = generatedPositioning;
      quickIcpDebug.retryParsed = {
        nicheLength: normalizeTextField(parsed.niche).length,
        idealClientLength: normalizeTextField(parsed.idealClient).length,
        positioningLength: normalizeTextField(parsed.positioning).length,
      };
    }
  }
  if (!isAcceptableQuickIcpFieldText(normalizeTextField(parsed.positioning), 'positioning', normalizedLanguage)) {
    const regeneratedPositioning = await generateNicheFieldFromContext({
      field: 'positioning',
      niche: nicheForFollowUp,
      contextHint: [
        `gen ${input.gender}`,
        `vârste ${input.ageRanges.join(', ')}`,
        input.jobType ? `job ${input.jobType}` : '',
        input.primaryReason ? `motiv principal ${input.primaryReason}` : '',
        input.differentiation ? `diferențiere ${input.differentiation}` : '',
      ]
        .filter(Boolean)
        .join('; '),
      language: normalizedLanguage,
      languageInstruction,
      strictLanguageReminder,
    });
    if (regeneratedPositioning) {
      parsed.positioning = regeneratedPositioning;
    }
  }
  if (!isAcceptableQuickIcpFieldText(normalizeTextField(parsed.idealClient), 'idealClient', normalizedLanguage)) {
    const regeneratedIdealClient = await generateNicheFieldFromContext({
      field: 'idealClient',
      niche: nicheForFollowUp,
      contextHint: [
        `gen ${input.gender}`,
        `vârste ${input.ageRanges.join(', ')}`,
        input.jobType ? `job ${input.jobType}` : '',
        input.sittingTime ? `stat jos ${input.sittingTime}` : '',
        input.definingSituations?.length ? `situații ${input.definingSituations.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('; '),
      language: normalizedLanguage,
      languageInstruction,
      strictLanguageReminder,
    });
    if (regeneratedIdealClient) {
      parsed.idealClient = regeneratedIdealClient;
    }
  }
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
  const fallbackNiche = buildQuickIcpFallbackNiche(input, normalizedLanguage);
  const result = ensureCompleteNicheResult(
    parsed,
    contextHint,
    normalizedLanguage,
    fallbackNiche,
    buildQuickIcpFallbackIdealClient(input, fallbackNiche, normalizedLanguage),
    buildQuickIcpFallbackPositioning(input, fallbackNiche, normalizedLanguage)
  );
  result.debug = { quickIcp: quickIcpDebug };
  return result;
}

export async function generateNicheWizard(input: NicheFinderWizardInput): Promise<NicheResult> {
  const antiRepeatSection = buildAntiRepeatPromptSection(input.generationContext);
  const language = normalizeLanguage(input.language);
  const languageInstruction = buildAiLanguageInstruction(language);
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

${languageInstruction}

${antiRepeatSection}

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

  const normalizedNiche = normalizeTextField(parsed.niche) || contextHint;
  if (!isAcceptableQuickIcpFieldText(normalizeTextField(parsed.positioning), 'positioning', language)) {
    const regenerated = await generateNicheFieldFromContext({
      field: 'positioning',
      niche: normalizedNiche,
      contextHint,
      language,
      languageInstruction,
    });
    if (regenerated) {
      parsed.positioning = regenerated;
    }
  }

  if (!isAcceptableQuickIcpFieldText(normalizeTextField(parsed.idealClient), 'idealClient', language)) {
    const regenerated = await generateNicheFieldFromContext({
      field: 'idealClient',
      niche: normalizedNiche,
      contextHint,
      language,
      languageInstruction,
    });
    if (regenerated) {
      parsed.idealClient = regenerated;
    }
  }

  return ensureCompleteNicheResult(parsed, contextHint, language);
}

// ==================== DAILY IDEA GENERATOR ====================

export interface DailyIdeaInput {
  niche: string;
  icpProfile?: any;
  contentPreferences?: any;
  objective?: 'lead-gen' | 'engagement' | 'education';
  general?: boolean;
  language?: SupportedLanguage;
  generationContext?: GenerationPromptContext;
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

export interface RegenerateSceneInput {
  niche: string;
  format: 'REEL' | 'CAROUSEL' | 'STORY';
  hook: string;
  cta: string;
  dmKeyword: string;
  script: Scene[];
  targetScene: number;
  contentPreferences?: any;
  language?: SupportedLanguage;
}

export interface RegenerateHookInput {
  niche: string;
  format: 'REEL' | 'CAROUSEL' | 'STORY';
  hook: string;
  cta: string;
  dmKeyword: string;
  script: Scene[];
  contentPreferences?: any;
  language?: SupportedLanguage;
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

interface StructureUserIdeaInput {
  ideaText: string;
  niche: string;
  contentPreferences?: any;
  language?: SupportedLanguage;
  generationContext?: GenerationPromptContext;
}

const STRUCTURED_IDEA_SECTION_TITLES = [
  'PARTEA 1 – Context',
  'PARTEA 2 – Explicație clară',
  'PARTEA 3 – Exemplu / aplicație',
  'PARTEA 4 – Principiu final',
] as const;
const STRUCTURED_IDEA_SECTION_TITLES_EN = [
  'PART 1 - Context',
  'PART 2 - Clear explanation',
  'PART 3 - Example / application',
  'PART 4 - Final principle',
] as const;

const STRUCTURED_IDEA_DEFAULT_IMPROVEMENTS = [
  'Mesaj clarificat',
  'Redundanță eliminată',
  'Structură adăugată',
  'Ton adaptat la nișă',
] as const;

function getStructuredIdeaSectionTitles(language: SupportedLanguage): readonly string[] {
  return language === 'en' ? STRUCTURED_IDEA_SECTION_TITLES_EN : STRUCTURED_IDEA_SECTION_TITLES;
}

function localizeCtaStyleLabel(ctaStyle: string, language: SupportedLanguage): string {
  const normalized = normalizeLooseComparisonText(ctaStyle);
  const isSoft = normalized.includes('soft');
  const isDirect = normalized.includes('direct');
  const isEducational = normalized.includes('educational');
  const isMix = normalized === 'mix' || normalized.includes('mix');

  if (language === 'en') {
    if (isSoft) return 'Soft (comment / question)';
    if (isDirect) return 'Direct (write me X / send a message)';
    if (isEducational) return 'Educational (save / share)';
    if (isMix) return 'Mix';
    return ctaStyle || 'Mix';
  }

  if (isSoft) return 'Soft (comentariu / întrebare)';
  if (isDirect) return 'Direct (scrie-mi X / trimite mesaj)';
  if (isEducational) return 'Educațional (salvează / share)';
  if (isMix) return 'Mix';
  return ctaStyle || 'Mix';
}

function localizeStructuredIdeaResult(result: StructuredIdeaResult, language: SupportedLanguage): StructuredIdeaResult {
  const sectionTitles = getStructuredIdeaSectionTitles(language);
  const improvements =
    language === 'en'
      ? ['Message clarified', 'Redundancy removed', 'Structure added', 'Tone adapted to the niche']
      : ['Mesaj clarificat', 'Redundanță eliminată', 'Structură adăugată', 'Ton adaptat la nișă'];
  return {
    ...result,
    script: result.script.map((section, index) => ({
      ...section,
      sectionTitle: sectionTitles[index] || section.sectionTitle,
    })),
    ctaStyleApplied: localizeCtaStyleLabel(result.ctaStyleApplied, language),
    improvements,
  };
}

function normalizeTextValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanNicheTextArtifacts(value: string): string {
  const text = normalizeTextValue(value);
  if (!text) {
    return '';
  }

  return text
    .replace(/\bzil\s+nic\b/gi, 'zilnic')
    .replace(/\bcon\s+secven(?:t|ț)(?:a|ă)\b/gi, 'consecvență')
    .replace(/\bpro\s+gres\b/gi, 'progres')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizeLooseComparisonText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
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

function looksLikeDailyIdeaCtaLikeText(value: string, cta: string, keyword: string): boolean {
  const normalizedValue = normalizeLooseComparisonText(value);
  if (!normalizedValue) {
    return false;
  }

  const normalizedCta = normalizeLooseComparisonText(cta);
  const normalizedKeyword = normalizeLooseComparisonText(keyword);

  if (normalizedCta && normalizedValue === normalizedCta) {
    return true;
  }

  const ctaSignals = [
    'scrie ',
    'comenteaza ',
    'trimite ',
    'lasa ',
    'da-mi ',
    'swipe up',
    'in dm',
    ' dm ',
  ];

  const hasDirectSignal = ctaSignals.some((signal) => normalizedValue.includes(signal));
  const referencesKeyword = normalizedKeyword ? normalizedValue.includes(normalizedKeyword) : false;
  const promisesDelivery =
    normalizedValue.includes('iti trimit') ||
    normalizedValue.includes('ti-o trimit') ||
    normalizedValue.includes('ti o trimit') ||
    normalizedValue.includes('iti dau') ||
    normalizedValue.includes('primesti');

  return hasDirectSignal || (referencesKeyword && promisesDelivery);
}

function buildDailyIdeaFinalSceneText(expectedFormat: DailyIdeaResult['format']): string {
  if (expectedFormat === 'CAROUSEL') {
    return 'Concluzia practică este simplă: nu încerca să schimbi totul dintr-odată. Alege ideea cea mai ușor de aplicat din slide-urile anterioare, testeaz-o câteva zile la rând și urmărește ce se schimbă în energie, postură sau consecvență. Așa construiești progres real, nu doar entuziasm de moment.';
  }

  if (expectedFormat === 'STORY') {
    return 'Ține minte ideea principală: un pas mic, repetat constant, îți dă rezultate mai bune decât un restart mare pe care nu reușești să-l susții până la capăt.';
  }

  return 'Concluzia utilă este asta: nu ai nevoie să faci totul perfect din prima. Alege un singur pas clar din ce ai văzut aici, repetă-l câteva zile la rând și lasă consecvența să facă diferența în corpul și energia ta.';
}

function buildDailyIdeaFinalSceneVisual(expectedFormat: DailyIdeaResult['format']): string {
  if (expectedFormat === 'CAROUSEL') {
    return 'Slide final cu concluzia practică evidențiată clar pe ecran';
  }

  if (expectedFormat === 'STORY') {
    return 'Cadru simplu cu ideea-cheie afișată mare pe ecran';
  }

  return 'Cadru final cu concluzia practică afișată clar pe ecran';
}

function hasConcreteSolutionSignals(text: string): boolean {
  const normalized = normalizeLooseComparisonText(text);
  if (!normalized) {
    return false;
  }

  const hasNumbers = /\b\d{1,3}\b/.test(normalized);
  const hasTiming =
    /\b(min|minute|sec|secunde|ore|ora|zile|saptamana|saptamani|x\/saptamana|\/zi)\b/.test(normalized);
  const hasStructureSignals =
    /\b(pasi|pasul|set|seturi|repetari|rep|runde|protocol|routine|rutina|frecventa|serii)\b/.test(
      normalized
    );
  const hasActionVerbs =
    /\b(fa|faci|incepe|incepi|repeta|repeta-l|testeaza|aplica|executa|mobilizeaza|respira)\b/.test(
      normalized
    );

  return (hasNumbers && hasTiming) || (hasStructureSignals && hasActionVerbs);
}

function buildConcreteSolutionScene(expectedFormat: DailyIdeaResult['format']): { text: string; visual: string } {
  if (expectedFormat === 'CAROUSEL') {
    return {
      text: 'Protocol simplu pe care îl poți aplica azi: 2 minute respirație controlată, 3 minute mobilitate pentru șolduri și torace, apoi 2 seturi a câte 10 repetări pentru fesieri. Repetă rutina 4 zile pe săptămână timp de 2 săptămâni și notează zilnic nivelul de energie și tensiunea din zona lombară.',
      visual: 'Slide cu pașii numerotați (2 min + 3 min + 2x10) și checklist de 14 zile',
    };
  }

  if (expectedFormat === 'STORY') {
    return {
      text: 'Fă acum varianta scurtă: 60 secunde respirație, 90 secunde mobilitate pentru șolduri, apoi 10 repetări glute bridge. Repetă secvența de 2 ori, zilnic, 7 zile. Dacă o păstrezi simplă și constantă, disconfortul scade și corpul răspunde mai rapid.',
      visual: 'Story cu timer pe ecran și pașii 60s + 90s + 10 repetări',
    };
  }

  return {
    text: 'Soluția practică în 6 minute: 1 minut respirație 360°, 2 minute mobilitate pentru coloană și șolduri, 3 minute activare fesieri (2 seturi x 10 repetări glute bridge cu 10 secunde pauză). Aplică rutina 5 zile pe săptămână timp de 14 zile și urmărește cum scade tensiunea din spate.',
    visual: 'Cadru cu cronometru 6:00 și demonstrație pe pași (1 min + 2 min + 3 min)',
  };
}

function trimToLastCompleteSentence(value: string): string {
  const text = normalizeTextValue(value);
  if (!text) {
    return '';
  }

  const lastBoundary = Math.max(text.lastIndexOf('.'), text.lastIndexOf('!'), text.lastIndexOf('?'));
  if (lastBoundary >= 24) {
    return text.slice(0, lastBoundary + 1).trim();
  }

  return text;
}

function looksAbruptlyCut(value: string): boolean {
  const text = normalizeTextValue(value);
  if (!text) {
    return false;
  }

  const endsWithBoundary = /[.!?]$/.test(text);
  const shortDanglingTail = /\s[a-zA-ZăâîșțĂÂÎȘȚ]{1,3}$/.test(text);
  const minWords = text.split(/\s+/).filter(Boolean).length < 7;
  return (!endsWithBoundary && shortDanglingTail) || (isLikelyIncompleteGeneratedText(text, 'ro') && minWords);
}

function repairPossiblyTruncatedText(value: string, fallback: string): string {
  const text = normalizeTextValue(value);
  if (!text) {
    return fallback;
  }

  if (!looksAbruptlyCut(text)) {
    return text;
  }

  const trimmed = trimToLastCompleteSentence(text);
  if (trimmed && trimmed.split(/\s+/).length >= 7) {
    return trimmed;
  }

  return fallback;
}

function sanitizeDailyIdeaScript(
  script: Scene[],
  expectedFormat: DailyIdeaResult['format'],
  cta: string,
  keyword: string
): Scene[] {
  if (script.length === 0) {
    return script;
  }

  const lastSceneIndex = script.length - 1;
  const lastScene = script[lastSceneIndex];
  const lastSceneText = normalizeTextValue(lastScene.text);
  const lastSceneVisual = normalizeTextValue(lastScene.visual);
  const shouldRewriteLastScene =
    looksLikeDailyIdeaCtaLikeText(lastSceneText, cta, keyword) ||
    looksLikeDailyIdeaCtaLikeText(lastSceneVisual, cta, keyword);

  let sanitized = shouldRewriteLastScene
    ? script.map((scene, index) =>
        index === lastSceneIndex
          ? {
              ...scene,
              text: buildDailyIdeaFinalSceneText(expectedFormat),
              visual: buildDailyIdeaFinalSceneVisual(expectedFormat),
            }
          : scene
      )
    : script;

  const hasConcreteScene = sanitized.some((scene) => hasConcreteSolutionSignals(normalizeTextValue(scene.text)));
  if (!hasConcreteScene && sanitized.length >= 2) {
    const concreteScene = buildConcreteSolutionScene(expectedFormat);
    sanitized = sanitized.map((scene, index) =>
      index === 1
        ? {
            ...scene,
            text: concreteScene.text,
            visual: concreteScene.visual,
          }
        : scene
    );
  }

  return sanitized.map((scene, index) => {
    const fallbackText =
      scene.scene === 5 || index === 4
        ? buildConcreteSolutionScene(expectedFormat).text
        : scene.scene === 4 || index === 3
          ? buildDailyIdeaFinalSceneText(expectedFormat)
          : 'Aplică acest pas într-o formă simplă și repetabilă, apoi urmărește consecvent progresul pentru câteva zile.';
    const fallbackVisual =
      scene.scene === 5 || index === 4
        ? buildConcreteSolutionScene(expectedFormat).visual
        : scene.scene === 4 || index === 3
          ? buildDailyIdeaFinalSceneVisual(expectedFormat)
          : `Cadru clar pentru scena ${scene.scene || index + 1}, cu demonstrație practică`;

    return {
      ...scene,
      text: repairPossiblyTruncatedText(scene.text, fallbackText),
      visual: repairPossiblyTruncatedText(scene.visual, fallbackVisual),
    };
  });
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
  const format = normalizeTextValue(source.format).toUpperCase() || expectedFormat;
  const keyword = normalizeTextValue(source.dmKeyword) || buildDailyIdeaDefaultKeyword(expectedFormat);
  const cta = normalizeTextValue(source.cta) || buildDailyIdeaDefaultCta(expectedFormat, keyword);
  const script = sanitizeDailyIdeaScript(
    normalizeDailyIdeaScript(source.script ?? source.scenes ?? source.slides),
    expectedFormat,
    cta,
    keyword
  );
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
  const ensureFiveScenes = (idea: DailyIdeaResult): DailyIdeaResult => {
    const sceneTemplates: Record<number, { text: string; visual: string }> = {
      1: {
        text: 'Problema principală trebuie formulată clar și concret, cu un context recognoscibil pentru publicul țintă.',
        visual: 'Cadru introductiv cu problema principală evidențiată pe ecran',
      },
      2: {
        text: 'Primul pas aplicabil: alege o acțiune simplă pe care o poți face azi, fără echipament complicat și fără plan greu de urmat.',
        visual: 'Cadru demonstrativ cu primul pas aplicat practic',
      },
      3: {
        text: 'Al doilea pas aplicabil: repetă aceeași rutină în zile consecutive, cu focus pe consistență și execuție corectă.',
        visual: 'Cadru cu repetarea rutinei și accent pe execuție',
      },
      4: {
        text: buildDailyIdeaFinalSceneText(idea.format),
        visual: buildDailyIdeaFinalSceneVisual(idea.format),
      },
      5: buildConcreteSolutionScene(idea.format),
    };

    const normalized = Array.from({ length: 5 }, (_, index) => {
      const sceneNumber = index + 1;
      const existing = idea.script.find((scene) => scene.scene === sceneNumber) || idea.script[index];
      if (existing && normalizeTextValue(existing.text)) {
        return {
          scene: sceneNumber,
          text: normalizeTextValue(existing.text),
          visual: normalizeTextValue(existing.visual) || sceneTemplates[sceneNumber].visual,
        };
      }

      return {
        scene: sceneNumber,
        text: sceneTemplates[sceneNumber].text,
        visual: sceneTemplates[sceneNumber].visual,
      };
    });

    return {
      ...idea,
      script: sanitizeDailyIdeaScript(normalized, idea.format, idea.cta, idea.dmKeyword),
    };
  };

  return {
    reel: ensureFiveScenes(normalizeDailyIdeaResult(source.reel, 'REEL')),
    carousel: ensureFiveScenes(normalizeDailyIdeaResult(source.carousel, 'CAROUSEL')),
    story: ensureFiveScenes(normalizeDailyIdeaResult(source.story, 'STORY')),
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
  const rawTitle =
    normalizeTextValue(source.sectionTitle) ||
    normalizeTextValue(source.title) ||
    normalizeTextValue(source.heading) ||
    normalizeTextValue(source.name) ||
    normalizeTextValue(source.label);

  if (!rawTitle) {
    return '';
  }

  const normalizedRawTitle = normalizeLooseComparisonText(rawTitle);
  const matchedDefaultTitle = STRUCTURED_IDEA_SECTION_TITLES.find((title) =>
    normalizedRawTitle.startsWith(normalizeLooseComparisonText(title))
  );

  return matchedDefaultTitle || rawTitle;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripStructuredIdeaSectionHeading(text: string, title: string): string {
  let cleaned = text.trim();
  const escapedTitle = escapeRegExp(title);
  const headingPattern = new RegExp(
    `^${escapedTitle}(?:\\s*,[^\\n]*)?(?:\\r?\\n|\\s*[:\\-–]\\s*)?`,
    'i'
  );

  for (let i = 0; i < 2; i += 1) {
    const next = cleaned.replace(headingPattern, '').trim();
    if (next === cleaned) {
      break;
    }
    cleaned = next;
  }

  return cleaned;
}

function sanitizeStructuredIdeaSectionText(text: string, title: string): string {
  return stripStructuredIdeaSectionHeading(normalizeTextValue(text), title);
}

function sanitizeStructuredIdeaScriptSections(
  script: StructuredIdeaSection[]
): StructuredIdeaSection[] {
  const hasPracticalSection = script.some((section) => hasConcreteSolutionSignals(normalizeTextValue(section.text)));

  return script.map((section, index) => {
    const sectionTitle = section.sectionTitle || STRUCTURED_IDEA_SECTION_TITLES[index] || `PARTEA ${index + 1}`;
    const cleanedText = sanitizeStructuredIdeaSectionText(section.text, sectionTitle);
    const practicalFallback =
      index === 2
        ? 'Exemplu concret: setează timer 6 minute, fă 1 minut respirație, 2 minute mobilitate și 3 minute activare controlată, 5 zile pe săptămână.'
        : 'Aplică un pas simplu, măsurabil și repetabil timp de 7 zile pentru progres real.';

    return {
      ...section,
      sectionTitle,
      text:
        !hasPracticalSection && index === 2
          ? practicalFallback
          : repairPossiblyTruncatedText(cleanedText, practicalFallback),
    };
  });
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
    const sectionTitle =
      normalizeStructuredIdeaTitle(part) ||
      STRUCTURED_IDEA_SECTION_TITLES[index] ||
      `PARTEA ${index + 1}`;
    const text = sanitizeStructuredIdeaSectionText(textParts.join('\n\n').trim(), sectionTitle);

    return {
      sectionTitle,
      text,
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

function looksLikeStructuredIdeaMetaText(value: string): boolean {
  const normalized = normalizeLooseComparisonText(value);
  if (!normalized) {
    return true;
  }

  const metaSignals = [
    'ideea trebuie',
    'mesajul trebuie',
    'partea aceasta',
    'partea asta',
    'in partea de',
    'poti lua o situatie',
    'trebuie sa numesti',
    'trebuie sa explici',
    'important este sa explici',
    'la final ideea trebuie',
    'raportat la',
    'pleci de la ideea ta',
    'ca sa devina memorabil',
  ];

  return metaSignals.some((signal) => normalized.includes(signal));
}

function looksLikeWeakStructuredHook(hook: string): boolean {
  const normalized = normalizeLooseComparisonText(hook);
  if (!normalized) {
    return true;
  }

  return (
    normalized.startsWith('de ce vreau sa vorbesc') ||
    normalized.startsWith('vreau sa vorbesc despre') ||
    normalized.includes('mai multa energie si echilibru pentru') ||
    normalized.split(/\s+/).length > 18
  );
}

function looksLikeTruncatedStructuredText(value: string): boolean {
  const text = value.trim();
  if (!text) {
    return true;
  }

  if (/[([{]$/.test(text)) {
    return true;
  }

  if (/[.?!:;"')\]]$/.test(text)) {
    return false;
  }

  if (text.length < 80) {
    return text.split(/\s+/).length < 16;
  }

  const lastWord = text.split(/\s+/).pop() || '';
  if (lastWord.length <= 2) {
    return true;
  }

  const truncatedEndings = ['do', 'dur', 'ener', 'conti', 'consec', 'obos', 'epuiz', 'incep', 'ince', 'renun'];
  return truncatedEndings.some((ending) => lastWord.toLowerCase() === ending);
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

type StructuredIdeaBlockKey =
  | 'mainIdea'
  | 'hook1'
  | 'hook2'
  | 'section1'
  | 'section2'
  | 'section3'
  | 'section4'
  | 'cta';

function getStructuredIdeaWeakBlocks(
  parsed: Partial<Record<StructuredIdeaBlockKey, string>>
): StructuredIdeaBlockKey[] {
  const weakBlocks: StructuredIdeaBlockKey[] = [];

  if (!parsed.mainIdea || looksLikeStructuredIdeaPlaceholder(parsed.mainIdea)) {
    weakBlocks.push('mainIdea');
  }

  if (!parsed.hook1 || looksLikeStructuredIdeaPlaceholder(parsed.hook1) || looksLikeWeakStructuredHook(parsed.hook1)) {
    weakBlocks.push('hook1');
  }

  if (!parsed.hook2 || looksLikeStructuredIdeaPlaceholder(parsed.hook2) || looksLikeWeakStructuredHook(parsed.hook2)) {
    weakBlocks.push('hook2');
  }

  (['section1', 'section2', 'section3', 'section4'] as StructuredIdeaBlockKey[]).forEach((key) => {
    const sectionIndex = Number(key.replace('section', '')) - 1;
    const sectionTitle = STRUCTURED_IDEA_SECTION_TITLES[sectionIndex] || `PARTEA ${sectionIndex + 1}`;
    const text = sanitizeStructuredIdeaSectionText(parsed[key] || '', sectionTitle);
    if (
      !text ||
      looksLikeStructuredIdeaPlaceholder(text) ||
      looksLikeStructuredIdeaMetaText(text) ||
      looksLikeTruncatedStructuredText(text) ||
      text.split(/\s+/).length < 40
    ) {
      weakBlocks.push(key);
    }
  });

  if (!parsed.cta || looksLikeStructuredIdeaPlaceholder(parsed.cta)) {
    weakBlocks.push('cta');
  }

  return weakBlocks;
}

function parseStructuredIdeaDelimitedContent(
  content: string,
  fallbackCtaStyle: string
): {
  parsed: Partial<Record<StructuredIdeaBlockKey, string>>;
  missing: StructuredIdeaBlockKey[];
  result: StructuredIdeaResult | null;
} {
  const blockMap: Record<StructuredIdeaBlockKey, string> = {
    mainIdea: 'MAIN_IDEA',
    hook1: 'HOOK1',
    hook2: 'HOOK2',
    section1: 'SECTION1',
    section2: 'SECTION2',
    section3: 'SECTION3',
    section4: 'SECTION4',
    cta: 'CTA',
  };

  const parsed = Object.entries(blockMap).reduce((acc, [key, sectionName]) => {
    const value = extractDelimitedSection(content, sectionName);
    if (value) {
      acc[key as StructuredIdeaBlockKey] = value;
    }
    return acc;
  }, {} as Partial<Record<StructuredIdeaBlockKey, string>>);

  const missing = (Object.keys(blockMap) as StructuredIdeaBlockKey[]).filter((key) => !parsed[key]);

  let result: StructuredIdeaResult | null = null;
  if (missing.length === 0) {
    const normalized = normalizeStructuredIdeaResult(
      {
        mainIdea: parsed.mainIdea,
        hooks: [parsed.hook1, parsed.hook2],
        script: [
          { sectionTitle: STRUCTURED_IDEA_SECTION_TITLES[0], text: parsed.section1 },
          { sectionTitle: STRUCTURED_IDEA_SECTION_TITLES[1], text: parsed.section2 },
          { sectionTitle: STRUCTURED_IDEA_SECTION_TITLES[2], text: parsed.section3 },
          { sectionTitle: STRUCTURED_IDEA_SECTION_TITLES[3], text: parsed.section4 },
        ],
        cta: parsed.cta,
        ctaStyleApplied: fallbackCtaStyle,
        improvements: STRUCTURED_IDEA_DEFAULT_IMPROVEMENTS,
      },
      fallbackCtaStyle
    );

    result = isStructuredIdeaResultIncomplete(normalized) ? null : normalized;
  }

  return {
    parsed,
    missing,
    result,
  };
}

function buildStructuredIdeaDelimitedFormatInstructions(targets: StructuredIdeaBlockKey[]): string {
  const labels: Record<StructuredIdeaBlockKey, string> = {
    mainIdea: '===MAIN_IDEA===\n1 propoziție clară, naturală',
    hook1: '===HOOK1===\nHook scurt și memorabil',
    hook2: '===HOOK2===\nA doua variantă de hook',
    section1: '===SECTION1===\nPARTEA 1 – Context, 70-120 cuvinte, text final vorbit',
    section2: '===SECTION2===\nPARTEA 2 – Explicație clară, 70-120 cuvinte, text final vorbit',
    section3: '===SECTION3===\nPARTEA 3 – Exemplu / aplicație, 70-120 cuvinte, text final vorbit',
    section4: '===SECTION4===\nPARTEA 4 – Principiu final, 70-120 cuvinte, text final vorbit',
    cta: '===CTA===\nCTA final, 30-55 cuvinte',
  };

  return targets.map((target) => labels[target]).join('\n\n');
}

function isStructuredIdeaResultIncomplete(result: StructuredIdeaResult): boolean {
  if (!result.mainIdea || looksLikeStructuredIdeaPlaceholder(result.mainIdea)) {
    return true;
  }

  if (
    result.hooks.length < 2 ||
    result.hooks.some((hook) => looksLikeStructuredIdeaPlaceholder(hook) || looksLikeWeakStructuredHook(hook))
  ) {
    return true;
  }

  if (
    result.script.length < STRUCTURED_IDEA_SECTION_TITLES.length ||
    result.script.some((section) => {
      const text = section.text.trim();
      return (
        !text ||
        looksLikeStructuredIdeaPlaceholder(text) ||
        looksLikeStructuredIdeaMetaText(text) ||
        looksLikeTruncatedStructuredText(text) ||
        text.split(/\s+/).length < 40
      );
    })
  ) {
    return true;
  }

  return !result.cta || looksLikeStructuredIdeaPlaceholder(result.cta);
}

function buildStructuredIdeaPrompt(input: StructureUserIdeaInput): { prompt: string; ctaStyle: string } {
  const brandVoiceSection = buildBrandVoiceSection(input.contentPreferences);
  const ctaStyle = input.contentPreferences?.brandVoice?.ctaStyle || 'Mix';
  const antiRepeatSection = buildAntiRepeatPromptSection(input.generationContext);
  const languageInstruction = buildAiLanguageInstruction(normalizeLanguage(input.language));

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

${languageInstruction}

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
- NU scrie meta-explicații despre content precum: "ideea trebuie", "în partea asta", "mesajul trebuie", "poți spune".
- Scrie direct textul final, ca și cum antrenorul ar vorbi în cameră.
- Dacă utilizatorul vorbește din experiență personală, păstrează natural perspectiva de tip "și eu am fost acolo".
- Hook-urile trebuie să fie scurte, clare și memorabile, nu să repete brut ideea utilizatorului.

${antiRepeatSection}

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
- Script total: 320-520 cuvinte.
- Fiecare secțiune din script: minimum 70-120 cuvinte.
- Fiecare secțiune trebuie să fie completă, fluentă, fără bullets.
- CTA: minimum 30-55 cuvinte, clar și acționabil.

CALITATE OBLIGATORIE:
- Text conversațional, natural, fără formulări rigide.
- Fiecare secțiune trebuie să conțină explicație concretă, nu doar afirmații.
- Menține ideea utilizatorului, dar o dezvoltă clar și coerent.
- Scriptul trebuie să curgă logic dintr-o secțiune în alta, nu să pară 4 texte separate lipite.
- Fiecare secțiune trebuie să poată fi citită cu voce tare fără să sune stângaci.

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
  input: StructureUserIdeaInput,
  partialResult: StructuredIdeaResult,
  fallbackCtaStyle: string
): Promise<StructuredIdeaResult> {
  const brandVoiceSection = buildBrandVoiceSection(input.contentPreferences);
  const antiRepeatSection = buildAntiRepeatPromptSection(input.generationContext);
  const languageInstruction = buildAiLanguageInstruction(normalizeLanguage(input.language));
  const sectionsSnapshot = partialResult.script
    .map((section, index) => `${index + 1}. ${section.sectionTitle}: ${section.text || '[LIPSĂ]'}`)
    .join('\n');

  const prompt = `Completezi un răspuns JSON incomplet pentru structurarea unei idei de Reel.

NIȘĂ: "${input.niche}"
BRAND VOICE:
${brandVoiceSection}
STIL CTA: ${fallbackCtaStyle}

${languageInstruction}

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
- Fiecare secțiune din script trebuie să aibă 70-120 cuvinte și conținut concret.
- Nu lăsa texte precum "string", titluri simple sau secțiuni goale.
- Returnează exact 4 secțiuni de script și exact 4 itemi la improvements.
- NU descrie cum ar trebui construit mesajul. Scrie direct varianta finală, ca text vorbit.
- NU folosi formulări meta precum "ideea trebuie", "mesajul trebuie", "în partea asta", "poți spune".
- Hook-urile trebuie rescrise complet dacă sunt vagi, prea lungi sau repetă brut ideea utilizatorului.

${antiRepeatSection}

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

type MultiFormatIdeaKey = 'reel' | 'carousel' | 'story';

function extractDelimitedSection(content: string, sectionName: string): string {
  const pattern = new RegExp(`===${sectionName}===([\\s\\S]*?)(?=\\n===|$)`, 'i');
  const match = content.match(pattern);
  return match?.[1]?.trim() || '';
}

function extractDelimitedLineValue(content: string, label: string): string {
  const pattern = new RegExp(`^${label}:\\s*(.+)$`, 'im');
  const match = content.match(pattern);
  return match?.[1]?.trim() || '';
}

function parseDelimitedFormatSection(
  content: string,
  key: MultiFormatIdeaKey,
  expectedFormat: DailyIdeaResult['format']
): DailyIdeaResult | null {
  const sectionName = key.toUpperCase();
  const section = extractDelimitedSection(content, sectionName);

  if (!section) {
    return null;
  }

  try {
    return normalizeDailyIdeaResult(
      {
        format: expectedFormat,
        hook: extractDelimitedLineValue(section, 'HOOK'),
        script: Array.from({ length: 5 }, (_, index) => ({
          scene: index + 1,
          text: extractDelimitedLineValue(section, `SCENE${index + 1}`),
          visual: extractDelimitedLineValue(section, `VISUAL${index + 1}`),
        })),
        cta: extractDelimitedLineValue(section, 'CTA'),
        objective: 'Generare lead-uri',
        conversionRate: 0,
        leadMagnet: extractDelimitedLineValue(section, 'LEAD_MAGNET'),
        dmKeyword: extractDelimitedLineValue(section, 'DM_KEYWORD'),
        reasoning: extractDelimitedLineValue(section, 'REASONING'),
      },
      expectedFormat
    );
  } catch {
    return null;
  }
}

function parseDelimitedMultiFormatIdeaContent(content: string): {
  parsed: Partial<Record<MultiFormatIdeaKey, DailyIdeaResult>>;
  missing: MultiFormatIdeaKey[];
} {
  const parsed: Partial<Record<MultiFormatIdeaKey, DailyIdeaResult>> = {};
  const formats: Array<{ key: MultiFormatIdeaKey; expectedFormat: DailyIdeaResult['format'] }> = [
    { key: 'reel', expectedFormat: 'REEL' },
    { key: 'carousel', expectedFormat: 'CAROUSEL' },
    { key: 'story', expectedFormat: 'STORY' },
  ];

  const missing = formats
    .filter(({ key, expectedFormat }) => {
      const result = parseDelimitedFormatSection(content, key, expectedFormat);
      if (result) {
        parsed[key] = result;
        return false;
      }
      return true;
    })
    .map(({ key }) => key);

  return { parsed, missing };
}

function assembleMultiFormatIdeaResult(
  parsed: Partial<Record<MultiFormatIdeaKey, DailyIdeaResult>>,
  source: MultiFormatIdeaResult['source']
): MultiFormatIdeaResult {
  if (!parsed.reel || !parsed.carousel || !parsed.story) {
    throw new Error('Incomplete multi-format parsed result.');
  }

  return {
    reel: parsed.reel,
    carousel: parsed.carousel,
    story: parsed.story,
    source,
  };
}

function buildDelimitedFormatInstructions(targets: MultiFormatIdeaKey[]): string {
  const formatMap: Record<MultiFormatIdeaKey, DailyIdeaResult['format']> = {
    reel: 'REEL',
    carousel: 'CAROUSEL',
    story: 'STORY',
  };

  return targets
    .map((target) => {
      const format = formatMap[target];
      return `===${format}===
HOOK: hook scurt și specific, pe un singur rând
SCENE1: text complet, pe un singur rând
VISUAL1: vizual scurt, filmabil
SCENE2: text complet, pe un singur rând
VISUAL2: vizual scurt, filmabil
SCENE3: text complet, pe un singur rând
VISUAL3: vizual scurt, filmabil
SCENE4: concluzie practică / principiu clar, fără CTA, pe un singur rând
VISUAL4: vizual scurt, filmabil
SCENE5: soluție concretă cu pași clari, timp/repetări/frecvență, fără CTA, pe un singur rând
VISUAL5: vizual scurt, filmabil pentru demonstrarea soluției
CTA: CTA cu keyword DM și beneficiu clar, pe un singur rând
LEAD_MAGNET: lead magnet scurt, pe un singur rând
DM_KEYWORD: un singur keyword
REASONING: 1-2 propoziții scurte, pe un singur rând`;
    })
    .join('\n\n');
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

function extractIdeaSentences(ideaText: string): string[] {
  return ideaText
    .split(/[.!?]+/)
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function buildStructuredIdeaMainPoint(ideaText: string): string {
  const sentences = extractIdeaSentences(ideaText);
  const firstSentence = sentences[0] || normalizeIdeaSeedText(ideaText);
  return firstSentence
    .replace(/^vreau sa vorbesc despre\s*/i, '')
    .replace(/^vreau să vorbesc despre\s*/i, '')
    .replace(/^cum\s+/i, '')
    .replace(/\s*,\s*/g, ', ')
    .trim();
}

function buildStructuredIdeaDirectHooks(ideaText: string): string[] {
  const mainPoint = buildStructuredIdeaMainPoint(ideaText);

  const hooks = [
    'Nu e despre talent. E despre să nu te oprești prea repede',
    'Ce am înțeles când am încetat să mai renunț la primul greu',
    'Orice scop devine mai ușor când nu-l tratezi ca pe o pedeapsă',
    'Perseverența nu trebuie să doară ca să te ducă departe',
  ];

  if (!mainPoint) {
    return hooks.slice(0, 2);
  }

  return [
    hooks[0],
    hooks[1],
  ];
}

function buildStructuredIdeaRescueCta(mainIdea: string, ctaStyle: string): string {
  const compactIdea = normalizeIdeaSeedText(mainIdea)
    .replace(/^cum\s+/i, '')
    .replace(/[.?!]+$/g, '');

  if (/educational|educational \(salveaza \/ share\)|educațional/i.test(ctaStyle)) {
    return `Dacă ți-a pus ordine în minte ideea asta despre ${compactIdea || 'perseverență și consecvență'}, salvează materialul și trimite-l cuiva care are nevoie să audă asta exact acum.`;
  }

  if (/dm|lead/i.test(ctaStyle)) {
    return `Dacă vrei, îți transform și alte idei brute în scripturi clare, naturale și ușor de spus pe cameră. Scrie-mi în privat și le lucrăm împreună.`;
  }

  return `Dacă vrei, îți transform și alte idei brute în scripturi clare, naturale și ușor de spus pe cameră, ca să nu mai sune nici rigide, nici trase de păr.`;
}

function buildStructuredIdeaRescueSection4(mainIdea: string, section3: string): string {
  const compactIdea = normalizeIdeaSeedText(mainIdea)
    .replace(/[.?!]+$/g, '')
    .trim();
  const fallbackLead = compactIdea
    ? `Ideea de ținut minte e asta: ${compactIdea.charAt(0).toLowerCase()}${compactIdea.slice(1)}.`
    : 'Ideea de ținut minte e asta: nu trebuie să transformi tot procesul într-o luptă continuă ca să ajungi unde vrei.';

  const section3Hint = normalizeIdeaSeedText(section3).toLowerCase();
  const hasBurnoutSignal =
    section3Hint.includes('burnout') ||
    section3Hint.includes('epuiz') ||
    section3Hint.includes('obos') ||
    section3Hint.includes('energie');

  if (hasBurnoutSignal) {
    return `${fallbackLead} Nu trebuie să te rupi în două ca să demonstrezi că meriți rezultatul. Ai nevoie să rămâi suficient de consecvent, suficient de serios și suficient de prezent încât munca ta să se adune în timp. Acolo apare progresul real. Nu când forțezi două zile și apoi cazi, ci când continui într-un ritm pe care chiar îl poți duce. Când înțelegi asta, succesul nu mai arată ca o pedeapsă, ci ca un drum pe care poți merge fără să te pierzi pe tine pe parcurs.`;
  }

  return `${fallbackLead} Cei care ajung unde își propun nu sunt mereu cei mai talentați, ci cei care nu se opresc de fiecare dată când apare primul greu. Perseverența bună nu înseamnă încăpățânare oarbă, ci capacitatea de a continua și de a-ți păstra direcția chiar și când ritmul nu e perfect. Exact acolo se construiește diferența dintre intenție și rezultat. Dacă rămâi în joc suficient de mult, munca începe să se vadă.`;
}

function buildStructuredIdeaRescueSection2(mainIdea: string, section1: string): string {
  const compactIdea = normalizeIdeaSeedText(mainIdea).replace(/[.?!]+$/g, '').trim();
  const section1Hint = normalizeIdeaSeedText(section1).toLowerCase();
  const hasEnergySignal =
    section1Hint.includes('energie') ||
    section1Hint.includes('obosit') ||
    section1Hint.includes('epuiz') ||
    section1Hint.includes('durer');

  if (hasEnergySignal) {
    return `Adevărul este că nu trebuie să alegi între rezultate și starea ta de bine. ${compactIdea ? compactIdea.charAt(0).toUpperCase() + compactIdea.slice(1) : 'Poți să ajungi unde îți propui'} dacă înțelegi că seriozitatea nu înseamnă să tragi de tine până te storci. Înseamnă să fii consecvent și să revii la planul tău chiar și în zilele mai slabe. Munca făcută inteligent bate efortul dus în extreme. Când nu mai vezi progresul ca pe o pedeapsă, începi să-l poți susține cu mai mult calm, mai multă claritate și mai puțină presiune pe tine.`;
  }

  return `Explicația simplă este asta: rezultatele nu apar pentru că te forțezi haotic o perioadă scurtă, ci pentru că rămâi suficient de constant cât să lași efortul să se adune. ${compactIdea ? compactIdea.charAt(0).toUpperCase() + compactIdea.slice(1) : 'Scopurile mari'} devin mai ușor de dus când le spargi în pași repetabili și când nu te sperii de primele zile grele. Asta înseamnă perseverență reală. Nu dramă, nu epuizare, ci seriozitatea de a continua și atunci când nu totul merge perfect.`;
}

function buildStructuredIdeaRescueSection3(mainIdea: string, section2: string): string {
  const section2Hint = normalizeIdeaSeedText(section2).toLowerCase();
  const hasConsistencySignal =
    section2Hint.includes('constant') ||
    section2Hint.includes('consecvent') ||
    section2Hint.includes('ritm') ||
    section2Hint.includes('contin');

  if (hasConsistencySignal) {
    return `Uite cum se vede asta în viața reală: pornești cu entuziasm, te ții câteva zile, apoi vine o zi aglomerată și simți imediat că parcă tot planul s-a rupt. Exact acolo apare capcana. În loc să adaptezi ritmul și să mergi mai departe, ai tendința să crezi că totul a eșuat și că trebuie să reîncepi perfect de luni. Dar nu asta te ajută. Te ajută să continui într-o variantă mai simplă, dar să continui. Acolo se construiește încrederea că poți ajunge unde vrei fără să te consumi inutil pe drum.`;
  }

  return `Imaginează-ți o perioadă în care îți propui ceva mare și după primele obstacole începi să simți că e prea mult. Asta pățesc cei mai mulți. Nu pentru că nu pot, ci pentru că interpretează orice zi mai grea ca pe un semn că drumul e greșit. În realitate, progresul apare când accepți că uneori mergi mai tare, alteori mai încet, dar nu abandonezi ideea de bază. Când înveți să continui fără să dramatizezi fiecare pas, tot procesul devine mai stabil și mai ușor de dus.`;
}

function buildStructuredIdeaRescueSection1(mainIdea: string): string {
  const compactIdea = normalizeIdeaSeedText(mainIdea).replace(/[.?!]+$/g, '').trim();
  return `Știu cum e să te uiți la un scop mare și să simți din prima că o să te coste prea multă energie. Și eu am trecut prin faza în care aveam impresia că, dacă vreau un rezultat serios, trebuie automat să trag de mine până mă storc. Doar că fix ideea asta m-a blocat cel mai tare. ${compactIdea ? compactIdea.charAt(0).toUpperCase() + compactIdea.slice(1) : 'Schimbarea reală'} începe abia când încetezi să mai vezi procesul ca pe o pedeapsă și începi să-l construiești într-un mod pe care chiar îl poți duce în viața reală.`;
}

function rescueStructuredIdeaResultFromPartial(
  parsed: Partial<Record<StructuredIdeaBlockKey, string>>,
  fallbackCtaStyle: string
): StructuredIdeaResult | null {
  const requiredCore: StructuredIdeaBlockKey[] = [
    'mainIdea',
    'hook1',
    'hook2',
    'section1',
  ];

  if (requiredCore.some((key) => !parsed[key])) {
    return null;
  }

  const repairedSection1 =
    parsed.section1 && !looksLikeTruncatedStructuredText(parsed.section1) && !looksLikeStructuredIdeaMetaText(parsed.section1)
      ? parsed.section1
      : buildStructuredIdeaRescueSection1(parsed.mainIdea || '');

  const repairedSection2 =
    parsed.section2 &&
    parsed.section2.trim().split(/\s+/).length >= 28 &&
    !looksLikeStructuredIdeaMetaText(parsed.section2) &&
    !looksLikeTruncatedStructuredText(parsed.section2)
      ? parsed.section2
      : buildStructuredIdeaRescueSection2(parsed.mainIdea || '', repairedSection1);
  const rescuedSection4 =
    parsed.section4 && !looksLikeTruncatedStructuredText(parsed.section4)
      ? parsed.section4
      : buildStructuredIdeaRescueSection4(parsed.mainIdea || '', parsed.section3 || repairedSection2);
  const repairedSection3 =
    parsed.section3 &&
    parsed.section3.trim().split(/\s+/).length >= 28 &&
    !looksLikeStructuredIdeaMetaText(parsed.section3) &&
    !looksLikeTruncatedStructuredText(parsed.section3)
      ? parsed.section3
      : buildStructuredIdeaRescueSection3(parsed.mainIdea || '', repairedSection2);
  const repairedHooks = [parsed.hook1, parsed.hook2].map((hook, index) => {
    if (hook && !looksLikeWeakStructuredHook(hook) && !looksLikeStructuredIdeaPlaceholder(hook)) {
      return hook;
    }

    return buildStructuredIdeaDirectHooks(parsed.mainIdea || parsed.section1 || '')[index] || '';
  });

  const rescued = normalizeStructuredIdeaResult(
    {
      mainIdea: parsed.mainIdea,
      hooks: repairedHooks,
      script: [
        { sectionTitle: STRUCTURED_IDEA_SECTION_TITLES[0], text: repairedSection1 },
        { sectionTitle: STRUCTURED_IDEA_SECTION_TITLES[1], text: repairedSection2 },
        { sectionTitle: STRUCTURED_IDEA_SECTION_TITLES[2], text: repairedSection3 },
        { sectionTitle: STRUCTURED_IDEA_SECTION_TITLES[3], text: rescuedSection4 },
      ],
      cta: parsed.cta || buildStructuredIdeaRescueCta(parsed.mainIdea || '', fallbackCtaStyle),
      ctaStyleApplied: fallbackCtaStyle,
      improvements: STRUCTURED_IDEA_DEFAULT_IMPROVEMENTS,
    },
    fallbackCtaStyle
  );

  return {
    ...rescued,
    hooks: repairedHooks,
    script: sanitizeStructuredIdeaScriptSections([
      { ...rescued.script[0], text: repairedSection1 },
      { ...rescued.script[1], text: repairedSection2 },
      { ...rescued.script[2], text: repairedSection3 },
      { ...rescued.script[3], text: rescuedSection4 },
    ]),
    cta: rescued.cta || buildStructuredIdeaRescueCta(parsed.mainIdea || '', fallbackCtaStyle),
  };
}

function acceptStructuredIdeaResultFromFullAiBlocks(
  parsed: Partial<Record<StructuredIdeaBlockKey, string>>,
  fallbackCtaStyle: string
): StructuredIdeaResult | null {
  const allBlocks: StructuredIdeaBlockKey[] = [
    'mainIdea',
    'hook1',
    'hook2',
    'section1',
    'section2',
    'section3',
    'section4',
    'cta',
  ];

  if (allBlocks.some((key) => !parsed[key])) {
    return null;
  }

  const normalized = normalizeStructuredIdeaResult(
    {
      mainIdea: parsed.mainIdea,
      hooks: [parsed.hook1, parsed.hook2],
      script: [
        { sectionTitle: STRUCTURED_IDEA_SECTION_TITLES[0], text: parsed.section1 },
        { sectionTitle: STRUCTURED_IDEA_SECTION_TITLES[1], text: parsed.section2 },
        { sectionTitle: STRUCTURED_IDEA_SECTION_TITLES[2], text: parsed.section3 },
        {
          sectionTitle: STRUCTURED_IDEA_SECTION_TITLES[3],
          text: parsed.section4 || buildStructuredIdeaRescueSection4(parsed.mainIdea || '', parsed.section3 || ''),
        },
      ],
      cta: parsed.cta || buildStructuredIdeaRescueCta(parsed.mainIdea || '', fallbackCtaStyle),
      ctaStyleApplied: fallbackCtaStyle,
      improvements: STRUCTURED_IDEA_DEFAULT_IMPROVEMENTS,
    },
    fallbackCtaStyle
  );

  const repaired: StructuredIdeaResult = {
    ...normalized,
    hooks: normalized.hooks.map((hook, index) => {
      if (!looksLikeWeakStructuredHook(hook) && !looksLikeStructuredIdeaPlaceholder(hook)) {
        return hook;
      }

      return buildStructuredIdeaDirectHooks(parsed.mainIdea || parsed.section1 || '')[index] || hook;
    }),
    script: normalized.script.map((section, index) => {
      if (!looksLikeStructuredIdeaMetaText(section.text) && section.text.trim().split(/\s+/).length >= 40) {
        return section;
      }

      if (index === 3) {
        return {
          ...section,
          text: buildStructuredIdeaRescueSection4(parsed.mainIdea || '', parsed.section3 || ''),
        };
      }

      return section;
    }),
    cta:
      normalized.cta && !looksLikeStructuredIdeaPlaceholder(normalized.cta)
        ? normalized.cta
        : buildStructuredIdeaRescueCta(parsed.mainIdea || '', fallbackCtaStyle),
  };

  const sanitized = {
    ...repaired,
    script: sanitizeStructuredIdeaScriptSections(repaired.script),
  };

  if (sanitized.script.some((section) => looksLikeTruncatedStructuredText(section.text) || section.text.trim().split(/\s+/).length < 40)) {
    return null;
  }

  return sanitized;
}

function buildStructuredIdeaEmergencyResult(input: StructureUserIdeaInput): StructuredIdeaResult {
  const ideaSeed = normalizeIdeaSeedText(input.ideaText);
  const nicheSeed = normalizeIdeaSeedText(input.niche);
  const ctaStyle = input.contentPreferences?.brandVoice?.ctaStyle || 'Mix';
  const sentences = extractIdeaSentences(input.ideaText);
  const coreIdea = buildStructuredIdeaMainPoint(input.ideaText);
  const personalShift =
    sentences.find((sentence) => /candva|cândva|si eu|și eu|am fost/i.test(sentence)) ||
    'Și eu am fost în punctul în care vedeam disciplina ca pe ceva greu și obositor.';
  const closingThought =
    sentences.find((sentence) => /nu te lasa|nu te lăsa|munceste|muncește|continua|continuă/i.test(sentence)) ||
    'Nu te lăsa exact în momentul în care încă nu vezi rezultatul, pentru că acolo renunță cei mai mulți.';
  const hooks = buildStructuredIdeaDirectHooks(input.ideaText);

  return {
    mainIdea: coreIdea || ideaSeed,
    hooks,
    script: [
      {
        sectionTitle: STRUCTURED_IDEA_SECTION_TITLES[0],
        text: `${personalShift} Mult timp am crezut că, dacă un lucru cere perseverență, înseamnă automat că trebuie să doară, să te stoarcă și să te facă să simți că tragi de tine în fiecare zi. Doar că nu acolo era problema. Problema era felul în care mă uitam la muncă și la disciplină: ca la o povară, nu ca la ceva care se construiește pas cu pas. Și cred că foarte mulți oameni se blochează exact aici. Vor un rezultat mare, dar în mintea lor drumul până acolo arată atât de greu încât obosesc înainte să înceapă serios.`,
      },
      {
        sectionTitle: STRUCTURED_IDEA_SECTION_TITLES[1],
        text: `Adevărul este că poți atinge aproape orice scop dacă rămâi suficient de mult în joc, dar fără să transformi tot procesul într-o luptă continuă cu tine. Perseverența nu înseamnă să mergi zilnic la maximum. Înseamnă să continui și când nu ai chef, și când nu vezi imediat rezultatul, și când progresul nu arată spectaculos. Seriozitatea nu înseamnă rigiditate. Înseamnă să-ți iei promisiunea în serios chiar și în zilele obișnuite. Iar munca nu trebuie să pară o pedeapsă. Când o vezi ca pe o serie de pași repetabili, începe să pară mai ușor de dus și mai realist de ținut.`,
      },
      {
        sectionTitle: STRUCTURED_IDEA_SECTION_TITLES[2],
        text: `Uite cum se vede asta în viața reală: începi ceva cu entuziasm, te ții câteva zile, apoi vine o zi mai aglomerată, o stare mai proastă sau o perioadă în care nu mai simți că merge. Și exact atunci apare gândul că poate nu e pentru tine sau că e prea greu. Dar de multe ori nu ai nevoie să schimbi scopul. Ai nevoie doar să nu abandonezi la primul blocaj. Să reduci ritmul, să simplifici pasul următor, să continui într-o formă mai ușoară, dar să continui. Acolo se face diferența între oamenii care doar pornesc și cei care chiar ajung undeva.`,
      },
      {
        sectionTitle: STRUCTURED_IDEA_SECTION_TITLES[3],
        text: `Asta e ideea pe care vreau s-o ții minte: nu trebuie să faci totul greu ca să ajungi departe. Trebuie doar să fii suficient de serios încât să nu renunți de fiecare dată când devine incomod. ${closingThought} Rezultatele mari nu apar pentru că ai avut motivație perfectă, ci pentru că ai rămas acolo destul de mult cât să lași munca să se adune. Când înțelegi asta, disciplina nu mai pare o pedeapsă. Pare exact ce este: un drum pe care mergi mai departe, chiar și atunci când încă nu se vede tot.`,
      },
    ],
    cta: `Dacă vrei, îți transform și alte idei brute în scripturi clare, naturale și ușor de spus pe cameră, ca să nu mai sune nici rigide, nici trase de păr.`,
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
  const cleaned = normalizeTextValue(angle).replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return 'Schimbă un singur lucru azi și corpul tău îți va mulțumi.';
  }
  const repaired = repairPossiblyTruncatedText(cleaned, cleaned);
  const withEnding = /[.!?]$/.test(repaired) ? repaired : `${repaired}.`;
  return withEnding;
}

function buildEmergencyScenes(lines: string[], visualPrefix: string): Scene[] {
  return lines.map((text, index) => ({
    scene: index + 1,
    text,
    visual: `${visualPrefix} ${index + 1}`,
  }));
}

function selectEmergencyVariantIndex(seed: string, count: number): number {
  const normalized = normalizeIdeaSeedText(seed);
  let hash = 0;

  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 31 + normalized.charCodeAt(index)) >>> 0;
  }

  const tick = Number(process.hrtime.bigint() % BigInt(count));
  return (hash + tick) % count;
}

function buildMultiFormatIdeaEmergencyResult(input: DailyIdeaInput): MultiFormatIdeaResult {
  const audienceLabel = buildEmergencyAudienceLabel(input.niche);
  const baseLeadMagnet = buildEmergencyLeadMagnet(audienceLabel);
  const variantIndex = selectEmergencyVariantIndex(
    `${input.niche}|${input.general ? 'general' : 'niche'}`,
    4
  );

  if (variantIndex === 0) {
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

  if (variantIndex === 1) {
    return {
      reel: {
        format: 'REEL',
        hook: buildEmergencyHook('Nu ai nevoie de extreme ca să vezi corpul mai ferm'),
        script: buildEmergencyScenes(
          [
            `Mulți ${audienceLabel} cred că rezultatele apar doar când faci totul perfect: sală multă, dietă strictă și disciplină fără pauză. Adevărul este că tocmai presiunea asta îi face pe mulți să renunțe repede.`,
            `Primul pas este să cobori standardul de intrare, nu obiectivul. Dacă poți face două sau trei sesiuni scurte pe săptămână, ai deja baza pe care poți construi fără să-ți dai viața peste cap.`,
            `Al doilea pas este să repeți aceleași mișcări utile suficient de des încât corpul să se adapteze. Consecvența bate varietatea haotică atunci când vrei tonifiere și mai mult control asupra corpului tău.`,
            `Dacă vrei structura simplă pe care o folosesc pentru consistență fără extreme, scrie RUTINA în DM și ți-o trimit imediat.`,
          ],
          'Cadru REEL'
        ),
        cta: 'Scrie RUTINA în DM și îți trimit schema simplă pentru consistență fără extreme.',
        objective: 'Generare lead-uri',
        conversionRate: 0,
        leadMagnet: baseLeadMagnet,
        dmKeyword: 'RUTINA',
        reasoning: `Acest Reel funcționează pentru că sparge o credință foarte comună la ${audienceLabel}: ideea că progresul cere extreme. Mesajul reduce rezistența, face obiectivul să pară realizabil și mută atenția pe consecvență. CTA-ul promite un cadru simplu și concret.`,
      },
      carousel: {
        format: 'CAROUSEL',
        hook: buildEmergencyHook('Cum arată, de fapt, progresul sustenabil'),
        script: buildEmergencyScenes(
          [
            `Primul slide clarifică problema: mulți caută rezultate rapide și ajung să alterneze perioade foarte bune cu perioade în care nu mai fac nimic. Pentru ${audienceLabel}, ciclul acesta consumă energie și scade încrederea.`,
            `Al doilea slide explică regula de bază: antrenamente puține, dar repetate, sunt mai valoroase decât planuri perfecte pe care nu le poți susține în ritmul tău real.`,
            `Al treilea slide arată ce urmărești concret: mai multă forță de bază, postură mai bună, mai mult control și semne mici că rutina se lipește de viața ta, nu că lucrezi împotriva ei.`,
            `Ultimul slide mută focusul dinspre perfecțiune spre structură. Când ai reguli simple și realist de aplicat, corpul răspunde mai bine decât atunci când îl duci dintr-o extremă în alta.`,
          ],
          'Slide CAROUSEL'
        ),
        cta: 'Scrie CONSECVENT în DM și îți trimit pașii de bază pentru progres sustenabil.',
        objective: 'Generare lead-uri',
        conversionRate: 0,
        leadMagnet: baseLeadMagnet,
        dmKeyword: 'CONSECVENT',
        reasoning: `Carousel-ul funcționează pentru că traduce ideea abstractă de progres sustenabil în criterii clare și ușor de reținut. Fiecare slide reduce confuzia și îl face pe cititor să-și reevalueze așteptările. CTA-ul continuă natural conversația.`,
      },
      story: {
        format: 'STORY',
        hook: buildEmergencyHook('Dacă tot începi și te oprești, problema nu e voința'),
        script: buildEmergencyScenes(
          [
            `Dacă simți că mereu începi bine și apoi pierzi ritmul, nu înseamnă că nu ești disciplinat. Pentru mulți ${audienceLabel}, planul este pur și simplu prea greu de susținut.`,
            `Un plan bun nu te stoarce în primele zile. Îți lasă spațiu să-l repeți și într-o săptămână aglomerată, nu doar într-una ideală.`,
            `Când simplifici suficient, începi să strângi dovezi că poți rămâne consecvent. Asta schimbă și corpul, și felul în care te raportezi la proces.`,
            `Dacă vrei varianta mea scurtă pentru săptămâni aglomerate, scrie PLAN în DM.`,
          ],
          'Cadru STORY'
        ),
        cta: 'Scrie PLAN în DM și îți trimit structura simplă pentru săptămâni aglomerate.',
        objective: 'Generare lead-uri',
        conversionRate: 0,
        leadMagnet: baseLeadMagnet,
        dmKeyword: 'PLAN',
        reasoning: `Story-ul merge bine pentru că pornește dintr-o frustrare foarte comună și o reframează fără judecată. Soluția pare realistă și ușor de testat, iar CTA-ul este scurt și potrivit pentru contextul de Story.`,
      },
      source: 'emergency-fallback',
    };
  }

  if (variantIndex === 2) {
    return {
      reel: {
        format: 'REEL',
        hook: buildEmergencyHook('Dacă te dor spatele și umerii, nu ignora semnalul'),
        script: buildEmergencyScenes(
          [
            `Pentru mulți ${audienceLabel}, durerile ușoare de spate și umeri au devenit ceva normal. Dar faptul că te-ai obișnuit cu ele nu înseamnă că trebuie să le accepți ca parte din fiecare zi.`,
            `Primul lucru util este să observi când corpul stă prea mult în aceeași poziție. De multe ori, problema nu este lipsa unui antrenament dur, ci lipsa mișcării mici și repetate peste zi.`,
            `Al doilea lucru este să introduci mișcări simple pentru coloană, omoplați și șolduri. Nu rezolvă totul instant, dar schimbă cum se simte corpul când le faci constant și fără grabă.`,
            `Dacă vrei mini-rutina mea pentru mobilitate și reset, scrie MOBILITATE în DM și ți-o trimit.`,
          ],
          'Cadru REEL'
        ),
        cta: 'Scrie MOBILITATE în DM și îți trimit mini-rutina simplă pentru mobilitate și reset.',
        objective: 'Generare lead-uri',
        conversionRate: 0,
        leadMagnet: baseLeadMagnet,
        dmKeyword: 'MOBILITATE',
        reasoning: `Acest Reel funcționează pentru că atinge un disconfort foarte ușor de recunoscut la ${audienceLabel}. Mesajul nu dramatizează, ci oferă o cale simplă și realistă. CTA-ul promite o soluție practică și imediat utilă.`,
      },
      carousel: {
        format: 'CAROUSEL',
        hook: buildEmergencyHook('3 semne că corpul tău cere mai multă mobilitate'),
        script: buildEmergencyScenes(
          [
            `Primul semn este rigiditatea de dimineață sau după perioade lungi de stat. Dacă ai nevoie de mult timp până simți că te miști firesc, corpul îți spune deja că are nevoie de mai multă variație.`,
            `Al doilea semn este că orice antrenament pare mai greu decât ar trebui. Uneori nu lipsa de motivație e problema, ci faptul că intri în efort cu un corp deja tensionat și limitat.`,
            `Al treilea semn este că te sprijini mereu pe aceleași zone: umeri, gât, lombar. Când segmentele astea preiau totul, apare și senzația că ești mereu obosit sau înțepenit.`,
            `Concluzia este simplă: mobilitatea nu e un bonus pentru perfecționiști. Este o bază minimă care îți face și antrenamentul, și ziua obișnuită mult mai ușor de dus.`,
          ],
          'Slide CAROUSEL'
        ),
        cta: 'Scrie POSTURA în DM și îți trimit pașii simpli pentru un corp mai puțin rigid.',
        objective: 'Generare lead-uri',
        conversionRate: 0,
        leadMagnet: baseLeadMagnet,
        dmKeyword: 'POSTURA',
        reasoning: `Carousel-ul funcționează pentru că listează semne clare, ușor de auto-identificat. Cititorul poate decide rapid dacă se regăsește, iar asta crește șansa să salveze sau să intre în DM pentru soluție.`,
      },
      story: {
        format: 'STORY',
        hook: buildEmergencyHook('Te simți mereu înțepenit? Începe de aici'),
        script: buildEmergencyScenes(
          [
            `Dacă te simți mereu înțepenit, nu înseamnă că trebuie să sari direct la antrenamente grele. Pentru mulți ${audienceLabel}, corpul cere mai întâi puțin spațiu și control.`,
            `Două-trei minute de mobilitate bine alese pot schimba mult felul în care te miști și cum se simte restul zilei.`,
            `Important este să faci puțin, dar des. Așa scazi tensiunea și începi să simți că ai din nou acces la mișcare, nu că te lupți cu ea.`,
            `Dacă vrei varianta mea scurtă, scrie RESET în DM.`,
          ],
          'Cadru STORY'
        ),
        cta: 'Scrie RESET în DM și îți trimit pașii simpli pentru mai puțină rigiditate.',
        objective: 'Generare lead-uri',
        conversionRate: 0,
        leadMagnet: baseLeadMagnet,
        dmKeyword: 'RESET',
        reasoning: `Story-ul merge bine pentru că este foarte direct și pornește dintr-o senzație comună: rigiditatea. Soluția este mică și ușor de încercat, ceea ce face CTA-ul natural și ușor de urmat.`,
      },
      source: 'emergency-fallback',
    };
  }

  return {
    reel: {
      format: 'REEL',
      hook: buildEmergencyHook('N-ai nevoie de o oră liberă ca să te miști mai bine'),
      script: buildEmergencyScenes(
        [
          `Mulți ${audienceLabel} renunță la idee înainte să înceapă pentru că își spun că nu au timp. Dar de cele mai multe ori, blocajul nu e lipsa unei ore libere, ci faptul că totul pare prea mare și prea greu de pornit.`,
          `Dacă poți găsi 10-15 minute clare, poți construi deja o rutină utilă. Cheia nu este durata perfectă, ci să știi exact ce faci în puținul timp pe care îl ai.`,
          `Când sesiunile sunt scurte și previzibile, le repeți mai ușor. Asta înseamnă mai puține pauze lungi, mai puțină vinovăție și mai multe șanse să vezi schimbări reale în timp.`,
          `Dacă vrei structura mea pentru antrenamente scurte și utile, scrie 15MIN în DM și ți-o trimit.`,
        ],
        'Cadru REEL'
      ),
      cta: 'Scrie 15MIN în DM și îți trimit structura simplă pentru antrenamente scurte și utile.',
      objective: 'Generare lead-uri',
      conversionRate: 0,
      leadMagnet: baseLeadMagnet,
      dmKeyword: '15MIN',
      reasoning: `Acest Reel funcționează pentru că atacă una dintre cele mai mari obiecții ale ${audienceLabel}: lipsa timpului. În loc să împingă un plan greu, promite claritate și o intrare ușoară în acțiune.`,
    },
    carousel: {
      format: 'CAROUSEL',
      hook: buildEmergencyHook('Cum folosești 15 minute fără să le irosești'),
      script: buildEmergencyScenes(
        [
          `Primul slide sparge mitul că doar antrenamentele lungi contează. Pentru mulți ${audienceLabel}, progresul începe atunci când timpul mic devine predictibil și bine folosit.`,
          `Al doilea slide arată regula simplă: mai puține exerciții, mai puține decizii și o ordine clară. Cu cât sesiunea e mai simplă, cu atât cresc șansele să o repeți și mâine.`,
          `Al treilea slide explică beneficiul real: nu doar consumi calorii, ci construiești ritm, control și senzația că te poți ține de ceva chiar și în zilele aglomerate.`,
          `Ultimul slide închide ideea: dacă nu ai timp mult, nu înseamnă că n-ai opțiuni. Ai nevoie doar de o structură care respectă viața reală, nu una idealizată.`,
        ],
        'Slide CAROUSEL'
      ),
      cta: 'Scrie TIMP în DM și îți trimit schema scurtă pentru zile aglomerate.',
      objective: 'Generare lead-uri',
      conversionRate: 0,
      leadMagnet: baseLeadMagnet,
      dmKeyword: 'TIMP',
      reasoning: `Carousel-ul funcționează pentru că transformă obiecția de timp într-o discuție despre structură și decizii simple. Mesajul este ușor de salvat și util exact pentru cei care se simt presați de program.`,
    },
    story: {
      format: 'STORY',
      hook: buildEmergencyHook('Ai doar puțin timp? E suficient ca să începi'),
      script: buildEmergencyScenes(
        [
          `Dacă aștepți momentul perfect, probabil n-o să vină prea curând. Pentru mulți ${audienceLabel}, progresul începe când acceptă că puțin făcut constant bate mult făcut rar.`,
          `Nu trebuie să ai o oră liberă. Ai nevoie de 10-15 minute clare și de mai puține decizii înainte să începi.`,
          `Când faci asta de câteva ori pe săptămână, corpul începe să răspundă și apare senzația că rutina chiar poate sta în viața ta.`,
          `Dacă vrei varianta mea scurtă, scrie SCURT în DM.`,
        ],
        'Cadru STORY'
      ),
      cta: 'Scrie SCURT în DM și îți trimit planul simplu pentru zile fără timp.',
      objective: 'Generare lead-uri',
      conversionRate: 0,
      leadMagnet: baseLeadMagnet,
      dmKeyword: 'SCURT',
      reasoning: `Story-ul merge bine pentru că reduce presiunea și creează un prag mic de intrare. Exact asta are nevoie publicul când obiecția principală este timpul. CTA-ul continuă firesc ideea.`,
    },
    source: 'emergency-fallback',
  };
}

function buildMultiFormatTaggedSceneArray(prefix: string, content: string): Scene[] {
  return Array.from({ length: 5 }, (_, index) => {
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
  const antiRepeatSection = buildAntiRepeatPromptSection(input.generationContext);
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

${antiRepeatSection}

REGULI:
- Totul exclusiv în română naturală.
- Cele 3 idei trebuie să fie clar diferite între ele.
- Hook-ul trebuie să fie specific și complet.
- Fiecare scenă trebuie să fie clară și utilă.
- CTA-ul trebuie să includă un keyword DM și un beneficiu clar.
- CTA-ul stă exclusiv în tag-ul CTA, nu în scene.
- Scenele 2-4 trebuie să includă elemente aplicabile, nu doar teorie.
- Scena 5 / ultimul slide trebuie să livreze soluție concretă cu pași, timp/repetări/frecvență, fără CTA.
- Nu pune în nicio scenă formulări de tipul "scrie în DM", "comentează", "salvează" sau alte invitații la acțiune.
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
<reelScene5>...</reelScene5>
<reelVisual5>...</reelVisual5>
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
<carouselScene5>...</carouselScene5>
<carouselVisual5>...</carouselVisual5>
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
<storyScene5>...</storyScene5>
<storyVisual5>...</storyVisual5>
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
  input: StructureUserIdeaInput,
  fallbackCtaStyle: string
): Promise<StructuredIdeaResult> {
  const language = normalizeLanguage(input.language);
  const languageInstruction = buildAiLanguageInstruction(language);
  const localizedImprovements =
    language === 'en'
      ? ['Message clarified', 'Redundancy removed', 'Structure added', 'Tone adapted to the niche']
      : ['Mesaj clarificat', 'Redundanță eliminată', 'Structură adăugată', 'Ton adaptat la nișă'];
  const brandVoiceSection = buildBrandVoiceSection(input.contentPreferences);
  const antiRepeatSection = buildAntiRepeatPromptSection(input.generationContext);
  const prompt = `Rescrie ideea utilizatorului ca output structurat pentru un Reel.

NIȘĂ: "${input.niche}"
BRAND VOICE:
${brandVoiceSection}
STIL CTA: ${fallbackCtaStyle}

${languageInstruction}

${antiRepeatSection}

IDEA UTILIZATOR:
"""
${input.ideaText}
"""

Returnează DOAR text cu tag-urile de mai jos, fără markdown și fără explicații extra.
- Păstrează tonul conversațional.
- Fiecare secțiune trebuie să fie clară, completă și utilă.
- Fiecare secțiune trebuie să aibă aproximativ 70-120 cuvinte.
- CTA-ul trebuie să fie clar și acționabil.
- improvements trebuie să fie exact cele 4 itemi din format (în limba cerută).
- NU descrie cum ar trebui scris mesajul.
- NU folosi formulări meta ca: "ideea trebuie", "mesajul trebuie", "în partea asta", "poți spune".
- Scrie direct varianta finală, ca text vorbit, cu flow natural între secțiuni.
- Hook-urile trebuie să fie scurte, memorabile și naturale, nu să repete brut textul utilizatorului.
- Dacă utilizatorul povestește ceva personal, păstrează acel unghi personal.

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
${localizedImprovements.join('\n')}
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
  const languageInstruction = buildAiLanguageInstruction(normalizeLanguage(input.language));
  const recentIdeasSection = buildRecentIdeasSection(input.recentIdeas);
  const antiRepeatSection = buildAntiRepeatPromptSection(input.generationContext);
  const brandVoiceSection = buildBrandVoiceSection(input.contentPreferences);
  const contentCreationSection = buildContentCreationSection(input.contentPreferences);
  const icpProfileText =
    input.icpProfile == null
      ? 'Nu există profil de client ideal salvat. Folosește exclusiv nișa pentru specificitate și nu inventa detalii foarte precise despre client.'
      : typeof input.icpProfile === 'string'
        ? input.icpProfile
        : JSON.stringify(input.icpProfile);
  
  const prompt = `Tu ești un expert în content marketing fitness cu focus pe conversii reale.

${languageInstruction}

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

${antiRepeatSection}

Generează o idee completă de postare Instagram/TikTok care:
1. Hook-ul TREBUIE să menționeze direct problema/audiența din nișă (ex: pentru "mame după sarcină" → hook despre mame, nu generic)
2. Script-ul rezolvă PROBLEMA SPECIFICĂ a clientului ideal descris mai sus
3. CTA-ul oferă un lead magnet RELEVANT pentru nișă
4. Fiecare scenă vorbește DIRECT către clientul ideal
5. Evită orice generalizări - fii SPECIFIC și TARGETAT
6. CTA-ul trebuie să existe doar în câmpul "cta", nu în nicio scenă
7. Ultima scenă trebuie să închidă ideea cu un principiu util, o concluzie practică sau un ultim pas clar, nu cu invitație la DM/comentariu/salvare

REGULI STRICTE:
✗ NU folosi hook-uri generice ("Vrei să slăbești?", "3 trucuri pentru...")
✓ Folosește hook-uri specifice nisei ("Mamă după sarcină? Acestea sunt greșelile care te blochează...")
✗ NU oferi sfaturi generale de fitness
✓ Oferă soluții EXACTE pentru problema clientului ideal
✗ NU crea lead magnets generice
✓ Creează lead magnets care rezolvă EXACT problema nisei

Format: Alege între REEL (30-60 sec, 4-6 scene), CAROUSEL (6-9 slide-uri) sau STORY (15 sec, 3-4 scene).

REGULĂ LINGVISTICĂ FINALĂ:
- hook-ul, scriptul, CTA-ul, lead magnetul și reasoning-ul trebuie să respecte limba cerută mai sus
- fără amestec inutil de română și engleză
- fără traduceri literale
- fără formulări care ar suna nenatural pentru publicul țintă
- dacă o formulare nu ar fi spusă natural într-o conversație reală în limba cerută, rescrie-o
- dacă un hook nu are sens complet de unul singur, rescrie-l
- dacă o propoziție pare „puternică”, dar nu spune clar ceva concret, rescrie-o
- claritatea și logica sunt obligatorii, nu opționale

IMPORTANT PENTRU SCRIPT - CERINȚE DETALIATE:
- Pentru fiecare scenă/slide, câmpul "text" trebuie să fie FOARTE DETALIAT și COMPLET
- Minim 4-6 propoziții per scenă (≈ 80-150 de cuvinte), în limba cerută, naturală și conversațională
- Nicio scenă nu are voie să conțină formulări de tipul "scrie în DM", "comentează", "salvează", "swipe up", "trimite mesaj" sau alte CTA-uri mascate
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
  "reasoning": "De ce funcționează această idee - 4-5 propoziții DETALIATE, scrise clar și natural în limba cerută, care explică psihologia, pattern-urile de conversie, și de ce rezonează cu ICP-ul specific"
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
  const languageInstruction = buildAiLanguageInstruction(normalizeLanguage(input.language));
  const recentIdeasSection = buildRecentIdeasSection(input.recentIdeas);
  const antiRepeatSection = buildAntiRepeatPromptSection(input.generationContext);
  const brandVoiceSection = buildBrandVoiceSection(input.contentPreferences);
  const contentCreationSection = buildContentCreationSection(input.contentPreferences);
  const icpProfileText =
    input.icpProfile == null
      ? 'Nu există profil de client ideal salvat. Folosește exclusiv nișa pentru specificitate și nu inventa detalii foarte precise despre client.'
      : typeof input.icpProfile === 'string'
        ? input.icpProfile
        : JSON.stringify(input.icpProfile);
  
  const buildDelimitedPrompt = (targets: MultiFormatIdeaKey[], retryReason?: string) => `Generezi ${
    targets.length === 3 ? '3 idei de content' : `${targets.length} idei de content`
  } pentru un antrenor fitness din România.

${languageInstruction}

Fără markdown. Fără JSON.
Toate valorile trebuie să stea pe un singur rând. Nu folosi line breaks în interiorul câmpurilor.

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

${antiRepeatSection}

REGULI:
- Ideile cerute trebuie să fie clar diferite între ele și diferite de istoricul recent.
- Nu reutiliza hook-uri, CTA-uri sau aceeași problemă principală din istoric.
- Toate ideile trebuie să fie specifice contextului dat.
- Hook-urile trebuie să fie complete, clare și naturale.
- CTA-ul trebuie să includă keyword DM și beneficiu clar.
- CTA-ul stă exclusiv în câmpul "cta", nu în scene.
- Scena 5 / ultimul slide trebuie să conțină o soluție concretă: pași clari, timp/repetări/frecvență, fără CTA.
- Include soluții practice și în scenele 2-4 când este relevant; nu concentra totul într-o singură scenă.
- Nu pune în nicio scenă formulări de tipul "scrie în DM", "comentează", "salvează", "trimite mesaj" sau alte invitații la acțiune.
- Visual-urile trebuie să fie scurte și filmabile.
- Evită formulările vagi, academice sau traduse prost.
- Hook și CTA: pe un singur rând.
- Fiecare scenă: pe un singur rând.
- DM keyword: un singur cuvânt sau maxim două cuvinte scurte.
- Dacă refaci doar o parte lipsă, livrezi DOAR secțiunile cerute acum.
${retryReason ? `- CONTEXT RETRY: ${retryReason}` : ''}

STRUCTURĂ:
- REEL: 5 scene, 28-52 cuvinte per scenă, 1 hook, 1 CTA
- CAROUSEL: 5 scene/slides, 40-68 cuvinte per scenă, 1 hook, 1 CTA
- STORY: 5 scene, 18-40 cuvinte per scenă, 1 hook, 1 CTA

Răspunde DOAR în formatul exact de mai jos:
${buildDelimitedFormatInstructions(targets)}`;

  console.log(`🎯 Generating multi-format ideas for niche: "${input.niche}"`);

  const generateDelimitedResponse = async (targets: MultiFormatIdeaKey[], retryReason?: string) => {
    const content = await generateGeminiText(buildDelimitedPrompt(targets, retryReason), 0.65, 5200);
    console.log(`✅ Gemini multi-format response received (${content.length} chars) [model=${GEMINI_MODEL}]`);
    return content;
  };

  const parseDelimitedResponse = (content: string, source: MultiFormatIdeaResult['source']) => {
    const { parsed, missing } = parseDelimitedMultiFormatIdeaContent(content);
    return {
      parsed,
      missing,
      result: missing.length === 0 ? assembleMultiFormatIdeaResult(parsed, source) : null,
    };
  };

  let result: MultiFormatIdeaResult;
  try {
    const firstContent = await generateDelimitedResponse(['reel', 'carousel', 'story']);
    let { parsed, missing, result: parsedResult } = parseDelimitedResponse(firstContent, 'ai');

    if (missing.length > 0) {
      console.warn(
        `Multi-format delimited response incomplete, retrying only missing sections: ${missing.join(', ')}`
      );
      console.warn(`Gemini multi-format raw preview: ${previewModelResponse(firstContent)}`);

      const retryContent = await generateDelimitedResponse(
        missing,
        `Lipseau sau erau incomplete secțiunile: ${missing.join(', ')}. Refă doar aceste secțiuni complet.`
      );
      const retryParsed = parseDelimitedMultiFormatIdeaContent(retryContent);

      parsed = {
        ...parsed,
        ...retryParsed.parsed,
      };
      missing = (['reel', 'carousel', 'story'] as MultiFormatIdeaKey[]).filter((key) => !parsed[key]);
      parsedResult = missing.length === 0 ? assembleMultiFormatIdeaResult(parsed, 'ai') : null;
    }

    if (!parsedResult) {
      throw new Error(`Delimited multi-format response incomplete after retry: ${missing.join(', ')}`);
    }

    result = parsedResult;
  } catch (error) {
    console.warn('Multi-format delimited generation failed, switching to tagged fallback:', error);

    try {
      result = await generateMultiFormatIdeaTaggedFallback(input);
      console.log(`✅ Gemini multi-format tagged fallback succeeded [model=${GEMINI_MODEL}]`);
    } catch (fallbackError) {
      console.warn('Multi-format tagged fallback failed, using emergency local fallback:', fallbackError);
      result = normalizeMultiFormatIdeaResult(buildMultiFormatIdeaEmergencyResult(input));
      console.log('✅ Multi-format emergency local fallback succeeded');
    }
  }

  result.source = result.source || 'ai';
  
  console.log(`📝 Generated 3 formats - REEL: "${result.reel.hook.substring(0, 30)}..." | CAROUSEL: "${result.carousel.hook.substring(0, 30)}..." | STORY: "${result.story.hook.substring(0, 30)}..."`);
  
  return result;
}

export async function regenerateDailyIdeaScene(input: RegenerateSceneInput): Promise<Scene> {
  const languageInstruction = buildAiLanguageInstruction(normalizeLanguage(input.language));
  const language = normalizeLanguage(input.language);
  const isEn = language === 'en';
  const brandVoiceSection = buildBrandVoiceSection(input.contentPreferences);
  const safeTargetScene = Math.min(5, Math.max(1, Math.trunc(input.targetScene)));
  const normalizedScenes = Array.from({ length: 5 }, (_, index) => {
    const sceneNumber = index + 1;
    const existing = input.script.find((scene) => scene.scene === sceneNumber) || input.script[index];
    return {
      scene: sceneNumber,
      text: normalizeTextValue(existing?.text),
      visual: normalizeTextValue(existing?.visual),
    };
  });

  const sceneContext = normalizedScenes
    .map(
      (scene) =>
        `${isEn ? 'SCENE' : 'SCENA'} ${scene.scene}: ${scene.text || (isEn ? '[MISSING]' : '[LIPSA]')}${scene.visual ? ` | ${isEn ? 'VISUAL' : 'VIZUAL'}: ${scene.visual}` : ''}`
    )
    .join('\n');

  const prompt = `${isEn ? 'Generate a single scene for a Daily Idea script.' : 'Generezi o singură scenă pentru un script Daily Idea, în limba română.'}

${languageInstruction}

${isEn ? 'CONTEXT' : 'CONTEXT'}:
- ${isEn ? 'Niche' : 'Nișă'}: "${input.niche}"
- Format: ${input.format}
- Hook: ${input.hook}
- ${isEn ? 'CTA (do not use it inside the scene)' : 'CTA (nu îl folosi în scenă)'}: ${input.cta}
- ${isEn ? 'DM keyword (do not use it inside the scene)' : 'DM keyword (nu îl folosi în scenă)'}: ${input.dmKeyword}

BRAND VOICE:
${brandVoiceSection}

${isEn ? 'CURRENT SCRIPT (5 scenes)' : 'SCRIPT CURENT (5 scene)'}:
${sceneContext}

${isEn ? 'TASK' : 'TASK'}:
- ${isEn ? `Rewrite ONLY scene ${safeTargetScene}, keeping coherence with the other scenes.` : `Rescrie DOAR scena ${safeTargetScene}, păstrând coerența cu celelalte scene.`}
- ${isEn ? 'No CTA inside the scene.' : 'Fără CTA în scenă.'}
- ${isEn ? 'Avoid call-to-actions like write in DM, comment, save, send message.' : 'Evită formulări de tip: scrie în DM, comentează, salvează, trimite mesaj.'}
- ${isEn ? 'If target scene is 5, provide a concrete solution with clear steps + timing/reps/frequency.' : 'Dacă scena țintă este 5, oferă soluție concretă cu pași clari + timp/repetări/frecvență.'}
- ${isEn ? 'If target scene is 2-4, include practical elements (not only theory) when natural.' : 'Dacă scena țintă este 2-4, include elemente practice (nu doar teorie) când este natural.'}
- ${isEn ? 'Visual must be short, filmable and specific to the scene.' : 'Vizualul să fie scurt, filmabil și specific scenei.'}
- ${isEn ? 'Scene text must be complete (not fragmented), natural and coherent.' : 'Textul scenei trebuie să fie complet (nu fragment), natural și fără întreruperi.'}

${isEn ? 'Return ONLY valid JSON, no markdown:' : 'Răspunde DOAR JSON valid, fără markdown:'}
{
  "text": "${isEn ? 'complete scene text' : 'text complet pentru scenă'}",
  "visual": "${isEn ? 'short, filmable visual direction' : 'vizual scurt, filmabil'}"
}`;

  const parseSceneOutput = async (content: string): Promise<{ text: string; visual: string }> => {
    let text = '';
    let visual = '';

    try {
      const parsed = await parseModelJson<{ text?: string; visual?: string }>(content);
      text = stripModelReasoningLeakage(normalizeTextValue(parsed.text));
      visual = normalizeTextValue(parsed.visual);
    } catch {
      const multilineField = (label: string): string => {
        const pattern = new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\n[A-Z_]+:\\s*|$)`, 'i');
        const match = content.match(pattern);
        return match?.[1]?.trim() || '';
      };

      text = stripModelReasoningLeakage(
        multilineField('SCENE_TEXT') ||
          multilineField('TEXT') ||
          extractDelimitedLineValue(content, 'SCENE_TEXT') ||
          extractDelimitedLineValue(content, 'TEXT')
      );
      visual =
        multilineField('SCENE_VISUAL') ||
        multilineField('VISUAL') ||
        extractDelimitedLineValue(content, 'SCENE_VISUAL') ||
        extractDelimitedLineValue(content, 'VISUAL');
    }

    return { text: normalizeTextValue(text), visual: normalizeTextValue(visual) };
  };

  const isWeakSceneText = (value: string): boolean => {
    const wordCount = value.trim().split(/\s+/).filter(Boolean).length;
    return wordCount < 12 || isLikelyIncompleteGeneratedText(value, language);
  };
  const isWeakSceneVisual = (value: string): boolean => {
    const normalized = normalizeTextValue(value);
    if (!normalized) {
      return true;
    }

    const wordCount = normalized.split(/\s+/).filter(Boolean).length;
    const endsAbruptly = /[a-zA-ZăâîșțĂÂÎȘȚ]$/.test(normalized) && normalized.length < 14;
    return wordCount < 3 || isLikelyIncompleteGeneratedText(normalized, language) || endsAbruptly;
  };

  let parsedScene = await parseSceneOutput(await generateGeminiJson(prompt, 0.45, 1400));

  if (isWeakSceneText(parsedScene.text)) {
    const strictRetryPrompt = `${prompt}

${isEn ? 'IMPORTANT:' : 'IMPORTANT:'}
- ${isEn ? 'text must be complete, coherent and fully finished.' : 'text trebuie să fie complet, coerent și finalizat.'}
- ${isEn ? 'Do not stop in the middle of a sentence.' : 'NU te opri la mijlocul propoziției.'}
- ${isEn ? 'minimum 24 words.' : 'minim 24 cuvinte.'}
- ${isEn ? 'return only valid JSON.' : 'returnează doar JSON valid.'}`;
    parsedScene = await parseSceneOutput(await generateGeminiJson(strictRetryPrompt, 0.35, 1700));
  }

  if (isWeakSceneVisual(parsedScene.visual)) {
    const visualOnlyPrompt = `${isEn ? 'Generate only a short visual direction for this scene.' : 'Generează doar direcția vizuală scurtă pentru această scenă.'}

${languageInstruction}

${isEn ? 'Niche' : 'Nișă'}: "${input.niche}"
Format: ${input.format}
${isEn ? 'Hook' : 'Hook'}: ${input.hook}
${isEn ? 'Target scene number' : 'Număr scenă țintă'}: ${safeTargetScene}
${isEn ? 'Scene text' : 'Text scenă'}: ${parsedScene.text}

${isEn ? 'Return only valid JSON:' : 'Returnează doar JSON valid:'}
{
  "visual": "${isEn ? 'short, filmable visual direction' : 'vizual scurt, filmabil'}"
}`;

    try {
      const visualContent = await generateGeminiJson(visualOnlyPrompt, 0.3, 600);
      const visualParsed = await parseModelJson<{ visual?: string }>(visualContent);
      const generatedVisual = normalizeTextValue(visualParsed.visual);
      if (!isWeakSceneVisual(generatedVisual)) {
        parsedScene.visual = generatedVisual;
      }
    } catch {
      // Keep fallback path below.
    }
  }

  const text = parsedScene.text;
  const visual = parsedScene.visual;

  if (!text) {
    const fallback = safeTargetScene === 5
      ? buildConcreteSolutionScene(input.format)
      : safeTargetScene === 4
        ? {
            text: buildDailyIdeaFinalSceneText(input.format),
            visual: buildDailyIdeaFinalSceneVisual(input.format),
          }
        : {
            text: isEn
              ? 'Apply one simple, measurable and repeatable step over the next days so progress is easy to track in real life.'
              : 'Aplică un pas simplu, măsurabil și repetabil în următoarele zile, astfel încât progresul să fie ușor de urmărit în viața reală.',
            visual: isEn
              ? `Practical shot for scene ${safeTargetScene}, clearly demonstrating the recommended step`
              : `Cadru practic pentru scena ${safeTargetScene}, cu demonstrație clară a pasului recomandat`,
          };

    return {
      scene: safeTargetScene,
      text: fallback.text,
      visual: fallback.visual,
    };
  }

  const fallbackVisual =
    safeTargetScene === 5
      ? buildConcreteSolutionScene(input.format).visual
      : safeTargetScene === 4
        ? buildDailyIdeaFinalSceneVisual(input.format)
        : isEn
          ? `Practical shot for scene ${safeTargetScene}, with a clear demonstration of the idea`
          : `Cadru practic pentru scena ${safeTargetScene}, cu demonstrație clară a ideii`;

  return {
    scene: safeTargetScene,
    text: normalizeTextValue(text),
    visual: !isWeakSceneVisual(visual) ? normalizeTextValue(visual) : fallbackVisual,
  };
}

export async function regenerateDailyIdeaHook(input: RegenerateHookInput): Promise<string> {
  const languageInstruction = buildAiLanguageInstruction(normalizeLanguage(input.language));
  const language = normalizeLanguage(input.language);
  const isEn = language === 'en';
  const brandVoiceSection = buildBrandVoiceSection(input.contentPreferences);
  const normalizedScenes = Array.from({ length: 5 }, (_, index) => {
    const sceneNumber = index + 1;
    const existing = input.script.find((scene) => scene.scene === sceneNumber) || input.script[index];
    return `${isEn ? 'SCENE' : 'SCENA'} ${sceneNumber}: ${normalizeTextValue(existing?.text) || (isEn ? '[MISSING]' : '[LIPSA]')}`;
  }).join('\n');

  const prompt = `${isEn ? 'Generate a new hook line for an existing Daily Idea.' : 'Generezi un hook nou pentru un Daily Idea existent, în limba română.'}

${languageInstruction}

${isEn ? 'CONTEXT' : 'CONTEXT'}:
- ${isEn ? 'Niche' : 'Nișă'}: "${input.niche}"
- Format: ${input.format}
- ${isEn ? 'Current hook (must be changed)' : 'Hook curent (trebuie schimbat)'}: ${input.hook}
- CTA: ${input.cta}
- ${isEn ? 'DM keyword' : 'DM keyword'}: ${input.dmKeyword}

BRAND VOICE:
${brandVoiceSection}

${isEn ? 'SCRIPT CONTEXT' : 'CONTEXT SCRIPT'}:
${normalizedScenes}

${isEn ? 'TASK' : 'TASK'}:
- ${isEn ? 'Rewrite ONLY the hook line as one strong sentence.' : 'Rescrie DOAR hook-ul ca o singură propoziție puternică.'}
- ${isEn ? 'Hook must be clearly different from the current hook.' : 'Hook-ul trebuie să fie clar diferit de hook-ul curent.'}
- ${isEn ? 'Keep it specific, punchy, and coherent with the script context.' : 'Păstrează-l specific, memorabil și coerent cu scriptul.'}
- ${isEn ? 'No CTA in hook. No hashtags. No quotes. One line only.' : 'Fără CTA în hook. Fără hashtaguri. Fără ghilimele. Un singur rând.'}
- ${isEn ? 'Keep it concise (roughly 8-18 words), but always complete.' : 'Păstrează-l concis (aprox. 8-18 cuvinte), dar mereu complet.'}

${isEn ? 'Return ONLY valid JSON, no markdown:' : 'Răspunde DOAR JSON valid, fără markdown:'}
{
  "hook": "${isEn ? 'new hook line' : 'hook nou'}"
}`;

  const fallbackHook = isEn
    ? 'Your schedule is chaotic, but you can still get results with a simple plan.'
    : 'Programul tău e haotic, dar poți avea rezultate cu un plan simplu.';
  const endsWithRomanianDanglingConnector = (value: string): boolean => {
    const normalized = normalizeLooseComparisonText(value).replace(/[.!?]+$/g, '').trim();
    if (!normalized) {
      return false;
    }

    const danglingPatterns = [
      /\b(sa|să)$/i,
      /\bca$/i,
      /\bca sa$/i,
      /\bca să$/i,
      /\bpentru$/i,
      /\bpentru ca$/i,
      /\bpentru că$/i,
      /\bdar$/i,
      /\bsi$/i,
      /\bși$/i,
      /\bcu$/i,
      /\bdupa$/i,
      /\bdupă$/i,
      /\bfara$/i,
      /\bfără$/i,
      /\bla$/i,
      /\bin$/i,
      /\bîn$/i,
      /\bde$/i,
      /\bdin$/i,
      /\bprin$/i,
      /\bspre$/i,
      /\bintre$/i,
      /\bîntre$/i,
      /\bdespre$/i,
      /\bpe$/i,
      /\bun$/i,
      /\bo$/i,
      /\bal$/i,
      /\ba$/i,
      /\bsau$/i,
      /\bori$/i,
    ];

    return danglingPatterns.some((pattern) => pattern.test(normalized));
  };
  const isWeakHook = (value: string): boolean => {
    const normalized = normalizeTextValue(value);
    if (!normalized) {
      return true;
    }
    const words = normalized.split(/\s+/).filter(Boolean).length;
    const hasSentenceEnding = /[.!?]$/.test(normalized);
    return (
      words < 6 ||
      looksAbruptlyCut(normalized) ||
      !hasSentenceEnding ||
      (!isEn && endsWithRomanianDanglingConnector(normalized))
    );
  };
  const sanitizeHook = (value: string): string => {
    const compact = normalizeTextValue(value).replace(/\s+/g, ' ').trim();
    if (!compact) {
      return '';
    }
    const repaired = repairPossiblyTruncatedText(compact, compact);
    return /[.!?]$/.test(repaired) ? repaired : `${repaired}.`;
  };

  try {
    const strictRetryPrompt = `${prompt}

${isEn ? 'IMPORTANT:' : 'IMPORTANT:'}
- ${isEn ? 'The hook must be a COMPLETE sentence that ends with . ! or ?' : 'Hook-ul trebuie să fie o propoziție COMPLETĂ care se termină cu . ! sau ?'}
- ${isEn ? 'Do not stop mid-thought.' : 'Nu te opri la jumătatea ideii.'}
- ${isEn ? 'Minimum 7 words.' : 'Minimum 7 cuvinte.'}
- ${isEn ? 'Do not end with connectors/prepositions like "to", "for", "and".' : 'NU termina propoziția cu conectori/prepoziții de tip: "să", "ca să", "pentru că", "și", "cu", "de", "în".'}
- ${isEn ? 'Return only valid JSON.' : 'Returnează doar JSON valid.'}`;

    const attempts: Array<{ type: 'normal' | 'strict'; temperature: number; maxTokens: number }> = [
      { type: 'normal', temperature: 0.75, maxTokens: 500 },
      { type: 'strict', temperature: 0.55, maxTokens: 700 },
      { type: 'strict', temperature: 0.45, maxTokens: 800 },
    ];

    for (const attempt of attempts) {
      const content =
        attempt.type === 'normal'
          ? await generateGeminiText(prompt, attempt.temperature, attempt.maxTokens)
          : await generateGeminiJson(strictRetryPrompt, attempt.temperature, attempt.maxTokens);

      const parsed = await parseModelJson<{ hook?: string }>(content);
      const candidate = stripModelReasoningLeakage(normalizeTextValue(parsed.hook));
      const sanitized = sanitizeHook(candidate);

      if (sanitized && !isWeakHook(sanitized)) {
        return sanitized;
      }
    }

    return isWeakHook(fallbackHook) ? buildEmergencyHook('Alege un pas simplu azi și ține-te de el 7 zile.') : fallbackHook;
  } catch {
    return isWeakHook(fallbackHook) ? buildEmergencyHook('Alege un pas simplu azi și ține-te de el 7 zile.') : fallbackHook;
  }
}

export async function structureUserIdea(input: StructureUserIdeaInput): Promise<StructuredIdeaResult> {
  const { ctaStyle } = buildStructuredIdeaPrompt(input);
  const language = normalizeLanguage(input.language);
  const languageInstruction = buildAiLanguageInstruction(language);
  const brandVoiceSection = buildBrandVoiceSection(input.contentPreferences);
  const antiRepeatSection = buildAntiRepeatPromptSection(input.generationContext);
  const resolveGuaranteedStructuredIdea = async (): Promise<StructuredIdeaResult> => {
    try {
      const taggedFallback = await generateStructuredIdeaTaggedFallback(input, ctaStyle);
      console.log(`🧩 Structured idea tagged fallback returned hooks: "${taggedFallback.hooks[0]}" | "${taggedFallback.hooks[1]}"`);
      if (!isStructuredIdeaResultIncomplete(taggedFallback)) {
        return localizeStructuredIdeaResult(taggedFallback, language);
      }

      console.warn('Structured idea tagged fallback was incomplete, using emergency fallback.');
      return localizeStructuredIdeaResult(buildStructuredIdeaEmergencyResult(input), language);
    } catch (error) {
      console.warn('Structured idea tagged fallback failed, using emergency fallback:', error);
      return localizeStructuredIdeaResult(buildStructuredIdeaEmergencyResult(input), language);
    }
  };

  const buildDelimitedPrompt = (targets: StructuredIdeaBlockKey[], retryReason?: string) => `Transformă ideea brută a utilizatorului într-un script structurat pentru un Reel.

NIȘĂ: "${input.niche}"
BRAND VOICE:
${brandVoiceSection}
STIL CTA: ${ctaStyle}

${languageInstruction}

${antiRepeatSection}

IDEA UTILIZATOR:
"""
${input.ideaText}
"""

REGULI:
- Scrie exclusiv în limba cerută mai sus, natural, ca text vorbit.
- NU descrie cum ar trebui construit mesajul. Scrie direct varianta finală.
- NU folosi formulări meta precum: "ideea trebuie", "mesajul trebuie", "în partea asta", "poți spune".
- Dacă utilizatorul vorbește din experiență personală, păstrează acel unghi personal natural, dar curat.
- Hook-urile trebuie să fie scurte, clare, memorabile și să nu repete brut ideea originală.
- Fiecare secțiune trebuie să curgă firesc în următoarea.
- Include cel puțin o secțiune cu soluție concretă (pași clari + timp/repetări/frecvență).
- Nu folosi bullets, markdown, JSON sau explicații extra.
- Livrezi DOAR blocurile cerute acum.
${retryReason ? `- CONTEXT RETRY: ${retryReason}` : ''}

Răspunde DOAR în formatul exact de mai jos:
${buildStructuredIdeaDelimitedFormatInstructions(targets)}`;

  const generateDelimitedResponse = async (targets: StructuredIdeaBlockKey[], retryReason?: string) => {
    const content = await generateGeminiText(buildDelimitedPrompt(targets, retryReason), 0.45, 3200);
    console.log(
      `✅ Gemini structured idea response received (${content.length} chars) [model=${GEMINI_MODEL}] [blocks=${targets.join(',')}]`
    );
    return content;
  };

  console.log(`🎯 Structuring user idea for niche: "${input.niche}"`);
  console.log(`📝 Structured idea raw input preview: ${previewModelResponse(input.ideaText, 180)}`);

  try {
    const primaryContent = await generateDelimitedResponse([
      'mainIdea',
      'hook1',
      'hook2',
      'section1',
      'section2',
      'section3',
      'section4',
      'cta',
    ]);

    let { parsed, missing, result } = parseStructuredIdeaDelimitedContent(primaryContent, ctaStyle);

    if (missing.length > 0 || !result) {
      console.warn(
        `Structured idea delimited response incomplete, retrying only missing blocks: ${missing.join(', ') || 'all'}`
      );
      console.warn(`Structured idea raw preview: ${previewModelResponse(primaryContent)}`);

      const weakBlocks = getStructuredIdeaWeakBlocks(parsed);
      const retryTargets =
        missing.length > 0
          ? missing
          : weakBlocks.length > 0
            ? weakBlocks
            : (['mainIdea', 'hook1', 'hook2', 'section1', 'section2', 'section3', 'section4', 'cta'] as StructuredIdeaBlockKey[]);
      const retryContent = await generateDelimitedResponse(
        retryTargets,
        language === 'en'
          ? `Missing or weak blocks: ${retryTargets.join(', ')}. Regenerate only these blocks as final, natural, coherent text in English.`
          : `Lipseau sau erau slabe blocurile: ${retryTargets.join(', ')}. Refă doar aceste blocuri ca text final, natural și coerent.`
      );
      const retryParsed = parseStructuredIdeaDelimitedContent(retryContent, ctaStyle);

      parsed = {
        ...parsed,
        ...retryParsed.parsed,
      };

      const mergedResult = parseStructuredIdeaDelimitedContent(
        [
          parsed.mainIdea ? `===MAIN_IDEA===\n${parsed.mainIdea}` : '',
          parsed.hook1 ? `===HOOK1===\n${parsed.hook1}` : '',
          parsed.hook2 ? `===HOOK2===\n${parsed.hook2}` : '',
          parsed.section1 ? `===SECTION1===\n${parsed.section1}` : '',
          parsed.section2 ? `===SECTION2===\n${parsed.section2}` : '',
          parsed.section3 ? `===SECTION3===\n${parsed.section3}` : '',
          parsed.section4 ? `===SECTION4===\n${parsed.section4}` : '',
          parsed.cta ? `===CTA===\n${parsed.cta}` : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
        ctaStyle
      );

      missing = mergedResult.missing;
      result = mergedResult.result;
    }

      if (!result) {
        const acceptedFullAiResult = acceptStructuredIdeaResultFromFullAiBlocks(parsed, ctaStyle);
        if (acceptedFullAiResult) {
          console.warn('Structured idea AI result had all blocks but failed strict validation; keeping repaired AI result.');
          console.log(
            `🧩 Structured idea accepted from repaired AI path with hooks: "${acceptedFullAiResult.hooks[0]}" | "${acceptedFullAiResult.hooks[1]}"`
          );
          return localizeStructuredIdeaResult(acceptedFullAiResult, language);
        }

        if (missing.length > 0) {
          const rescued = rescueStructuredIdeaResultFromPartial(parsed, ctaStyle);
          if (rescued) {
            console.warn('Structured idea AI result was missing only weak/non-critical blocks; rescued result without full fallback.');
            console.log(`🧩 Structured idea rescued from AI path with hooks: "${rescued.hooks[0]}" | "${rescued.hooks[1]}"`);
            return localizeStructuredIdeaResult(rescued, language);
          }
        }
      }

      if (result) {
        console.log(`🧩 Structured idea generated from AI path with hooks: "${result.hooks[0]}" | "${result.hooks[1]}"`);
        return localizeStructuredIdeaResult(result, language);
      }

    throw new Error(`Structured idea delimited response incomplete after retry: ${missing.join(', ')}`);
  } catch (error) {
    console.warn('Structured idea delimited generation failed, switching to tagged fallback:', error);
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

async function transcribeAudioWithGemini(
  audioFilePath: string,
  language: SupportedLanguage = 'ro'
): Promise<TranscriptionResult> {
  const audioBase64 = readFileSync(audioFilePath).toString('base64');
  const targetLanguage = language === 'en' ? 'English' : 'Romanian';
  const content = await createGeminiPartsText(
    [
      {
        text:
          `Transcribe this audio in ${targetLanguage}. Return only the spoken words, without commentary, labels, timestamps, or formatting cleanup beyond normal punctuation.`,
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
    language,
  };
}

export async function transcribeAudio(
  audioFilePath: string,
  language: SupportedLanguage = 'ro'
): Promise<TranscriptionResult> {
  const normalizedLanguage = normalizeLanguage(language);
  try {
    console.log(`🎙️ Transcribing audio from: ${audioFilePath}`);

    if (process.env.OPENAI_API_KEY) {
      const transcription = await getTranscriptionClient().audio.transcriptions.create({
        file: createReadStream(audioFilePath),
        model: 'whisper-1',
        language: normalizedLanguage,
        response_format: 'verbose_json',
      });

      console.log(`✅ OpenAI transcription complete: ${transcription.text.substring(0, 100)}...`);

      return {
        text: transcription.text,
        language: transcription.language,
        duration: transcription.duration,
      };
    }

    const transcription = await transcribeAudioWithGemini(audioFilePath, normalizedLanguage);
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
  language?: SupportedLanguage;
  generationContext?: GenerationPromptContext;
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

function ensurePracticalSuggestionText(text: string, language: SupportedLanguage): string {
  const safeText = repairPossiblyTruncatedText(
    normalizeTextValue(text),
    language === 'en'
      ? 'Clarify the message, add one concrete example, and end with a specific CTA.'
      : 'Clarifică mesajul, adaugă un exemplu concret și încheie cu un CTA specific.'
  );
  const normalized = normalizeLooseComparisonText(safeText);
  const hasActionSignals =
    /\b(pas|pasi|step|steps|adauga|adaugă|include|testeaza|testează|rescrie|rewrite|replace|add)\b/.test(
      normalized
    );

  if (hasActionSignals) {
    return safeText;
  }

  const suffix =
    language === 'en'
      ? ' Practical next step: rewrite the first line for clarity, add one concrete example, and end with a direct CTA.'
      : ' Pas practic: rescrie prima propoziție pentru claritate, adaugă un exemplu concret și încheie cu un CTA direct.';

  return `${safeText}${suffix}`.trim();
}

function normalizeSuggestion(entry: any, language: SupportedLanguage): Suggestion | null {
  const type = entry?.type;
  const category = typeof entry?.category === 'string' ? entry.category.trim() : '';
  const text = typeof entry?.text === 'string' ? entry.text.trim() : '';

  if (!text) {
    return null;
  }

  return {
    type: type === 'error' || type === 'warning' || type === 'success' ? type : 'warning',
    category: category || 'general',
    text: ensurePracticalSuggestionText(text, language),
  };
}

function buildFeedbackFallbackSummary(input: ContentFeedbackInput, suggestions: Suggestion[]): string {
  if (normalizeLanguage(input.language) === 'en') {
    const context = input.transcription
      ? 'The analysis was based on the audio transcript extracted from the video.'
      : 'The analysis was based on general best practices for this content type.';
    const topSuggestion = suggestions[0]?.text
      ? `First priority: ${suggestions[0].text}`
      : 'First priority: clarify the message, add trust proof, and close with a specific CTA.';

    return `${context} The content needs improvements in clarity, trust, and conversion. ${topSuggestion}`;
  }

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
  const language = normalizeLanguage(input.language);
  const suggestions = Array.isArray(parsed?.suggestions)
    ? parsed.suggestions
        .map((entry) => normalizeSuggestion(entry, language))
        .filter((entry): entry is Suggestion => Boolean(entry))
    : [];

  const fallbackSuggestions: Suggestion[] =
    language === 'en'
      ? [
          {
            type: 'warning',
            category: 'clarity',
            text: 'The main message is not clear enough yet. State who the content is for and what result it promises in the first sentence.',
          },
          {
            type: 'warning',
            category: 'trust',
            text: 'Add a credibility element: a personal example, a concrete client result, or a clear proof point.',
          },
          {
            type: 'error',
            category: 'cta',
            text: 'Close with a specific, actionable CTA instead of a vague or implied next step.',
          },
        ]
      : [
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
      ? repairPossiblyTruncatedText(parsed.summary.trim(), buildFeedbackFallbackSummary(input, normalizedSuggestions))
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
  const antiRepeatSection = buildAntiRepeatPromptSection(input.generationContext);
  const languageInstruction = buildAiLanguageInstruction(normalizeLanguage(input.language));
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

${languageInstruction}

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

${antiRepeatSection}

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
  language?: SupportedLanguage;
  generationContext?: GenerationPromptContext;
}

export interface NicheVariant {
  variant: string;
  description: string;
}

export interface PresetNicheOption {
  niche: string;
  description: string;
}

export interface TranslateNicheProfileInput {
  niche?: string;
  idealClient?: string;
  positioning?: string;
  targetLanguage: SupportedLanguage;
}

export interface TranslateNicheProfileResult {
  niche: string;
  idealClient: string;
  positioning: string;
}

export interface IdeaTranslationInput {
  id: string;
  hook: string;
  cta: string;
  script?: unknown;
}

export interface TranslateIdeasInput {
  ideas: IdeaTranslationInput[];
  targetLanguage: SupportedLanguage;
}

export interface TranslateIdeasResult {
  ideas: IdeaTranslationInput[];
}

function detectLikelyLanguage(text: string): SupportedLanguage | null {
  const value = normalizeTextValue(text).toLowerCase();
  if (!value) return null;

  const hasRomanianDiacritics = /[ăâîșț]/.test(value);
  if (hasRomanianDiacritics) return 'ro';

  const roMarkers = [' pentru ', ' cu ', ' care ', ' și ', ' nișa ', ' antrenor ', ' rezultate '];
  const enMarkers = [' for ', ' with ', ' who ', ' and ', ' niche ', ' coach ', ' results '];

  const roScore = roMarkers.reduce((acc, marker) => acc + (value.includes(marker) ? 1 : 0), 0);
  const enScore = enMarkers.reduce((acc, marker) => acc + (value.includes(marker) ? 1 : 0), 0);

  if (roScore === enScore) return null;
  return roScore > enScore ? 'ro' : 'en';
}

function isLikelyAlreadyInTargetLanguage(
  input: { niche: string; idealClient: string; positioning: string },
  targetLanguage: SupportedLanguage
): boolean {
  const values = [input.niche, input.idealClient, input.positioning]
    .map((entry) => normalizeTextValue(entry))
    .filter(Boolean);

  if (!values.length) return true;

  const detected = values
    .map((entry) => detectLikelyLanguage(entry))
    .filter((value): value is SupportedLanguage => Boolean(value));

  if (!detected.length) return false;

  return detected.every((value) => value === targetLanguage);
}

function shouldKeepOriginalTranslationValue(original: string, translated: string): boolean {
  const originalText = normalizeTextValue(original);
  const translatedText = normalizeTextValue(translated);

  if (!translatedText) return true;
  if (!originalText) return false;

  if (originalText.length >= 40 && translatedText.length < Math.max(20, Math.floor(originalText.length * 0.35))) {
    return true;
  }

  return false;
}

function getLocalizedNicheUi(language: SupportedLanguage) {
  return language === 'en'
    ? {
        optionLabel: 'Option',
        customFitnessNiche: 'Custom fitness niche',
      }
    : {
        optionLabel: 'Varianta',
        customFitnessNiche: 'Nișă fitness personalizată',
      };
}

function buildPresetNicheDescription(niche: string, language: SupportedLanguage): string {
  const normalized = niche.toLowerCase();

  if (normalized.includes('post-partum') || normalized.includes('postpartum') || normalized.includes('post-natal')) {
    return language === 'en'
      ? 'For women who want to get back in shape after pregnancy with a safe, realistic plan adapted to the postpartum period.'
      : 'Pentru femei care vor să revină în formă după sarcină, cu un plan sigur, realist și adaptat perioadei post-partum.';
  }

  if (normalized.includes('femei')) {
    return language === 'en'
      ? 'For women who want visible results through a clear, sustainable process that is easy to follow.'
      : 'Pentru femei care vor rezultate vizibile printr-un proces clar, sustenabil și ușor de urmat.';
  }

  if (normalized.includes('bărbați') || normalized.includes('barbati')) {
    return language === 'en'
      ? 'For men who want to lose fat, look better, and follow a simple plan without unnecessary complexity.'
      : 'Pentru bărbați care vor să slăbească, să arate mai bine și să urmeze un plan simplu, fără complicații inutile.';
  }

  if (normalized.includes('35+') || normalized.includes('40+') || normalized.includes('persoane 35')) {
    return language === 'en'
      ? 'For adults who want more energy, less body fat, and a plan that fits their real lifestyle.'
      : 'Pentru adulți care vor mai multă energie, mai puțină grăsime și un program potrivit ritmului lor de viață.';
  }

  if (normalized.includes('începători') || normalized.includes('incepatori') || normalized.includes('sedentari')) {
    return language === 'en'
      ? 'For people starting from zero who need clear steps to build consistency and achieve real results.'
      : 'Pentru persoane care pornesc de la zero și au nevoie de pași clari ca să capete consistență și rezultate reale.';
  }

  return language === 'en'
    ? `For people interested in ${niche.toLowerCase()}, with a focus on clear results and an easy-to-follow process.`
    : `Pentru persoane interesate de ${niche.toLowerCase()}, cu focus pe rezultate clare și un proces ușor de urmat.`;
}

function buildPresetNicheFallbacks(language: SupportedLanguage): PresetNicheOption[] {
  if (language === 'en') {
    return [
      {
        niche: 'Fat loss for busy women 30-45',
        description:
          'For women who want to lose fat sustainably without extreme diets, even with a busy schedule.',
      },
      {
        niche: 'Postpartum toning and recovery',
        description:
          'For moms who want to regain energy, tone, and confidence after pregnancy with safe, realistic steps.',
      },
      {
        niche: 'Transformation for busy men',
        description:
          'For men who want to lose belly fat and look better without spending hours in the gym.',
      },
      {
        niche: 'Fitness for sedentary beginners',
        description:
          'For people starting from zero who need a simple plan to lose fat and build consistency.',
      },
      {
        niche: 'Body recomposition for adults 35+',
        description:
          'For adults who want to lose fat, maintain muscle mass, and feel more energetic after 35.',
      },
    ];
  }

  return [
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
}

function normalizeNicheVariantEntry(value: unknown, index: number, language: SupportedLanguage): NicheVariant | null {
  if (typeof value === 'string') {
    const variant = value.trim();
    return variant ? sanitizeNicheVariant({ variant, description: '' }, index, language) : null;
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
  }, index, language);
}

function normalizeDiscoverAudience(input: NicheDiscoverPhaseAInput, language: SupportedLanguage = 'ro'): string {
  if (input.gender === 'femei') {
    return language === 'en' ? 'women' : 'femei';
  }

  if (input.gender === 'barbati') {
    return language === 'en' ? 'men' : 'bărbați';
  }

  return language === 'en' ? 'people' : 'persoane';
}

function normalizeDiscoverAge(input: NicheDiscoverPhaseAInput): string {
  return input.ageRanges.length ? input.ageRanges.join(', ') : '25-45';
}

function normalizeOutcomeForTitle(value: string, language: SupportedLanguage = 'ro'): string {
  const normalized = normalizeTextValue(value);
  if (!normalized) {
    return language === 'en' ? 'Sustainable results' : 'Rezultate sustenabile';
  }

  if (/^să\s+/i.test(normalized)) {
    const lower = normalized.toLowerCase();
    if (lower.includes('slabeasca') || lower.includes('slăbească')) {
      return language === 'en' ? 'Sustainable fat loss' : 'Slăbire sustenabilă';
    }
    if (lower.includes('tonifieze')) {
      return language === 'en' ? 'Toning and body confidence' : 'Tonifiere și formă fizică';
    }
    if (lower.includes('energie')) {
      return language === 'en' ? 'More energy and balance' : 'Mai multă energie și echilibru';
    }
    return language === 'en' ? 'Clear, sustainable progress' : 'Progres clar și sustenabil';
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function normalizeOutcomeForSentence(value: string, language: SupportedLanguage = 'ro'): string {
  const normalized = normalizeTextValue(value);
  if (!normalized) {
    return language === 'en' ? 'get sustainable results' : 'rezultate sustenabile';
  }

  const lower = normalized.toLowerCase();
  if (lower.startsWith('să ')) {
    if (language === 'en') {
      if (lower.includes('slăb') || lower.includes('slab')) return 'lose fat sustainably';
      if (lower.includes('tonifi')) return 'tone up without extremes';
      if (lower.includes('energie')) return 'have more energy and control';
      if (lower.includes('durer') || lower.includes('disconfort')) return 'reduce pain and discomfort';
      return normalized.replace(/^să\s+/i, '').trim();
    }
    return lower;
  }
  if (lower.includes('slăb')) return language === 'en' ? 'lose fat sustainably' : 'să slăbească într-un mod sustenabil';
  if (lower.includes('tonifi')) return language === 'en' ? 'tone up without extremes' : 'să se tonifieze fără extreme';
  if (lower.includes('energie')) return language === 'en' ? 'have more energy and control' : 'să aibă mai multă energie și control';
  if (lower.includes('durer') || lower.includes('disconfort')) {
    return language === 'en' ? 'reduce pain and discomfort' : 'să scape de durere și disconfort';
  }
  return language === 'en'
    ? normalized.charAt(0).toLowerCase() + normalized.slice(1)
    : `să obțină ${normalized.toLowerCase()}`;
}

function normalizeProblemForSentence(value: string, language: SupportedLanguage = 'ro'): string {
  const normalized = normalizeTextValue(value);
  if (!normalized) {
    return language === 'en' ? 'lack of clarity and consistency' : 'lipsa de claritate și consecvență';
  }

  const lower = normalized.toLowerCase();
  if (language === 'en') {
    if (lower.includes('consecven')) return 'lack of consistency';
    if (lower.includes('energie')) return 'low energy';
    if (lower.includes('confuz')) return 'confusion about what to do';
    if (lower.includes('aliment')) return 'chaotic eating';
    if (lower.includes('frica') || lower.includes('rusinea') || lower.includes('rușinea')) {
      return 'fear or embarrassment about the gym';
    }
    return normalized.charAt(0).toLowerCase() + normalized.slice(1);
  }

  if (lower.startsWith('lipsa de ')) {
    return normalized.toLowerCase();
  }

  return normalized.charAt(0).toLowerCase() + normalized.slice(1);
}

function normalizeSituationForSentence(value: string, language: SupportedLanguage = 'ro'): string {
  const normalized = normalizeTextValue(value);
  if (!normalized) {
    return language === 'en' ? 'need a realistic approach' : 'au nevoie de o abordare realistă';
  }

  const cleaned = normalized
    .replace(/^c[âa]nd\s+/i, '')
    .replace(/^că\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[A-ZĂÂÎȘȚ]/, (char) => char.toLowerCase());

  if (language === 'en') {
    const lower = cleaned.toLowerCase();
    if (lower.includes('ocup') || lower.includes('dezorganiz')) return 'are busy and disorganized';
    if (lower.includes('estetic')) return 'want better aesthetics but struggle to stay consistent';
    if (lower.includes('la inceput') || lower.includes('la început')) return 'are just starting and need guidance';
    if (lower.includes('nu au structura') || lower.includes('nu au structură')) return 'know what to do but have no structure';
    if (lower.includes('durer') || lower.includes('limit')) return 'have pain or limitations and are afraid to start';
  }

  return cleaned;
}

function buildVariantDescriptionFromTitle(title: string, language: SupportedLanguage = 'ro'): string {
  const normalized = normalizeTextValue(title);
  if (!normalized) {
    return language === 'en'
      ? 'A clear direction with a defined audience, a recognizable core problem, and a promise that can be refined further in the next step.'
      : 'O direcție clară, cu un public bine definit, o problemă centrală recognoscibilă și o promisiune care poate fi rafinată mai departe în pasul următor.';
  }

  return language === 'en'
    ? `A clear direction for ${normalized.toLowerCase()}, with a well-defined audience and a message that can be refined further. This option highlights the client's main problem and the kind of result they want, without slipping into exaggerated promises.`
    : `O direcție clară pentru ${normalized.toLowerCase()}, cu un public bine conturat și un mesaj ușor de rafinat mai departe. Varianta scoate în evidență problema principală a clientului și tipul de rezultat pe care îl urmărește, fără să alunece în promisiuni exagerate.`;
}

function sanitizeNicheVariant(variant: NicheVariant, index: number, language: SupportedLanguage = 'ro'): NicheVariant {
  const fallbackTitle = language === 'en' ? `Option ${index + 1}` : `Varianta ${index + 1}`;
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
    description: cleanedDescription || buildVariantDescriptionFromTitle(cleanedTitle || fallbackTitle, language),
  };
}

function buildFallbackNicheVariants(input: NicheDiscoverPhaseAInput, language: SupportedLanguage): NicheVariant[] {
  const audience = normalizeDiscoverAudience(input, language);
  const ages = normalizeDiscoverAge(input);
  const topSituation = normalizeSituationForSentence(input.valueSituations[0] || '', language);
  const topProblem = normalizeProblemForSentence(input.commonProblems[0] || '', language);
  const topOutcomeTitle = normalizeOutcomeForTitle(input.primaryOutcome || '', language);
  const topOutcomeSentence = normalizeOutcomeForSentence(input.primaryOutcome || '', language);

  if (language === 'en') {
    return [
      sanitizeNicheVariant({
        variant: `${topOutcomeTitle} for ${audience} ${ages}`,
        description: `For ${audience} aged ${ages} who need a realistic path forward. This direction focuses on a clear, practical process for people who want ${topOutcomeSentence}. It works well if you want your message to feel grounded, useful, and easy to trust.`,
      }, 0, language),
      sanitizeNicheVariant({
        variant: `Sustainable fitness for ${audience} with a busy schedule`,
        description: `For ${audience} who want visible results but keep running into ${topProblem}. The focus here is on solutions that fit a full schedule, not on perfection. It is a strong option if you want to position training as realistic, sustainable, and easier to maintain long term.`,
      }, 1, language),
      sanitizeNicheVariant({
        variant: `Realistic transformation for ${audience} who need consistency`,
        description: `For ${audience} who need structure, clarity, and practical steps they can follow in everyday life. This direction highlights consistency, confidence, and sustainable progress instead of quick fixes. It fits well if you want a more mature, stable positioning angle built around long-term progress.`,
      }, 2, language),
    ];
  }

  return [
    sanitizeNicheVariant({
      variant: `${topOutcomeTitle} pentru ${audience} ${ages}`,
      description: `Pentru ${audience} de ${ages} care ${topSituation}. Varianta vorbește despre un proces clar, realist și ușor de urmat pentru cei care vor ${topOutcomeSentence}. Se potrivește bine dacă vrei să comunici ghidaj, claritate și progres vizibil, fără presiune inutilă sau soluții extreme.`,
    }, 0, language),
    sanitizeNicheVariant({
      variant: `Fitness sustenabil pentru ${audience} cu program aglomerat`,
      description: `Pentru ${audience} care vor rezultate vizibile, dar se lovesc constant de ${topProblem}. Aici accentul cade pe soluții aplicabile într-un program plin, nu pe perfecțiune. Este o variantă bună dacă vrei să poziționezi antrenamentul ca ceva sustenabil, adaptat vieții reale și ușor de păstrat pe termen lung.`,
    }, 1, language),
    sanitizeNicheVariant({
      variant: `Transformare realistă pentru ${audience} care vor consecvență`,
      description: `Pentru ${audience} care au nevoie de structură, claritate și pași aplicabili în viața de zi cu zi. Direcția pune accent pe consecvență, încredere și rezultate sustenabile, nu pe schimbări rapide. Funcționează bine dacă vrei un mesaj mai matur, mai stabil și mai orientat spre progres pe termen lung.`,
    }, 2, language),
  ];
}

export async function generateNicheVariants(input: NicheDiscoverPhaseAInput): Promise<{ variants: NicheVariant[] }> {
  const antiRepeatSection = buildAntiRepeatPromptSection(input.generationContext);
  const language = normalizeLanguage(input.language);
  const languageInstruction = buildAiLanguageInstruction(language);
  const strictLanguageReminder =
    language === 'en'
      ? [
          'CRITICAL LANGUAGE RULE:',
          '- All "variant" and "description" values must be written in English only.',
          '- Do not answer in Romanian.',
        ].join('\n')
      : '';
  const prompt = `Tu ești un expert în marketing fitness. Pe baza răspunsurilor antrenorului, propune EXACT 3 variante de nișă.

RĂSPUNSURI ANTRENOR:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👥 Gen preferă să lucreze cu: ${input.gender}
🎯 Vârsta clienților care merg bine: ${input.ageRanges.join(', ')}
💡 Situații unde aduce valoare: ${input.valueSituations.join(', ')}
🚨 Problemă explicată cel mai des: ${input.commonProblems.join(', ')}
✅ Ce vrea să rezolve în 2-3 luni: ${input.primaryOutcome}
❌ Content de evitat: ${input.avoidContent.join(', ') || 'N/A'}

${languageInstruction}
${strictLanguageReminder ? `\n\n${strictLanguageReminder}` : ''}

${antiRepeatSection}

Creează EXACT 3 variante de nișă diferite. Fiecare variantă:
- "variant": Titlul nișei (1 propoziție scurtă, specifică)
- "description": Descriere mai detaliată (3-4 propoziții)

Pentru fiecare "description":
- explică clar cui i se potrivește varianta
- arată ce problemă principală rezolvă
- explică ce tip de rezultat promite
- spune ce unghi de mesaj sau poziționare transmite
- scrie în limba cerută mai sus, natural, clar, fără formulări corporatiste sau propoziții incomplete

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
    .map((variant: unknown, index: number) => normalizeNicheVariantEntry(variant, index, language))
    .filter((variant: NicheVariant | null): variant is NicheVariant => Boolean(variant))
    .slice(0, 3);

  const usedTitles = new Set(variants.map((variant: NicheVariant) => variant.variant.toLowerCase()));
  for (const fallback of buildFallbackNicheVariants(input, language)) {
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

export async function generatePresetNicheOptions(
  generationContext?: GenerationPromptContext & { language?: SupportedLanguage }
): Promise<{ niches: PresetNicheOption[] }> {
  const antiRepeatSection = buildAntiRepeatPromptSection(generationContext);
  const language = normalizeLanguage(generationContext?.language);
  const languageInstruction = buildAiLanguageInstruction(language);
  const strictLanguageReminder =
    language === 'en'
      ? [
          'CRITICAL LANGUAGE RULE:',
          '- All "niche" and "description" values must be written in English only.',
          '- Do not answer in Romanian.',
        ].join('\n')
      : '';
  const prompt = `Tu ești un expert în marketing fitness pentru antrenori din România.

Generează EXACT 5 nișe prestabilite pe care un fitness coach le-ar putea alege rapid.

${languageInstruction}
${strictLanguageReminder ? `\n\n${strictLanguageReminder}` : ''}

CERINȚE:
- Fiecare nișă trebuie să fie clară, specifică și realistă pentru un antrenor de fitness.
- Evită formulări prea generale sau corporate.
- Variază publicul și rezultatul promis.
- "niche" = titlu scurt, clar, ușor de ales dintr-un click.
- "description" = 1-2 propoziții despre cui se adresează și ce rezultat urmărește.
- Tot output-ul trebuie să respecte limba cerută mai sus.

${antiRepeatSection}

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
        description: description || buildPresetNicheDescription(niche, language),
      };
    })
    .filter((entry: PresetNicheOption | null): entry is PresetNicheOption => Boolean(entry))
    .slice(0, 5);

  const usedTitles = new Set(niches.map((entry: PresetNicheOption) => entry.niche.toLowerCase()));

  for (const fallback of buildPresetNicheFallbacks(language)) {
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

export async function translateNicheProfile(
  input: TranslateNicheProfileInput
): Promise<TranslateNicheProfileResult> {
  const niche = normalizeTextValue(input.niche) || '';
  const idealClient = normalizeTextValue(input.idealClient) || '';
  const positioning = normalizeTextValue(input.positioning) || '';
  const normalizedTargetLanguage = normalizeLanguage(input.targetLanguage);

  if (!niche && !idealClient && !positioning) {
    return { niche: '', idealClient: '', positioning: '' };
  }

  if (isLikelyAlreadyInTargetLanguage({ niche, idealClient, positioning }, normalizedTargetLanguage)) {
    return { niche, idealClient, positioning };
  }

  const targetLanguageLabel = normalizedTargetLanguage === 'en' ? 'English' : 'Romanian';
  const prompt = `You are translating a fitness coach niche profile for display inside the app.

Translate the content into ${targetLanguageLabel}.
Rules:
- Preserve the exact meaning, specificity, and marketing intent.
- Keep the niche concise and specific.
- Keep the positioning persuasive and natural in the target language.
- If a field is already in the target language, keep it natural and only lightly polish it if needed.
- Return strict JSON only, without markdown.

FORMAT:
{
  "niche": "translated niche",
  "idealClient": "translated ideal client profile",
  "positioning": "translated positioning message"
}

INPUT:
- niche: ${JSON.stringify(niche)}
- idealClient: ${JSON.stringify(idealClient)}
- positioning: ${JSON.stringify(positioning)}`;

  const content = await generateGeminiJson(prompt, 0.2, 900);
  const parsed = await parseModelJson<Partial<TranslateNicheProfileResult>>(content);

  const translatedNiche = repairPossiblyTruncatedText(normalizeTextValue(parsed?.niche), niche);
  const translatedIdealClient = repairPossiblyTruncatedText(normalizeTextValue(parsed?.idealClient), idealClient);
  const translatedPositioning = repairPossiblyTruncatedText(normalizeTextValue(parsed?.positioning), positioning);

  return {
    niche: shouldKeepOriginalTranslationValue(niche, translatedNiche) ? niche : translatedNiche,
    idealClient: shouldKeepOriginalTranslationValue(idealClient, translatedIdealClient)
      ? idealClient
      : translatedIdealClient,
    positioning: shouldKeepOriginalTranslationValue(positioning, translatedPositioning)
      ? positioning
      : translatedPositioning,
  };
}

export async function translateIdeas(
  input: TranslateIdeasInput
): Promise<TranslateIdeasResult> {
  const normalizedTargetLanguage = normalizeLanguage(input.targetLanguage);
  const ideas = (input.ideas || []).slice(0, 20).map((idea) => ({
    id: String(idea.id || ''),
    hook: normalizeTextValue(idea.hook) || '',
    cta: normalizeTextValue(idea.cta) || '',
    script: idea.script ?? [],
  }));

  if (ideas.length === 0) {
    return { ideas: [] };
  }

  const targetLanguageLabel = normalizedTargetLanguage === 'en' ? 'English' : 'Romanian';
  const prompt = `You are translating social media ideas for fitness coaches.

Translate all user-facing text into ${targetLanguageLabel}.
Rules:
- Preserve exact meaning and persuasion style.
- Keep emojis and formatting where natural.
- Keep ids exactly unchanged.
- Keep script array structure as-is; only translate textual fields like "text" and "description".
- If content is already in the target language, keep it natural and lightly polish only if needed.
- Return strict JSON only.

FORMAT:
{
  "ideas": [
    {
      "id": "idea-id",
      "hook": "translated hook",
      "cta": "translated cta",
      "script": []
    }
  ]
}

INPUT:
${JSON.stringify({ ideas })}`;

  const content = await generateGeminiJson(prompt, 0.2, 2200);
  const parsed = await parseModelJson<Partial<TranslateIdeasResult>>(content);
  const translatedIdeas = Array.isArray(parsed?.ideas) ? parsed.ideas : [];

  const byId = new Map(
    translatedIdeas
      .map((idea) => ({
        id: normalizeTextValue((idea as any)?.id) || '',
        hook: normalizeTextValue((idea as any)?.hook) || '',
        cta: normalizeTextValue((idea as any)?.cta) || '',
        script: (idea as any)?.script,
      }))
      .filter((idea) => idea.id)
      .map((idea) => [idea.id, idea])
  );

  return {
    ideas: ideas.map((original) => {
      const translated = byId.get(original.id);
      if (!translated) {
        return original;
      }
      return {
        id: original.id,
        hook: shouldKeepOriginalTranslationValue(original.hook, translated.hook)
          ? original.hook
          : repairPossiblyTruncatedText(translated.hook, original.hook),
        cta: shouldKeepOriginalTranslationValue(original.cta, translated.cta)
          ? original.cta
          : repairPossiblyTruncatedText(translated.cta, original.cta),
        script: translated.script ?? original.script,
      };
    }),
  };
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
  language?: SupportedLanguage;
  generationContext?: GenerationPromptContext;
}

export async function generateNicheDiscover(input: NicheDiscoverInput): Promise<NicheResult> {
  const antiRepeatSection = buildAntiRepeatPromptSection(input.generationContext);
  const language = normalizeLanguage(input.language);
  const languageInstruction = buildAiLanguageInstruction(language);
  const strictLanguageReminder =
    language === 'en'
      ? [
          'CRITICAL LANGUAGE RULE:',
          '- The final values for "niche", "idealClient", and "positioning" must be in English only.',
          '- The questionnaire answers may be written in Romanian, but that does not change the output language.',
          '- Do not answer in Romanian.',
        ].join('\n')
      : '';
  const prompt = `Tu ești un expert în marketing fitness. Antrenorul a ales nișa "${input.selectedNiche}" și acum vrei să o rafinezi pe baza răspunsurilor detaliate.

Creează:
1. Nișa RAFINATĂ și specifică (1 propoziție precisă, bazată pe "${input.selectedNiche}" dar mai precizată)
2. Profilul clientului ideal ULTRA-DETALIAT (2-3 paragrafe consistente care combină tot ce știi)
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

${languageInstruction}
${strictLanguageReminder ? `\n\n${strictLanguageReminder}` : ''}

${antiRepeatSection}

INSTRUCȚIUNI:
- "niche": Rafinează nișa aleasă să fie SUPER precisă (include vârsta, situația, obiectivul principal)
- "idealClient": Scrie 2-3 paragrafe DETALIATE în proză (nu bullet points):
  * Paragraf 1: Cine sunt (demografic + situație de viață)
  * Paragraf 2: Rutina zilnică (de la trezire la culcare)
  * Paragraf 3: Pain points și frustrări (awareness + identitate + blocaje)
- "idealClient" trebuie să aibă 140-240 cuvinte și să fie complet, nu tăiat
- "positioning": Mesaj puternic care vorbește direct despre problema lor principală
- "positioning" trebuie să aibă 45-90 cuvinte și să fie complet, nu tăiat

Răspunde DOAR în format JSON strict, fără markdown.
IMPORTANT:
- JSON valid obligatoriu
- Fără ghilimele duble ne-escape-uite în interiorul valorilor text
- Dacă ai nevoie de citare în text, folosește apostrof simplu

FORMAT:
{
  "niche": "Nișa ta RAFINATĂ aici",
  "idealClient": "Profilul ULTRA-DETALIAT (2-3 paragrafe în proză)",
  "positioning": "Mesajul tău de poziționare puternic"
}`;

  const content = await generateGeminiJson(prompt, 0.7, 1800);
  const parsed = normalizeNicheResultAliases(await parseModelJson<Partial<NicheResult>>(content));
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
  const fallbackNiche = buildDiscoverFallbackNiche(input, language);
  const enrichedParsed: Partial<NicheResult> = { ...parsed };
  if (isLikelyIncompleteGeneratedText(normalizeTextField(enrichedParsed.idealClient), language) || !hasMinimumUsefulLength(normalizeTextField(enrichedParsed.idealClient), 'idealClient')) {
    enrichedParsed.idealClient = await generateQuickIcpFieldText({
      field: 'idealClient',
      niche: normalizeTextField(enrichedParsed.niche) || fallbackNiche,
      input: {
        gender: input.gender,
        ageRanges: input.ageRanges,
        wakeUpTime: input.wakeUpTime,
        jobType: input.jobType,
        sittingTime: input.sittingTime,
        morning: input.morning,
        lunch: input.lunch,
        evening: input.evening,
        definingSituations: input.definingSituations,
        differentiation: input.selectedNiche,
        internalObjections: [input.clientStatement],
      },
      language,
      languageInstruction,
      strictLanguageReminder,
    });
  }
  if (isLikelyIncompleteGeneratedText(normalizeTextField(enrichedParsed.positioning), language) || !hasMinimumUsefulLength(normalizeTextField(enrichedParsed.positioning), 'positioning')) {
    enrichedParsed.positioning = await generateQuickIcpFieldText({
      field: 'positioning',
      niche: normalizeTextField(enrichedParsed.niche) || fallbackNiche,
      input: {
        gender: input.gender,
        ageRanges: input.ageRanges,
        wakeUpTime: input.wakeUpTime,
        jobType: input.jobType,
        sittingTime: input.sittingTime,
        morning: input.morning,
        lunch: input.lunch,
        evening: input.evening,
        definingSituations: input.definingSituations,
        differentiation: input.selectedNiche,
        internalObjections: [input.clientStatement],
      },
      language,
      languageInstruction,
      strictLanguageReminder,
    });
  }
  return ensureCompleteNicheResult(
    enrichedParsed,
    contextHint,
    language,
    fallbackNiche,
    buildDiscoverFallbackIdealClient(input, fallbackNiche, language),
    buildDiscoverFallbackPositioning(input, fallbackNiche, language)
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
  language?: SupportedLanguage;
  generationContext?: GenerationPromptContext;
}

export async function generateICPDay(input: ICPDayInput): Promise<{ icpProfile: string }> {
  const antiRepeatSection = buildAntiRepeatPromptSection(input.generationContext);
  const languageInstruction = buildAiLanguageInstruction(normalizeLanguage(input.language));
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

${languageInstruction}

${antiRepeatSection}

Scrie un profil de client ideal natural, în limba cerută mai sus, 3-4 paragrafe. NU folosi bullet points, doar proză.

Răspunde DOAR cu textul profilului (fără JSON, fără markdown).`;

  const language = normalizeLanguage(input.language);
  const generated = (await generateGeminiText(prompt, 0.7, 700)) || '';
  const fallbackBase =
    language === 'en'
      ? 'The ideal client has a demanding daily rhythm and needs practical structure, not generic motivation.'
      : 'Clientul ideal are un ritm zilnic solicitant și are nevoie de structură practică, nu de motivație generică.';
  let icpProfile = repairPossiblyTruncatedText(generated, fallbackBase);
  const normalized = normalizeLooseComparisonText(icpProfile);
  const hasPracticalSignals =
    /\b(pasi|pas|plan|rutina|frecventa|step|steps|plan|routine|frequency|aplica|apply)\b/.test(normalized);
  if (!hasPracticalSignals) {
    icpProfile = `${icpProfile}\n\n${
      language === 'en'
        ? 'Practical lens: this profile needs one clear daily step, a repeatable routine, and measurable weekly check-ins.'
        : 'Lentilă practică: acest profil are nevoie de un pas zilnic clar, o rutină repetabilă și check-in-uri săptămânale măsurabile.'
    }`;
  }
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
  language?: SupportedLanguage;
  generationContext?: GenerationPromptContext;
}

export async function analyzeTextContent(input: TextContentFeedbackInput): Promise<ContentFeedbackResult> {
  const antiRepeatSection = buildAntiRepeatPromptSection(input.generationContext);
  const languageInstruction = buildAiLanguageInstruction(normalizeLanguage(input.language));
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

${languageInstruction}

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

${antiRepeatSection}

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
  const parsed = await parseModelJson<Partial<ContentFeedbackResult>>(content);
  const result = normalizeContentFeedbackResult(parsed, {
    fileType: 'image',
    fileUrl: '',
    niche: input.niche,
    language: input.language,
  });

  console.log(
    `📊 Scores: Clarity ${result.clarityScore}, Relevance ${result.relevanceScore}, Trust ${result.trustScore}, CTA ${result.ctaScore} → Overall ${result.overallScore}`
  );

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
  generationContext?: GenerationPromptContext;
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

function ensurePracticalEmailBody(body: string, language: SupportedLanguage): string {
  const safeBody = repairPossiblyTruncatedText(
    normalizeTextValue(body),
    language === 'en'
      ? 'Start simple, stay consistent, and track progress weekly.'
      : 'Începe simplu, rămâi consecvent și urmărește progresul săptămânal.'
  );
  const normalized = normalizeLooseComparisonText(safeBody);
  const hasPracticalSignals =
    /\b(1\.|2\.|3\.|pasul|step|minute|minutes|repetari|reps|frecventa|frequency)\b/.test(normalized);

  if (hasPracticalSignals) {
    return safeBody;
  }

  const practicalBlock =
    language === 'en'
      ? `\n\nPractical plan:\n1. Block 10 minutes today for one focused action.\n2. Repeat the same routine 5 days this week.\n3. Track one metric daily for 7 days.`
      : `\n\nPlan practic:\n1. Blochează azi 10 minute pentru o acțiune clară.\n2. Repetă aceeași rutină 5 zile săptămâna asta.\n3. Urmărește zilnic un indicator timp de 7 zile.`;

  return `${safeBody}${practicalBlock}`.trim();
}

function normalizeEmailEscapes(value: string): string {
  return normalizeTextValue(value)
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\r/g, '')
    .trim();
}

function trimEmailToLastCompleteSentence(value: string): string {
  const text = normalizeTextValue(value);
  if (!text) {
    return '';
  }

  if (/[.!?]$/.test(text)) {
    return text;
  }

  const lastBoundary = Math.max(text.lastIndexOf('.'), text.lastIndexOf('!'), text.lastIndexOf('?'));
  if (lastBoundary >= 80) {
    return text.slice(0, lastBoundary + 1).trim();
  }

  return text;
}

function ensureDetailedEmailBody(
  body: string,
  language: SupportedLanguage,
  niche: string,
  audiencePain: string,
  topic: string
): string {
  const normalizedBody = trimEmailToLastCompleteSentence(normalizeEmailEscapes(body));
  const practical = ensurePracticalEmailBody(normalizedBody, language);
  const wordCount = practical.split(/\s+/).filter(Boolean).length;
  const hasDetailedSignals =
    /\b(1\.|2\.|3\.|4\.|plan practic|practical plan|protocol|week|saptaman|săptămân|daily|zilnic)\b/i.test(
      practical
    );

  if (wordCount >= 230 && hasDetailedSignals) {
    return practical;
  }

  const extension =
    language === 'en'
      ? [
          '',
          'Detailed implementation plan:',
          '1. Baseline (Day 1): write down your current routine, identify one bottleneck, and choose one 10-minute action you can execute today.',
          '2. Execution (Days 2-5): repeat the same action at the same time each day, keep friction low, and track completion in a simple checklist.',
          '3. Optimization (Days 6-7): review what blocked you, adjust the routine by reducing complexity, and keep only the steps you can sustain next week.',
          `4. Applied to ${niche || 'your niche'} and topic "${topic || 'the current issue'}": focus on the exact pain point "${audiencePain || 'lack of consistency'}" and make every daily action solve that specific issue.`,
          '',
          'What to avoid:',
          '- Do not add too many new habits at once.',
          '- Do not rely on motivation spikes.',
          '- Do not skip tracking, even if the day feels busy.',
        ].join('\n')
      : [
          '',
          'Plan detaliat de implementare:',
          '1. Bază (Ziua 1): notează rutina actuală, identifică blocajul principal și alege o singură acțiune de 10 minute pe care o poți executa azi.',
          '2. Execuție (Zilele 2-5): repetă aceeași acțiune la aceeași oră, redu fricțiunea și bifează zilnic execuția într-un checklist simplu.',
          '3. Optimizare (Zilele 6-7): analizează ce te-a blocat, simplifică pașii și păstrează doar ce poți susține și săptămâna viitoare.',
          `4. Aplicat pe ${niche || 'nișa ta'} și topicul "${topic || 'problema curentă'}": atacă direct problema "${audiencePain || 'lipsa de consecvență'}", iar fiecare acțiune zilnică să rezolve fix acel punct.`,
          '',
          'Ce să eviți:',
          '- Nu adăuga prea multe obiceiuri noi dintr-odată.',
          '- Nu te baza pe motivație de moment.',
          '- Nu sări peste tracking, chiar dacă ziua e aglomerată.',
        ].join('\n');

  return `${practical}\n${extension}`.trim();
}

function extractTopicTokens(topic: string): string[] {
  return normalizeLooseComparisonText(topic)
    .split(/[^a-z0-9ăâîșț]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4)
    .slice(0, 6);
}

function isEmailBodyRelevant(body: string, topic: string, audiencePain: string): boolean {
  const normalizedBody = normalizeLooseComparisonText(body);
  if (!normalizedBody) {
    return false;
  }

  const topicTokens = extractTopicTokens(topic);
  const painTokens = extractTopicTokens(audiencePain);
  const topicMatches = topicTokens.filter((token) => normalizedBody.includes(token)).length;
  const painMatches = painTokens.filter((token) => normalizedBody.includes(token)).length;

  if (topicTokens.length === 0 && painTokens.length === 0) {
    return normalizedBody.split(/\s+/).length >= 120;
  }

  return topicMatches >= Math.min(2, topicTokens.length) || painMatches >= Math.min(2, painTokens.length);
}

function looksLikeGenericEmailFallback(body: string, language: SupportedLanguage): boolean {
  const normalized = normalizeLooseComparisonText(body);
  if (!normalized) return true;

  if (language === 'en') {
    return (
      normalized.includes('start simple, stay consistent') ||
      normalized.includes('if your schedule gets busy') ||
      normalized.includes('practical plan:')
    );
  }

  return (
    normalized.includes('incepe simplu, ramai consecvent') ||
    normalized.includes('cand programul se aglomereaza') ||
    normalized.includes('plan practic:')
  );
}

export async function generateMarketingEmail(
  input: GenerateMarketingEmailInput
): Promise<MarketingEmailResult> {
  const antiRepeatSection = buildAntiRepeatPromptSection(input.generationContext);
  const languageInstruction = buildAiLanguageInstruction(normalizeLanguage(input.language));
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

${languageInstruction}

CERINȚE:
1) Emailul trebuie să fie specific nișei și ICP-ului, NU generic.
2) Emailul trebuie să fie specific topicului exact: "${input.topic}".
3) Emailul trebuie să vorbească explicit despre pain point: "${input.audiencePain || 'N/A'}".
2) Include mecanisme de conversie: hook, relevanță, proof, CTA clar.
3) Include un bloc de soluție practică cu pași aplicabili imediat (pași/timp/frecvență).
4) Body în format plain text, ușor de trimis prin orice provider.
5) Body trebuie să fie detaliat și substanțial (ideal 280-450 cuvinte), nu răspuns scurt.
6) Include explicit un mini-plan de implementare pe zile/săptămână.
4) Evită promisiuni nerealiste.
5) Subject options să fie scurte și clare (max ~60 caractere).
6) Preview text max ~120 caractere.
7) Nu opri textul devreme și nu tăia propozițiile.

${antiRepeatSection}

Răspunde DOAR JSON strict:
{
  "subjectOptions": ["subiect 1", "subiect 2", "subiect 3"],
  "previewText": "preview",
  "body": "corpul complet al emailului",
  "cta": "cta final clar",
  "angles": ["unghi 1", "unghi 2", "unghi 3"]
}`;

  const content = (await generateGeminiJson(prompt, 0.6, 3600)) || '{}';
  let parsed: Partial<MarketingEmailResult> = {};
  try {
    parsed = await parseModelJson<Partial<MarketingEmailResult>>(content);
  } catch (error) {
    console.warn('Email JSON parse failed on first attempt, continuing with retry/fallback:', error);
    parsed = {};
  }
  const language = normalizeLanguage(input.language);
  const fallbackSubjectOptions =
    language === 'en'
      ? [
          `A simple plan for ${input.topic}`,
          'Stay consistent when life gets busy',
          'Make training easier to follow',
        ]
      : [
          `Un plan simplu pentru ${input.topic}`,
          'Cum rămâi consecvent când ai program aglomerat',
          'Fă antrenamentul mai ușor de ținut',
        ];
  const fallbackPreview =
    language === 'en'
      ? 'A practical way to stay consistent without adding pressure to your schedule.'
      : 'O metodă practică să rămâi consecvent fără să adaugi presiune în program.';
  const fallbackCta =
    language === 'en'
      ? input.ctaGoal || 'Reply to this email and I will send you the next practical step.'
      : input.ctaGoal || 'Răspunde la acest email și îți trimit următorul pas practic.';
  const fallbackBody =
    language === 'en'
      ? [
          `Hi,`,
          ``,
          `If your schedule gets busy, consistency does not have to disappear. The goal is not to force a perfect routine, but to keep a simple minimum that still moves you forward.`,
          ``,
          `Start with the smallest version of the habit: one short workout, one planned meal, or one clear decision before the day takes over. That keeps momentum alive even when work is demanding.`,
          ``,
          `For ${input.userContext.niche || 'your fitness goal'}, this matters because the result comes from repeated execution, not from a few perfect weeks.`,
          ``,
          fallbackCta,
        ].join('\n')
      : [
          `Salut,`,
          ``,
          `Când programul se aglomerează, consecvența nu trebuie să dispară. Scopul nu este să forțezi o rutină perfectă, ci să păstrezi un minim simplu care te duce înainte.`,
          ``,
          `Începe cu cea mai mică versiune a obiceiului: un antrenament scurt, o masă planificată sau o decizie clară înainte să te prindă ziua din urmă. Așa păstrezi ritmul chiar și când munca devine solicitantă.`,
          ``,
          `Pentru ${input.userContext.niche || 'obiectivul tău fitness'}, rezultatul vine din execuție repetată, nu din câteva săptămâni perfecte.`,
          ``,
          fallbackCta,
        ].join('\n');

  const generatedBodyCandidate = normalizeTextValue(parsed.body);
  const needsRetry =
    !generatedBodyCandidate ||
    generatedBodyCandidate.split(/\s+/).filter(Boolean).length < 120 ||
    !isEmailBodyRelevant(generatedBodyCandidate, input.topic, input.audiencePain || '');

  if (needsRetry) {
    const retryPrompt = `${prompt}

IMPORTANT RETRY RULES:
- Subject and body must explicitly reference topic "${input.topic}".
- Body must include at least one paragraph specifically about "${input.audiencePain || input.topic}".
- Body must include a concrete implementation plan (steps + frequency + what to track).
- Keep tone "${input.tone}" and end with CTA goal "${input.ctaGoal || fallbackCta}".
- Return strict JSON only.`;
    const retryContent = (await generateGeminiJson(retryPrompt, 0.45, 3900)) || '{}';
    let retryParsed: Partial<MarketingEmailResult> = {};
    try {
      retryParsed = await parseModelJson<Partial<MarketingEmailResult>>(retryContent);
    } catch (error) {
      console.warn('Email JSON parse failed on retry, keeping safe fallback path:', error);
      retryParsed = {};
    }
    parsed = {
      ...parsed,
      ...retryParsed,
      body: normalizeTextValue(retryParsed.body) || parsed.body,
      previewText: normalizeTextValue(retryParsed.previewText) || parsed.previewText,
      cta: normalizeTextValue(retryParsed.cta) || parsed.cta,
      subjectOptions:
        Array.isArray(retryParsed.subjectOptions) && retryParsed.subjectOptions.length
          ? retryParsed.subjectOptions
          : parsed.subjectOptions,
      angles:
        Array.isArray(retryParsed.angles) && retryParsed.angles.length
          ? retryParsed.angles
          : parsed.angles,
    };
  }

  const postRetryBody = normalizeTextValue(parsed.body);
  const needsBodyOnlyRegeneration =
    !postRetryBody ||
    !isEmailBodyRelevant(postRetryBody, input.topic, input.audiencePain || '') ||
    looksLikeGenericEmailFallback(postRetryBody, language);

  if (needsBodyOnlyRegeneration) {
    const bodyOnlyPrompt = `Scrie DOAR corpul unui email în limba ${language === 'en' ? 'engleză' : 'română'}, fără JSON și fără markdown.

TOPIC OBLIGATORIU: "${input.topic}"
PAIN POINT OBLIGATORIU: "${input.audiencePain || input.topic}"
NIȘĂ/CONTEXT: "${input.userContext.niche || 'fitness'}"
OFERĂ: "${input.offer || 'N/A'}"
SCOP CTA: "${input.ctaGoal || fallbackCta}"
TON: "${input.tone}"

Reguli obligatorii:
- 280-450 cuvinte
- explică clar problema topicului și de ce apare
- oferă soluții detaliate, concrete (pași, frecvență, ce urmărești)
- include un mini-plan pe 7 zile aplicat exact pe topic
- închide natural cu CTA-ul cerut
- nu folosi text generic sau șabloane.
`;

    try {
      const bodyOnly = normalizeTextValue(await generateGeminiText(bodyOnlyPrompt, 0.5, 2600));
      if (bodyOnly && isEmailBodyRelevant(bodyOnly, input.topic, input.audiencePain || '')) {
        parsed.body = bodyOnly;
      }
    } catch (error) {
      console.warn('Body-only regeneration failed, keeping previous body path:', error);
    }
  }

  return {
    subjectOptions: Array.isArray(parsed.subjectOptions)
      ? parsed.subjectOptions.slice(0, 3)
      : fallbackSubjectOptions,
    previewText: parsed.previewText || fallbackPreview,
    body: ensureDetailedEmailBody(
      parsed.body || fallbackBody,
      language,
      input.userContext.niche || '',
      input.audiencePain || '',
      input.topic
    ),
    cta: parsed.cta || fallbackCta,
    angles: Array.isArray(parsed.angles) && parsed.angles.length
      ? parsed.angles.slice(0, 5)
      : language === 'en'
        ? ['consistency', 'busy schedule', 'simple execution']
        : ['consecvență', 'program aglomerat', 'execuție simplă'],
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
  language?: SupportedLanguage;
  generationContext?: GenerationPromptContext;
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
  const antiRepeatSection = buildAntiRepeatPromptSection(input.generationContext);
  const languageInstruction = buildAiLanguageInstruction(normalizeLanguage(input.language));

  const prompt = `Tu ești un nutriționist sportiv senior pentru clienți fitness.

${languageInstruction}

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

${antiRepeatSection}

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
  "summary": "2-4 propoziții în limba cerută",
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
  translateNicheProfile,
  generateDailyIdea,
  generateMultiFormatIdea,
  structureUserIdea,
  analyzeFeedback,
  analyzeTextContent,
  generateMarketingEmail,
  generateClientNutritionPlan,
};
