import fs from 'fs-extra';
import path from 'path';
import { spawn } from 'child_process';
import { logger } from '../utils/logger.js';
import { logCliCommand } from '../utils/cliLogger.js';

export interface Skill {
  name: string;
  description: string;
  agent: 'claude' | 'gemini' | 'codex';
  path: string;
  content: string;
  metadata: Record<string, any>;
}

export interface SkillsByAgent {
  claude: Skill[];
  gemini: Skill[];
  codex: Skill[];
}

// Skill directory paths for each agent (fallback)
const SKILL_DIRS: Record<string, string> = {
  claude: '.claude/skills',
  gemini: '.gemini/skills',
  codex: '.codex/skills',
};

/**
 * Parse SKILL.md file to extract metadata and content
 */
function parseSkillFile(content: string): { metadata: Record<string, any>; body: string } {
  const metadata: Record<string, any> = {};
  let body = content;

  // Check for YAML frontmatter
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (frontmatterMatch) {
    const yamlContent = frontmatterMatch[1];
    body = frontmatterMatch[2];

    // Simple YAML parsing for common fields
    const lines = yamlContent.split('\n');
    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim();
        let value = line.slice(colonIndex + 1).trim();

        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        metadata[key] = value;
      }
    }
  }

  return { metadata, body };
}

/**
 * Load skills from a specific directory for a specific agent
 */
async function loadSkillsFromDir(skillsDir: string, agent: 'claude' | 'gemini' | 'codex'): Promise<Skill[]> {
  const skills: Skill[] = [];

  if (!await fs.pathExists(skillsDir)) {
    return skills;
  }

  try {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(skillsDir, entry.name);

      if (entry.isDirectory()) {
        // Look for SKILL.md in the directory
        const skillFile = path.join(entryPath, 'SKILL.md');
        if (await fs.pathExists(skillFile)) {
          try {
            const content = await fs.readFile(skillFile, 'utf-8');
            const { metadata, body } = parseSkillFile(content);

            skills.push({
              name: metadata.name || entry.name,
              description: metadata.description || '',
              agent,
              path: entryPath,
              content: body,
              metadata,
            });
          } catch (err: any) {
            logger.warn(`Failed to parse skill file ${skillFile}: ${err.message}`);
          }
        }
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        // Single file skill
        try {
          const content = await fs.readFile(entryPath, 'utf-8');
          const { metadata, body } = parseSkillFile(content);

          const skillName = metadata.name || entry.name.replace('.md', '');
          skills.push({
            name: skillName,
            description: metadata.description || '',
            agent,
            path: entryPath,
            content: body,
            metadata,
          });
        } catch (err: any) {
          logger.warn(`Failed to parse skill file ${entryPath}: ${err.message}`);
        }
      }
    }
  } catch (err: any) {
    logger.error(`Failed to read skills directory ${skillsDir}: ${err.message}`);
  }

  return skills;
}

/**
 * Run a CLI command and return stdout
 */
