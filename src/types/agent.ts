export enum AgentType {
  CLAUDE = 'claude',
  CODEX = 'codex',
  GEMINI = 'gemini',
}

export interface AgentConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AgentResult {
  subtaskId: string;
  agent: AgentType;
  status: 'success' | 'failure';
  outputFile: string;
  tokensUsed: number;
  executionTimeMs: number;
  error?: string;
}
