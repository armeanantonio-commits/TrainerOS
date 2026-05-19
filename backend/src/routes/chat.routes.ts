import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { prisma } from '../lib/prisma.js';
import { getPlanLimits } from '../config/planLimits.js';
import { streamGeminiText } from '../lib/gemini.js';
import {
  acquireGenerationLock,
  buildGenerationConflictPayload,
  releaseGenerationLock,
} from '../lib/generation-lock.js';
import {
  buildAntiRepeatPromptSection,
  getRecentGenerationPreviews,
  rememberGeneratedValue,
} from '../lib/generation-history.js';
import { buildAiLanguageInstruction, normalizeLanguage } from '../lib/language.js';

const router = Router();
const prismaAny = prisma as any;

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const DEFAULT_CHAT_MAX_OUTPUT_TOKENS = 32768;

function getChatMaxOutputTokens(): number {
  const parsed = Number.parseInt(process.env.CHAT_MAX_OUTPUT_TOKENS || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CHAT_MAX_OUTPUT_TOKENS;
}

function normalizeChatResponse(raw: string): string {
  if (!raw) return '';

  let text = raw.replace(/\r\n/g, '\n').trim();

  // Remove leaked structured labels/sections that are not suitable for chat bubbles.
  const blockedSectionStarts = [
    '**`reasoning`**',
    '`reasoning`',
    '**reasoning**',
    'reasoning:',
    '**`message_template`**',
    '`message_template`',
    '**message_template**',
    'message_template:',
    '### Scenariul',
    '### Scenario',
  ];

  for (const marker of blockedSectionStarts) {
    const idx = text.toLowerCase().indexOf(marker.toLowerCase());
    if (idx !== -1) {
      text = text.slice(0, idx).trimEnd();
      break;
    }
  }

  // Remove markdown fences if they leaked.
  text = text.replace(/```[\s\S]*?```/g, '').trim();

  // Remove single wrapping quotes often produced around full answer blocks.
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith('“') && text.endsWith('”'))) {
    text = text.slice(1, -1).trim();
  }

  // Keep normal paragraph spacing.
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

