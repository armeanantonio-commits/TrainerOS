const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

type GeminiRole = 'user' | 'assistant';
type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };

export interface GeminiMessage {
  role: GeminiRole;
  content: string;
}

interface GeminiTextOptions {
  system?: string;
  temperature?: number;
  maxTokens?: number;
}

function getApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }
  return apiKey;
}

function buildApiUrl(action: 'generateContent' | 'streamGenerateContent'): string {
  const apiKey = encodeURIComponent(getApiKey());
  const baseUrl = `${GEMINI_API_BASE_URL}/models/${encodeURIComponent(GEMINI_MODEL)}`;

  if (action === 'streamGenerateContent') {
    return `${baseUrl}:streamGenerateContent?alt=sse&key=${apiKey}`;
  }

  return `${baseUrl}:generateContent?key=${apiKey}`;
}

function sanitizeMessages(messages: GeminiMessage[]): GeminiMessage[] {
  return messages
    .filter((message) => (message.role === 'user' || message.role === 'assistant') && message.content.trim().length > 0)
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}

function buildRequestBody(messages: GeminiMessage[], options: GeminiTextOptions): Record<string, unknown> {
  const contents = sanitizeMessages(messages).map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));

  return {
    contents,
    systemInstruction: options.system ? { parts: [{ text: options.system }] } : undefined,
    generationConfig: {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxTokens ?? 1024,
    },
  };
}

function buildPartsRequestBody(parts: GeminiPart[], options: GeminiTextOptions): Record<string, unknown> {
  return {
    contents: [
      {
        role: 'user',
        parts,
      },
    ],
    systemInstruction: options.system ? { parts: [{ text: options.system }] } : undefined,
    generationConfig: {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxTokens ?? 1024,
    },
  };
}

function extractText(payload: any): string {
  if (!Array.isArray(payload?.candidates)) {
    return '';
  }

  return payload.candidates
    .flatMap((candidate: any) => candidate?.content?.parts || [])
    .filter((part: any) => typeof part?.text === 'string')
    .map((part: any) => part.text)
    .join('');
}

async function parseError(response: Response): Promise<string> {
  const errorText = await response.text();

  try {
    const parsed = JSON.parse(errorText);
    return parsed?.error?.message || errorText;
  } catch {
    return errorText;
  }
}

export async function createGeminiText(messages: GeminiMessage[], options: GeminiTextOptions = {}): Promise<string> {
  const response = await fetch(buildApiUrl('generateContent'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(buildRequestBody(messages, options)),
  });

  if (!response.ok) {
    throw new Error(`Gemini request failed (${response.status}): ${await parseError(response)}`);
  }

  const payload = await response.json();
  return extractText(payload).trim();
}

export async function createGeminiPartsText(parts: GeminiPart[], options: GeminiTextOptions = {}): Promise<string> {
  const response = await fetch(buildApiUrl('generateContent'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(buildPartsRequestBody(parts, options)),
  });

  if (!response.ok) {
    throw new Error(`Gemini request failed (${response.status}): ${await parseError(response)}`);
  }

  const payload = await response.json();
  return extractText(payload).trim();
}

export async function streamGeminiText(
  messages: GeminiMessage[],
  options: GeminiTextOptions & {
    signal?: AbortSignal;
    onText: (chunk: string) => void;
  }
): Promise<void> {
  const response = await fetch(buildApiUrl('streamGenerateContent'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    signal: options.signal,
    body: JSON.stringify(buildRequestBody(messages, options)),
  });

  if (!response.ok) {
    throw new Error(`Gemini stream failed (${response.status}): ${await parseError(response)}`);
  }

  if (!response.body) {
    throw new Error('Gemini stream response body is empty');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  const processEvent = (rawEvent: string): boolean => {
    const trimmed = rawEvent.trim();
    if (!trimmed) {
      return true;
    }

    const dataText = trimmed
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n');

    if (!dataText || dataText === '[DONE]') {
      return true;
    }

    try {
      const payload = JSON.parse(dataText);
      const text = extractText(payload);
      if (text) {
        options.onText(text);
      }
      return true;
    } catch (error) {
      if (error instanceof SyntaxError) {
        return false;
      }

      throw error;
    }
  };

  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    buffer = buffer.replace(/\r\n/g, '\n');

    let boundaryIndex = buffer.indexOf('\n\n');
    while (boundaryIndex !== -1) {
      const rawEvent = buffer.slice(0, boundaryIndex);
      const remainingBuffer = buffer.slice(boundaryIndex + 2);

      if (!processEvent(rawEvent)) {
        break;
      }

      buffer = remainingBuffer;
      boundaryIndex = buffer.indexOf('\n\n');
    }
  }

  if (buffer.trim()) {
    const parsed = processEvent(buffer.replace(/\n+$/, ''));
    if (!parsed) {
      throw new Error('Gemini stream ended with an incomplete event payload');
    }
  }
}
