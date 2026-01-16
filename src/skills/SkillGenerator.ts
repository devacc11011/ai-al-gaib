import fs from 'fs-extra';
import path from 'path';
import { spawn } from 'child_process';
import { logger } from '../utils/logger.js';
import { logCliCommand } from '../utils/cliLogger.js';

// Skill documentation references for prompt injection
const SKILL_DOCS = {
  claude: `
## Claude Code Skills Documentation Reference

Skills are markdown files that extend Claude's capabilities. Key points:

### File Structure
- Location: \`.claude/skills/{skill-name}/SKILL.md\`
- Format: Markdown with YAML frontmatter

### Required Format
\`\`\`markdown
---
name: skill-name
description: Clear description of what the skill does and when to use it (max 1024 chars)
---

# Skill Name

## Instructions
Step-by-step instructions for Claude to follow.

## Examples
Concrete usage examples.
\`\`\`

### Frontmatter Fields
- \`name\`: Required. Lowercase, numbers, hyphens only. Max 64 chars.
- \`description\`: Required. Explains purpose and when to use. Max 1024 chars.
- \`allowed-tools\`: Optional. Tools Claude can use without permission (e.g., Read, Grep, Glob)
- \`user-invocable\`: Optional. If true, appears in slash menu. Default: true

### Best Practices
1. Description should include keywords users would naturally say
2. Use step-by-step instructions
3. Include concrete examples
4. Keep instructions focused and specific
`,

  gemini: `
## Gemini CLI Skills Documentation Reference

Agent Skills extend Gemini with specialized knowledge. Key points:

### File Structure
- Location: \`.gemini/skills/{skill-name}/SKILL.md\`
- Format: Markdown with YAML frontmatter

### Required Format
\`\`\`markdown
---
name: unique-name
description: Clear description of what the skill does
---

Actual instructions and workflow content
\`\`\`

### Key Points
- \`description\` is the most important field - Gemini uses it to determine relevance
- Skills are activated when Gemini determines they're relevant to the task
- Can include scripts/, references/, and assets/ subdirectories

### Best Practices
1. Write clear, specific descriptions
2. Include when the skill should be used
3. Provide step-by-step workflows
4. Be specific about expected outputs
`,

  codex: `
## OpenAI Codex Skills Documentation Reference

Skills package instructions and resources for Codex. Key points:

### File Structure
- Location: \`.codex/skills/{skill-name}/SKILL.md\`
- Can include: scripts/, references/, assets/

### Required Format
\`\`\`markdown
---
name: skill-name
description: What the skill does
---

Instructions for Codex to follow
\`\`\`

### Key Points
- Minimum requirement: name and description fields
- Skills can be invoked explicitly or automatically matched
- Can include executable scripts and reference documents

### Best Practices
1. Clear, actionable descriptions
2. Step-by-step instructions
3. Include examples and expected outputs
`
};

const SKILL_DIRS: Record<string, string> = {
  claude: '.claude/skills',
  gemini: '.gemini/skills',
  codex: '.codex/skills',
};

export interface SkillGenerationRequest {
  name: string;
  description: string;
  targetAgent: 'claude' | 'gemini' | 'codex' | 'all';
  generatorAgent: 'claude' | 'gemini' | 'codex';
  workspaceRoot: string;
}

export interface SkillGenerationResult {
  success: boolean;
  path?: string;
  paths?: string[]; // For 'all' target
  error?: string;
}

