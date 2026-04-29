import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { colors } from '../constants/colors';
import Card from '../components/Card';
import Input from '../components/Input';
import Button from '../components/Button';
import { emailAPI } from '../services/api';
import { useI18n } from '../hooks/useI18n';

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

function SelectRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: T; text: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.selectWrapper}>
      <Text style={styles.selectLabel}>{label}</Text>
      <View style={styles.optionRow}>
        {options.map((opt) => (
          <Button
            key={opt.value}
            title={opt.text}
            variant={value === opt.value ? 'primary' : 'outline'}
            onPress={() => onChange(opt.value)}
            style={styles.optionButton}
            textStyle={styles.optionButtonText}
          />
        ))}
      </View>
    </View>
  );
}

export default function EmailMarketingScreen() {
  const { language: platformLanguage, t } = useI18n();
  const [topic, setTopic] = useState('');
  const [objective, setObjective] = useState<Objective>('nurture');
  const [emailType, setEmailType] = useState<EmailType>('single');
  const [tone, setTone] = useState<Tone>('friendly');
  const [language, setLanguage] = useState<Language>(platformLanguage);
  const [offer, setOffer] = useState('');
  const [audiencePain, setAudiencePain] = useState('');
  const [ctaGoal, setCtaGoal] = useState('');

  useEffect(() => {
    setLanguage(platformLanguage);
  }, [platformLanguage]);

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
  });

  const result = generateMutation.data;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>{t('email.eyebrow')}</Text>
      <Text style={styles.title}>{t('email.title')}</Text>
      <Text style={styles.subtitle}>
        {t('email.subtitle')}
      </Text>

      <Card style={styles.card}>
        <Text style={styles.formTitle}>{t('email.formTitle')}</Text>

        <Input
          label={t('email.topic')}
          value={topic}
          onChangeText={setTopic}
          placeholder={t('email.placeholder.topic')}
        />

        <SelectRow
          label={t('email.objective')}
          value={objective}
          onChange={(value) => setObjective(value as Objective)}
          options={[
            { value: 'nurture', text: t('email.objective.nurture') },
            { value: 'lead-magnet', text: t('email.objective.leadMagnet') },
            { value: 'sales', text: t('email.objective.sales') },
            { value: 'reengagement', text: t('email.objective.reengagement') },
          ]}
        />

        <SelectRow
          label={t('email.type')}
          value={emailType}
          onChange={(value) => setEmailType(value as EmailType)}
          options={[
            { value: 'single', text: t('email.type.single') },
            { value: 'welcome', text: t('email.type.welcome') },
            { value: 'promo', text: t('email.type.promo') },
            { value: 'newsletter', text: t('email.type.newsletter') },
          ]}
        />

        <SelectRow
          label={t('email.tone')}
          value={tone}
          onChange={(value) => setTone(value as Tone)}
          options={[
            { value: 'friendly', text: t('email.tone.friendly') },
            { value: 'empathetic', text: t('email.tone.empathetic') },
            { value: 'authoritative', text: t('email.tone.authoritative') },
            { value: 'direct', text: t('email.tone.direct') },
          ]}
        />

        <SelectRow
          label={t('email.language')}
          value={language}
          onChange={(value) => setLanguage(value as Language)}
          options={[
            { value: 'ro', text: 'Română' },
            { value: 'en', text: 'English' },
          ]}
        />

        <Input
          label={t('email.offerOptional')}
          value={offer}
          onChangeText={setOffer}
          placeholder={t('email.placeholder.offer')}
        />

        <Input
          label={t('email.audiencePainOptional')}
          value={audiencePain}
          onChangeText={setAudiencePain}
          placeholder={t('email.placeholder.pain')}
        />

        <Input
          label={t('email.ctaGoalOptional')}
          value={ctaGoal}
          onChangeText={setCtaGoal}
          placeholder={t('email.placeholder.cta')}
        />

        <Button
          title={t('email.generate')}
          onPress={() => generateMutation.mutate()}
          loading={generateMutation.isPending}
          disabled={topic.trim().length < 5}
        />

        {generateMutation.isError ? (
          <Text style={styles.errorText}>
            {(generateMutation.error as any)?.response?.data?.error || t('email.error')}
          </Text>
        ) : null}
      </Card>

      {result ? (
        <Card>
          <Text style={styles.resultTitle}>{t('email.output')}</Text>

          <Text style={styles.blockTitle}>{t('email.subjectOptions')}</Text>
          {result.subjectOptions?.map((subject, idx) => (
            <Text key={`${subject}-${idx}`} style={styles.resultText}>
              {idx + 1}. {subject}
            </Text>
          ))}

          <Text style={styles.blockTitle}>{t('email.previewText')}</Text>
          <Text style={styles.resultText}>{result.previewText}</Text>

          <Text style={styles.blockTitle}>{t('email.body')}</Text>
          <Text style={styles.resultText}>{result.body}</Text>

          <Text style={styles.blockTitle}>CTA</Text>
          <Text style={styles.resultText}>{result.cta}</Text>

          <Text style={styles.blockTitle}>{t('email.angles')}</Text>
          {result.angles?.map((angle, idx) => (
            <Text key={`${angle}-${idx}`} style={styles.resultText}>• {angle}</Text>
          ))}
        </Card>
      ) : null}
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
  eyebrow: {
    color: '#60A5FA',
    fontSize: 12,
    fontWeight: '700' as const,
    marginBottom: 6,
    letterSpacing: 0.7,
  },
  title: {
    color: colors.text.primary,
    fontSize: 30,
    fontWeight: '700' as const,
    marginBottom: 8,
  },
  subtitle: {
    color: colors.text.secondary,
    fontSize: 14,
    marginBottom: 14,
  },
  card: {
    marginBottom: 14,
  },
  formTitle: {
    color: colors.text.primary,
    fontSize: 20,
    fontWeight: '700' as const,
    marginBottom: 12,
  },
  selectWrapper: {
    marginBottom: 12,
  },
  selectLabel: {
    color: colors.text.primary,
    fontSize: 14,
    fontWeight: '600' as const,
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
  },
  optionButton: {
    minHeight: 36,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  optionButtonText: {
    fontSize: 12,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    marginTop: 10,
  },
  resultTitle: {
    color: colors.text.primary,
    fontSize: 20,
    fontWeight: '700' as const,
    marginBottom: 12,
  },
  blockTitle: {
    color: colors.brand.primary,
    fontSize: 13,
    fontWeight: '700' as const,
    marginTop: 12,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  resultText: {
    color: colors.text.secondary,
    fontSize: 14,
    lineHeight: 20,
  },
});
