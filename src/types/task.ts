export enum TaskType {
  CODE_GENERATION = 'code_generation',
  REFACTORING = 'refactoring',
  ANALYSIS = 'analysis',
  DOCUMENTATION = 'documentation',
  TESTING = 'testing',
}

export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface Task {
  id: string;
  type: TaskType;
  description: string;
  priority: TaskPriority;
  contextFiles?: string[];
  constraints?: string[];
  createdAt: Date;
}
