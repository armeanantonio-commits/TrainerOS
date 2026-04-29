import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { colors } from '../constants/colors';
import Card from '../components/Card';
import Button from '../components/Button';
import { authAPI, ideaAPI } from '../services/api';
import { useI18n } from '../hooks/useI18n';

interface IdeaScene {
  scene?: number;
  number?: number;
  text?: string;
  description?: string;
  visual?: string;
}

interface IdeaData {
  format?: string;
  hook?: string;
  script?: IdeaScene[] | string[];
  cta?: string;
  reasoning?: string;
  title?: string;
  description?: string;
  hooks?: string[];
}

type FormatKey = 'reel' | 'carousel' | 'story';

interface MultiFormatIdeas {
  reel?: IdeaData;
  carousel?: IdeaData;
  story?: IdeaData;
}

const getHookText = (idea: IdeaData, fallback: string) => idea.hook || idea.title || fallback;

const getDescriptionText = (idea: IdeaData) => {
  if (idea.description) return idea.description;
  const firstScene = Array.isArray(idea.script) ? idea.script[0] : null;
  if (!firstScene) return '';
  if (typeof firstScene === 'string') return firstScene;
  return firstScene.text || firstScene.description || '';
};

const normalizeScenes = (idea: IdeaData) => {
  if (!Array.isArray(idea.script)) return [];
  return idea.script
    .map((scene, idx) => {
      if (typeof scene === 'string') {
        return { sceneNumber: idx + 1, sceneText: scene, sceneVisual: '' };
      }
      const sceneNumber = scene.scene ?? scene.number ?? idx + 1;
      const sceneText = scene.text ?? scene.description ?? '';
      return { sceneNumber, sceneText, sceneVisual: scene.visual || '' };
    })
    .filter((scene) => scene.sceneText);
};

const buildIdeasFromHistory = (ideas: IdeaData[]): MultiFormatIdeas | null => {
  if (!Array.isArray(ideas) || ideas.length === 0) return null;

  const latest = ideas
    .slice()
    .sort(
      (a: any, b: any) =>
        +new Date((b as any).createdAt || 0) - +new Date((a as any).createdAt || 0)
    );

  const anchorTime = +new Date((latest[0] as any).createdAt || Date.now());
  const inWindow = latest.filter((idea: any) => {
    const t = +new Date(idea.createdAt || 0);
    return Math.abs(anchorTime - t) <= 2 * 60 * 1000;
  });

  const set: MultiFormatIdeas = {};
  inWindow.forEach((idea: any) => {
    const format = (idea.format || '').toLowerCase();
    if (format === 'reel') set.reel = idea;
    if (format === 'carousel') set.carousel = idea;
    if (format === 'story') set.story = idea;
  });

  if (!set.reel && !set.carousel && !set.story) {
    set.reel = inWindow[0];
  }

  return set;
};

