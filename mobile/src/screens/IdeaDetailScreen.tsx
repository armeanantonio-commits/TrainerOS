import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { colors } from '../constants/colors';
import Card from '../components/Card';
import { ideaAPI } from '../services/api';
import { useI18n } from '../hooks/useI18n';

interface IdeaScene {
  scene?: number;
  number?: number;
  text?: string;
  description?: string;
  visual?: string;
}

interface IdeaData {
  id: string;
  createdAt?: string;
  format?: string;
  hook?: string;
  script?: IdeaScene[] | string[];
  cta?: string;
  reasoning?: string;
  title?: string;
  description?: string;
}

type RootStackParamList = {
  IdeaDetail: { id: string; ideas?: IdeaData[] };
};

const getHookText = (idea: IdeaData, fallback: string) => idea.hook || idea.title || fallback;

const getDescriptionText = (idea: IdeaData) => {
  if (idea.description) return idea.description;
  if (!Array.isArray(idea.script) || idea.script.length === 0) return '';
  const firstScene = idea.script[0];
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

export default function IdeaDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'IdeaDetail'>>();
  const { language, t } = useI18n();
  const ideaId = route.params?.id;
  const routeIdeas = route.params?.ideas || [];
  const [activeFormat, setActiveFormat] = useState<string | null>(null);

  const formatOrder = ['reel', 'carousel', 'story'];
  const sortedRouteIdeas = useMemo(() => {
    if (!routeIdeas.length) return [];
    return [...routeIdeas].sort((a, b) => {
      const aKey = (a.format || '').toLowerCase();
      const bKey = (b.format || '').toLowerCase();
      const aIndex = formatOrder.indexOf(aKey);
      const bIndex = formatOrder.indexOf(bKey);
      const ai = aIndex === -1 ? 99 : aIndex;
      const bi = bIndex === -1 ? 99 : bIndex;
      return ai - bi;
    });
  }, [routeIdeas]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['idea-detail', ideaId],
    queryFn: async () => {
      const { data } = await ideaAPI.get(ideaId);
      return data as IdeaData;
    },
    enabled: !!ideaId && sortedRouteIdeas.length === 0,
  });

  if (isLoading && sortedRouteIdeas.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.brand.primary} />
      </View>
    );
  }

  if ((isError || !data) && sortedRouteIdeas.length === 0) {
    return (
      <View style={styles.container}>
        <Card style={styles.errorCard}>
          <Text style={styles.errorTitle}>{t('ideaDetail.notFound')}</Text>
          <Text style={styles.errorText}>
            {t('ideaDetail.notFoundText')}
          </Text>
        </Card>
      </View>
    );
  }

  const tabs = sortedRouteIdeas.length > 0
    ? sortedRouteIdeas
    : (data ? [data] : []);
  const initialFormat = (tabs.find((idea) => idea.id === ideaId)?.format || tabs[0]?.format || '').toLowerCase();
  const selectedFormat = (activeFormat || initialFormat).toLowerCase();
  const selectedIdea = tabs.find((idea) => (idea.format || '').toLowerCase() === selectedFormat) || tabs[0];
  const scenes = selectedIdea ? normalizeScenes(selectedIdea) : [];

  if (!selectedIdea) {
    return (
      <View style={styles.container}>
        <Card style={styles.errorCard}>
          <Text style={styles.errorTitle}>{t('ideaDetail.notFound')}</Text>
          <Text style={styles.errorText}>
            {t('ideaDetail.notFoundText')}
          </Text>
        </Card>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card style={styles.ideaCard}>
        {tabs.length > 1 && (
          <View style={styles.tabsRow}>
            {tabs.map((idea) => {
              const formatKey = (idea.format || '').toLowerCase();
              const isActive = formatKey === selectedFormat;
              return (
                <TouchableOpacity
                  key={`${idea.id}-${formatKey}`}
                  onPress={() => setActiveFormat(formatKey)}
                  style={[styles.tabButton, isActive && styles.tabButtonActive]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                    {(idea.format || 'REEL').toUpperCase()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={styles.headerRow}>
          <Text style={styles.formatBadge}>
            {(selectedIdea?.format || 'REEL').toUpperCase()}
          </Text>
          {selectedIdea?.createdAt ? (
            <Text style={styles.dateText}>
              {new Date(selectedIdea.createdAt).toLocaleDateString(language === 'en' ? 'en-US' : 'ro-RO')}
            </Text>
          ) : null}
        </View>

        <Text style={styles.ideaTitle}>{getHookText(selectedIdea, t('history.noHook'))}</Text>
        {getDescriptionText(selectedIdea) ? (
          <Text style={styles.ideaDescription}>{getDescriptionText(selectedIdea)}</Text>
        ) : null}

        {scenes.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('ideaDetail.scriptScenes')}</Text>
            {scenes.map((scene, index) => (
              <View key={`${scene.sceneNumber}-${index}`} style={styles.sceneItem}>
                <Text style={styles.sceneNumber}>{t('ideaDetail.scene', { number: scene.sceneNumber })}</Text>
                <Text style={styles.sceneText}>{scene.sceneText}</Text>
                {scene.sceneVisual ? (
                  <Text style={styles.sceneVisual}>{t('ideaDetail.visual', { text: scene.sceneVisual })}</Text>
                ) : null}
              </View>
            ))}
          </View>
        )}

        {selectedIdea?.cta ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>CTA</Text>
            <View style={styles.ctaBox}>
              <Text style={styles.ctaText}>{selectedIdea.cta}</Text>
            </View>
          </View>
        ) : null}

        {selectedIdea?.reasoning ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('ideaDetail.reasoning')}</Text>
            <Text style={styles.reasoningText}>{selectedIdea.reasoning}</Text>
          </View>
        ) : null}
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
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.dark.bg,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  ideaCard: {
    marginBottom: 16,
  },
  tabsRow: {
    flexDirection: 'row' as const,
    gap: 8,
    marginBottom: 12,
  },
  tabButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.dark.border,
    borderRadius: 8,
    backgroundColor: colors.dark.bg,
  },
  tabButtonActive: {
    borderColor: colors.brand.primary,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: colors.text.secondary,
  },
  tabTextActive: {
    color: colors.brand.primary,
  },
  headerRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
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
  dateText: {
    fontSize: 12,
    color: colors.text.muted,
  },
  ideaTitle: {
    fontSize: 20,
    fontWeight: 'bold' as const,
    color: colors.text.primary,
    marginBottom: 12,
  },
  ideaDescription: {
    fontSize: 15,
    color: colors.text.secondary,
    lineHeight: 22,
    marginBottom: 16,
  },
  section: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.text.primary,
    marginBottom: 10,
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
  ctaBox: {
    backgroundColor: colors.dark.bg,
    borderWidth: 1,
    borderColor: colors.dark.border,
    borderRadius: 10,
    padding: 12,
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
  errorCard: {
    margin: 20,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: colors.text.primary,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
  },
});
