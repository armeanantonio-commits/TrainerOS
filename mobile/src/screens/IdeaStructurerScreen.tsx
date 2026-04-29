import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TextInput } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../constants/colors';
import Card from '../components/Card';
import Button from '../components/Button';
import { authAPI, ideaAPI } from '../services/api';
import { useI18n } from '../hooks/useI18n';

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
  return (
    normalizeTextValue(section.text) ||
    normalizeTextValue(section.content) ||
    normalizeTextValue(section.body) ||
    normalizeTextValue(section.scriptText) ||
    normalizeTextValue(section.description)
  );
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
  const rawScript = Array.isArray(source.script) ? source.script : [];
  const improvements = Array.isArray(source.improvements)
    ? source.improvements.map((item) => normalizeTextValue(item)).filter(Boolean)
    : [];

  return {
    mainIdea: normalizeTextValue(source.mainIdea),
    hooks: hooks.length > 0 ? hooks : ['', ''],
    script: defaultSectionTitles.map((title, index) => {
      const section = rawScript[index];
      const part = section && typeof section === 'object' ? (section as Record<string, unknown>) : {};

      return {
        sectionTitle: normalizeStructuredIdeaTitle(part, defaultSectionTitles) || title,
        text: normalizeSectionText(part),
      };
    }),
    cta: normalizeTextValue(source.cta),
    ctaStyleApplied: normalizeTextValue(source.ctaStyleApplied),
    improvements: improvements.length > 0 ? improvements : defaultImprovements,
  };
}

export default function IdeaStructurerScreen() {
  const navigation = useNavigation<any>();
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

  const hasNiche = !!(userData?.niche && userData?.icpProfile);

  const structureMutation = useMutation({
    mutationFn: (text: string) => ideaAPI.structure({ ideaText: text }),
    onError: (error: any) => {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        t('structurer.error');
      Alert.alert(t('daily.error'), message);
    },
  });

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

  const canSubmit = useMemo(() => ideaText.trim().length >= 10, [ideaText]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card style={styles.card}>
        <Text style={styles.title}>{t('structurer.title')}</Text>
        <Text style={styles.subtitle}>{t('structurer.subtitle')}</Text>

        {!hasNiche ? (
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              {t('structurer.nicheRequired')}
            </Text>
            <Button
              title={t('structurer.goNiche')}
              onPress={() => navigation.navigate('NicheFinder')}
            />
          </View>
        ) : (
          <>
            <TextInput
              multiline
              value={ideaText}
              onChangeText={setIdeaText}
              placeholder={t('structurer.placeholder')}
              placeholderTextColor={colors.text.muted}
              style={styles.bigInput}
              textAlignVertical="top"
              maxLength={4000}
            />
            <View style={styles.actionRow}>
              <Button
                title={t('structurer.submit')}
                onPress={() => structureMutation.mutate(ideaText)}
                loading={structureMutation.isPending}
                disabled={!canSubmit}
              />
            </View>
          </>
        )}
      </Card>

      {structureMutation.isSuccess && !hasVisibleResult && (
        <Card style={styles.warningCard}>
          <Text style={styles.warningText}>
            {t('structurer.incomplete')}
          </Text>
        </Card>
      )}

      {hasVisibleResult && result && (
        <View style={styles.resultsWrap}>
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>{t('structurer.mainIdea')}</Text>
            <Text style={styles.bodyText}>{result.mainIdea}</Text>
          </Card>

          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>{t('structurer.hooks')}</Text>
            {result.hooks.map((hook, idx) => (
              <View key={`hook-${idx}`} style={styles.itemBox}>
                <Text style={styles.bodyText}>{idx + 1}. {hook}</Text>
              </View>
            ))}
          </Card>

          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>{t('structurer.script')}</Text>
            {result.script.map((part, idx) => (
              <View key={`part-${idx}`} style={styles.itemBox}>
                <Text style={styles.partTitle}>{part.sectionTitle}</Text>
                <Text style={styles.bodyText}>{part.text}</Text>
              </View>
            ))}
          </Card>

          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>{t('structurer.cta')}</Text>
            <Text style={styles.metaText}>
              {t('structurer.ctaStyle', { style: result.ctaStyleApplied })}
            </Text>
            <Text style={styles.bodyText}>{result.cta}</Text>
          </Card>

          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>{t('structurer.improvements')}</Text>
            {result.improvements.map((item, idx) => (
              <Text key={`impr-${idx}`} style={styles.bodyText}>• {item}</Text>
            ))}
          </Card>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  content: {
    padding: 20,
  },
  resultsWrap: {
    gap: 12,
  },
  card: {
    marginBottom: 12,
  },
  title: {
    color: colors.text.primary,
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 6,
  },
  subtitle: {
    color: colors.text.secondary,
    fontSize: 14,
    marginBottom: 12,
  },
  bigInput: {
    minHeight: 220,
    backgroundColor: colors.dark.bgLight,
    borderWidth: 1,
    borderColor: colors.dark.border,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: colors.text.primary,
    fontSize: 16,
  },
  actionRow: {
    marginTop: 12,
    alignItems: 'flex-end',
  },
  sectionTitle: {
    color: colors.text.primary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
  },
  partTitle: {
    color: colors.brand.primary,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
  },
  itemBox: {
    backgroundColor: colors.dark.bgLight,
    borderWidth: 1,
    borderColor: colors.dark.border,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  bodyText: {
    color: colors.text.secondary,
    fontSize: 14,
    lineHeight: 20,
  },
  metaText: {
    color: colors.text.muted,
    fontSize: 12,
    marginBottom: 8,
  },
  warningBox: {
    borderWidth: 1,
    borderColor: `${colors.brand.primary}55`,
    backgroundColor: `${colors.brand.primary}22`,
    borderRadius: 10,
    padding: 12,
    gap: 12,
  },
  warningText: {
    color: colors.text.secondary,
    fontSize: 14,
    lineHeight: 20,
  },
  warningCard: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#facc1555',
    backgroundColor: '#facc1518',
  },
});
