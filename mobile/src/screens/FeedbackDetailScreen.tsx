import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation, useRoute } from '@react-navigation/native';
import { colors } from '../constants/colors';
import Card from '../components/Card';
import { feedbackAPI } from '../services/api';
import { useI18n } from '../hooks/useI18n';

interface FeedbackSuggestion {
  type?: 'error' | 'warning' | 'success' | string;
  category?: string;
  text: string;
}

interface FeedbackData {
  id: string;
  fileType: string;
  fileName: string;
  fileUrl?: string;
  duration?: number;
  overallScore: number;
  clarityScore: number;
  relevanceScore: number;
  trustScore: number;
  ctaScore: number;
  summary?: string;
  transcription?: string;
  suggestions?: FeedbackSuggestion[];
  createdAt: string;
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.scoreRow}>
      <Text style={styles.scoreLabel}>{label}</Text>
      <View style={styles.scoreTrack}>
        <View style={[styles.scoreFill, { width: `${Math.max(0, Math.min(100, value))}%` }]} />
      </View>
      <Text style={styles.scoreValue}>{value}</Text>
    </View>
  );
}

export default function FeedbackDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { language, t } = useI18n();
  const id = route.params?.id as string;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['feedback-detail', id],
    queryFn: async () => {
      const { data } = await feedbackAPI.get(id);
      return data as FeedbackData;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.brand.primary} />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={styles.container}>
        <Card>
          <Text style={styles.errorTitle}>{t('feedback.notFound')}</Text>
          <Text style={styles.errorText}>{t('feedback.loadError')}</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>{t('feedback.back')}</Text>
          </TouchableOpacity>
        </Card>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card style={styles.card}>
        <Text style={styles.title}>📊 {t('feedback.titlePlain')}</Text>
        <Text style={styles.metaText}>
          {new Date(data.createdAt).toLocaleDateString(language === 'en' ? 'en-US' : 'ro-RO')} •{' '}
          {data.fileType === 'video' ? t('feedback.video') : t('feedback.image')}
        </Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.blockTitle}>{t('feedback.file')}</Text>
        <Text style={styles.text}>{t('feedback.name', { name: data.fileName })}</Text>
        {data.duration ? (
          <Text style={styles.text}>{t('feedback.duration', { duration: data.duration })}</Text>
        ) : null}
        {data.fileUrl ? (
          <TouchableOpacity onPress={() => Linking.openURL(`https://api.traineros.org${data.fileUrl}`)}>
            <Text style={styles.linkText}>{t('feedback.downloadOriginal')}</Text>
          </TouchableOpacity>
        ) : null}
      </Card>

      <Card style={styles.card}>
        <Text style={styles.overallLabel}>{t('feedback.overallScore')}</Text>
        <Text style={styles.overallValue}>{data.overallScore}/100</Text>
        <ScoreRow label={t('review.clarity')} value={data.clarityScore} />
        <ScoreRow label={t('review.relevance')} value={data.relevanceScore} />
        <ScoreRow label={t('review.trust')} value={data.trustScore} />
        <ScoreRow label="CTA" value={data.ctaScore} />
      </Card>

      {data.summary ? (
        <Card style={styles.card}>
          <Text style={styles.blockTitle}>{t('review.summary')}</Text>
          <Text style={styles.text}>{data.summary}</Text>
        </Card>
      ) : null}

      {data.transcription ? (
        <Card style={styles.card}>
          <Text style={styles.blockTitle}>{t('review.transcription')}</Text>
          <Text style={styles.text}>{data.transcription}</Text>
        </Card>
      ) : null}

      {data.suggestions?.length ? (
        <Card style={styles.card}>
          <Text style={styles.blockTitle}>{t('review.suggestions')}</Text>
          {data.suggestions.map((item, idx) => (
            <View key={`${item.category || 'tip'}-${idx}`} style={styles.suggestionItem}>
              <Text style={styles.suggestionCategory}>
                {(item.category || item.type || 'TIP').toUpperCase()}
              </Text>
              <Text style={styles.text}>{item.text}</Text>
            </View>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: colors.dark.bg,
  },
  card: {
    marginBottom: 12,
  },
  title: {
    color: colors.text.primary,
    fontSize: 22,
    fontWeight: '700' as const,
  },
  metaText: {
    marginTop: 6,
    color: colors.text.secondary,
    fontSize: 13,
  },
  blockTitle: {
    color: colors.brand.primary,
    fontSize: 14,
    fontWeight: '700' as const,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  text: {
    color: colors.text.secondary,
    fontSize: 14,
    lineHeight: 20,
  },
  linkText: {
    marginTop: 10,
    color: colors.brand.primary,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  overallLabel: {
    color: colors.text.secondary,
    fontSize: 12,
    textAlign: 'center' as const,
  },
  overallValue: {
    color: colors.text.primary,
    fontSize: 34,
    fontWeight: '700' as const,
    textAlign: 'center' as const,
    marginBottom: 12,
  },
  scoreRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: 8,
  },
  scoreLabel: {
    width: 80,
    color: colors.text.secondary,
    fontSize: 12,
  },
  scoreTrack: {
    flex: 1,
    height: 8,
    borderRadius: 99,
    backgroundColor: colors.dark.bg,
    overflow: 'hidden' as const,
    marginHorizontal: 8,
  },
  scoreFill: {
    height: '100%',
    backgroundColor: colors.brand.primary,
  },
  scoreValue: {
    width: 28,
    textAlign: 'right' as const,
    color: colors.text.primary,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  suggestionItem: {
    borderWidth: 1,
    borderColor: colors.dark.border,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    backgroundColor: colors.dark.bg,
  },
  suggestionCategory: {
    color: colors.brand.primary,
    fontSize: 11,
    fontWeight: '700' as const,
    marginBottom: 4,
  },
  errorTitle: {
    color: colors.text.primary,
    fontSize: 20,
    fontWeight: '700' as const,
    marginBottom: 8,
  },
  errorText: {
    color: colors.text.secondary,
    fontSize: 14,
  },
  backButton: {
    marginTop: 12,
  },
  backButtonText: {
    color: colors.brand.primary,
    fontWeight: '700' as const,
  },
});