async function runCommand(cmd: string, args: string[], cwd: string, timeout: number = 30000): Promise<string> {
  return new Promise((resolve, reject) => {
    logCliCommand([cmd, ...args], cwd);
    const child = spawn(cmd, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin` }
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      reject(new Error(`Command timed out: ${cmd} ${args.join(' ')}`));
    }, timeout);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return;
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Parse Claude skills list output
 */
function parseClaudeSkillsOutput(output: string, workspaceRoot: string): Skill[] {
  const skills: Skill[] = [];

  // Claude /skills output format varies, try to parse skill names and descriptions
  // Common format: "skill-name - description" or JSON output
  const lines = output.split('\n').filter(line => line.trim());

  for (const line of lines) {
    // Skip header lines or empty
    if (line.startsWith('Available') || line.startsWith('---') || !line.trim()) continue;

    // Try to parse "name - description" format
    const match = line.match(/^\s*[•\-\*]?\s*(\S+)\s*[-–:]\s*(.*)$/);
    if (match) {
      skills.push({
        name: match[1].trim(),
        description: match[2].trim(),
        agent: 'claude',
        path: path.join(workspaceRoot, SKILL_DIRS.claude, match[1].trim()),
        content: '',
        metadata: {}
      });
    } else if (line.trim() && !line.includes(':')) {
      // Just a skill name
      const name = line.trim().replace(/^[•\-\*]\s*/, '');
      if (name && !name.includes(' ')) {
        skills.push({
          name,
          description: '',
          agent: 'claude',
          path: path.join(workspaceRoot, SKILL_DIRS.claude, name),
          content: '',
          metadata: {}
        });
      }
    }
  }

  return skills;
}

/**
 * Parse Gemini skills list output
 */
function parseGeminiSkillsOutput(output: string, workspaceRoot: string): Skill[] {
  const skills: Skill[] = [];

  // gemini skills list output format
  const lines = output.split('\n').filter(line => line.trim());

  for (const line of lines) {
    // Skip headers
    if (line.toLowerCase().includes('available') || line.startsWith('---')) continue;

    // Try "name - description" or "name: description"
    const match = line.match(/^\s*[•\-\*]?\s*(\S+)\s*[-–:]\s*(.*)$/);
    if (match) {
      skills.push({
        name: match[1].trim(),
        description: match[2].trim(),
        agent: 'gemini',
        path: path.join(workspaceRoot, SKILL_DIRS.gemini, match[1].trim()),
        content: '',
        metadata: {}
      });
    }
  }

  return skills;
}

/**
 * Load skills via CLI for a specific agent
 */
async function loadSkillsViaCLI(
  agent: 'claude' | 'gemini' | 'codex',
  workspaceRoot: string
): Promise<Skill[] | null> {
  try {
    let output: string;

    switch (agent) {
      case 'claude':
        // Claude: use /skills command (claude /skills)
        output = await runCommand('claude', ['/skills'], workspaceRoot, 60000);
        return parseClaudeSkillsOutput(output, workspaceRoot);

      case 'gemini':
        // Gemini: ask about skills via prompt
        output = await runCommand('gemini', ['-p', 'List all available skills. Output each skill on a new line in format: skill-name - description. Only output the skill list, nothing else.'], workspaceRoot, 60000);
        return parseGeminiSkillsOutput(output, workspaceRoot);

      case 'codex':
        // Codex: ask about skills via prompt
        output = await runCommand('codex', ['-q', 'List all available skills. Output each skill on a new line in format: skill-name - description. Only output the skill list, nothing else.'], workspaceRoot, 60000);
        return parseGeminiSkillsOutput(output, workspaceRoot); // Similar format

      default:
        return null;
    }
  } catch (err: any) {
    logger.warn(`[SkillLoader] CLI skill loading failed for ${agent}: ${err.message}`);
    return null;
  }
}

/**
 * Load all skills from a workspace for all agents
 * Tries CLI first, falls back to filesystem scan
 */
export async function loadWorkspaceSkills(workspaceRoot: string): Promise<SkillsByAgent> {
  logger.info(`[SkillLoader] Loading skills from workspace: ${workspaceRoot}`);

  const result: SkillsByAgent = {
    claude: [],
    gemini: [],
    codex: [],
  };

  for (const agent of ['claude', 'gemini', 'codex'] as const) {
    // Try CLI first
    logger.info(`[SkillLoader] Attempting to load ${agent} skills via CLI...`);
    const cliSkills = await loadSkillsViaCLI(agent, workspaceRoot);

    if (cliSkills && cliSkills.length > 0) {
      result[agent] = cliSkills;
      logger.info(`[SkillLoader] Loaded ${cliSkills.length} ${agent} skills via CLI`);
    } else {
      // Fallback to filesystem scan
      logger.info(`[SkillLoader] Falling back to filesystem scan for ${agent} skills...`);
      const fullPath = path.join(workspaceRoot, SKILL_DIRS[agent]);
      const fsSkills = await loadSkillsFromDir(fullPath, agent);
      result[agent] = fsSkills;

      if (fsSkills.length > 0) {
        logger.info(`[SkillLoader] Found ${fsSkills.length} ${agent} skills via filesystem`);
      }
    }
  }

  return result;
}

/**
 * Load skills for a specific agent from workspace
 */
export async function loadSkillsForAgent(
  workspaceRoot: string,
  agent: 'claude' | 'gemini' | 'codex'
): Promise<Skill[]> {
  const skillDir = SKILL_DIRS[agent];
  if (!skillDir) {
    return [];
  }

  const fullPath = path.join(workspaceRoot, skillDir);
  return loadSkillsFromDir(fullPath, agent);
}

/**
 * Get skill by name from loaded skills
 */
export function getSkillByName(skills: SkillsByAgent, name: string): Skill | undefined {
  for (const agentSkills of Object.values(skills) as Skill[][]) {
    const found = agentSkills.find((s: Skill) => s.name === name);
    if (found) return found;
  }
  return undefined;
}

/**
 * Generate prompt injection for selected skills
 */
export function generateSkillPrompt(skills: Skill[]): string {
  if (skills.length === 0) return '';

  const skillPrompts = skills.map(skill => {
    return `
## Skill: ${skill.name}
${skill.description ? `Description: ${skill.description}\n` : ''}
${skill.content}
`;
  });

  return `
<activated-skills>
The following skills have been activated for this task. Follow their instructions when applicable:

${skillPrompts.join('\n---\n')}
</activated-skills>
`;
}

export class SkillLoader {
  private workspaceRoot: string;
  private cachedSkills: SkillsByAgent | null = null;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  setWorkspaceRoot(root: string) {
    this.workspaceRoot = root;
    this.cachedSkills = null; // Clear cache on workspace change
  }

  async loadAllSkills(): Promise<SkillsByAgent> {
    if (!this.cachedSkills) {
      this.cachedSkills = await loadWorkspaceSkills(this.workspaceRoot);
    }
    return this.cachedSkills;
  }

  async loadSkillsForAgent(agent: 'claude' | 'gemini' | 'codex'): Promise<Skill[]> {
    const allSkills = await this.loadAllSkills();
    return allSkills[agent];
  }

  async getSkillByName(name: string): Promise<Skill | undefined> {
    const allSkills = await this.loadAllSkills();
    return getSkillByName(allSkills, name);
  }

  generatePrompt(skills: Skill[]): string {
    return generateSkillPrompt(skills);
  }

  clearCache() {
    this.cachedSkills = null;
  }
}
