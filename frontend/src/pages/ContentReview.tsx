import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { feedbackAPI } from '@/services/api';
import Button from '@/components/Button';
import Card from '@/components/Card';
import ScoreBar from '@/components/ScoreBar';
import { useI18n } from '@/hooks/useI18n';

export default function ContentReview() {
  const { t } = useI18n();
  const MAX_VIDEO_MB = 250;
  const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024;
  const inputPanelRef = useRef<HTMLDivElement | null>(null);
  const [contentText, setContentText] = useState('');
  const [format, setFormat] = useState<'reel' | 'carousel' | 'story'>('reel');
  const [analysisType, setAnalysisType] = useState<'text' | 'video'>('video');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const analyzeTextMutation = useMutation({
    mutationFn: (data: { text: string; format: string }) => feedbackAPI.analyzeText(data),
  });

  const analyzeVideoMutation = useMutation({
    mutationFn: (formData: FormData) => feedbackAPI.analyze(formData),
  });

  const analyzeMutation = analysisType === 'text' ? analyzeTextMutation : analyzeVideoMutation;
  const maxUploadErrorMessage = t('review.maxUploadError', { size: MAX_VIDEO_MB });
  const textPlaceholder =
    t('review.placeholderPrefix', { format: format.toUpperCase() }) +
    '\n\n' +
    t(
      format === 'reel'
        ? 'review.placeholder.reel'
        : format === 'carousel'
          ? 'review.placeholder.carousel'
          : 'review.placeholder.story'
    );

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > MAX_VIDEO_BYTES) {
        setUploadError(maxUploadErrorMessage);
        setVideoFile(null);
        setVideoPreview(null);
        return;
      }
      setUploadError(null);
      setVideoFile(file);
      const url = URL.createObjectURL(file);
      setVideoPreview(url);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (analysisType === 'text') {
      if (!contentText.trim()) return;
      analyzeTextMutation.mutate({ text: contentText, format });
    } else {
      if (!videoFile || uploadError) return;
      const formData = new FormData();
      formData.append('file', videoFile); // Backend expects 'file', not 'video'
      formData.append('format', format);
      analyzeVideoMutation.mutate(formData);
    }
  };

  const handleReset = () => {
    setContentText('');
    setVideoFile(null);
    setVideoPreview(null);
    setUploadError(null);
    analyzeTextMutation.reset();
    analyzeVideoMutation.reset();
  };

  const scrollToInputPanel = () => {
    window.setTimeout(() => {
      inputPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  };

  useEffect(() => {
    if (!analyzeMutation.isSuccess) {
      return;
    }

    inputPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [analyzeMutation.isSuccess]);

  return (
    <div className="min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="console-hero mb-6">
          <div className="console-orb left-[-4rem] top-[-3rem] h-24 w-24 bg-cyan-300/18 animate-float-slow" />
          <div className="console-orb right-0 top-8 h-20 w-20 bg-emerald-300/16 animate-float-delay" />
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="console-badge">{t('review.badge')}</span>
          </div>
          <h1 className="mt-1 mb-3 text-3xl font-bold text-white font-display sm:text-4xl">
            {t('review.title')}{' '}
            <span className="bg-gradient-to-r from-[#8CF8D4] via-[#72CAFF] to-[#A78BFA] bg-clip-text text-transparent">{t('review.highlight')}</span>
          </h1>
          <p className="max-w-2xl text-base text-slate-300/78">
            {t('review.subtitle')}
          </p>
          <p className="mt-1 text-xs text-slate-300/72">
            {t('review.powered')}
          </p>
        </div>

        {/* Analysis Type Selector */}
        <div className="max-w-3xl mx-auto mb-6">
          <Card>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setAnalysisType('video');
                  scrollToInputPanel();
                }}
                className={`console-option p-4 ${
                  analysisType === 'video'
                    ? 'console-option-active'
                    : ''
                }`}
              >
                <div className="text-3xl mb-2">🎥</div>
                <p className="text-white font-semibold">{t('review.videoAnalysis')}</p>
                <p className="text-gray-400 text-xs mt-1">{t('review.videoDescription')}</p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAnalysisType('text');
                  scrollToInputPanel();
                }}
                className={`console-option p-4 ${
                  analysisType === 'text'
                    ? 'console-option-active'
                    : ''
                }`}
              >
                <div className="text-3xl mb-2">📝</div>
                <p className="text-white font-semibold">{t('review.textAnalysis')}</p>
                <p className="text-gray-400 text-xs mt-1">{t('review.textDescription')}</p>
              </button>
            </div>
          </Card>
        </div>

        {!analyzeMutation.isSuccess ? (
          <div ref={inputPanelRef} className="max-w-3xl mx-auto scroll-mt-24">
            <Card className="console-panel-strong">
              <div className="flex items-center gap-4 mb-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10">
                  <span className="text-3xl">{analysisType === 'video' ? '🎥' : '📊'}</span>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white font-display">
                    {analysisType === 'video' ? t('review.videoAnalysis') : t('review.textAnalysis')}
                  </h2>
                  <p className="text-gray-300 text-sm">
                    {analyzeMutation.isPending 
                      ? (analysisType === 'video' ? t('review.videoPending') : t('review.textPending'))
                      : (analysisType === 'video' ? t('review.videoIdle') : t('review.textIdle'))}
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Format Selection */}
                <div>
                  <label className="block text-white font-semibold mb-3">{t('review.contentType')}</label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['reel', 'carousel', 'story'] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setFormat(f)}
                        className={`console-option p-4 ${
                          format === f
                            ? 'console-option-active'
                            : ''
                        }`}
                      >
                        <div className="text-2xl mb-2">
                          {f === 'reel' ? '🎥' : f === 'carousel' ? '📸' : '⚡'}
                        </div>
                        <p className="text-white font-semibold capitalize">{f}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Video Upload (if video mode) */}
                {analysisType === 'video' && (
                  <div>
                    <label className="block text-white font-semibold mb-3">
                      {t('review.uploadVideo')}
                    </label>
                    {!videoPreview ? (
                      <div className="rounded-[24px] border-2 border-dashed border-cyan-300/18 p-8 text-center transition-colors hover:border-cyan-300/42">
                        <input
                          type="file"
                          accept="video/*"
                          onChange={handleVideoChange}
                          className="hidden"
                          id="video-upload"
                        />
                        <label htmlFor="video-upload" className="cursor-pointer">
                          <div className="text-6xl mb-4">🎬</div>
                          <p className="text-white font-semibold mb-2">
                            {t('review.clickUpload')}
                          </p>
                          <p className="text-gray-400 text-sm">
                            {t('review.maxVideo', { size: MAX_VIDEO_MB })}
                          </p>
                          <p className="text-brand-500 text-xs mt-2">
                            {t('review.whisperHint')}
                          </p>
                        </label>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <video
                          src={videoPreview}
                          controls
                          className="w-full rounded-lg bg-black"
                        />
                        <div className="console-option flex items-center justify-between p-3">
                          <div>
                            <p className="text-white text-sm font-semibold">{videoFile?.name}</p>
                            <p className="text-gray-400 text-xs">
                              {(videoFile!.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setVideoFile(null);
                              setVideoPreview(null);
                            }}
                            className="text-red-500 hover:text-red-400 text-sm"
                          >
                            {t('review.remove')}
                          </button>
                        </div>
                      </div>
                    )}
                    {uploadError && (
                      <p className="text-red-400 text-xs mt-2">
                        {uploadError}
                      </p>
                    )}
                  </div>
                )}

                {/* Text Input (if text mode) */}
                {analysisType === 'text' && (
                  <div>
                    <label className="block text-white font-semibold mb-3">
                      {t('review.postText')}
                    </label>
                    <textarea
                      value={contentText}
                      onChange={(e) => setContentText(e.target.value)}
                      placeholder={textPlaceholder}
                      rows={12}
                      className="console-input min-h-[18rem] resize-none"
                    />
                    <p className="text-gray-400 text-sm mt-2">
                      {t('review.characterCount', { count: contentText.length })}
                    </p>
                  </div>
                )}

                {/* Submit Button */}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={analysisType === 'text' ? !contentText.trim() : !videoFile}
                  isLoading={analyzeMutation.isPending}
                >
                  {analyzeMutation.isPending 
                    ? (analysisType === 'video' ? t('review.videoSubmitPending') : t('review.textPending'))
                    : (analysisType === 'video' ? t('review.transcribeAnalyze') : t('review.analyzeText'))}
                </Button>
              </form>

              {analyzeMutation.isError && (
                <div className="mt-6 rounded-[22px] border border-red-500/40 bg-red-500/10 p-4">
                  <p className="text-red-500 text-sm font-semibold mb-2">
                    {t('review.analysisFailed')}
                  </p>
                  <p className="text-red-400 text-xs">
                    {(analyzeMutation.error as any)?.response?.status === 413
                      ? maxUploadErrorMessage
                      : (analyzeMutation.error as any)?.response?.data?.error || 
                        (analyzeMutation.error as any)?.message || 
                        t('review.fileFormatError')}
                  </p>
                  {(analyzeMutation.error as any)?.response?.data?.details && (
                    <details className="mt-2">
                      <summary className="text-red-400 text-xs cursor-pointer hover:text-red-300">
                        {t('review.techDetails')}
                      </summary>
                      <pre className="text-red-300 text-xs mt-2 overflow-auto max-h-40 p-2 bg-red-900/20 rounded">
                        {(analyzeMutation.error as any).response.data.details}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </Card>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto">
            {/* Analysis Complete Header */}
            <div className="mb-6">
              <Card className="border-cyan-300/28 bg-[linear-gradient(135deg,rgba(114,202,255,0.12),rgba(9,18,34,0.88))]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#8CF8D4,#72CAFF)]">
                      <span className="text-2xl text-slate-950">✓</span>
                    </div>
                    <div>
                      <h3 className="text-white font-bold text-lg">{t('review.complete')}</h3>
                      <p className="text-gray-300 text-sm capitalize">
                        {format} • {analysisType === 'video' ? t('review.videoWithTranscription') : t('review.characters', { count: contentText.length })}
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" onClick={handleReset}>
                    {t('review.analyzeAnother')}
                  </Button>
                </div>
              </Card>
            </div>

            {/* Transcription (if video was analyzed) */}
            {analysisType === 'video' && analyzeMutation.data?.data?.transcription && (
              <Card className="mb-6">
                <h3 className="text-xl font-bold text-white mb-4 font-display flex items-center gap-2">
                  <span className="text-2xl">🎙️</span>
                  {t('review.transcription')}
                </h3>
                <div className="console-option p-4">
                  <p className="whitespace-pre-wrap leading-relaxed text-slate-300/78">
                    {analyzeMutation.data.data.transcription}
                  </p>
                </div>
                <p className="text-gray-400 text-xs mt-2">
                  {t('review.transcribed')}
                </p>
              </Card>
            )}

            {/* Scores */}
            <Card className="mb-6">
              <h2 className="text-2xl font-bold text-white mb-6 font-display">
                {t('review.scores')}
              </h2>
              <div className="grid md:grid-cols-2 gap-6">
                <ScoreBar label={t('review.clarity')} score={analyzeMutation.data.data.clarityScore} />
                <ScoreBar label={t('review.relevance')} score={analyzeMutation.data.data.relevanceScore} />
                <ScoreBar label={t('review.trust')} score={analyzeMutation.data.data.trustScore} />
                <ScoreBar label="CTA" score={analyzeMutation.data.data.ctaScore} />
              </div>
            </Card>

            {/* Suggestions */}
            {analyzeMutation.data.data.suggestions && (
              <Card className="mb-6">
                <h3 className="text-xl font-bold text-white mb-4 font-display flex items-center gap-2">
                  <span className="text-2xl">💡</span>
                  {t('review.suggestions')}
                </h3>
                <ul className="space-y-3">
                  {analyzeMutation.data.data.suggestions.map(
                    (s: { type: 'error' | 'warning' | 'success'; category: string; text: string }, i: number) => (
                      <li key={i} className="flex items-start gap-3">
                        <span
                          className={
                            s.type === 'error'
                              ? 'text-red-500 text-xl flex-shrink-0'
                              : s.type === 'warning'
                                ? 'text-yellow-500 text-xl flex-shrink-0'
                                : 'text-brand-500 text-xl flex-shrink-0'
                          }
                        >
                          →
                        </span>
                        <div>
                          <p className="text-gray-200">{s.text}</p>
                          {s.category && (
                            <p className="text-gray-500 text-xs mt-1">
                              {t('review.category', { category: s.category })}
                            </p>
                          )}
                        </div>
                      </li>
                    )
                  )}
                </ul>
              </Card>
            )}

            {/* Summary */}
            {analyzeMutation.data.data.summary && (
              <Card>
                <h3 className="text-xl font-bold text-white mb-4 font-display">
                  {t('review.summary')}
                </h3>
                <p className="text-gray-300 leading-relaxed">{analyzeMutation.data.data.summary}</p>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
