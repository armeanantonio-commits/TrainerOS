import { useState } from 'react';
import Card from './Card';
import Button from './Button';
import { copyToClipboard } from '@/lib/utils';

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
    reasoning?: string;
    objective?: string;
    conversionRate?: string;
  };
}

export default function IdeaCard({ idea }: IdeaCardProps) {
  const [copied, setCopied] = useState<string | null>(null);
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

  const handleCopy = async (text: string, type: string) => {
    await copyToClipboard(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
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
              <h3 className="text-console-accent font-bold text-lg">HOOK</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy(idea.hook, 'hook')}
              >
                {copied === 'hook' ? '✓ Copiat' : 'Copiază'}
              </Button>
            </div>
            <p className="text-white text-lg font-medium">{idea.hook}</p>
          </div>

          {/* Script */}
          <div className="mb-6">
            <h3 className="mb-3 text-sm font-semibold uppercase text-slate-300/72">
              Script pe Scene
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
                    <span className="text-console-accent font-bold text-sm">
                      Scenă {sceneNumber}
                    </span>
                    {sceneText && <p className="mt-1 text-slate-200">{sceneText}</p>}
                    {sceneVisual && (
                      <p className="mt-2 text-xs text-slate-400">
                        🎬 Vizual: {sceneVisual}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      </div>

      {/* CTA & Info Card */}
      <div className="space-y-4">
        <Card className="border-cyan-300/28 bg-[linear-gradient(135deg,rgba(114,202,255,0.12),rgba(9,18,34,0.88))]">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-console-accent">
            🎯 CTA RECOMANDAT
          </h3>
          <p className="text-white font-medium mb-4">{idea.cta}</p>
          <Button
            variant="primary"
            size="sm"
            className="w-full"
            onClick={() => handleCopy(idea.cta, 'cta')}
          >
            {copied === 'cta' ? '✓ Copiat' : 'Copiază CTA'}
          </Button>
        </Card>

        {/* objective/conversion hidden */}

        {idea.reasoning && (
          <Card>
            <h3 className="mb-3 text-sm font-semibold uppercase text-slate-300/72">
              De ce funcționează
            </h3>
            <p className="text-sm leading-relaxed text-slate-300/84">{idea.reasoning}</p>
          </Card>
        )}
      </div>
    </div>
  );
}
