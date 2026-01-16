import { AgentResult, AgentType } from '../../types/agent.js';

export interface AgentExecutionRequest {
  subtaskId: string;
  taskDescription: string;
  contextFiles: string[];
  outputFile: string;
  onOutput?: (chunk: string) => void; 
  abortSignal?: AbortSignal; // For cancellation
}

export abstract class Agent {
  abstract readonly type: AgentType;

  abstract execute(request: AgentExecutionRequest): Promise<AgentResult>;
}
