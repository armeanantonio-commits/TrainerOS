import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { authAPI, ideaAPI } from '@/services/api';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { useI18n } from '@/hooks/useI18n';

interface StructuredIdeaResponse {
  mainIdea: string;
  hooks: string[];
  script: { sectionTitle: string; text: string }[];
  cta: string;
  ctaStyleApplied: string;
  improvements: string[];
}

function normalizeTextValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLooseComparisonText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
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

function normalizeStructuredIdeaTitle(value: unknown, defaultSectionTitles: string[]): string {
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
  const matchedDefaultTitle = defaultSectionTitles.find((title) =>
    normalizedRawTitle.startsWith(normalizeLooseComparisonText(title))
  );

  return matchedDefaultTitle || rawTitle;
}

function normalizeSectionText(section: Record<string, unknown>): string {
  return collectStructuredIdeaText(section).join('\n\n').trim();
}

function normalizeStructuredIdeaResponse(
  value: unknown,
  defaultSectionTitles: string[],
  defaultImprovements: string[]
): StructuredIdeaResponse | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const source = value as Record<string, unknown>;
  const hooks = Array.isArray(source.hooks)
    ? source.hooks.map((hook) => normalizeTextValue(hook)).filter(Boolean)
    : [];
  const rawScript = Array.isArray(source.script)
    ? source.script
    : source.script && typeof source.script === 'object'
      ? Object.values(source.script as Record<string, unknown>)
      : [];
  const improvements = Array.isArray(source.improvements)
    ? source.improvements.map((item) => normalizeTextValue(item)).filter(Boolean)
    : [];
  const normalizedScript = rawScript.length
    ? rawScript.map((section, index) => {
        const part = section && typeof section === 'object' ? (section as Record<string, unknown>) : {};

        return {
          sectionTitle:
            normalizeStructuredIdeaTitle(part, defaultSectionTitles) ||
            defaultSectionTitles[index] ||
            `PARTEA ${index + 1}`,
          text: normalizeSectionText(part),
        };
      })
    : defaultSectionTitles.map((title) => ({
        sectionTitle: title,
        text: '',
      }));

  return {
    mainIdea: normalizeTextValue(source.mainIdea),
    hooks: hooks.length > 0 ? hooks : ['', ''],
    script: normalizedScript,
    cta: normalizeTextValue(source.cta),
    ctaStyleApplied: normalizeTextValue(source.ctaStyleApplied),
    improvements: improvements.length > 0 ? improvements : defaultImprovements,
  };
}

export default function IdeaStructurer() {
  const { t } = useI18n();
  const [ideaText, setIdeaText] = useState('');
  const defaultSectionTitles = [
    t('structurer.defaultSection1'),
    t('structurer.defaultSection2'),
    t('structurer.defaultSection3'),
    t('structurer.defaultSection4'),
  ];
  const defaultImprovements = [
    t('structurer.defaultImprovement1'),
    t('structurer.defaultImprovement2'),
    t('structurer.defaultImprovement3'),
    t('structurer.defaultImprovement4'),
  ];

  const { data: userData } = useQuery({
    queryKey: ['user-me'],
    queryFn: async () => {
      const { data } = await authAPI.me();
      return data.user;
    },
  });

  const structureMutation = useMutation({
    mutationFn: (text: string) => ideaAPI.structure({ ideaText: text }),
  });

  const hasNiche = !!userData?.niche;
  const result = normalizeStructuredIdeaResponse(
    structureMutation.data?.data,
    defaultSectionTitles,
    defaultImprovements
  );
  const hasVisibleResult = !!(
    result &&
    (result.mainIdea ||
      result.hooks.some(Boolean) ||
      result.script.some((part) => part.text) ||
      result.cta ||
      result.improvements.length)
  );

  return (
    <div className="min-h-screen bg-dark-400 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <Card className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-2 font-display">
            {t('structurer.title')}
          </h1>
          <p className="text-gray-300 mb-6">{t('structurer.subtitle')}</p>

          {!hasNiche ? (
            <div className="bg-brand-500/10 border border-brand-500/40 rounded-lg p-4">
              <p className="text-gray-200 mb-3">
                {t('structurer.nicheRequired')}
              </p>
              <Link to="/niche-finder">
                <Button>{t('structurer.goNiche')}</Button>
              </Link>
            </div>
          ) : (
            <>
              <textarea
                value={ideaText}
                onChange={(e) => setIdeaText(e.target.value)}
                placeholder={t('structurer.placeholder')}
                className="w-full min-h-[220px] p-4 rounded-lg bg-dark-300 border border-dark-100 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />

              <div className="mt-4 flex justify-end">
                <Button
                  onClick={() => structureMutation.mutate(ideaText)}
                  isLoading={structureMutation.isPending}
                  disabled={!ideaText.trim() || ideaText.trim().length < 10}
                >
                  {t('structurer.submit')}
                </Button>
              </div>
            </>
          )}
        </Card>

        {structureMutation.isError && (
          <Card className="mb-6 bg-red-500/10 border-red-500/50">
            <p className="text-red-400">
              {(structureMutation.error as any)?.response?.data?.message ||
                (structureMutation.error as any)?.response?.data?.error ||
                t('structurer.error')}
            </p>
          </Card>
        )}

        {structureMutation.isSuccess && !hasVisibleResult && (
          <Card className="mb-6 bg-yellow-500/10 border-yellow-500/40">
            <p className="text-yellow-200">
              {t('structurer.incomplete')}
            </p>
          </Card>
        )}

        {hasVisibleResult && result && (
          <div className="space-y-6">
            <Card>
              <h2 className="text-white font-bold mb-3">{t('structurer.mainIdea')}</h2>
              <p className="text-gray-200">{result.mainIdea}</p>
            </Card>

            <Card>
              <h2 className="text-white font-bold mb-3">{t('structurer.hooks')}</h2>
              <div className="space-y-2">
                {result.hooks.map((hook, idx) => (
                  <div key={idx} className="bg-dark-300 rounded-lg p-3 text-gray-100">
                    {idx + 1}. {hook}
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <h2 className="text-white font-bold mb-3">{t('structurer.script')}</h2>
              <div className="space-y-4">
                {result.script.map((part, idx) => (
                  <div key={`${part.sectionTitle}-${idx}`} className="bg-dark-300 rounded-lg p-4">
                    <h3 className="text-brand-500 font-semibold mb-2">{part.sectionTitle}</h3>
                    <p className="text-gray-200 whitespace-pre-wrap">{part.text}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <h2 className="text-white font-bold mb-2">{t('structurer.cta')}</h2>
              <p className="text-gray-400 text-sm mb-3">
                {t('structurer.ctaStyle', { style: result.ctaStyleApplied })}
              </p>
              <p className="text-gray-100">{result.cta}</p>
            </Card>

            <Card>
              <h2 className="text-white font-bold mb-3">{t('structurer.improvements')}</h2>
              <ul className="space-y-2">
                {result.improvements.map((item, idx) => (
                  <li key={idx} className="text-gray-200">
                    • {item}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
