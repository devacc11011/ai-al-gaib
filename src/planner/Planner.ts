import { Task } from '../types/task.js';
import { Plan, Subtask } from '../types/plan.js';
import { AgentType } from '../types/agent.js';
import { randomUUID } from 'crypto';

export class Planner {
  async createPlan(task: Task, preferredPlanner?: string): Promise<Plan> {
    console.log(`[Planner] Analyzing task: "${task.description}"...`);

    // Simple heuristic for prototype:
    // If task contains "read" or "analyze", make an analysis task.
    // If task contains "create" or "implement", make an implementation task.
    
    const planId = `plan-${Date.now()}`;
    const subtasks: Subtask[] = [];
    const isAnalysis = task.description.toLowerCase().includes('read') || task.description.toLowerCase().includes('analyze') || task.description.toLowerCase().includes('check');
    
    // Step 1: Analysis / Reading
    const analysisAgent = (preferredPlanner as AgentType) || AgentType.CLAUDE;

    subtasks.push({
        id: randomUUID(),
        title: isAnalysis ? `Read/Analyze: ${task.description}` : 'Analyze Requirements',
        description: `User Request: ${task.description}\nAction: Analyze the request and required context.`,
        agent: analysisAgent,
        priority: 1,
        inputContextFiles: task.contextFiles || [],
        outputFile: `.ai-al-gaib/contexts/${task.id}/results/1-analysis.md`,
        dependencies: [],
        status: 'pending'
    });

    // Step 2: Implementation (only if it looks like a modification task)
    if (!isAnalysis || task.description.toLowerCase().includes('and') || task.description.toLowerCase().includes('create')) {
        subtasks.push({
            id: randomUUID(),
            title: `Execute: ${task.description}`,
            description: `Based on analysis, implement: ${task.description}`,
            agent: AgentType.CLAUDE,
            priority: 2,
            inputContextFiles: [`.ai-al-gaib/contexts/${task.id}/results/1-analysis.md`],
            outputFile: `.ai-al-gaib/contexts/${task.id}/results/2-result.md`,
            dependencies: [],
            status: 'pending'
        });
    }

    return {
      id: planId,
      taskId: task.id,
      subtasks,
      estimatedTokens: 5000,
      createdAt: new Date()
    };
  }
}
