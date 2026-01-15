import { Task, TaskType, TaskPriority } from '../types/task.js';
import { Planner } from '../planner/Planner.js';
import { ClaudeCodeAdapter } from '../agents/claude/ClaudeCodeAdapter.js';
import { AgentType } from '../types/agent.js';
import chalk from 'chalk';
import path from 'path';

export class Orchestrator {
  private planner: Planner;
  private agents: Map<AgentType, any>;

  constructor() {
    this.planner = new Planner();
    this.agents = new Map();
    
    // Register Agents
    this.agents.set(AgentType.CLAUDE, new ClaudeCodeAdapter());
    // TODO: Register Codex and Gemini adapters
    // Mocking Gemini as Claude for now to make the prototype work without crashing
    this.agents.set(AgentType.GEMINI, new ClaudeCodeAdapter()); 
  }

  async planTask(description: string, options: { planner?: string }): Promise<string> {
    const task: Task = {
      id: `task-${Date.now()}`,
      type: TaskType.CODE_GENERATION, // Default
      description,
      priority: TaskPriority.MEDIUM,
      createdAt: new Date()
    };

    const plan = await this.planner.createPlan(task, options.planner);
    
    console.log(chalk.green('\nPlan Created Successfully!'));
    console.log(`Plan ID: ${plan.id}`);
    console.log('Subtasks:');
    plan.subtasks.forEach(st => {
      console.log(`  - [${st.agent}] ${st.title}`);
    });

    return plan.id;
  }

  // Very simplified execution logic
  async executePlan(planId: string): Promise<void> {
      console.log(chalk.yellow('\n[Orchestrator] Executing Plan: ${planId}'));
      // In a real app, we would load the Plan object from DB/File using planId
      // Here we just re-create a dummy plan or fail.
      // For the prototype to be interactive, I should probably return the Plan object in step 1 
      // and pass it here, or save it to a file.
      
      console.log(chalk.red('Error: Plan persistence not implemented yet.'));
      console.log('Use "plan" command to see the planning phase.');
  }
  
  // Helper to run the full flow for demonstration
  async runFullFlow(description: string, options: { planner?: string }): Promise<void> {
    const task: Task = {
        id: `task-${Date.now()}`,
        type: TaskType.CODE_GENERATION,
        description,
        priority: TaskPriority.MEDIUM,
        createdAt: new Date()
    };

    // 1. Plan
    const plan = await this.planner.createPlan(task, options.planner);
    
    // 2. Execute
    console.log(chalk.green(`\n[Orchestrator] Starting Execution of ${plan.subtasks.length} subtasks...`));
    
    for (const subtask of plan.subtasks) {
        const agent = this.agents.get(subtask.agent);
        if (!agent) {
            console.error(`Agent ${subtask.agent} not found!`);
            continue;
        }

        console.log(chalk.blue(`\n> Running Subtask: ${subtask.title} (${subtask.agent})`));
        
        const result = await agent.execute({
            subtaskId: subtask.id,
            taskDescription: subtask.description,
            contextFiles: subtask.inputContextFiles,
            outputFile: path.resolve(process.cwd(), subtask.outputFile)
        });

        if (result.status === 'success') {
            console.log(chalk.green(`  ✓ Completed in ${result.executionTimeMs}ms`));
            console.log(chalk.gray(`    Output: ${result.outputFile}`));
        } else {
            console.log(chalk.red(`  ✗ Failed: ${result.error}`));
            break; // Stop on failure
        }
    }
    
    console.log(chalk.green('\nAll tasks completed!'));
  }
}
