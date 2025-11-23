import { ZHIPU_API_KEY, ZHIPU_API_URL } from '../constants';
import { Message } from '../types';

export interface StreamChunk {
  content: string;
  reasoning: string;
}

export async function* streamCompletion(
  messages: Message[],
  modelId: string
): AsyncGenerator<StreamChunk, void, unknown> {
  const response = await fetch(ZHIPU_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ZHIPU_API_KEY}`
    },
    body: JSON.stringify({
      model: modelId,
      // Pass full history but sanitize to only role/content to avoid API errors
      messages: messages.map(m => ({ 
        role: m.role, 
        content: m.content 
      })),
      stream: true,
      temperature: modelId.includes('4.5') ? 0.6 : 0.7, // Slightly lower temp for reasoning
      top_p: 0.95,
      max_tokens: 8192, 
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API Error: ${response.status} - ${errorBody}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response body is not readable');

  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    
    // Process all complete lines
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;

      const dataStr = trimmed.replace('data: ', '');
      if (dataStr === '[DONE]') return;

      try {
        const json = JSON.parse(dataStr);
        const delta = json.choices[0]?.delta;
        
        if (delta) {
          yield {
            content: delta.content || '',
            // Check for reasoning content (common in modern reasoning models)
            // If the API returns <think> tags in content, we might handle that in UI, 
            // but standard "reasoning" field is preferable if available.
            reasoning: delta.reasoning_content || '' 
          };
        }
      } catch (e) {
        console.warn('Failed to parse SSE message:', e);
      }
    }
  }
}