export default function DailyIdeaScreen() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [ideasByFormat, setIdeasByFormat] = useState<MultiFormatIdeas | null>(null);
  const [activeTab, setActiveTab] = useState<FormatKey>('reel');
  const [showNicheAlert, setShowNicheAlert] = useState(false);

  const { data: userData, isLoading: isUserLoading } = useQuery({
    queryKey: ['user-me'],
    queryFn: async () => {
      const { data } = await authAPI.me();
      return data.user;
    },
  });
  const hasNiche = !!(userData?.niche && userData?.icpProfile);

  const generateMutation = useMutation({
    mutationFn: () => ideaAPI.generateMultiFormat(),
    onSuccess: (response) => {
      const payload = response.data || {};
      const normalized: MultiFormatIdeas = {
        reel: payload.reel || payload,
        carousel: payload.carousel,
        story: payload.story,
      };
      setIdeasByFormat(normalized);
      if (normalized.reel) setActiveTab('reel');
      else if (normalized.carousel) setActiveTab('carousel');
      else if (normalized.story) setActiveTab('story');
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
    onError: async (error: any) => {
      const status = error?.response?.status;
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        t('daily.generateError');

      // Recovery path: if backend generated but response was lost, pull latest set from history.
      try {
        const historyResponse = await ideaAPI.history();
        const latestSet = buildIdeasFromHistory(historyResponse?.data?.ideas || []);
        if (latestSet) {
          setIdeasByFormat(latestSet);
          if (latestSet.reel) setActiveTab('reel');
          else if (latestSet.carousel) setActiveTab('carousel');
          else if (latestSet.story) setActiveTab('story');
          return;
        }
      } catch {
        // Ignore recovery errors and continue with normal error handling.
      }

      if (status === 429 || status === 403) {
        Alert.alert(t('daily.limitReached'), message);
        return;
      }

      if (status === 400 && error?.response?.data?.nicheRequired) {
        Alert.alert(t('daily.nicheRequiredTitle'), message);
        return;
      }

      if (status === 401) {
        Alert.alert(t('daily.sessionExpired'), t('daily.loginAgain'));
        return;
      }

      Alert.alert(t('daily.error'), message);
    },
  });

  const handleGenerate = () => {
    if (isUserLoading) {
      return;
    }
    if (!hasNiche) {
      setShowNicheAlert(true);
      Alert.alert(t('daily.nicheRequiredTitle'), t('daily.nicheRequired'));
      return;
    }
    generateMutation.mutate();
  };

  const currentIdea = ideasByFormat?.[activeTab];
  const availableTabs: FormatKey[] = (['reel', 'carousel', 'story'] as const).filter(
    (key) => !!ideasByFormat?.[key]
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>💡 {t('daily.title')}</Text>
        <Text style={styles.subtitle}>
          {t('daily.subtitle')}
        </Text>
      </View>

      {!ideasByFormat ? (
        <Card style={styles.generateCard}>
          <Text style={styles.emoji}>🚀</Text>
          <Text style={styles.generateTitle}>{t('daily.ready')}</Text>
          <Text style={styles.generateText}>
            {t('daily.readyText')}
          </Text>
          {(!isUserLoading && !hasNiche) || showNicheAlert ? (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                {t('daily.nicheRequired')}
              </Text>
              <Button
                title={t('daily.goToNiche')}
                onPress={() => navigation.navigate('NicheFinder')}
                variant="outline"
              />
            </View>
          ) : null}
          <Button
            title={t('daily.generate')}
            onPress={handleGenerate}
            loading={generateMutation.isPending}
            style={styles.generateButton}
            disabled={isUserLoading || !hasNiche}
          />
        </Card>
      ) : (
        <>
          {availableTabs.length > 1 && (
            <Card style={styles.tabsCard}>
              <View style={styles.tabsRow}>
                {availableTabs.map((tab) => (
                  <TouchableOpacity
                    key={tab}
                    onPress={() => setActiveTab(tab)}
                    style={[
                      styles.tabButton,
                      activeTab === tab && styles.tabButtonActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        activeTab === tab && styles.tabTextActive,
                      ]}
                    >
                      {tab.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Card>
          )}

          {currentIdea ? (
          <Card style={styles.ideaCard}>
            <View style={styles.badgeRow}>
              <Text style={styles.formatBadge}>
                {(currentIdea.format || 'REEL').toUpperCase()}
              </Text>
            </View>
            <Text style={styles.ideaTitle}>{getHookText(currentIdea, t('daily.defaultHook'))}</Text>
            {getDescriptionText(currentIdea) ? (
              <Text style={styles.ideaDescription}>{getDescriptionText(currentIdea)}</Text>
            ) : null}
            
            {normalizeScenes(currentIdea).length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('daily.scriptScenes')}</Text>
                {normalizeScenes(currentIdea).map((scene, index) => (
                  <View key={`${scene.sceneNumber}-${index}`} style={styles.sceneItem}>
                    <Text style={styles.sceneNumber}>{t('daily.scene', { number: scene.sceneNumber })}</Text>
                    <Text style={styles.sceneText}>{scene.sceneText}</Text>
                    {scene.sceneVisual ? (
                      <Text style={styles.sceneVisual}>{t('daily.visual', { text: scene.sceneVisual })}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            )}

            {currentIdea.cta && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('daily.cta')}</Text>
                <Text style={styles.ctaText}>{currentIdea.cta}</Text>
              </View>
            )}

            {currentIdea.reasoning ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('daily.reasoning')}</Text>
                <Text style={styles.reasoningText}>{currentIdea.reasoning}</Text>
              </View>
            ) : null}
          </Card>
          ) : null}

          <Button
            title={t('daily.generateAnother')}
            onPress={handleGenerate}
            loading={generateMutation.isPending}
            variant="outline"
          />
        </>
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
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold' as const,
    color: colors.text.primary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  generateCard: {
    alignItems: 'center' as const,
    padding: 32,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  generateTitle: {
    fontSize: 22,
    fontWeight: 'bold' as const,
    color: colors.text.primary,
    marginBottom: 12,
    textAlign: 'center' as const,
  },
  generateText: {
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center' as const,
    marginBottom: 24,
    lineHeight: 20,
  },
  generateButton: {
    width: '100%',
  },
  warningBox: {
    width: '100%',
    backgroundColor: `${colors.warning}14`,
    borderWidth: 1,
    borderColor: `${colors.warning}66`,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    gap: 10,
  },
  warningText: {
    color: colors.text.primary,
    fontSize: 14,
    lineHeight: 20,
  },
  ideaCard: {
    marginBottom: 16,
  },
  tabsCard: {
    marginBottom: 12,
    padding: 10,
  },
  tabsRow: {
    flexDirection: 'row' as const,
    gap: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.dark.border,
    backgroundColor: colors.dark.bg,
  },
  tabButtonActive: {
    borderColor: colors.brand.primary,
    backgroundColor: `${colors.brand.primary}22`,
  },
  tabText: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '700' as const,
  },
  tabTextActive: {
    color: colors.brand.primary,
  },
  badgeRow: {
    marginBottom: 10,
  },
  formatBadge: {
    alignSelf: 'flex-start' as const,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: '700' as const,
    color: colors.brand.primary,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  ideaTitle: {
    fontSize: 20,
    fontWeight: 'bold' as const,
    color: colors.text.primary,
    marginBottom: 12,
  },
  ideaDescription: {
    fontSize: 16,
    color: colors.text.secondary,
    lineHeight: 24,
    marginBottom: 20,
  },
  section: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.text.primary,
    marginBottom: 12,
  },
  sceneItem: {
    backgroundColor: colors.dark.bg,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  sceneNumber: {
    fontSize: 12,
    color: colors.brand.primary,
    fontWeight: '700' as const,
    marginBottom: 6,
  },
  sceneText: {
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  sceneVisual: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 8,
  },
  ctaText: {
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  reasoningText: {
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
  },
});
