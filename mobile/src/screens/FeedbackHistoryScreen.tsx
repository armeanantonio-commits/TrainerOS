import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { colors } from '../constants/colors';
import Card from '../components/Card';
import { feedbackAPI } from '../services/api';
import { useI18n } from '../hooks/useI18n';

interface FeedbackItem {
  id: string;
  fileName: string;
  fileType: 'video' | 'image' | string;
  overallScore: number;
  clarityScore: number;
  ctaScore: number;
  createdAt: string;
}

export default function FeedbackHistoryScreen() {
  const navigation = useNavigation<any>();
  const { language, t } = useI18n();

  const { data, isLoading } = useQuery({
    queryKey: ['feedback-history'],
    queryFn: async () => {
      const { data } = await feedbackAPI.history();
      return data?.feedbacks as FeedbackItem[];
    },
  });

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.brand.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={data || []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation.navigate('FeedbackDetail', { id: item.id })}
          >
            <Card style={styles.card}>
              <View style={styles.topRow}>
                <Text style={styles.titleText} numberOfLines={1}>
                  {item.fileType === 'video' ? '🎥' : '🖼️'} {item.fileName}
                </Text>
                <Text style={styles.scoreText}>{item.overallScore}/100</Text>
              </View>

              <Text style={styles.dateText}>
                {new Date(item.createdAt).toLocaleDateString(language === 'en' ? 'en-US' : 'ro-RO')}
              </Text>

              <View style={styles.metricsRow}>
                <Text style={styles.metricText}>{t('review.clarity')}: {item.clarityScore}</Text>
                <Text style={styles.metricText}>CTA: {item.ctaScore}</Text>
              </View>
            </Card>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>{t('feedbackHistory.emptyTitle')}</Text>
            <Text style={styles.emptyText}>{t('feedbackHistory.emptyText')}</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: colors.dark.bg,
  },
  content: {
    padding: 20,
  },
  card: {
    marginBottom: 12,
  },
  topRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  titleText: {
    flex: 1,
    color: colors.text.primary,
    fontSize: 15,
    fontWeight: '700' as const,
  },
  scoreText: {
    color: colors.brand.primary,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  dateText: {
    marginTop: 8,
    color: colors.text.muted,
    fontSize: 12,
  },
  metricsRow: {
    marginTop: 8,
    flexDirection: 'row' as const,
    gap: 12,
  },
  metricText: {
    color: colors.text.secondary,
    fontSize: 12,
  },
  emptyContainer: {
    paddingTop: 80,
    alignItems: 'center' as const,
  },
  emptyTitle: {
    color: colors.text.primary,
    fontSize: 18,
    fontWeight: '700' as const,
    marginBottom: 8,
  },
  emptyText: {
    color: colors.text.secondary,
    fontSize: 14,
    textAlign: 'center' as const,
  },
});
