import fs from 'fs';
import path from 'path';

const CLI_LOG_FILE = path.resolve(process.cwd(), 'logs/cli.log');

function formatCommand(command: string | string[]): string {
  const parts = Array.isArray(command) ? command : [command];
  return parts
    .map(part => {
      if (typeof part !== 'string') return String(part);
      return part.length > 200 ? `${part.slice(0, 200)}…` : part;
    })
    .join(' ');
}

export function logCliCommand(command: string | string[], cwd?: string): void {
  const timestamp = new Date().toISOString();
  const workingDir = cwd || process.cwd();
  const formattedCommand = formatCommand(command);
  const logLine = `[${timestamp}] [CLI] cwd=${workingDir} cmd=${formattedCommand}\n`;

  try {
    fs.mkdirSync(path.dirname(CLI_LOG_FILE), { recursive: true });
    fs.appendFileSync(CLI_LOG_FILE, logLine);
  } catch (error) {
    console.error('[CLI Logger] Failed to write CLI log:', error);
  }
}
