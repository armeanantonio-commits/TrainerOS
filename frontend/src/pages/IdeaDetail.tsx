import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import Button from '@/components/Button';
import Card from '@/components/Card';
import IdeaCard from '@/components/IdeaCard';
import { useI18n } from '@/hooks/useI18n';

type FormatKey = 'reel' | 'carousel' | 'story';

function normalizeFormat(format?: string): FormatKey | null {
  if (!format) return null;
  const key = format.toLowerCase();
  if (key === 'reel' || key === 'carousel' || key === 'story') return key;
  return null;
}

export default function IdeaDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { language, t } = useI18n();
  const [activeTab, setActiveTab] = useState<FormatKey>('reel');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['idea', id],
    queryFn: async () => {
      const { data } = await api.get(`/idea/${id}`);
      return data;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (!data) return;
    const initial = normalizeFormat(data.format);
    if (initial) setActiveTab(initial);
  }, [data?.id]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-dark-400 py-12">
        <div className="max-w-3xl mx-auto px-4">
          <Card className="text-center py-12">
            <div className="w-16 h-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">{t('ideaDetail.loading')}</h3>
            <p className="text-gray-300">{t('ideaDetail.wait')}</p>
          </Card>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-dark-400 py-12">
        <div className="max-w-3xl mx-auto px-4">
          <Card className="bg-red-500/10 border-red-500/50 text-center py-12">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl">⚠️</span>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">{t('ideaDetail.notFound')}</h3>
            <p className="text-gray-300 mb-6">
              {t('ideaDetail.notFoundText')}
            </p>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => navigate(-1)} variant="outline">
                ← {t('common.back')}
              </Button>
              <Link to="/daily-idea">
                <Button>{t('ideaDetail.generateNew')}</Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const baseIdea = data;
  const groupIdeas = Array.isArray(data.group) && data.group.length > 0
    ? data.group
    : [data];

  const ideasByFormat = {
    reel: groupIdeas.find((idea: any) => normalizeFormat(idea.format) === 'reel'),
    carousel: groupIdeas.find((idea: any) => normalizeFormat(idea.format) === 'carousel'),
    story: groupIdeas.find((idea: any) => normalizeFormat(idea.format) === 'story'),
  } as const;

  const availableFormats = (['reel', 'carousel', 'story'] as const)
    .filter((key) => ideasByFormat[key]);

  const activeIdea = ideasByFormat[activeTab] || baseIdea;

  return (
    <div className="min-h-screen bg-dark-400 py-12">
      <div className="max-w-3xl mx-auto px-4">
        {/* Format Tabs */}
        {availableFormats.length > 1 && (
          <div className="mb-6">
            <Card>
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => setActiveTab('reel')}
                  className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all ${
                    activeTab === 'reel'
                      ? 'bg-brand-500 text-white'
                      : 'bg-dark-300 text-gray-400 hover:bg-dark-200'
                  }`}
                  disabled={!ideasByFormat.reel}
                >
                  <span className="text-xl">🎬</span>
                  REEL
                </button>
                <button
                  onClick={() => setActiveTab('carousel')}
                  className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all ${
                    activeTab === 'carousel'
                      ? 'bg-brand-500 text-white'
                      : 'bg-dark-300 text-gray-400 hover:bg-dark-200'
                  }`}
                  disabled={!ideasByFormat.carousel}
                >
                  <span className="text-xl">📊</span>
                  CAROUSEL
                </button>
                <button
                  onClick={() => setActiveTab('story')}
                  className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all ${
                    activeTab === 'story'
                      ? 'bg-brand-500 text-white'
                      : 'bg-dark-300 text-gray-400 hover:bg-dark-200'
                  }`}
                  disabled={!ideasByFormat.story}
                >
                  <span className="text-xl">⚡</span>
                  STORY
                </button>
              </div>
            </Card>
          </div>
        )}

        {/* Header */}
        <div className="mb-6">
          <Button onClick={() => navigate(-1)} variant="outline" size="sm" className="mb-4">
            ← {t('common.back')}
          </Button>
          <Card>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-brand-500/20 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">💡</span>
                </div>
                <div>
                  <h3 className="text-white font-bold">{t('ideaDetail.generated')}</h3>
                  <p className="text-gray-400 text-sm">
                    {new Date(activeIdea.createdAt).toLocaleDateString(language === 'en' ? 'en-US' : 'ro-RO', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs bg-brand-500/10 text-brand-500 px-3 py-1 rounded-full font-medium">
                  {activeIdea.format}
                </span>
                {activeIdea.used && (
                  <span className="text-xs text-brand-500 font-semibold">{t('ideaDetail.used')}</span>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* Display Idea Card */}
        <IdeaCard idea={activeIdea} />

        {/* Actions */}
        <div className="mt-8 flex gap-4 justify-center">
          <Link to="/daily-idea">
            <Button variant="outline">
              {t('ideaDetail.generateAnother')}
            </Button>
          </Link>
          <Link to="/idea-history">
            <Button variant="outline">
              {t('daily.viewHistory')}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
