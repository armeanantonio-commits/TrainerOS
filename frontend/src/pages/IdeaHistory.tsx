import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { ideaAPI } from '@/services/api';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { formatDate } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';

export default function IdeaHistory() {
  const { language, t } = useI18n();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['idea-history'],
    queryFn: () => ideaAPI.history(),
  });
  const ideas = data?.data?.ideas || [];
  const translationPayload = useMemo(
    () =>
      ideas.map((idea: any) => ({
        id: idea.id,
        hook: idea.hook || '',
        cta: idea.cta || '',
        script: idea.script || [],
      })),
    [ideas]
  );
  const translationKey = useMemo(
    () => translationPayload.map((idea: any) => `${idea.id}:${idea.hook}:${idea.cta}`).join('|'),
    [translationPayload]
  );
  const { data: translatedIdeasData } = useQuery({
    queryKey: ['idea-history-translated', language, translationKey],
    queryFn: () =>
      ideaAPI.translate({
        targetLanguage: language,
        ideas: translationPayload,
      }),
    enabled: translationPayload.length > 0,
    staleTime: 5 * 60 * 1000,
  });
  const translatedById = useMemo(() => {
    const list = translatedIdeasData?.data?.ideas || [];
    return new Map(list.map((idea: any) => [idea.id, idea]));
  }, [translatedIdeasData]);
  const localizedIdeas = useMemo(
    () =>
      ideas.map((idea: any) => {
        const translated = translatedById.get(idea.id);
        return translated ? { ...idea, ...translated } : idea;
      }),
    [ideas, translatedById]
  );

  return (
    <div className="min-h-screen bg-dark-400 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2 font-display">
              {t('history.title')}
            </h1>
            <p className="text-gray-300">{t('history.subtitle')}</p>
          </div>
          <Link to="/daily-idea">
            <Button>{t('history.generateNew')}</Button>
          </Link>
        </div>

        {/* Loading State */}
        {isLoading && (
          <Card className="text-center py-12">
            <div className="w-16 h-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-300">{t('history.loading')}</p>
          </Card>
        )}

        {/* Error State */}
        {isError && (
          <Card className="bg-red-500/10 border-red-500 text-center py-12">
            <span className="text-5xl mb-4 block">❌</span>
            <h3 className="text-xl font-bold text-white mb-2">{t('history.loadError')}</h3>
            <p className="text-gray-300">{t('history.loadErrorText')}</p>
          </Card>
        )}

        {/* Ideas List */}
        {localizedIdeas.length > 0 ? (
          <div className="space-y-4">
            {localizedIdeas.map((idea: any) => (
              <Link key={idea.id} to={`/idea/${idea.id}`} className="block">
                <Card hover className="cursor-pointer group">
                  <div className="grid md:grid-cols-12 gap-6">
                  {/* Date & Format */}
                  <div className="md:col-span-2">
                    <p className="text-gray-400 text-sm mb-1">
                      {formatDate(idea.createdAt)}
                    </p>
                    <div className="inline-flex items-center gap-2 bg-brand-500/20 rounded px-3 py-1">
                      <span className="text-brand-500 text-xs font-semibold uppercase">
                        {idea.format || 'Reel'}
                      </span>
                    </div>
                  </div>

                  {/* Hook */}
                  <div className="md:col-span-6">
                    <h3 className="text-white font-bold mb-2 text-lg group-hover:text-brand-500 transition-colors">
                      {idea.hook}
                    </h3>
                    <div className="space-y-1">
                      {idea.script?.slice(0, 2).map((scene: any, i: number) => {
                        const sceneNumber = scene.scene ?? scene.number ?? i + 1;
                        const sceneText = scene.text ?? scene.description ?? '';
                        return (
                          <p key={`${idea.id}-scene-${sceneNumber}-${i}`} className="text-gray-400 text-sm">
                            <span className="text-brand-500">{t('history.scene', { number: sceneNumber })}</span>{' '}
                            {sceneText ? `${sceneText.substring(0, 80)}...` : ''}
                          </p>
                        );
                      })}
                    </div>
                  </div>

                  {/* CTA & Objective */}
                  <div className="md:col-span-4">
                    <div className="bg-dark-200 rounded-lg p-4 mb-3">
                      <p className="text-gray-400 text-xs mb-1">CTA:</p>
                      <p className="text-white text-sm font-medium">{idea.cta}</p>
                    </div>
                    {/* objective hidden */}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-4 pt-4 border-t border-dark-50 flex gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      navigator.clipboard.writeText(idea.hook);
                    }}
                  >
                    {t('history.copyHook')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      navigator.clipboard.writeText(idea.cta);
                    }}
                  >
                    {t('history.copyCta')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                  >
                    {t('history.viewDetails')}
                  </Button>
                </div>
              </Card>
              </Link>
            ))}
          </div>
        ) : (
          !isLoading &&
          !isError && (
            <Card className="text-center py-12">
              <span className="text-5xl mb-4 block">📝</span>
              <h3 className="text-xl font-bold text-white mb-2">
                {t('history.emptyTitle')}
              </h3>
              <p className="text-gray-300 mb-6">
                {t('history.emptyText')}
              </p>
              <Link to="/daily-idea">
                <Button>{t('history.generateFirst')}</Button>
              </Link>
            </Card>
          )
        )}
      </div>
    </div>
  );
}
