import fs from 'fs';
import path from 'path';

const LOG_FILE = path.resolve(process.cwd(), 'logs/debug.log');

export const logger = {
  info: (msg: string) => appendLog('INFO', msg),
  error: (msg: string) => appendLog('ERROR', msg),
  warn: (msg: string) => appendLog('WARN', msg),
  debug: (msg: string) => appendLog('DEBUG', msg),
};

function appendLog(level: string, message: string) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [${level}] ${message}
`;
  
  // Console output for dev
  console.log(logLine.trim());

  try {
    fs.appendFileSync(LOG_FILE, logLine);
  } catch (e) {
    console.error('Failed to write to log file:', e);
  }
}
