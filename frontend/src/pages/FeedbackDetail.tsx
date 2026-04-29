import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import Button from '@/components/Button';
import Card from '@/components/Card';
import ScoreBar from '@/components/ScoreBar';
import { useI18n } from '@/hooks/useI18n';

export default function FeedbackDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { language, t } = useI18n();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['feedback', id],
    queryFn: async () => {
      const { data } = await api.get(`/feedback/${id}`);
      return data;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-dark-400 py-12">
        <div className="max-w-4xl mx-auto px-4">
          <Card className="text-center py-12">
            <div className="w-16 h-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">{t('feedback.loading')}</h3>
            <p className="text-gray-300">{t('ideaDetail.wait')}</p>
          </Card>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-dark-400 py-12">
        <div className="max-w-4xl mx-auto px-4">
          <Card className="bg-red-500/10 border-red-500/50 text-center py-12">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl">⚠️</span>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">{t('feedback.notFound')}</h3>
            <p className="text-gray-300 mb-6">
              {t('feedback.notFoundText')}
            </p>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => navigate(-1)} variant="outline">
                ← {t('common.back')}
              </Button>
              <Link to="/content-review">
                <Button>{t('feedback.analyzeNew')}</Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-400 py-12">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="mb-6">
          <Button onClick={() => navigate(-1)} variant="outline" size="sm" className="mb-4">
            ← {t('common.back')}
          </Button>
          <Card>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-brand-500/20 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">📊</span>
                </div>
                <div>
                  <h3 className="text-white font-bold">{t('feedback.title')}</h3>
                  <p className="text-gray-400 text-sm">
                    {new Date(data.createdAt).toLocaleDateString(language === 'en' ? 'en-US' : 'ro-RO', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs bg-dark-200 text-gray-300 px-3 py-1 rounded-full font-medium">
                  {data.fileType === 'video' ? t('feedback.video') : t('feedback.image')}
                </span>
              </div>
            </div>
          </Card>
        </div>

        {/* File Info */}
        <Card className="mb-6">
          <h3 className="text-xl font-bold text-white mb-4 font-display">{t('feedback.fileAnalyzed')}</h3>
          <div className="space-y-2">
            <div>
              <span className="text-gray-400">{t('feedback.name')}</span>{' '}
              <span className="text-white">{data.fileName}</span>
            </div>
            {data.duration && (
              <div>
                <span className="text-gray-400">{t('feedback.duration')}</span>{' '}
                <span className="text-white">{data.duration}s</span>
              </div>
            )}
            {data.fileUrl && (
              <div className="mt-4">
                <a
                  href={data.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-500 hover:text-brand-400 text-sm"
                >
                  {t('feedback.downloadOriginal')}
                </a>
              </div>
            )}
          </div>
        </Card>

        {/* Overall Score */}
        <Card className="mb-6">
          <div className="text-center mb-6">
            <h3 className="text-gray-300 mb-2">{t('feedback.overallScore')}</h3>
            <div className="text-6xl font-bold text-white mb-2">
              {data.overallScore}
              <span className="text-3xl text-gray-400">/100</span>
            </div>
            <p className="text-gray-400">
              {data.overallScore >= 80
                ? t('feedback.excellent')
                : data.overallScore >= 60
                ? t('feedback.good')
                : data.overallScore >= 40
                ? t('feedback.canImprove')
                : t('feedback.needsWork')}
            </p>
          </div>
        </Card>

        {/* Score Breakdown */}
        <Card className="mb-6">
          <h3 className="text-xl font-bold text-white mb-6 font-display">{t('feedback.detailedAnalysis')}</h3>
          <div className="space-y-4">
            <ScoreBar label={t('review.clarity')} score={data.clarityScore} />
            <ScoreBar label={t('review.relevance')} score={data.relevanceScore} />
            <ScoreBar label={t('review.trust')} score={data.trustScore} />
            <ScoreBar label="CTA" score={data.ctaScore} />
          </div>
        </Card>

        {/* Summary */}
        {data.summary && (
          <Card className="mb-6">
            <h3 className="text-xl font-bold text-white mb-4 font-display">{t('review.summary')}</h3>
            <p className="text-gray-300 leading-relaxed">{data.summary}</p>
          </Card>
        )}

        {/* Suggestions */}
        {data.suggestions && data.suggestions.length > 0 && (
          <Card className="mb-6">
            <h3 className="text-xl font-bold text-white mb-4 font-display">{t('review.suggestions')}</h3>
            <div className="space-y-3">
              {data.suggestions.map((suggestion: any, index: number) => {
                const bgColor =
                  suggestion.type === 'error'
                    ? 'bg-red-500/10 border-red-500/30'
                    : suggestion.type === 'warning'
                    ? 'bg-yellow-500/10 border-yellow-500/30'
                    : 'bg-green-500/10 border-green-500/30';
                
                const icon =
                  suggestion.type === 'error'
                    ? '❌'
                    : suggestion.type === 'warning'
                    ? '⚠️'
                    : '✅';

                return (
                  <div key={index} className={`border rounded-lg p-4 ${bgColor}`}>
                    <div className="flex items-start gap-3">
                      <span className="text-xl flex-shrink-0">{icon}</span>
                      <div className="flex-grow">
                        {suggestion.category && (
                          <p className="text-xs text-gray-400 uppercase mb-1 font-semibold">
                            {suggestion.category}
                          </p>
                        )}
                        <p className="text-white">{suggestion.text}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Actions */}
        <div className="flex gap-4 justify-center">
          <Link to="/content-review">
            <Button variant="outline">{t('feedback.analyzeAnother')}</Button>
          </Link>
          <Link to="/dashboard">
            <Button variant="outline">🏠 Dashboard</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
