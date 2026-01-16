import fs from 'fs-extra';
import path from 'path';

const RESULT_LOG_FILE = path.resolve(process.cwd(), 'logs/agent-results.log');

export interface AgentResultLogEntry {
  agent: string;
  subtaskId: string;
  subtaskTitle: string;
  status: 'success' | 'failure';
  outputFile?: string;
  error?: string;
}

export async function logAgentResult(entry: AgentResultLogEntry): Promise<void> {
  const timestamp = new Date().toISOString();
  const headerLines = [
    `[${timestamp}] [AgentResult] agent=${entry.agent}`,
    `subtask=${entry.subtaskId} (${entry.subtaskTitle})`,
    `status=${entry.status.toUpperCase()}`
  ];

  if (entry.outputFile) {
    headerLines.push(`output=${entry.outputFile}`);
  }
  if (entry.error) {
    headerLines.push(`error=${entry.error}`);
  }

  let outputContent = '';
  if (entry.outputFile) {
    try {
      outputContent = await fs.readFile(entry.outputFile, 'utf-8');
    } catch (err: any) {
      headerLines.push(`output_read_error=${err.message}`);
    }
  }

  const block = `${headerLines.join(' | ')}\n----- OUTPUT BEGIN -----\n${outputContent || '(no output)'}\n----- OUTPUT END -----\n\n`;

  await fs.ensureDir(path.dirname(RESULT_LOG_FILE));
  await fs.appendFile(RESULT_LOG_FILE, block, 'utf-8');
}
