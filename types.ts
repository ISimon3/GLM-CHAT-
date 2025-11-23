export enum Role {
  User = 'user',
  Assistant = 'assistant',
  System = 'system'
}

export interface Message {
  id: string;
  role: Role;
  content: string; // The final answer
  reasoning?: string; // The "Thinking" process
  timestamp: number;
}

export interface ModelConfig {
  id: string;
  name: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  systemPrompt?: string; // Optional system prompt for the specific session
  createdAt: number;
}