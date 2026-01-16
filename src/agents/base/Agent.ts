import { AgentResult, AgentType } from '../../types/agent.js';

export interface PermissionRequest {
  id: string;
  type: 'file_write' | 'file_edit' | 'bash' | 'unknown';
  description: string;
  rawText: string;
}

export interface AgentExecutionRequest {
  subtaskId: string;
  taskDescription: string;
  contextFiles: string[];
  outputFile: string;
  workspaceRoot?: string;
  onOutput?: (chunk: string) => void;
  onPermissionRequest?: (request: PermissionRequest, respond: (allow: boolean) => void) => void;
  abortSignal?: AbortSignal; // For cancellation
}

export abstract class Agent {
  abstract readonly type: AgentType;

  abstract execute(request: AgentExecutionRequest): Promise<AgentResult>;
}
