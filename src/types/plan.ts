import { AgentType } from './agent.js';

export interface Plan {
  id: string;
  taskId: string;
  subtasks: Subtask[];
  estimatedTokens: number;
  createdAt: Date;
}

export interface Subtask {
  id: string;
  title: string;
  description: string;
  agent: AgentType;
  priority: number;
  inputContextFiles: string[];
  outputFile: string;
  dependencies: string[]; // IDs of subtasks that must complete first
  status: 'pending' | 'running' | 'completed' | 'failed';
}
