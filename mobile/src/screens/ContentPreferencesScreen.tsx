import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../constants/colors';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import { contentAPI } from '../services/api';
import { useI18n } from '../hooks/useI18n';

interface BrandVoiceForm {
  perception: string[];
  naturalStyle: string;
  neverDo: string[];
  principles: string[];
  customPrinciple: string;
  ctaStyle: string;
  brandWords: string[];
  frequentPhrases: string;
  humorTone: string;
}

const TOTAL_STEPS = 8;

const DEFAULT_FORM: BrandVoiceForm = {
  perception: [],
  naturalStyle: '',
  neverDo: [],
  principles: [],
  customPrinciple: '',
  ctaStyle: '',
  brandWords: [],
  frequentPhrases: '',
  humorTone: '',
};

const isObject = (value: unknown): value is Record<string, any> =>
  typeof value === 'object' && value !== null;

const sanitizeBrandVoice = (raw: unknown): BrandVoiceForm => {
  if (!isObject(raw)) return DEFAULT_FORM;

  return {
    perception: Array.isArray(raw.perception)
      ? raw.perception.filter((item) => typeof item === 'string')
      : [],
    naturalStyle: typeof raw.naturalStyle === 'string' ? raw.naturalStyle : '',
    neverDo: Array.isArray(raw.neverDo)
      ? raw.neverDo.filter((item) => typeof item === 'string')
      : [],
    principles: Array.isArray(raw.principles)
      ? raw.principles.filter((item) => typeof item === 'string')
      : [],
    customPrinciple:
      typeof raw.customPrinciple === 'string' ? raw.customPrinciple : '',
    ctaStyle: typeof raw.ctaStyle === 'string' ? raw.ctaStyle : '',
    brandWords: Array.isArray(raw.brandWords)
      ? raw.brandWords.filter((item) => typeof item === 'string')
      : [],
    frequentPhrases:
      typeof raw.frequentPhrases === 'string' ? raw.frequentPhrases : '',
    humorTone: typeof raw.humorTone === 'string' ? raw.humorTone : '',
  };
};

