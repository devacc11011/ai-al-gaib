import fs from 'fs-extra';
import path from 'path';
import { spawn } from 'child_process';
import { logger } from '../utils/logger.js';
import { logCliCommand } from '../utils/cliLogger.js';

const PROJECT_PROMPT_INSTRUCTIONS = `
You are a senior software engineer agent responsible for project kick-off alignment and working-agreement definition. Before writing or modifying any code, you must establish project-specific rules through questions so that every downstream agent can work safely and consistently.

Core principles:
1. Do not assume or invent requirements.
2. Never force generic best practices unless the user explicitly accepts them.
3. Treat every uncertainty as a question for the user.
4. Do not finalize any rules without explicit user confirmation.

Primary goals:
1. Collect project-specific working rules via targeted questions.
2. Convert the answers into explicit rules that every agent will follow.

Questioning guidelines:
- Use the following categories and keep each batch of questions tightly related: project nature, technology stack, architecture & structure, conventions & style, testing strategy, scope & risk, verification & completion criteria.
- Ask only a few related questions at a time so the user can respond comfortably.
- Whenever possible, provide multiple-choice options that match realistic scenarios.
- If the user does not answer, offer reasonable options and ask them to choose.
- Clarify ambiguous answers with follow-up questions instead of guessing.

Required categories and example topics:
1. Project Nature: new vs. existing, experimental vs. production vs. long-term maintenance, priority between speed and quality.
2. Technology Stack: languages/frameworks, single vs. multi-stack, specific language/runtime versions.
3. Architecture & Structure: layered vs. MVC vs. clean vs. free-form, required directory structure.
4. Conventions & Style: whether to strictly follow existing style, naming conventions, formatters/linters.
5. Testing Strategy: whether tests are mandatory, expected test level (unit/integration/E2E), whether failing tests block delivery.
6. Scope & Risk: maximum scope per agent, areas requiring human review (DB, security, auth, payments, etc.), whether automatic refactors are allowed.
7. Verification & Completion: commands that must run (lint/test/build/typecheck/etc.), differences between local and CI environments.

After gathering sufficient answers, produce the final deliverable with the exact sections and order:
1. Confirmation Question List (only if more answers are needed; otherwise skip this section).
2. Temporary Assumptions (only if absolutely necessary and clearly labeled).
3. Project Working Rules (explicit, numbered, actionable rules tailored to this project).
4. Scope Guardrails (list of allowed areas, forbidden areas, and conditional areas).
5. Start & Completion Criteria (conditions required before starting work and checks required before declaring success).

Rules for output:
- Producing rules without user input is forbidden. If answers are missing, ask questions instead of inventing guidelines.
- Keep the writing direct and implementation-ready—avoid abstract language.
- Highlight any blockers or unanswered questions clearly so humans can respond.
`;

export interface ProjectPromptRequest {
  projectName: string;
  projectDescription: string;
  agent: 'claude' | 'gemini' | 'codex';
  workspaceRoot: string;
}

export interface ProjectPromptResult {
  success: boolean;
  path?: string;
  error?: string;
}

export class ProjectPromptBuilder {
  async build(request: ProjectPromptRequest, onLog?: (msg: string) => void): Promise<ProjectPromptResult> {
    const log = (msg: string) => {
      logger.info(`[ProjectPromptBuilder] ${msg}`);
      onLog?.(msg);
    };

    const { projectName, projectDescription, agent, workspaceRoot } = request;

    if (!workspaceRoot) {
      return { success: false, error: 'Workspace root not set' };
    }

    const prompt = this.composePrompt(projectName, projectDescription);
    log(`Generating project prompt for "${projectName}" using ${agent}...`);

    try {
      let output = '';

      if (agent === 'claude') {
        output = await this.runClaude(prompt, workspaceRoot, log);
      } else if (agent === 'gemini') {
        output = await this.runGemini(prompt, workspaceRoot, log);
      } else if (agent === 'codex') {
        output = await this.runCodex(prompt, workspaceRoot, log);
      } else {
        return { success: false, error: `Unsupported agent: ${agent}` };
      }

      if (!output.trim()) {
        return { success: false, error: 'Agent returned empty response' };
      }

      const cleaned = this.cleanOutput(output);
      const outputPath = path.join(workspaceRoot, 'PROJECT_PROMPT.md');
      await fs.writeFile(outputPath, cleaned, 'utf-8');
      log(`Project prompt saved to ${outputPath}`);

      return { success: true, path: outputPath };
    } catch (error: any) {
      log(`Error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  private composePrompt(projectName: string, projectDescription: string): string {
    const description = projectDescription.trim() || 'No additional description provided.';
    return `
${PROJECT_PROMPT_INSTRUCTIONS}

Project context for you:
- Name: ${projectName}
- Summary: ${description}

Begin by producing the first batch of clarification questions grouped by the categories above. Once answers arrive, continue iterating until you can output the final deliverable in the required order.`;
  }

  private cleanOutput(content: string): string {
    let cleaned = content.trim();
    if (cleaned.startsWith('```markdown')) {
      cleaned = cleaned.slice('```markdown'.length);
    } else if (cleaned.startsWith('```md')) {
      cleaned = cleaned.slice('```md'.length);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
    return cleaned.trim();
  }

  private async runClaude(prompt: string, cwd: string, log: (msg: string) => void): Promise<string> {
    return new Promise((resolve, reject) => {
      logCliCommand(['claude', '-p', '-', '--dangerously-skip-permissions'], cwd);
      const child = spawn('claude', ['-p', '-', '--dangerously-skip-permissions'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd,
        env: { ...process.env, PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin` }
      });

      child.stdin.write(prompt);
      child.stdin.end();

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        stdout += text;
        const preview = text.slice(0, 120).replace(/\n/g, ' ');
        log(`[Claude] ${preview}${text.length > 120 ? '...' : ''}`);
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Claude exited with code ${code}: ${stderr}`));
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    });
  }

  private async runGemini(prompt: string, cwd: string, log: (msg: string) => void): Promise<string> {
    return new Promise((resolve, reject) => {
      logCliCommand(['gemini', '-p', prompt], cwd);
      const child = spawn('gemini', ['-p', prompt], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd,
        env: { ...process.env, PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin` }
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        stdout += text;
        const preview = text.slice(0, 120).replace(/\n/g, ' ');
        log(`[Gemini] ${preview}${text.length > 120 ? '...' : ''}`);
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Gemini exited with code ${code}: ${stderr}`));
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    });
  }

  private async runCodex(prompt: string, cwd: string, log: (msg: string) => void): Promise<string> {
    return new Promise((resolve, reject) => {
      logCliCommand(['codex', '-q', prompt], cwd);
      const child = spawn('codex', ['-q', prompt], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd,
        env: { ...process.env, PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin` }
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        stdout += text;
        const preview = text.slice(0, 120).replace(/\n/g, ' ');
        log(`[Codex] ${preview}${text.length > 120 ? '...' : ''}`);
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Codex exited with code ${code}: ${stderr}`));
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    });
  }
}
