import * as pty from 'node-pty';
import { logger } from './logger.js';
import { EventEmitter } from 'events';

export interface PermissionRequest {
  id: string;
  type: 'file_write' | 'file_edit' | 'bash' | 'unknown';
  description: string;
  rawText: string;
}

export interface PtyOptions {
  cwd: string;
  prompt: string;
  onOutput?: (data: string) => void;
  onPermissionRequest?: (request: PermissionRequest) => void;
  onComplete?: (output: string) => void;
  onError?: (error: Error) => void;
}

export class PtyManager extends EventEmitter {
  private ptyProcess: pty.IPty | null = null;
  private outputBuffer: string = '';
  private isWaitingForPermission: boolean = false;
  private currentPermissionRequest: PermissionRequest | null = null;
  private options: PtyOptions;
  private permissionIdCounter: number = 0;

  constructor(options: PtyOptions) {
    super();
    this.options = options;
  }

  async start(): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const shell = process.platform === 'win32' ? 'cmd.exe' : 'bash';

        // Start pty with claude command
        this.ptyProcess = pty.spawn(shell, ['-c', `claude -p - 2>&1`], {
          name: 'xterm-color',
          cols: 120,
          rows: 30,
          cwd: this.options.cwd,
          env: {
            ...process.env,
            PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin`,
            TERM: 'xterm-256color'
          }
        });

        logger.info(`[PtyManager] Started pty process with PID: ${this.ptyProcess.pid}`);

        // Send prompt to stdin
        this.ptyProcess.write(this.options.prompt);
        this.ptyProcess.write('\x04'); // Ctrl+D to signal EOF

        this.ptyProcess.onData((data: string) => {
          this.handleData(data);
        });

        this.ptyProcess.onExit(({ exitCode }) => {
          logger.info(`[PtyManager] Process exited with code: ${exitCode}`);
          if (exitCode === 0) {
            this.options.onComplete?.(this.outputBuffer);
            resolve(this.outputBuffer);
          } else {
            const error = new Error(`Process exited with code ${exitCode}`);
            this.options.onError?.(error);
            reject(error);
          }
        });

      } catch (error: any) {
        logger.error(`[PtyManager] Failed to start: ${error.message}`);
        reject(error);
      }
    });
  }

  private handleData(data: string) {
    this.outputBuffer += data;
    this.options.onOutput?.(data);
    logger.info(`[PtyManager:data] ${data.replace(/\n/g, '\\n')}`);

    // Detect permission requests
    const permissionRequest = this.detectPermissionRequest(data);
    if (permissionRequest) {
      this.isWaitingForPermission = true;
      this.currentPermissionRequest = permissionRequest;
      logger.info(`[PtyManager] Permission request detected: ${permissionRequest.type}`);
      this.options.onPermissionRequest?.(permissionRequest);
      this.emit('permission-request', permissionRequest);
    }
  }

  private detectPermissionRequest(data: string): PermissionRequest | null {
    // Claude permission patterns
    const patterns = [
      { regex: /Do you want to (write|create) (?:to |file )?['"]?([^'"?\n]+)['"]?\?/i, type: 'file_write' as const },
      { regex: /Do you want to edit ['"]?([^'"?\n]+)['"]?\?/i, type: 'file_edit' as const },
      { regex: /Do you want to run ['"]?([^'"?\n]+)['"]?\?/i, type: 'bash' as const },
      { regex: /Allow this action\?/i, type: 'unknown' as const },
      { regex: /\(y\/n\)/i, type: 'unknown' as const },
      { regex: /Press Enter to allow|Do you want to allow/i, type: 'unknown' as const }
    ];

    for (const { regex, type } of patterns) {
      const match = data.match(regex);
      if (match) {
        return {
          id: `perm-${++this.permissionIdCounter}`,
          type,
          description: match[1] || match[0],
          rawText: data
        };
      }
    }

    return null;
  }

  respondToPermission(allow: boolean) {
    if (!this.ptyProcess || !this.isWaitingForPermission) {
      logger.warn('[PtyManager] No permission request pending');
      return;
    }

    const response = allow ? 'y\n' : 'n\n';
    logger.info(`[PtyManager] Responding to permission: ${allow ? 'ALLOW' : 'DENY'}`);
    this.ptyProcess.write(response);
    this.isWaitingForPermission = false;
    this.currentPermissionRequest = null;
  }

  allowAll() {
    // Send special command to allow all future permissions
    if (this.ptyProcess) {
      this.ptyProcess.write('a\n'); // Some CLIs support 'a' for allow all
    }
  }

  kill() {
    if (this.ptyProcess) {
      logger.info('[PtyManager] Killing process');
      this.ptyProcess.kill();
      this.ptyProcess = null;
    }
  }

  isRunning(): boolean {
    return this.ptyProcess !== null;
  }

  getOutput(): string {
    return this.outputBuffer;
  }
}
