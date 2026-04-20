import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { extractFrameFromVideo } from '../lib/ffmpeg.js';

let openrouter: OpenAI | null = null;

function getOpenRouterClient(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  if (!openrouter) {
    openrouter = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey,
      defaultHeaders: {
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
        'X-Title': 'TrainerOS Content Analyzer',
      },
    });
  }

  return openrouter;
}

export interface VideoFeedbackInput {
  fileUrl: string;
  fileType: 'video' | 'image';
  duration?: number;
  niche?: string;
}

export interface Suggestion {
  type: 'error' | 'warning' | 'success';
  category: string;
  text: string;
}

export interface VideoFeedbackResult {
  clarityScore: number;
  relevanceScore: number;
  trustScore: number;
  ctaScore: number;
  overallScore: number;
  suggestions: Suggestion[];
  summary: string;
}

/**
 * Analyze video content using Molmo 2 8B vision model via OpenRouter
 */
export async function analyzeVideoWithMolmo(input: VideoFeedbackInput): Promise<VideoFeedbackResult> {
  try {
    // Convert video file to base64 for vision analysis
    const filePath = path.join(process.cwd(), input.fileUrl);
    
    // For video, we'll extract key frames or use the file directly
    // Molmo can handle video files
    let base64Content: string;
    let mimeType: string;

    if (input.fileType === 'video') {
      const frameOutputPath = filePath + '_frame.jpg';
      
      try {
        // Extract frame at 3 seconds (typical hook position)
        extractFrameFromVideo(filePath, frameOutputPath);
        
        // Read the extracted frame
        const frameBuffer = fs.readFileSync(frameOutputPath);
        base64Content = frameBuffer.toString('base64');
        mimeType = 'image/jpeg';
        
        // Clean up the frame file
        fs.unlinkSync(frameOutputPath);
      } catch (ffmpegError) {
        console.warn('⚠️ ffmpeg extraction failed, using fallback:', ffmpegError);
        throw new Error('Video frame extraction failed. Check the bundled FFmpeg binary.');
      }
    } else {
      // Read image file and convert to base64
      const imageBuffer = fs.readFileSync(filePath);
      base64Content = imageBuffer.toString('base64');
      mimeType = 'image/jpeg'; // Adjust based on actual file type
    }

    const dataUrl = `data:${mimeType};base64,${base64Content}`;

    const prompt = `Tu ești un expert în analiza content-ului fitness pe social media specializat în REELS și VIDEO.

${input.niche ? `Context: Nișa antrenorului este "${input.niche}"` : ''}
${input.duration ? `Durată video: ${input.duration} secunde` : ''}

Analizează acest ${input.fileType === 'video' ? 'REEL/VIDEO' : 'POST'} în detaliu și evaluează pe 4 criterii (0-100):

1. **CLARITATE (0-100)**: 
   - Mesajul este ușor de înțeles în primele 3 secunde?
   - E clar ce problemă rezolvi sau ce oferi?
   - Text on-screen este lizibil și coerent?

2. **RELEVANȚĂ (0-100)**: 
   - Conținutul vorbește direct despre problemele audienței fitness?
   - Este specific pentru nișa antrenorului?
   - Adresează pain points concrete?

3. **ÎNCREDERE (0-100)**: 
   - Include dovezi sociale (testimoniale, rezultate)?
   - Antrenorul apare profesionist și credibil?
   - Există proof of results (before/after, statistici)?

4. **CTA (0-100)**: 
   - Call-to-action este clar și vizibil?
   - Este specific și acționabil (ex: "Scrie PLAN în DM")?
   - Apare la momentul potrivit în video?

IMPORTANT: Generează 3-5 sugestii concrete și acționabile:
- **"error"**: Problemă MAJORĂ care blochează conversia (ex: lipsă CTA, mesaj neclar)
- **"warning"**: Oportunitate ratată care ar putea dubla performanța (ex: lipsă social proof)
- **"success"**: Ceva care funcționează FOARTE bine (continuă așa)

Categorii pentru sugestii: "hook", "clarity", "social-proof", "cta", "editing", "retention", "trust", "relevance"

Răspunde DOAR în format JSON strict, fără markdown:
{
  "clarityScore": 82,
  "relevanceScore": 91,
  "trustScore": 68,
  "ctaScore": 45,
  "overallScore": 72,
  "suggestions": [
    {
      "type": "error",
      "category": "cta",
      "text": "Lipsește un CTA clar. Adaugă text on-screen în ultimele 3 secunde: 'Scrie PLAN în DM pentru programul tău personalizat'"
    },
    {
      "type": "warning",
      "category": "social-proof",
      "text": "Niciun rezultat vizibil. Adaugă before/after sau testimonial text pentru +30% trust"
    },
    {
      "type": "success",
      "category": "hook",
      "text": "Hook-ul din prima secundă captează atenția perfect! Pattern interrupt bun"
    }
  ],
  "summary": "Video solid cu hook puternic, dar îi lipsește CTA-ul și social proof. Adaugă un CTA clar și un testimonial pentru +25 puncte overall."
}`;

    console.log('🤖 Sending video to Molmo 2 8B for analysis...');

    const completion = await getOpenRouterClient().chat.completions.create({
      model: 'allenai/molmo-2-8b',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: dataUrl,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
      temperature: 0.6,
      max_tokens: 1500,
    });

    const content = completion.choices[0].message.content?.trim() || '{}';
    console.log('✅ Molmo analysis received:', content.substring(0, 100) + '...');

    // Clean and parse JSON response
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    const result = JSON.parse(cleaned);

    return result;
  } catch (error: any) {
    console.error('❌ Molmo video analysis failed:', error.message);
    
    // Fallback to simple analysis if Molmo fails
    return {
      clarityScore: 70,
      relevanceScore: 75,
      trustScore: 60,
      ctaScore: 50,
      overallScore: 64,
      suggestions: [
        {
          type: 'warning',
          category: 'analysis',
          text: 'Analiza video automată nu a putut fi completată. Revizuiește manual hook-ul, CTA-ul și social proof-ul.',
        },
      ],
      summary: 'Analiza video temporar indisponibilă. Asigură-te că ai: (1) Hook puternic în prima secundă, (2) CTA clar la final, (3) Social proof vizibil.',
    };
  }
}
