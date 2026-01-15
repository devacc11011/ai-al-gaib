import { Task, TaskType, TaskPriority } from '../types/task.js';
import { Plan } from '../types/plan.js';
import { Planner } from '../planner/Planner.js';
import { ClaudeCodeAdapter } from '../agents/claude/ClaudeCodeAdapter.js';
import { AgentType } from '../types/agent.js';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';

export interface ExecutionCallbacks {
  onLog?: (message: string) => void;
  onPlanCreated?: (plan: any) => void; // New callback
  onSubtaskStart?: (subtaskId: string, title: string) => void;
  onSubtaskComplete?: (subtaskId: string, result: any) => void;
  onSubtaskFail?: (subtaskId: string, error: string) => void;
}

export class Orchestrator {
  private planner: Planner;
  private agents: Map<AgentType, any>;
  private planStorageDir: string;

  constructor() {
    this.planner = new Planner();
    this.agents = new Map();
    this.planStorageDir = path.resolve(process.cwd(), '.ai-al-gaib', 'plans');
    
    // Register Agents
    this.agents.set(AgentType.CLAUDE, new ClaudeCodeAdapter());
    this.agents.set(AgentType.GEMINI, new ClaudeCodeAdapter()); 
  }
  
  async planTask(
    description: string,
    options: { planner?: string } = {},
    callbacks?: ExecutionCallbacks
  ): Promise<Plan> {
    const task = this.createTask(description);
    const log = (msg: string) => {
      console.log(msg);
      callbacks?.onLog?.(msg);
    };

    log(chalk.cyan(`[Orchestrator] Planning task: "${description}"...`));
    const plan = await this.planner.createPlan(task, options.planner);
    const planPath = await this.persistPlan(plan, task);

    log(chalk.green(`[Orchestrator] Plan ${plan.id} created with ${plan.subtasks.length} subtasks.`));
    log(chalk.green(`[Orchestrator] Saved plan to ${planPath}`));
    callbacks?.onPlanCreated?.(plan);
    return plan;
  }

  async executePlan(
    planIdentifier: string,
    callbacks?: ExecutionCallbacks
  ): Promise<void> {
    const planPath = this.resolvePlanPath(planIdentifier);
    const { plan, task } = await this.loadPlanFromFile(planPath);
    
    const log = (msg: string) => {
      console.log(msg);
      callbacks?.onLog?.(msg);
    };
    log(chalk.cyan(`[Orchestrator] Loaded plan ${plan.id} from ${planPath}`));
    
    await this.executePlanSubtasks(plan, task, callbacks, planPath);
  }
  
  async runFullFlow(
    description: string, 
    options: { planner?: string },
    callbacks?: ExecutionCallbacks
  ): Promise<void> {
    const log = (msg: string) => {
        console.log(msg);
        callbacks?.onLog?.(msg);
    };

    const task = this.createTask(description);

    log(`[Orchestrator] Planning task: "${description}"...`);
    const plan = await this.planner.createPlan(task, options.planner);
    const planPath = await this.persistPlan(plan, task);
    
    log(`[Orchestrator] Plan created with ${plan.subtasks.length} subtasks.`);
    callbacks?.onPlanCreated?.(plan); // Send plan to UI
    
    await this.executePlanSubtasks(plan, task, callbacks, planPath);
  }

  private createTask(description: string): Task {
    return {
      id: `task-${Date.now()}`,
      type: TaskType.CODE_GENERATION,
      description,
      priority: TaskPriority.MEDIUM,
      createdAt: new Date()
    };
  }

  private resolvePlanPath(identifier: string): string {
    const absoluteInput = path.isAbsolute(identifier)
      ? identifier
      : path.resolve(process.cwd(), identifier);

    if (fs.existsSync(absoluteInput)) {
      return absoluteInput;
    }

    const normalizedName = identifier.endsWith('.json') ? identifier : `${identifier}.json`;
    const defaultPath = path.join(this.planStorageDir, normalizedName);
    if (fs.existsSync(defaultPath)) {
      return defaultPath;
    }

    throw new Error(`Plan file not found for identifier: ${identifier}`);
  }

  private async loadPlanFromFile(planPath: string): Promise<{ plan: Plan; task: Task }> {
    const payload = await fs.readJson(planPath);
    if (!payload?.plan || !payload?.task) {
      throw new Error(`Plan file "${planPath}" is missing required data.`);
    }

    const plan: Plan = {
      ...payload.plan,
      createdAt: new Date(payload.plan.createdAt),
      subtasks: payload.plan.subtasks
    };

    const task: Task = {
      ...payload.task,
      createdAt: new Date(payload.task.createdAt)
    };

    return { plan, task };
  }

  private async persistPlan(plan: Plan, task: Task, existingPath?: string): Promise<string> {
    const targetPath = existingPath ?? path.join(this.planStorageDir, `${plan.id}.json`);
    await fs.ensureDir(path.dirname(targetPath));

    const payload = {
      version: 1,
      plan: {
        ...plan,
        createdAt: plan.createdAt.toISOString(),
        subtasks: plan.subtasks
      },
      task: {
        ...task,
        createdAt: task.createdAt.toISOString()
      }
    };

    await fs.writeJson(targetPath, payload, { spaces: 2 });
    return targetPath;
  }

  private async executePlanSubtasks(
    plan: Plan,
    task: Task,
    callbacks?: ExecutionCallbacks,
    planPath?: string
  ): Promise<void> {
    const log = (msg: string) => {
      console.log(msg);
      callbacks?.onLog?.(msg);
    };

    log(`[Orchestrator] Starting Execution for plan ${plan.id}...`);
    let executionFailed = false;
    
    for (const subtask of plan.subtasks) {
        const agent = this.agents.get(subtask.agent);
        if (!agent) {
            const err = `Agent ${subtask.agent} not found!`;
            log(`[Error] ${err}`);
            callbacks?.onSubtaskFail?.(subtask.id, err);
            executionFailed = true;
            break;
        }

        subtask.status = 'running';
        if (planPath) {
          await this.persistPlan(plan, task, planPath);
        }

        log(`> Running Subtask: ${subtask.title} (${subtask.agent})`);
        callbacks?.onSubtaskStart?.(subtask.id, subtask.title);
        
        // Temporarily override console.log to capture agent logs
        const originalLog = console.log;
        console.log = (msg: string) => {
            originalLog(msg);
            callbacks?.onLog?.(msg);
        };

        const result = await agent.execute({
            subtaskId: subtask.id,
            taskDescription: subtask.description,
            contextFiles: subtask.inputContextFiles,
            outputFile: path.resolve(process.cwd(), subtask.outputFile)
        });

        // Restore console.log
        console.log = originalLog;

        if (result.status === 'success') {
            subtask.status = 'completed';
            log(`  ✓ Completed in ${result.executionTimeMs}ms`);
            callbacks?.onSubtaskComplete?.(subtask.id, result);
        } else {
            subtask.status = 'failed';
            const err = result.error || 'Unknown error';
            log(`  ✗ Failed: ${err}`);
            callbacks?.onSubtaskFail?.(subtask.id, err);
            if (planPath) {
              await this.persistPlan(plan, task, planPath);
            }
            executionFailed = true;
            break; 
        }

        if (planPath) {
          await this.persistPlan(plan, task, planPath);
        }
    }
    
    if (executionFailed) {
      log('[Orchestrator] Execution finished with errors.');
    } else {
      log('All tasks completed!');
    }
  }
}
