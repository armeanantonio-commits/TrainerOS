import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../constants/colors';
import Card from '../components/Card';
import Input from '../components/Input';
import Button from '../components/Button';
import { contentAPI } from '../services/api';
import { useI18n } from '../hooks/useI18n';

interface ContentCreationData {
  filmingLocation: string;
  naturalContentTypes: string[];
  otherNaturalFormat: string;
  deliveryStyles: string[];
}

const totalSteps = 3;

const filmingLocationOptions = ['Acasă', 'La sală', 'Ambele (în funcție de zi)'];
const naturalContentTypeOptions = [
  'Educațional – nutriție',
  'Educațional – exerciții / antrenamente',
  'Relatable / funny',
  'Story / experiență personală',
];
const deliveryStyleOptions = [
  'Vorbit direct la cameră',
  'Voice-over peste video',
  'Text + B-roll (fără vorbit)',
  'Mix, în funcție de zi',
];

const DEFAULT_FORM: ContentCreationData = {
  filmingLocation: '',
  naturalContentTypes: [],
  otherNaturalFormat: '',
  deliveryStyles: [],
};

export default function ContentCreationPreferencesScreen() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<ContentCreationData>(DEFAULT_FORM);

  const preferencesQuery = useQuery({
    queryKey: ['content-preferences'],
    queryFn: async () => {
      const { data } = await contentAPI.getPreferences();
      return data?.contentPreferences;
    },
  });

  useEffect(() => {
    const payload = preferencesQuery.data?.contentCreation;
    if (!payload) return;
    setFormData({
      filmingLocation: payload.filmingLocation || '',
      naturalContentTypes: Array.isArray(payload.naturalContentTypes)
        ? payload.naturalContentTypes
        : [],
      otherNaturalFormat: payload.otherNaturalFormat || '',
      deliveryStyles: Array.isArray(payload.deliveryStyles)
        ? payload.deliveryStyles
        : [],
    });
  }, [preferencesQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (data: ContentCreationData) =>
      contentAPI.savePreferences({
        type: 'content-creation',
        version: 1,
        completedAt: new Date().toISOString(),
        contentCreation: data,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      await queryClient.invalidateQueries({ queryKey: ['content-preferences'] });
      Alert.alert(t('prefs.success'), t('creation.saved'), [
        { text: t('prefs.ok'), onPress: () => navigation.goBack() },
      ]);
    },
    onError: (error: any) => {
      Alert.alert(
        t('daily.error'),
        error?.response?.data?.error || t('creation.saveError')
      );
    },
  });

  const toggleMulti = (field: 'naturalContentTypes' | 'deliveryStyles', value: string) => {
    const current = formData[field];
    const updated = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    setFormData({ ...formData, [field]: updated });
  };

  const canGoNext = () => {
    if (step === 1) return !!formData.filmingLocation;
    if (step === 2) return formData.naturalContentTypes.length > 0;
    if (step === 3) return formData.deliveryStyles.length > 0;
    return true;
  };

  const handleContinue = () => {
    if (!canGoNext()) {
      Alert.alert(t('prefs.validation'), t('prefs.required'));
      return;
    }
    setStep((prev) => Math.min(totalSteps, prev + 1));
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.stepText}>
          {t('prefs.questionProgress', { current: step, total: totalSteps })}
        </Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${(step / totalSteps) * 100}%` }]} />
        </View>
        <Text style={styles.title}>{t('creation.title')}</Text>
      </View>

      <Card>
        {step === 1 ? (
          <View>
            <Text style={styles.questionTitle}>
              {t('creation.q1Mobile')}
            </Text>
            {[
              { value: filmingLocationOptions[0], label: t('creation.location.home') },
              { value: filmingLocationOptions[1], label: t('creation.location.gym') },
              { value: filmingLocationOptions[2], label: t('creation.location.both') },
            ].map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.option,
                  formData.filmingLocation === option.value && styles.optionActive,
                ]}
                onPress={() => setFormData({ ...formData, filmingLocation: option.value })}
              >
                <Text style={styles.optionText}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {step === 2 ? (
          <View>
            <Text style={styles.questionTitle}>
              {t('creation.q2Mobile')}
            </Text>
            {[
              { value: naturalContentTypeOptions[0], label: t('creation.type.nutrition') },
              { value: naturalContentTypeOptions[1], label: t('creation.type.training') },
              { value: naturalContentTypeOptions[2], label: t('creation.type.relatable') },
              { value: naturalContentTypeOptions[3], label: t('creation.type.story') },
            ].map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.option,
                  formData.naturalContentTypes.includes(option.value) && styles.optionActive,
                ]}
                onPress={() => toggleMulti('naturalContentTypes', option.value)}
              >
                <Text style={styles.optionText}>{option.label}</Text>
              </TouchableOpacity>
            ))}

            <Input
              label={t('creation.otherFormatMobile')}
              value={formData.otherNaturalFormat}
              onChangeText={(value) =>
                setFormData({ ...formData, otherNaturalFormat: value })
              }
              placeholder={t('creation.otherPlaceholderMobile')}
            />
          </View>
        ) : null}

        {step === 3 ? (
          <View>
            <Text style={styles.questionTitle}>
              {t('creation.q3Mobile')}
            </Text>
            {[
              { value: deliveryStyleOptions[0], label: t('creation.delivery.camera') },
              { value: deliveryStyleOptions[1], label: t('creation.delivery.voiceover') },
              { value: deliveryStyleOptions[2], label: t('creation.delivery.broll') },
              { value: deliveryStyleOptions[3], label: t('creation.delivery.mix') },
            ].map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.option,
                  formData.deliveryStyles.includes(option.value) && styles.optionActive,
                ]}
                onPress={() => toggleMulti('deliveryStyles', option.value)}
              >
                <Text style={styles.optionText}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <View style={styles.actionsRow}>
          <Button
            title={t('prefs.back')}
            variant="outline"
            disabled={step === 1}
            onPress={() => setStep((prev) => Math.max(1, prev - 1))}
          />

          {step < totalSteps ? (
            <Button title={t('prefs.next')} onPress={handleContinue} disabled={!canGoNext()} />
          ) : (
            <Button
              title={t('creation.save')}
              onPress={() => saveMutation.mutate(formData)}
              loading={saveMutation.isPending}
              disabled={!canGoNext()}
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
  header: {
    marginBottom: 16,
  },
  stepText: {
    color: colors.text.secondary,
    marginBottom: 6,
  },
  progressTrack: {
    height: 8,
    borderRadius: 8,
    backgroundColor: colors.dark.border,
    overflow: 'hidden' as const,
    marginBottom: 10,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.brand.primary,
  },
  title: {
    color: colors.text.primary,
    fontSize: 26,
    fontWeight: '700' as const,
  },
  questionTitle: {
    color: colors.text.primary,
    fontSize: 18,
    fontWeight: '700' as const,
    marginBottom: 12,
  },
  option: {
    padding: 14,
    borderWidth: 1,
    borderColor: colors.dark.border,
    borderRadius: 10,
    backgroundColor: colors.dark.bg,
    marginBottom: 10,
  },
  optionActive: {
    borderColor: colors.brand.primary,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  optionText: {
    color: colors.text.primary,
    fontSize: 14,
  },
  actionsRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    marginTop: 12,
    gap: 10,
  },
});