router.post('/stream', authenticate, async (req, res) => {
  try {
    const { message, history } = req.body as {
      message?: string;
      history?: ChatMessage[];
    };

    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const trimmedMessage = (message || '').trim();
    if (!trimmedMessage) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    if (!req.user.isAdmin) {
      const monthlyChatLimit = getPlanLimits(req.user.plan).chatQuestionsPerMonth;
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const nextMonthStart = new Date(monthStart);
      nextMonthStart.setMonth(nextMonthStart.getMonth() + 1);

      const messagesThisMonth = await prismaAny.chatMessageUsage.count({
        where: {
          userId: req.user.id,
          createdAt: {
            gte: monthStart,
            lt: nextMonthStart,
          },
        },
      });

      if (messagesThisMonth >= monthlyChatLimit) {
        res.status(429).json({
          error: 'Monthly chat limit reached',
          message: `Ai atins limita de ${monthlyChatLimit} întrebări în chat pe luna curentă.`,
          messagesThisMonth,
          limit: monthlyChatLimit,
        });
        return;
      }
    }

    const generationKey = acquireGenerationLock(req.user.id, 'chat');
    if (!generationKey) {
      res.status(409).json(buildGenerationConflictPayload('chat'));
      return;
    }

    try {
      const userProfile = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          name: true,
          niche: true,
          icpProfile: true,
          positioningMessage: true,
          contentPreferences: true,
        },
      });
      const languageInstruction = buildAiLanguageInstruction(normalizeLanguage(req.user.preferredLanguage));

      const safeHistory = (Array.isArray(history) ? history : [])
        .filter((item) => item && (item.role === 'user' || item.role === 'assistant'))
        .filter((item) => typeof item.content === 'string' && item.content.trim().length > 0)
        .slice(-16)
        .map((item) => ({ role: item.role, content: item.content.trim() }));

      const globalContext = [
        'Global app context (TrainerOS):',
        '- App pentru antrenori fitness care transformă contentul în clienți.',
        '- Module disponibile: Niche Finder (Quick/Discover), Brand Voice, Content Creation Preferences, Daily Idea Engine, Idea Structurer, Content Review, Idea History, Dashboard.',
        '- Daily Idea produce Hook + Script pe scene + CTA + reasoning pentru Reel/Carousel/Story.',
        '- Content Review oferă scoruri pe claritate, relevanță, încredere, CTA și recomandări concrete.',
        '- Obiectivul principal: consecvență de content și conversii în clienți.',
        '',
        `Context utilizator curent:`,
        `- Nume: ${userProfile?.name || 'Nespecificat'}`,
        `- Nișă: ${userProfile?.niche || 'Nespecificat'}`,
        `- ICP: ${userProfile?.icpProfile || 'Nespecificat'}`,
        `- Poziționare: ${userProfile?.positioningMessage || 'Nespecificat'}`,
        `- Content preferences: ${userProfile?.contentPreferences ? JSON.stringify(userProfile.contentPreferences) : 'Nespecificat'}`,
      ].join('\n');

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      const abortController = new AbortController();
      req.on('aborted', () => abortController.abort());
      res.on('close', () => {
        if (!res.writableEnded) {
          abortController.abort();
        }
      });
      let hasStreamedToClient = false;

      const antiRepeatSection = buildAntiRepeatPromptSection({
        recentOutputs: getRecentGenerationPreviews(req.user.id, 'chat', 4),
      });
      const systemInstruction = [
        'You are TrainerOS, an AI expert in fitness marketing and content strategy.',
        'Always identify yourself as "TrainerOS" when asked who you are.',
        'You must only assist with fitness marketing, fitness content strategy, audience positioning, offers, social media content, content execution, and related conversion issues.',
        'If the user asks about unrelated topics, politely refuse and redirect to fitness marketing/content topics.',
        'Use the global context provided below in every answer.',
        'Keep answers actionable, concise, and structured for execution.',
        'Reply like a normal direct chat message.',
        'Do not output labels, schemas, metadata keys, or analysis blocks (examples forbidden: reasoning, message_template, scenario headers, JSON fields).',
        'Do not use markdown code fences.',
        languageInstruction,
        '',
        globalContext,
        antiRepeatSection ? `\n${antiRepeatSection}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      let assistantResponse = '';
      let streamMessages = [
        ...safeHistory,
        { role: 'user' as const, content: trimmedMessage },
      ];
      const chatMaxOutputTokens = getChatMaxOutputTokens();

      for (let continuationAttempt = 0; continuationAttempt < 3; continuationAttempt += 1) {
        const streamResult = await streamGeminiText(streamMessages, {
          system: systemInstruction,
          temperature: 0.6,
          maxTokens: chatMaxOutputTokens,
          signal: abortController.signal,
          onText: (token) => {
            if (token) {
              assistantResponse += token;
              if (!res.writableEnded) {
                hasStreamedToClient = true;
                res.write(token);
              }
            }
          },
        });

        if (streamResult.finishReason !== 'MAX_TOKENS' || abortController.signal.aborted || res.writableEnded) {
          break;
        }

        streamMessages = [
          ...safeHistory,
          { role: 'user' as const, content: trimmedMessage },
          { role: 'assistant' as const, content: assistantResponse },
          {
            role: 'user' as const,
            content:
              'Continua exact de unde te-ai oprit. Nu relua inceputul, nu adauga introducere si nu explica de ce continui.',
          },
        ];
      }

      const responseText = normalizeChatResponse(assistantResponse);
      if (responseText) {
        rememberGeneratedValue(req.user.id, 'chat', responseText);
      }

      if (responseText && !hasStreamedToClient) {
        res.write(responseText);
      }

      await prismaAny.chatMessageUsage.create({
        data: {
          userId: req.user.id,
          message: trimmedMessage,
        },
      });

      res.end();
    } finally {
      releaseGenerationLock(generationKey);
    }
  } catch (error: any) {
    console.error('Chat stream error:', error);

    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'Failed to stream chat response' });
      return;
    }

    res.write('\n\n[TrainerOS] A intervenit o eroare de streaming. Încearcă din nou.');
    res.end();
  }
});

export default router;
