import { GoogleGenAI, Type } from '@google/genai';

const SCHEDULE_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    rationale: {
      type: Type.STRING,
      description: 'Concise Korean summary of how study sessions were prioritized and scheduled.',
    },
    blocks: {
      type: Type.ARRAY,
      description: 'Scheduled study blocks within the provided available windows.',
      items: {
        type: Type.OBJECT,
        properties: {
          date: { type: Type.STRING, description: 'Date in YYYY-MM-DD format.' },
          startTime: { type: Type.STRING, description: 'Start time in 24-hour HH:MM format.' },
          endTime: {
            type: Type.STRING,
            description: 'End time in 24-hour HH:MM format (up to 24:00).',
          },
          subjectId: {
            type: Type.STRING,
            description: 'Exact subject id from the supplied subjects list.',
          },
          checklistItemId: {
            type: Type.STRING,
            description: 'Matching checklist item id, or empty string if general review.',
          },
          title: { type: Type.STRING, description: 'Short study task title in Korean.' },
        },
        required: ['date', 'startTime', 'endTime', 'subjectId', 'title'],
      },
    },
  },
  required: ['rationale', 'blocks'],
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '허용되지 않는 요청 방식입니다.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { model, prompt, apiKey: clientApiKey } = body;

    const resolvedKey =
      (typeof clientApiKey === 'string' && clientApiKey.trim()) ||
      (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) ||
      '';

    if (!resolvedKey) {
      return res.status(400).json({ error: '서버에 GEMINI_API_KEY가 설정되어 있지 않습니다.' });
    }

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: '유효한 스케줄링 요청 데이터가 없습니다.' });
    }

    const primaryModel =
      (typeof model === 'string' && model.trim()) ||
      process.env.GEMINI_MODEL ||
      'gemini-4-hydrogen';

    const candidateModels = Array.from(
      new Set([primaryModel, 'gemini-4-hydrogen', 'gemini-3.5-flash-lite']),
    );

    const ai = new GoogleGenAI({ apiKey: resolvedKey });
    let lastError = null;

    for (const candidateModel of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: candidateModel,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseJsonSchema: SCHEDULE_RESPONSE_SCHEMA,
            temperature: 0.2,
          },
        });

        const text = response.text?.trim();
        if (text) {
          return res.status(200).json({ text, usedModel: candidateModel });
        }
      } catch (err) {
        lastError = err;
        const msg = String(err?.message || err || '');
        const isRetryableQuotaOrLoad =
          msg.includes('429') ||
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('503') ||
          msg.includes('UNAVAILABLE');
        if (!isRetryableQuotaOrLoad) {
          break;
        }
      }
    }

    const rawMsg = String(lastError?.message || lastError || 'AI 호출 중 오류가 발생했습니다.');
    if (rawMsg.includes('429') || rawMsg.includes('RESOURCE_EXHAUSTED')) {
      return res.status(429).json({
        error:
          '현재 선택한 모델의 API 무료 호출 한도(Quota)를 초과했습니다. 잠시 후 다시 시도하거나 Gemini 4 Hydrogen / 3.5 Flash-Lite 모델을 선택해 주세요.',
      });
    }
    return res.status(500).json({ error: 'AI 스케줄 생성 요청 처리 중 오류가 발생했습니다.' });
  } catch {
    return res.status(500).json({ error: '서버에서 AI 스케줄을 생성하는 중 오류가 발생했습니다.' });
  }
}