export class SkillGenerator {
  async generate(
    request: SkillGenerationRequest,
    onLog?: (msg: string) => void
  ): Promise<SkillGenerationResult> {
    const log = (msg: string) => {
      logger.info(`[SkillGenerator] ${msg}`);
      onLog?.(msg);
    };

    const { name, description, targetAgent, generatorAgent, workspaceRoot } = request;

    // Handle 'all' target - generate for all agents
    if (targetAgent === 'all') {
      return this.generateForAllAgents(request, onLog);
    }

    log(`Generating skill "${name}" for ${targetAgent} using ${generatorAgent}...`);

    // Build the prompt with skill documentation
    const skillDocsRef = SKILL_DOCS[targetAgent];
    const prompt = `
You are a skill file generator. Your task is to create a well-structured SKILL.md file.

${skillDocsRef}

---

Create a SKILL.md file for the following:
- Skill Name: ${name}
- Target Agent: ${targetAgent}
- Purpose: ${description}

Requirements:
1. Output ONLY the SKILL.md file content, nothing else
2. Use proper YAML frontmatter with name and description
3. Include clear step-by-step instructions
4. Include practical examples if applicable
5. Make the description keyword-rich for automatic matching
6. Follow the exact format specified in the documentation above

Generate the complete SKILL.md content now:
`;

    try {
      let skillContent = '';

      if (generatorAgent === 'claude') {
        log('Running Claude CLI to generate skill...');
        skillContent = await this.runClaude(prompt, workspaceRoot, log);
      } else if (generatorAgent === 'gemini') {
        log('Running Gemini CLI to generate skill...');
        skillContent = await this.runGemini(prompt, workspaceRoot, log);
      } else if (generatorAgent === 'codex') {
        log('Running Codex CLI to generate skill...');
        skillContent = await this.runCodex(prompt, workspaceRoot, log);
      }

      if (!skillContent.trim()) {
        return { success: false, error: 'Generator returned empty content' };
      }

      // Clean up the content (remove markdown code blocks if present)
      skillContent = this.cleanSkillContent(skillContent);

      // Ensure skill directory exists
      const skillDir = path.join(workspaceRoot, SKILL_DIRS[targetAgent], name);
      await fs.ensureDir(skillDir);

      // Write SKILL.md
      const skillPath = path.join(skillDir, 'SKILL.md');
      await fs.writeFile(skillPath, skillContent);

      log(`Skill file created at: ${skillPath}`);

      return { success: true, path: skillPath };

    } catch (error: any) {
      log(`Error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  private async generateForAllAgents(
    request: SkillGenerationRequest,
    onLog?: (msg: string) => void
  ): Promise<SkillGenerationResult> {
    const log = (msg: string) => {
      logger.info(`[SkillGenerator] ${msg}`);
      onLog?.(msg);
    };

    const agents: Array<'claude' | 'gemini' | 'codex'> = ['claude', 'gemini', 'codex'];
    log('Target "all" selected - generating skills for all agents.');

    const paths: string[] = [];

    for (const agent of agents) {
      log(`Starting generation for agent: ${agent}`);

      const result = await this.generate(
        { ...request, targetAgent: agent },
        onLog
      );

      if (!result.success || !result.path) {
        const error = result.error || `Skill generation failed for agent: ${agent}`;
        log(error);
        return { success: false, error };
      }

      paths.push(result.path);
      log(`Completed generation for agent: ${agent}`);
    }

    return { success: true, paths };
  }

  private cleanSkillContent(content: string): string {
    // Remove markdown code block wrapper if present
    let cleaned = content.trim();

    // Remove ```markdown or ``` at start
    if (cleaned.startsWith('```markdown')) {
      cleaned = cleaned.slice('```markdown'.length);
    } else if (cleaned.startsWith('```md')) {
      cleaned = cleaned.slice('```md'.length);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }

    // Remove ``` at end
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
        // Log progress (truncated)
        const preview = text.slice(0, 100).replace(/\n/g, ' ');
        log(`[Claude] ${preview}${text.length > 100 ? '...' : ''}`);
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
        const preview = text.slice(0, 100).replace(/\n/g, ' ');
        log(`[Gemini] ${preview}${text.length > 100 ? '...' : ''}`);
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
      // Codex CLI - adjust command as needed
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
        const preview = text.slice(0, 100).replace(/\n/g, ' ');
        log(`[Codex] ${preview}${text.length > 100 ? '...' : ''}`);
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
