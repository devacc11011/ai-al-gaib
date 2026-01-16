import { Task } from '../types/task.js';
import { Plan, Subtask } from '../types/plan.js';
import { AgentType } from '../types/agent.js';
import { randomUUID } from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import { spawn } from 'child_process';
import { execa } from 'execa';
import { logger } from '../utils/logger.js';

export class Planner {
  async createPlan(task: Task, plannerAgent: string = 'claude', onOutput?: (chunk: string) => void): Promise<Plan> {
    const log = (msg: string) => {
        onOutput?.(`[Planner] ${msg}\n`);
        logger.info(`[Planner] ${msg}`);
    };
    log(`Generating plan using ${plannerAgent}...`);
    
    const planId = `plan-${Date.now()}`;
    const contextDir = path.resolve(process.cwd(), `.ai-al-gaib/contexts/${task.id}`);
    await fs.ensureDir(contextDir);

    const prompt = `
You are an expert AI Planner.
Your goal is to break down the user's request into a series of subtasks.
The available agents are:
- 'claude': Best for complex coding, refactoring, architecture.
- 'codex': Best for simple code generation, unit tests.
- 'gemini': Best for analysis, reading files, summarization.

User Request: "${task.description}"

Output Format (JSON only, no explanation):
\`\`\`json
{
  "subtasks": [
    {
      "title": "Short title of subtask",
      "description": "Detailed description of what to do",
      "agent": "claude|codex|gemini"
    }
  ]
}
\`\`\`
`;

    const instructionFile = path.join(contextDir, 'planning-instruction.md');
    await fs.writeFile(instructionFile, prompt);
    let rawOutput = '';

    try {
        if (plannerAgent === 'claude') {
            const cmdLog = `Running command: claude -p "${prompt.replace(/\n/g, ' ')}"`;
            log(cmdLog);

            // Claude Code CLI with streaming (using spawn for compatibility)
            // Use stdin to pass prompt safely (avoids shell escaping issues)
            log(`[DEBUG] Starting subprocess with spawn...`);

            rawOutput = await new Promise<string>((resolve, reject) => {
                const child = spawn('claude', ['-p', '-', '--dangerously-skip-permissions'], {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    env: { ...process.env, PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin` }
                });

                // Write prompt to stdin
                child.stdin.write(prompt);
                child.stdin.end();

                let stdout = '';
                let stderr = '';

                child.stdout.on('data', (chunk) => {
                    const text = chunk.toString();
                    stdout += text;
                    logger.info(`[Planner:stdout] ${text}`);
                    onOutput?.(text);
                });

                child.stderr.on('data', (chunk) => {
                    const text = chunk.toString();
                    stderr += text;
                    logger.info(`[Planner:stderr] ${text}`);
                    onOutput?.(`[Stderr] ${text}`);
                });

                child.on('close', (code) => {
                    logger.info(`[Planner] Process exited with code: ${code}`);
                    logger.info(`[Planner] stdout length: ${stdout.length}, stderr length: ${stderr.length}`);
                    if (code === 0) {
                        resolve(stdout);
                    } else {
                        reject(new Error(`Process exited with code ${code}: ${stderr}`));
                    }
                });

                child.on('error', (err) => {
                    logger.error(`[Planner] Spawn error: ${err.message}`);
                    reject(err);
                });
            });

            log(`CLI execution completed. Output length: ${rawOutput?.length || 0}`);

        } else if (plannerAgent === 'gemini') {
            const { stdout } = await execa('gcloud', ['ai', 'generate', '--prompt-file', instructionFile]);
            rawOutput = stdout;
        } else if (plannerAgent === 'codex') {
            const { stdout } = await execa('gh', ['copilot', 'suggest', '-t', 'shell', fs.readFileSync(instructionFile, 'utf-8')]);
            rawOutput = stdout;
        } else {
             throw new Error(`Unknown planner agent: ${plannerAgent}`);
        }
    } catch (error: any) {
        log(`CLI execution failed: ${error.message}`);
        log(`Falling back to Mock Planner Logic.`);
        return this.fallbackPlan(task, planId, contextDir, onOutput);
    }

    let parsedPlan;
    try {
        const jsonMatch = rawOutput.match(/```json([\s\S]*?)```/) || rawOutput.match(/```([\s\S]*?)```/) || [null, rawOutput];
        const jsonString = jsonMatch[1]?.trim() || rawOutput.trim();
        parsedPlan = JSON.parse(jsonString);
    } catch (e) {
        log(`Failed to parse JSON response. Raw output:\n${rawOutput}`);
        throw new Error('Planner failed to generate a valid JSON plan.');
    }

    const subtasks: Subtask[] = parsedPlan.subtasks.map((st: any, index: number) => {
        // Support various field names that LLM might use
        const title = st.title || st.name || st.task?.slice(0, 50) || `Subtask ${index + 1}`;
        const description = st.description || st.task || st.instruction || st.details || '';
        const agent = st.agent || 'claude';

        logger.info(`[Planner] Parsed subtask ${index + 1}: title="${title}", agent="${agent}"`);

        return {
            id: randomUUID(),
            title,
            description,
            agent,
            priority: index + 1,
            inputContextFiles: index === 0 ? [] : [`.ai-al-gaib/contexts/${task.id}/results/${index}-result.md`],
            outputFile: st.outputFile || `.ai-al-gaib/contexts/${task.id}/results/${index + 1}-result.md`,
            dependencies: index === 0 ? [] : [`prev-task`],
            status: 'pending'
        };
    });

    return {
      id: planId,
      taskId: task.id,
      subtasks,
      estimatedTokens: 0,
      createdAt: new Date()
    };
  }

  private async fallbackPlan(task: Task, planId: string, contextDir: string, onOutput?: (chunk: string) => void): Promise<Plan> {
      onOutput?.(`[Fallback] Generating static plan for prototype safety.\n`);
      
      const subtasks: Subtask[] = [
        {
            id: randomUUID(),
            title: `Analyze: ${task.description.slice(0, 20)}...`,
            description: `Analyze the user request: ${task.description}`,
            agent: AgentType.GEMINI,
            priority: 1,
            inputContextFiles: [],
            outputFile: `.ai-al-gaib/contexts/${task.id}/results/1-analysis.md`,
            dependencies: [],
            status: 'pending'
        },
        {
            id: randomUUID(),
            title: `Execute: ${task.description.slice(0, 20)}...`,
            description: `Implement based on analysis: ${task.description}`,
            agent: AgentType.CLAUDE,
            priority: 2,
            inputContextFiles: [`.ai-al-gaib/contexts/${task.id}/results/1-analysis.md`],
            outputFile: `.ai-al-gaib/contexts/${task.id}/results/2-result.md`,
            dependencies: [],
            status: 'pending'
        }
      ];
      return { id: planId, taskId: task.id, subtasks, estimatedTokens: 0, createdAt: new Date() };
  }
}
