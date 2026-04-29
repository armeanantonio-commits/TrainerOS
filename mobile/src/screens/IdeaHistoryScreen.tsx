import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../constants/colors';
import Card from '../components/Card';
import { ideaAPI } from '../services/api';
import { useI18n } from '../hooks/useI18n';

interface IdeaScene {
  scene?: number;
  number?: number;
  text?: string;
  description?: string;
}

interface IdeaItem {
  id: string;
  createdAt: string;
  groupId?: string | null;
  format?: string;
  hook?: string;
  script?: IdeaScene[] | string[];
  cta?: string;
  title?: string;
  description?: string;
}

interface IdeaGroup {
  id: string;
  createdAt: string;
  ideas: IdeaItem[];
}

const FORMAT_ORDER: Record<string, number> = {
  reel: 0,
  carousel: 1,
  story: 2,
};

const getHookText = (idea: IdeaItem, fallback: string) => idea.hook || idea.title || fallback;

const getFirstScriptLine = (idea: IdeaItem) => {
  if (!Array.isArray(idea.script) || idea.script.length === 0) {
    return idea.description || '';
  }
  const firstScene = idea.script[0];
  if (typeof firstScene === 'string') return firstScene;
  return firstScene.text || firstScene.description || idea.description || '';
};

const HISTORY_PAGE_LIMIT = 50;

const toGroupKey = (idea: IdeaItem) => {
  if (idea.groupId) return idea.groupId;
  const date = new Date(idea.createdAt);
  const minuteBucket = Math.floor(date.getTime() / 60000);
  return `${date.toISOString().slice(0, 10)}-${minuteBucket}`;
};

const groupIdeas = (ideas: IdeaItem[]): IdeaGroup[] => {
  const map = new Map<string, IdeaGroup>();

  for (const idea of ideas) {
    const key = toGroupKey(idea);
    const existing = map.get(key);
    if (existing) {
      existing.ideas.push(idea);
    } else {
      map.set(key, {
        id: key,
        createdAt: idea.createdAt,
        ideas: [idea],
      });
    }
  }

  return Array.from(map.values())
    .map((group) => ({
      ...group,
      ideas: group.ideas.sort((a, b) => {
        const aKey = (a.format || '').toLowerCase();
        const bKey = (b.format || '').toLowerCase();
        const aOrder = FORMAT_ORDER[aKey] ?? 99;
        const bOrder = FORMAT_ORDER[bKey] ?? 99;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return +new Date(a.createdAt) - +new Date(b.createdAt);
      }),
    }))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
};

const getPreferredIdeaForGroup = (group: IdeaGroup) => {
  const reel = group.ideas.find((idea) => (idea.format || '').toLowerCase() === 'reel');
  if (reel) return reel;
  const carousel = group.ideas.find((idea) => (idea.format || '').toLowerCase() === 'carousel');
  if (carousel) return carousel;
  const story = group.ideas.find((idea) => (idea.format || '').toLowerCase() === 'story');
  return story || group.ideas[0];
};

export default function IdeaHistoryScreen() {
  const navigation = useNavigation<any>();
  const { language, t } = useI18n();

  const { data, isLoading } = useQuery({
    queryKey: ['idea-history'],
    queryFn: async () => {
      const allIdeas: IdeaItem[] = [];
      let page = 1;
      let totalPages = 1;

      do {
        const response = await ideaAPI.history({
          page,
          limit: HISTORY_PAGE_LIMIT,
        });
        const ideas = (response.data?.ideas || []) as IdeaItem[];
        const pages = Number(response.data?.pagination?.pages || 1);

        allIdeas.push(...ideas);
        totalPages = pages;
        page += 1;
      } while (page <= totalPages);

      return allIdeas;
    },
  });

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.brand.primary} />
      </View>
    );
  }

  const groupedData = groupIdeas((data || []) as IdeaItem[]);

  const renderIdeaGroup = ({ item }: { item: IdeaGroup }) => (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => {
        const preferredIdea = getPreferredIdeaForGroup(item);
        if (preferredIdea) {
          navigation.navigate('IdeaDetail', { id: preferredIdea.id, ideas: item.ideas });
        }
      }}
    >
      <Card style={styles.ideaCard}>
        <View style={styles.headerRow}>
          <Text style={styles.ideaDate}>
            {new Date(item.createdAt).toLocaleDateString(language === 'en' ? 'en-US' : 'ro-RO')}
          </Text>
        </View>
        <Text style={styles.ideaTitle}>
          {t('history.setWithFormats', {
            count: item.ideas.length,
            suffix: item.ideas.length > 1 ? (language === 'en' ? 's' : 'e') : '',
          })}
        </Text>

        <View style={styles.formatsRow}>
          {item.ideas.map((idea) => (
            <Text key={`${item.id}-${idea.id}`} style={styles.formatBadge}>
              {(idea.format || 'reel').toUpperCase()}
            </Text>
          ))}
        </View>

        {item.ideas.map((idea) => (
          <View key={`${item.id}-preview-${idea.id}`} style={styles.previewRow}>
            <Text style={styles.previewFormat}>{(idea.format || 'reel').toUpperCase()}:</Text>
            <Text style={styles.previewText} numberOfLines={1}>
              {getHookText(idea, t('history.noHook'))}
            </Text>
          </View>
        ))}

        {item.ideas[0]?.cta ? (
          <View style={styles.ctaBox}>
            <Text style={styles.ctaLabel}>CTA</Text>
            <Text style={styles.ctaText} numberOfLines={2}>
              {item.ideas[0].cta}
            </Text>
          </View>
        ) : null}
      </Card>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={groupedData}
        renderItem={renderIdeaGroup}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t('history.emptyTitle')}</Text>
            <Text style={styles.emptySubtext}>
              {t('history.emptyText')}
            </Text>
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
    backgroundColor: colors.dark.bg,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  listContent: {
    padding: 20,
  },
  ideaCard: {
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 8,
  },
  formatsRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
    marginBottom: 8,
  },
  formatBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    fontSize: 10,
    fontWeight: '700' as const,
    color: colors.brand.primary,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  previewRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: 6,
  },
  previewFormat: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: colors.brand.primary,
    marginRight: 6,
  },
  previewText: {
    flex: 1,
    fontSize: 13,
    color: colors.text.secondary,
  },
  ideaTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: colors.text.primary,
    marginBottom: 8,
  },
  ideaDescription: {
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
    marginBottom: 8,
  },
  ideaDate: {
    fontSize: 12,
    color: colors.text.muted,
  },
  ctaBox: {
    backgroundColor: colors.dark.bg,
    borderWidth: 1,
    borderColor: colors.dark.border,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  ctaLabel: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: colors.brand.primary,
    marginBottom: 4,
  },
  ctaText: {
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  emptyContainer: {
    alignItems: 'center' as const,
    marginTop: 80,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: colors.text.secondary,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.text.muted,
    textAlign: 'center' as const,
  },
});
