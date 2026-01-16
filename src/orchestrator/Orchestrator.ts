import { Task, TaskType, TaskPriority } from '../types/task.js';
import { Planner } from '../planner/Planner.js';
import { ClaudeCodeAdapter } from '../agents/claude/ClaudeCodeAdapter.js';
import { AgentType } from '../types/agent.js';
import { Skill, generateSkillPrompt } from '../skills/SkillLoader.js';
import chalk from 'chalk';
import path from 'path';
import { logAgentResult } from '../utils/agentResultLogger.js';

export interface PermissionRequest {
  id: string;
  type: 'file_write' | 'file_edit' | 'bash' | 'unknown';
  description: string;
  rawText: string;
}

export interface RunOptions {
  planner?: string;
  executor?: string;
  skills?: Skill[];
  yoloMode?: boolean;
}

export interface ExecutionCallbacks {
  onLog?: (message: string) => void;
  onPlanCreated?: (plan: any) => void;
  onPlannerOutput?: (chunk: string) => void;
  onSubtaskStart?: (subtaskId: string, title: string) => void;
  onSubtaskComplete?: (subtaskId: string, result: any) => void;
  onSubtaskFail?: (subtaskId: string, error: string) => void;
  onPermissionRequest?: (request: PermissionRequest, respond: (allow: boolean) => void) => void;
}
export class Orchestrator {
  private planner: Planner;
  private agents: Map<AgentType, any>;
  private abortController: AbortController | null = null;
  private workspaceRoot: string = process.cwd();

  constructor() {
    this.planner = new Planner();
    this.agents = new Map();

    // Register Agents
    this.agents.set(AgentType.CLAUDE, new ClaudeCodeAdapter());
    this.agents.set(AgentType.CODEX, new ClaudeCodeAdapter());
    this.agents.set(AgentType.GEMINI, new ClaudeCodeAdapter());
  }

  setWorkspaceRoot(root: string) {
    this.workspaceRoot = root;
  }

  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  async planTask(description: string, options: { planner?: string; executor?: string; skills?: Skill[] }): Promise<any> {
    const task: Task = {
      id: `task-${Date.now()}`,
      type: TaskType.CODE_GENERATION,
      description,
      priority: TaskPriority.MEDIUM,
      createdAt: new Date()
    };

    const plan = await this.planner.createPlan(task, {
      plannerAgent: options.planner,
      executorAgent: options.executor,
      skills: options.skills,
      workspaceRoot: this.workspaceRoot
    });
    return plan;
  }

  async executePlan(planId: string): Promise<void> {
     // Placeholder
  }
  
  cancel(): void {
    if (this.abortController) {
        console.log('[Orchestrator] Cancelling execution...');
        this.abortController.abort();
        this.abortController = null;
    }
  }

  async runFullFlow(
    description: string,
    options: RunOptions = {},
    callbacks?: ExecutionCallbacks
  ): Promise<void> {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    const log = (msg: string) => {
        console.log(msg);
        callbacks?.onLog?.(msg);
    };

    const task: Task = {
        id: `task-${Date.now()}`,
        type: TaskType.CODE_GENERATION,
        description,
        priority: TaskPriority.MEDIUM,
        createdAt: new Date()
    };

    try {
        if (signal.aborted) throw new Error('Cancelled');

            // 1. Plan
            log(`[Orchestrator] Planning task: "${description}" in ${this.workspaceRoot}...`);
            log(`[Orchestrator] Planner: ${options.planner || 'claude'}, Executor: ${options.executor || 'claude'}`);
            if (options.skills && options.skills.length > 0) {
                log(`[Orchestrator] Active Skills: ${options.skills.map(s => s.name).join(', ')}`);
            }
            const plan = await this.planner.createPlan(task, {
                plannerAgent: options.planner,
                executorAgent: options.executor,
                skills: options.skills,
                onOutput: (chunk) => {
                    callbacks?.onPlannerOutput?.(chunk);
                },
                workspaceRoot: this.workspaceRoot
            });
            
            if (signal.aborted) throw new Error('Cancelled');        
        log(`[Orchestrator] Plan created with ${plan.subtasks.length} subtasks.`);
        callbacks?.onPlanCreated?.(plan); 
        
        // 2. Execute
        log(`[Orchestrator] Starting Execution...`);
        
        for (const subtask of plan.subtasks) {
            if (signal.aborted) throw new Error('Cancelled');

            const agent = this.agents.get(subtask.agent);
            if (!agent) {
                const err = `Agent ${subtask.agent} not found!`;
                log(`[Error] ${err}`);
                callbacks?.onSubtaskFail?.(subtask.id, err);
                continue;
            }

            log(`> Running Subtask: ${subtask.title} (${subtask.agent})`);
            callbacks?.onSubtaskStart?.(subtask.id, subtask.title);
            
            // Override console.log
            const originalLog = console.log;
            console.log = (msg: string) => {
                originalLog(msg);
                callbacks?.onLog?.(msg);
            };

            try {
                const result = await agent.execute({
                    subtaskId: subtask.id,
                    taskDescription: subtask.description,
                    contextFiles: subtask.inputContextFiles,
                    outputFile: path.resolve(this.workspaceRoot, subtask.outputFile),
                    workspaceRoot: this.workspaceRoot,
                    onOutput: (chunk: string) => {
                        callbacks?.onLog?.(chunk.trimEnd());
                    },
                    onPermissionRequest: (request: PermissionRequest, respond: (allow: boolean) => void) => {
                        if (options?.yoloMode) {
                            log(`[Orchestrator] YOLO mode auto-approved permission: ${request.type} - ${request.description}`);
                            respond(true);
                            return;
                        }
                        callbacks?.onPermissionRequest?.(request, respond);
                    },
                    abortSignal: signal
                });

                try {
                    await logAgentResult({
                        agent: subtask.agent,
                        subtaskId: subtask.id,
                        subtaskTitle: subtask.title,
                        status: result.status === 'success' ? 'success' : 'failure',
                        outputFile: result.outputFile,
                        error: result.error
                    });
                } catch (logErr: any) {
                    log(`[LogError] Failed to record agent result: ${logErr.message}`);
                }

                if (result.status === 'success') {
                    log(`  ✓ Completed in ${result.executionTimeMs}ms`);
                    callbacks?.onSubtaskComplete?.(subtask.id, result);
                } else {
                    const err = result.error || 'Unknown error';
                    log(`  ✗ Failed: ${err}`);
                    callbacks?.onSubtaskFail?.(subtask.id, err);
                    break; 
                }
            } catch (execError: any) {
                try {
                    await logAgentResult({
                        agent: subtask.agent,
                        subtaskId: subtask.id,
                        subtaskTitle: subtask.title,
                        status: 'failure',
                        error: execError.message
                    });
                } catch (logErr: any) {
                    log(`[LogError] Failed to record agent result: ${logErr.message}`);
                }
                throw execError;
            } finally {
                console.log = originalLog;
            }
        }
        
        log('All tasks completed!');

    } catch (error: any) {
        if (error.message === 'Cancelled' || error.name === 'AbortError') {
            log('🛑 Execution cancelled.');
        } else {
            throw error;
        }
    } finally {
        this.abortController = null;
    }
  }
}
