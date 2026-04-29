export type SupportedLanguage = 'ro' | 'en';

export const DEFAULT_LANGUAGE: SupportedLanguage = 'ro';

export function normalizeLanguage(value: unknown): SupportedLanguage {
  return value === 'en' ? 'en' : DEFAULT_LANGUAGE;
}

export function buildAiLanguageInstruction(language: SupportedLanguage): string {
  if (language === 'en') {
    return [
      'OUTPUT LANGUAGE:',
      '- Write the entire final output in natural, fluent English.',
      '- Do not mix Romanian into user-facing fields unless quoting user-provided text.',
      '- Adapt idioms, tone, CTA wording, and marketing language for an English-speaking fitness audience.',
      '- Keep JSON keys, tags, and structural markers exactly as requested by the prompt.',
    ].join('\n');
  }

  return [
    'LIMBA OUTPUT-ULUI:',
    '- Scrie tot output-ul final în română naturală, corectă gramatical și ușor de înțeles pentru oameni din România.',
    '- Nu traduce literal din engleză și nu folosi jargon englezesc dacă există variantă clară în română.',
    '- Adaptează tonul, CTA-ul și formulările ca pentru un antrenor român real.',
    '- Păstrează cheile JSON, tagurile și markerii structurali exact cum sunt cerute în prompt.',
  ].join('\n');
}
