import { Task } from '../types/task.js';
import { Plan, Subtask } from '../types/plan.js';
import { AgentType } from '../types/agent.js';
import { randomUUID } from 'crypto';

export class Planner {
  async createPlan(task: Task, preferredAgent?: string): Promise<Plan> {
    console.log(`[Planner] Analyzing task: "${task.description}"...`);

    // TODO: In real implementation, this calls Claude/Gemini to generate the plan.
    // For prototype, we generate a static 2-step plan.

    const planId = `plan-${Date.now()}`;
    const subtasks: Subtask[] = [
      {
        id: randomUUID(),
        title: 'Analyze Requirements',
        description: `Analyze the requirements for: ${task.description}`,
        agent: AgentType.GEMINI, // Analysis usually goes to Gemini
        priority: 1,
        inputContextFiles: task.contextFiles || [],
        outputFile: `.ai-al-gaib/contexts/${task.id}/results/1-analysis.md`,
        dependencies: [],
        status: 'pending'
      },
      {
        id: randomUUID(),
        title: 'Implement Solution',
        description: `Implement the solution based on analysis.`,
        agent: (preferredAgent as AgentType) || AgentType.CLAUDE, // Code gen to Claude
        priority: 2,
        inputContextFiles: [`.ai-al-gaib/contexts/${task.id}/results/1-analysis.md`],
        outputFile: `.ai-al-gaib/contexts/${task.id}/results/2-implementation.md`,
        dependencies: [`${planId}-1`],
        status: 'pending'
      }
    ];

    return {
      id: planId,
      taskId: task.id,
      subtasks,
      estimatedTokens: 5000,
      createdAt: new Date()
    };
  }
}
