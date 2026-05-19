import { useState } from 'react';
import Card from './Card';
import Button from './Button';
import { copyToClipboard } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';

interface Scene {
  // Backend returns scenes as { scene, text, visual }
  scene?: number;
  text?: string;
  visual?: string;

  // Backwards-compat (older UI shape)
  number?: number;
  description?: string;
}

interface IdeaCardProps {
  idea: {
    format: string;
    hook: string;
    script: Scene[];
    cta: string;
    dmKeyword?: string;
    reasoning?: string;
    objective?: string;
    conversionRate?: string;
  };
  onRegenerateScene?: (sceneNumber: number) => void;
  onGenerateStoryImage?: (sceneNumber: number, sceneText: string, visualPrompt?: string) => void;
  generatingStoryImages?: number[];
  storySceneImages?: Record<number, string>;
  onRegenerateHook?: () => void;
  isRegeneratingHook?: boolean;
  regeneratingScenes?: number[];
}

export default function IdeaCard({
  idea,
  onRegenerateScene,
  onGenerateStoryImage,
  generatingStoryImages = [],
  storySceneImages = {},
  onRegenerateHook,
  isRegeneratingHook = false,
  regeneratingScenes = [],
}: IdeaCardProps) {
  const { t, language } = useI18n();
  const [copied, setCopied] = useState<string | null>(null);
  const [expandedPrompts, setExpandedPrompts] = useState<Record<number, boolean>>({});
  const format = (idea.format || 'REEL').toLowerCase();
  const normalizeSceneText = (value?: string) =>
    (value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  const normalizedCta = normalizeSceneText(idea.cta);
  const rawScenes = idea.script || [];
  const displayScenes =
    rawScenes.length > 1 &&
    normalizeSceneText(rawScenes[rawScenes.length - 1]?.text ?? rawScenes[rawScenes.length - 1]?.description) === normalizedCta
      ? rawScenes.slice(0, -1)
      : rawScenes;
  const existingSceneNumbers = new Set(
    displayScenes.map((scene, idx) => scene.scene ?? scene.number ?? idx + 1).filter((sceneNumber) => sceneNumber >= 1 && sceneNumber <= 5)
  );
  const missingScenes = [1, 2, 3, 4, 5].filter((sceneNumber) => !existingSceneNumbers.has(sceneNumber));

  const handleCopy = async (text: string, type: string) => {
    await copyToClipboard(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleDownloadImage = (imageUrl: string, sceneNumber: number) => {
    if (!imageUrl) {
      return;
    }

    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `story-scene-${sceneNumber}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyIconLabel = language === 'en' ? 'Copy' : 'Copiază';

  const getPromptPreview = (value: string, max = 140) => {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length <= max) {
      return normalized;
    }
    return `${normalized.slice(0, max).trimEnd()}...`;
  };

  const formatStoryPrompt = (value: string) => {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return null;
    }

    const sceneMarker = ' Scenă: ';
    const focusMarker = ' Focus vizual: ';
    const rulesMarker = ' Un personaj principal,';

    const sceneIndex = normalized.indexOf(sceneMarker);
    const focusIndex = normalized.indexOf(focusMarker);
    const rulesIndex = normalized.indexOf(rulesMarker);

    if (sceneIndex === -1 || focusIndex === -1 || rulesIndex === -1) {
      return {
        intro: normalized,
        scene: '',
        focus: '',
        rules: '',
      };
    }

    return {
      intro: normalized.slice(0, sceneIndex).trim(),
      scene: normalized.slice(sceneIndex + sceneMarker.length, focusIndex).trim(),
      focus: normalized.slice(focusIndex + focusMarker.length, rulesIndex).trim(),
      rules: normalized.slice(rulesIndex + 1).trim(),
    };
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main Idea Card */}
      <div className="lg:col-span-2">
        <Card>
          {/* Format Badge */}
          <div className="mb-6">
            <span className="console-badge">
              <span className="text-2xl">
                {format === 'reel' && '📱'}
                {format === 'carousel' && '🎠'}
                {format === 'story' && '📖'}
              </span>
              <span className="font-bold uppercase text-sm">
                {format}
              </span>
            </span>
          </div>

          {/* Hook */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h3 className="text-console-accent font-bold text-lg">HOOK</h3>
                {onRegenerateHook && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onRegenerateHook}
                    isLoading={isRegeneratingHook}
                    aria-label="Regenerate hook"
                    title={language === 'en' ? 'Regenerate hook' : 'Regenerează hook-ul'}
                  >
                    ↻
                  </Button>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy(idea.hook, 'hook')}
              >
                {copied === 'hook' ? t('ideaDetail.copied') : t('common.copy')}
              </Button>
            </div>
            <p className="text-white text-lg font-medium">{idea.hook}</p>
          </div>

          {/* Script */}
          <div className="mb-6">
            <h3 className="mb-3 text-sm font-semibold uppercase text-slate-300/72">
              {t('ideaDetail.scriptScenes')}
            </h3>
            <div className="space-y-3">
              {displayScenes.map((scene, idx) => {
                const sceneNumber = scene.scene ?? scene.number ?? idx + 1;
                const sceneText = scene.text ?? scene.description ?? '';
                const sceneVisual = scene.visual;

                return (
                  <div
                    key={`${sceneNumber}-${idx}`}
                    className="console-option p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-console-accent font-bold text-sm">
                          {t('ideaDetail.sceneLabel', { number: sceneNumber })}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(sceneText, `scene-title-${sceneNumber}`)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-700/80 bg-slate-900/70 text-lg text-slate-200 transition hover:border-slate-500 hover:text-white"
                          title={copyIconLabel}
                          aria-label={copyIconLabel}
                        >
                          {copied === `scene-title-${sceneNumber}` ? '✓' : '⧉'}
                        </button>
                      </div>
                      {onRegenerateScene && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onRegenerateScene(sceneNumber)}
                          isLoading={regeneratingScenes.includes(sceneNumber)}
                        >
                          ↻
                        </Button>
                      )}
                    </div>
                    {sceneText && <p className="mt-1 text-slate-200">{sceneText}</p>}
                    {format === 'story' && storySceneImages[sceneNumber] && (
                      <div className="relative mt-3 overflow-hidden rounded-lg border border-slate-700 bg-slate-900/40">
                        <button
                          type="button"
                          onClick={() => handleDownloadImage(storySceneImages[sceneNumber], sceneNumber)}
                          className="absolute right-2 top-2 z-10 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-600/90 bg-black/70 text-2xl text-white shadow-lg transition hover:bg-black/85"
                          title={language === 'en' ? 'Download image' : 'Descarcă imagine'}
                          aria-label={language === 'en' ? 'Download image' : 'Descarcă imagine'}
                        >
                          ↓
                        </button>
                        <img
                          src={storySceneImages[sceneNumber]}
                          alt={`Story scene ${sceneNumber}`}
                          className="h-auto w-full object-cover"
                        />
                      </div>
                    )}
                    {sceneVisual && (
                      <div className="mt-2 rounded-md border border-slate-700/70 bg-slate-900/40 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] uppercase tracking-wide text-slate-500">
                            {format === 'story' ? 'Prompt imagine' : 'Vizual'}
                          </p>
                          <button
                            type="button"
                            onClick={() => handleCopy(sceneVisual, `scene-prompt-${sceneNumber}`)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-700/80 bg-slate-900/70 text-lg text-slate-200 transition hover:border-slate-500 hover:text-white"
                            title={copyIconLabel}
                            aria-label={copyIconLabel}
                          >
                            {copied === `scene-prompt-${sceneNumber}` ? '✓' : '⧉'}
                          </button>
                        </div>
                        {format === 'story' && expandedPrompts[sceneNumber] ? (
                          (() => {
                            const parts = formatStoryPrompt(sceneVisual);
                            if (!parts) {
                              return null;
                            }
                            return (
                              <div className="mt-1 space-y-2 text-xs text-slate-300">
                                {parts.intro && (
                                  <p>
                                    <span className="font-semibold text-slate-200">Tip:</span> {parts.intro}
                                  </p>
                                )}
                                {parts.scene && (
                                  <p>
                                    <span className="font-semibold text-slate-200">Scenă:</span> {parts.scene}
                                  </p>
                                )}
                                {parts.focus && (
                                  <p>
                                    <span className="font-semibold text-slate-200">Focus vizual:</span> {parts.focus}
                                  </p>
                                )}
                                {parts.rules && (
                                  <p>
                                    <span className="font-semibold text-slate-200">Reguli:</span> {parts.rules}
                                  </p>
                                )}
                              </div>
                            );
                          })()
                        ) : (
                          <p className="mt-1 text-xs text-slate-300">
                            {format === 'story' ? getPromptPreview(sceneVisual) : sceneVisual}
                          </p>
                        )}
                        {format === 'story' && sceneVisual.length > 140 && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedPrompts((prev) => ({
                                ...prev,
                                [sceneNumber]: !prev[sceneNumber],
                              }))
                            }
                            className="mt-2 text-xs text-cyan-300 hover:text-cyan-200"
                          >
                            {expandedPrompts[sceneNumber]
                              ? (language === 'en' ? 'Show less' : 'Arată mai puțin')
                              : (language === 'en' ? 'Show full prompt' : 'Arată prompt complet')}
                          </button>
                        )}
                      </div>
                    )}
                    {format === 'story' && onGenerateStoryImage && (
                      <div className="mt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onGenerateStoryImage(sceneNumber, sceneText, sceneVisual)}
                          isLoading={generatingStoryImages.includes(sceneNumber)}
                        >
                          {language === 'en' ? 'Generate image' : 'Generează imagine'}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
              {missingScenes.map((sceneNumber) => (
                <div key={`missing-${sceneNumber}`} className="console-option p-4 border border-dashed border-cyan-300/30">
                  {onRegenerateScene && (
                    <div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onRegenerateScene(sceneNumber)}
                        isLoading={regeneratingScenes.includes(sceneNumber)}
                      >
                        {language === 'en' ? `Generate scene ${sceneNumber}` : `Generează scena ${sceneNumber}`}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* CTA & Info Card */}
      <div className="space-y-4">
        <Card className="border-cyan-300/28 bg-[linear-gradient(135deg,rgba(114,202,255,0.12),rgba(9,18,34,0.88))]">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-console-accent">
            {t('ideaDetail.recommendedCta')}
          </h3>
          <p className="text-white font-medium mb-4">{idea.cta}</p>
          <Button
            variant="primary"
            size="sm"
            className="w-full"
            onClick={() => handleCopy(idea.cta, 'cta')}
          >
            {copied === 'cta' ? t('ideaDetail.copied') : t('history.copyCta')}
          </Button>
        </Card>

        {/* objective/conversion hidden */}

        {idea.reasoning && (
          <Card>
            <h3 className="mb-3 text-sm font-semibold uppercase text-slate-300/72">
              {t('ideaDetail.reasoning')}
            </h3>
            <p className="text-sm leading-relaxed text-slate-300/84">{idea.reasoning}</p>
          </Card>
        )}
      </div>
    </div>
  );
}
