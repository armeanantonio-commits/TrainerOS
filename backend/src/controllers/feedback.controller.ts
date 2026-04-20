import type { Request, Response } from 'express';
import * as openaiService from '../services/openai.service.js';
import * as molmoService from '../services/molmo.service.js';
import { prisma } from '../lib/prisma.js';
import path from 'path';
import fs from 'fs';
import { getPlanLimits } from '../config/planLimits.js';
import { extractAudioFromVideo } from '../lib/ffmpeg.js';

async function checkContentReviewLimit(req: Request, res: Response): Promise<boolean> {
  if (!req.user || req.user.isAdmin) {
    return true;
  }

  const monthlyContentReviewLimit = getPlanLimits(req.user.plan).contentReviewsPerMonth;
  if (monthlyContentReviewLimit === null) {
    return true;
  }

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const nextMonthStart = new Date(monthStart);
  nextMonthStart.setMonth(nextMonthStart.getMonth() + 1);

  const reviewsThisMonth = await prisma.feedback.count({
    where: {
      userId: req.user.id,
      createdAt: {
        gte: monthStart,
        lt: nextMonthStart,
      },
    },
  });

  if (reviewsThisMonth >= monthlyContentReviewLimit) {
    res.status(429).json({
      error: 'Monthly content review limit reached',
      message: `Ai atins limita de ${monthlyContentReviewLimit} content review-uri pe luna curentă.`,
      generatedThisMonth: reviewsThisMonth,
      limit: monthlyContentReviewLimit,
    });
    return false;
  }

  return true;
}

export async function analyze(req: Request, res: Response): Promise<void> {
  try {
    console.log('🎬 Analyze endpoint called');
    console.log('📁 Request body:', req.body);
    console.log('📎 File:', req.file ? {
      filename: req.file.filename,
      mimetype: req.file.mimetype,
      size: req.file.size
    } : 'NO FILE');

    if (!req.user) {
      console.error('❌ No user in request');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Check if user has niche (optional but recommended)
    if (!req.user.niche) {
      // Allow but warn
      console.log('⚠️ User analyzing content without niche set');
    }

    if (!req.file) {
      console.error('❌ No file uploaded in request');
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const canProceed = await checkContentReviewLimit(req, res);
    if (!canProceed) {
      return;
    }
    const fileType = req.file.mimetype.startsWith('video') ? 'video' : 'image';
    const fileUrl = `/uploads/${req.file.filename}`;
    const filePath = path.join(process.cwd(), 'uploads', req.file.filename);

    // Get video duration if available (would need ffprobe in production)
    const duration = req.body.duration ? parseInt(req.body.duration) : undefined;

    let transcription: string | undefined;

    // If video, extract audio and transcribe with Whisper
    if (fileType === 'video') {
      try {
        console.log(`🎙️ Step 1: Extracting audio from video: ${req.file.filename}`);
        const audioPath = await extractAudioFromVideo(filePath);
        console.log(`✅ Audio extracted to: ${audioPath}`);
        
        console.log(`🎙️ Step 2: Transcribing audio with Whisper...`);
        const transcriptionResult = await openaiService.transcribeAudio(audioPath);
        transcription = transcriptionResult.text;
        
        console.log(`✅ Step 3: Transcription complete!`);
        console.log(`📝 Transcription length: ${transcription.length} characters`);
        console.log(`📝 Transcription preview: ${transcription.substring(0, 200)}...`);
        
        // Clean up audio file
        try {
          fs.unlinkSync(audioPath);
          console.log(`🗑️ Cleaned up audio file`);
        } catch (err) {
          console.warn('⚠️ Could not delete audio file:', err);
        }
      } catch (error: any) {
        console.error('❌ Transcription failed with error:', error.message);
        console.error('❌ Full error:', error);
        
        // Send error response instead of continuing
        res.status(500).json({
          error: 'Transcription failed',
          message: error.message,
          details: 'Video upload succeeded but audio transcription failed. Check the bundled FFmpeg binary and the transcription API key.',
        });
        return;
      }
    }

    // Analyze with Anthropic using transcription
    console.log(`🤖 Step 4: Preparing analysis...`);
    console.log(`📊 Analysis input:`, {
      fileType,
      hasNiche: !!req.user.niche,
      niche: req.user.niche,
      hasTranscription: !!transcription,
      transcriptionLength: transcription?.length || 0,
    });
    
    if (fileType === 'video' && !transcription) {
      console.error('⚠️ WARNING: Video analysis without transcription!');
    }
    
    const result = await openaiService.analyzeFeedback({
      fileType,
      fileUrl,
      duration,
      niche: req.user.niche || undefined,
      transcription,
    });
    
    console.log(`✅ Step 5: Analysis complete!`);
    console.log(`📊 Overall score: ${result.overallScore}/100`);

    // Save feedback to database
    const feedback = await prisma.feedback.create({
      data: {
        userId: req.user.id,
        fileUrl,
        fileType,
        fileName: req.file.originalname,
        duration,
        clarityScore: result.clarityScore,
        relevanceScore: result.relevanceScore,
        trustScore: result.trustScore,
        ctaScore: result.ctaScore,
        overallScore: result.overallScore,
        suggestions: result.suggestions as any,
        summary: result.summary,
        transcription: result.transcription,
      },
    });

    res.json({ ...result, id: feedback.id });
  } catch (error: any) {
    console.error('❌ Content analysis error:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({ 
      error: error.message || 'Failed to analyze content',
      details: error.stack,
    });
  }
}

export async function getHistory(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const feedbacks = await prisma.feedback.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    res.json({ feedbacks });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get feedback history' });
  }
}

export async function analyzeText(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const canProceed = await checkContentReviewLimit(req, res);
    if (!canProceed) {
      return;
    }

    const { text, format } = req.body;

    if (!text || !text.trim()) {
      res.status(400).json({ error: 'Text is required' });
      return;
    }

    console.log(`📝 Analyzing ${format || 'text'} content for user ${req.user.email}...`);

    // Get full user profile for personalized analysis
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        niche: true,
        icpProfile: true,
        positioningMessage: true,
        toneOfVoice: true,
      },
    });

    // Use Anthropic to analyze text content
    const result = await openaiService.analyzeTextContent({
      text,
      format: format || 'general',
      niche: user?.niche || undefined,
      icpProfile: user?.icpProfile as any,
      positioningMessage: user?.positioningMessage || undefined,
      toneOfVoice: user?.toneOfVoice || undefined,
    });

    // Save feedback to database
    const feedback = await prisma.feedback.create({
      data: {
        userId: req.user.id,
        fileUrl: '',
        fileType: 'text',
        fileName: `${format || 'text'}-analysis`,
        clarityScore: result.clarityScore,
        relevanceScore: result.relevanceScore,
        trustScore: result.trustScore,
        ctaScore: result.ctaScore,
        overallScore: result.overallScore,
        suggestions: result.suggestions as any,
        summary: result.summary,
      },
    });

    res.json({ ...result, id: feedback.id });
  } catch (error: any) {
    console.error('❌ Text analysis failed:', error);
    res.status(500).json({ error: error.message || 'Failed to analyze text content' });
  }
}

export async function getById(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;

    const feedback = await prisma.feedback.findFirst({
      where: {
        id,
        userId: req.user.id, // Only allow user to access their own feedback
      },
    });

    if (!feedback) {
      res.status(404).json({ error: 'Feedback not found' });
      return;
    }

    res.json(feedback);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get feedback' });
  }
}

export default {
  analyze,
  analyzeText,
  getHistory,
  getById,
};
