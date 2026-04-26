export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  visualizationCode?: string;
  timestamp: Date;
}

export interface ChatRequest {
  question: string;
  sessionId: string;
}

export interface ChatResponse {
  answer: string;
  visualizationCode?: string;
}