export default function ContentPreferencesScreen() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<BrandVoiceForm>(DEFAULT_FORM);

  const { data: existingPreferences, isLoading: isLoadingExisting } = useQuery({
    queryKey: ['content-preferences'],
    queryFn: async () => {
      const { data } = await contentAPI.getPreferences();
      return data?.contentPreferences;
    },
  });

  useEffect(() => {
    if (existingPreferences === undefined) return;
    const payload = isObject(existingPreferences)
      ? existingPreferences.brandVoice
      : null;
    setFormData(sanitizeBrandVoice(payload));
  }, [existingPreferences]);

  const saveMutation = useMutation({
    mutationFn: (data: BrandVoiceForm) =>
      contentAPI.savePreferences({
        type: 'brand-voice',
        version: 1,
        completedAt: new Date().toISOString(),
        brandVoice: data,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      await queryClient.invalidateQueries({ queryKey: ['content-preferences'] });
      Alert.alert(t('prefs.success'), t('brand.saved'), [
        { text: t('prefs.ok'), onPress: () => navigation.goBack() },
      ]);
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.error || t('brand.saveError');
      Alert.alert(t('daily.error'), message);
    },
  });

  const completionPercent = useMemo(
    () => Math.round((step / TOTAL_STEPS) * 100),
    [step]
  );

  const toggleWithLimit = (
    field: 'perception' | 'neverDo' | 'principles' | 'brandWords',
    value: string,
    max: number
  ) => {
    const current = formData[field];
    if (current.includes(value)) {
      setFormData({ ...formData, [field]: current.filter((v) => v !== value) });
      return;
    }
    if (current.length >= max) {
      Alert.alert(t('prefs.limit'), t('prefs.maxOptions', { max }));
      return;
    }
    setFormData({ ...formData, [field]: [...current, value] });
  };

  const canGoNext = () => {
    if (step === 1) return formData.perception.length >= 1;
    if (step === 2) return !!formData.naturalStyle;
    if (step === 3) return formData.neverDo.length >= 1;
    if (step === 4) return formData.principles.length >= 1;
    if (step === 5) return !!formData.ctaStyle;
    if (step === 6) return formData.brandWords.length === 3;
    return true;
  };

  const handleNext = () => {
    if (!canGoNext()) {
      Alert.alert(t('prefs.validation'), t('prefs.requiredShort'));
      return;
    }
    setStep((prev) => Math.min(TOTAL_STEPS, prev + 1));
  };

  const handleSubmit = () => {
    if (!canGoNext()) {
      Alert.alert(t('prefs.validation'), t('prefs.requiredShort'));
      return;
    }
    saveMutation.mutate(formData);
  };

  const SelectOption = ({
    label,
    selected,
    onPress,
  }: {
    label: string;
    selected: boolean;
    onPress: () => void;
  }) => (
    <TouchableOpacity
      style={[styles.optionCard, selected && styles.optionCardActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.optionText, selected && styles.optionTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.progressHeader}>
        <View style={styles.progressMetaRow}>
          <Text style={styles.progressStepText}>
            {t('prefs.questionProgress', { current: step, total: TOTAL_STEPS })}
          </Text>
          <Text style={styles.progressPercentText}>{t('prefs.durationBrand')}</Text>
        </View>
        <View style={styles.progressBarTrack}>
          <View style={[styles.progressBarFill, { width: `${completionPercent}%` }]} />
        </View>
      </View>

      <View style={styles.header}>
        <Text style={styles.title}>{t('brand.title')}</Text>
        <Text style={styles.subtitle}>
          {t('brand.subtitle')}
        </Text>
      </View>

      <Card style={styles.card}>
        {isLoadingExisting && (
          <Text style={styles.loadingText}>{t('brand.loading')}</Text>
        )}

        {!isLoadingExisting && step === 1 && (
          <View>
            <Text style={styles.questionTitle}>
              {t('brand.q1')}
            </Text>
            <Text style={styles.hint}>{t('brand.max2')}</Text>
            {[
              { value: 'Direct și clar', label: t('brand.perception.direct') },
              { value: 'Prietenos și cald', label: t('brand.perception.warm') },
              { value: 'Funny și relatable', label: t('brand.perception.funny') },
              { value: 'Serios și autoritar', label: t('brand.perception.authoritative') },
              { value: 'Calm și educativ', label: t('brand.perception.calm') },
              { value: 'Energic și “pushy” (pozitiv)', label: t('brand.perception.energetic') },
            ].map((option) => (
              <SelectOption
                key={option.value}
                label={option.label}
                selected={formData.perception.includes(option.value)}
                onPress={() => toggleWithLimit('perception', option.value, 2)}
              />
            ))}
          </View>
        )}

        {!isLoadingExisting && step === 2 && (
          <View>
            <Text style={styles.questionTitle}>{t('brand.q2')}</Text>
            {[
              { value: 'Simplu, pe înțelesul tuturor', label: t('brand.style.simple') },
              { value: 'Mix: simplu + un pic tehnic', label: t('brand.style.mix') },
              { value: 'Mai tehnic (pentru oameni deja avansați)', label: t('brand.style.technical') },
            ].map((option) => (
              <SelectOption
                key={option.value}
                label={option.label}
                selected={formData.naturalStyle === option.value}
                onPress={() => setFormData({ ...formData, naturalStyle: option.value })}
              />
            ))}
          </View>
        )}

        {!isLoadingExisting && step === 3 && (
          <View>
            <Text style={styles.questionTitle}>
              {t('brand.q3')}
            </Text>
            <Text style={styles.hint}>{t('brand.max2')}</Text>
            {[
              { value: 'Rușinare / motivare toxică', label: t('brand.never.shame') },
              { value: 'Promisiuni rapide', label: t('brand.never.promises') },
              { value: 'Extreme', label: t('brand.never.extreme') },
              { value: 'Prea tehnic / rigid', label: t('brand.never.rigid') },
              { value: 'Clickbait', label: t('brand.never.clickbait') },
            ].map((option) => (
              <SelectOption
                key={option.value}
                label={option.label}
                selected={formData.neverDo.includes(option.value)}
                onPress={() => toggleWithLimit('neverDo', option.value, 2)}
              />
            ))}
          </View>
        )}

        {!isLoadingExisting && step === 4 && (
          <View>
            <Text style={styles.questionTitle}>
              {t('brand.q4')}
            </Text>
            <Text style={styles.hint}>{t('brand.max2')}</Text>
            {[
              { value: 'Consistență > perfecțiune', label: t('brand.principle.consistency') },
              { value: 'Simplitate > programe complicate', label: t('brand.principle.simplicity') },
              { value: 'Tehnică > greutăți mari', label: t('brand.principle.technique') },
              { value: 'Obiceiuri > dietă extremă', label: t('brand.principle.habits') },
              { value: 'Sănătate & performanță > doar estetic', label: t('brand.principle.health') },
            ].map((option) => (
              <SelectOption
                key={option.value}
                label={option.label}
                selected={formData.principles.includes(option.value)}
                onPress={() => toggleWithLimit('principles', option.value, 2)}
              />
            ))}
            <Input
              label={t('brand.customPrinciple')}
              value={formData.customPrinciple}
              onChangeText={(text) => setFormData({ ...formData, customPrinciple: text })}
              placeholder={t('brand.customPrinciplePlaceholder')}
              maxLength={120}
            />
          </View>
        )}

        {!isLoadingExisting && step === 5 && (
          <View>
            <Text style={styles.questionTitle}>
              {t('brand.q5')}
            </Text>
            {[
              { value: 'Soft (comentariu / întrebare)', label: t('brand.cta.soft') },
              { value: 'Direct (scrie-mi X / trimite mesaj)', label: t('brand.cta.direct') },
              { value: 'Educațional (salvează / share)', label: t('brand.cta.educational') },
              { value: 'Mix', label: t('brand.cta.mix') },
            ].map((option) => (
              <SelectOption
                key={option.value}
                label={option.label}
                selected={formData.ctaStyle === option.value}
                onPress={() => setFormData({ ...formData, ctaStyle: option.value })}
              />
            ))}
          </View>
        )}

        {!isLoadingExisting && step === 6 && (
          <View>
            <Text style={styles.questionTitle}>
              {t('brand.q6')}
            </Text>
            <Text style={styles.hint}>{t('brand.exact3')}</Text>
            {[
              { value: 'Clar', label: t('brand.word.clear') },
              { value: 'Calm', label: t('brand.word.calm') },
              { value: 'Funny', label: t('brand.word.funny') },
              { value: 'Empatic', label: t('brand.word.empathic') },
              { value: 'Disciplinat', label: t('brand.word.disciplined') },
              { value: 'Științific', label: t('brand.word.scientific') },
              { value: 'Simplu', label: t('brand.word.simple') },
              { value: 'Motivațional', label: t('brand.word.motivational') },
              { value: 'Elegant', label: t('brand.word.elegant') },
              { value: 'No bullshit', label: t('brand.word.noBullshit') },
            ].map((option) => (
              <SelectOption
                key={option.value}
                label={option.label}
                selected={formData.brandWords.includes(option.value)}
                onPress={() => toggleWithLimit('brandWords', option.value, 3)}
              />
            ))}
          </View>
        )}

        {!isLoadingExisting && step === 7 && (
          <View>
            <Text style={styles.questionTitle}>
              {t('brand.q7')}
            </Text>
            <Text style={styles.hint}>{t('brand.optionalExamples')}</Text>
            <Input
              value={formData.frequentPhrases}
              onChangeText={(text) => setFormData({ ...formData, frequentPhrases: text })}
              placeholder={t('brand.phrasesPlaceholder')}
              maxLength={180}
            />
          </View>
        )}

        {!isLoadingExisting && step === 8 && (
          <View>
            <Text style={styles.questionTitle}>
              {t('brand.q8')}
            </Text>
            <Text style={styles.hint}>{t('brand.optional')}</Text>
            {[
              { value: 'Deloc', label: t('brand.humor.none') },
              { value: 'Subtil / ironic light', label: t('brand.humor.subtle') },
              { value: 'Relatable (POV, situații)', label: t('brand.humor.relatable') },
              { value: 'Direct și mai provocator (fără jigniri)', label: t('brand.humor.direct') },
            ].map((option) => (
              <SelectOption
                key={option.value}
                label={option.label}
                selected={formData.humorTone === option.value}
                onPress={() => setFormData({ ...formData, humorTone: option.value })}
              />
            ))}
          </View>
        )}

        <View style={styles.actionsRow}>
          <Button
            title={t('prefs.back')}
            variant="outline"
            onPress={() => setStep((prev) => Math.max(1, prev - 1))}
            disabled={step === 1 || saveMutation.isPending}
            style={styles.actionButton}
          />

          {step < TOTAL_STEPS ? (
            <Button
              title={t('prefs.next')}
              onPress={handleNext}
              disabled={saveMutation.isPending}
              style={styles.actionButton}
            />
          ) : (
            <Button
              title={saveMutation.isPending ? t('prefs.saving') : t('brand.save')}
              onPress={handleSubmit}
              loading={saveMutation.isPending}
              style={styles.actionButton}
            />
          )}
        </View>
      </Card>
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
  progressHeader: {
    marginBottom: 18,
  },
  progressMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressStepText: {
    color: colors.text.secondary,
    fontSize: 13,
  },
  progressPercentText: {
    color: colors.brand.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  progressBarTrack: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.dark.border,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.brand.primary,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    color: colors.text.primary,
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 8,
  },
  subtitle: {
    color: colors.text.secondary,
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    marginBottom: 20,
  },
  loadingText: {
    color: colors.text.secondary,
    marginBottom: 8,
  },
  questionTitle: {
    color: colors.text.primary,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 10,
  },
  hint: {
    color: colors.text.secondary,
    fontSize: 13,
    marginBottom: 10,
  },
  optionCard: {
    borderWidth: 1,
    borderColor: colors.dark.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    backgroundColor: colors.dark.bg,
  },
  optionCardActive: {
    borderColor: colors.brand.primary,
    backgroundColor: `${colors.brand.primary}22`,
  },
  optionText: {
    color: colors.text.secondary,
    fontSize: 14,
    fontWeight: '600',
  },
  optionTextActive: {
    color: colors.brand.primary,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  actionButton: {
    minWidth: 130,
  },
});
