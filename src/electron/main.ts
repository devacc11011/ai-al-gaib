import { app, BrowserWindow, ipcMain, WebContents, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { Orchestrator } from '../orchestrator/Orchestrator.js';
import { SkillLoader, Skill, SkillsByAgent } from '../skills/SkillLoader.js';
import { SkillGenerator, SkillGenerationRequest } from '../skills/SkillGenerator.js';
import chokidar, { FSWatcher } from 'chokidar';
import fs from 'fs';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged || process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;
let plannerWindow: BrowserWindow | null = null;
let executorWindow: BrowserWindow | null = null;
const orchestrator = new Orchestrator();

let workspaceRoot = path.resolve(__dirname, '../../../');
orchestrator.setWorkspaceRoot(workspaceRoot);

const skillLoader = new SkillLoader(workspaceRoot);
const skillGenerator = new SkillGenerator();

// Store pending permission callback
let pendingPermissionRespond: ((allow: boolean) => void) | null = null;
let contextWatcher: FSWatcher | null = null;

const getAIContextDir = () => path.join(workspaceRoot, '.ai-al-gaib');

const ensureAIContextDir = (): string => {
  const dir = getAIContextDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    },
  });

  if (isDev) {
    console.log('Running in development mode. Loading localhost:5173...');
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    const indexPath = path.join(__dirname, '../../ui/dist/index.html');
    mainWindow.loadFile(indexPath);
  }
}

function createPlannerWindow() {
  if (plannerWindow && !plannerWindow.isDestroyed()) {
    plannerWindow.focus();
    return;
  }

  plannerWindow = new BrowserWindow({
    width: 800,
    height: 600,
    title: 'Planner Output (Headless)',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    autoHideMenuBar: true
  });

  if (isDev) {
    plannerWindow.loadURL('http://localhost:5173?mode=planner');
  } else {
    const indexPath = path.join(__dirname, '../../ui/dist/index.html');
    plannerWindow.loadURL(`file://${indexPath}?mode=planner`);
  }
}

function createExecutorWindow() {
  if (executorWindow && !executorWindow.isDestroyed()) {
    executorWindow.focus();
    return;
  }

  executorWindow = new BrowserWindow({
    width: 900,
    height: 700,
    title: 'Executor Output',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    autoHideMenuBar: true
  });

  if (isDev) {
    executorWindow.loadURL('http://localhost:5173?mode=executor');
  } else {
    const indexPath = path.join(__dirname, '../../ui/dist/index.html');
    executorWindow.loadURL(`file://${indexPath}?mode=executor`);
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Helper to build file tree
const buildFileTree = (dir: string, depth: number = 0, maxDepth: number = 4): any => {
  const name = path.basename(dir);

  try {
    const stats = fs.statSync(dir);

    if (!stats.isDirectory()) {
      return { name, path: dir, type: 'file' };
    }

    // Limit depth to prevent huge trees
    if (depth >= maxDepth) {
      return { name, path: dir, type: 'folder', children: [] };
    }

    const children = fs.readdirSync(dir)
      .filter(file => {
        // Hide dotfiles, node_modules, etc.
        if (file.startsWith('.')) return false;
        if (file === 'node_modules') return false;
        if (file === 'dist') return false;
        if (file === '__pycache__') return false;
        return true;
      })
      .slice(0, 50) // Limit number of children
      .map(child => buildFileTree(path.join(dir, child), depth + 1, maxDepth));

    return { name, path: dir, type: 'folder', children };
  } catch (err) {
    return { name, path: dir, type: 'file' };
  }
};

const sendFileTreeUpdate = (target: WebContents) => {
  try {
    if (fs.existsSync(workspaceRoot)) {
      const tree = buildFileTree(workspaceRoot);
      target.send('file-tree-update', tree);
    }
  } catch (err) {
    console.error('Failed to build file tree:', err);
  }
};

const setupFileWatcher = (win: BrowserWindow) => {
  if (contextWatcher) {
    contextWatcher.close().catch(() => {});
  }

  const dir = ensureAIContextDir();
  contextWatcher = chokidar.watch(dir, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true
  });

  contextWatcher.on('all', () => sendFileTreeUpdate(win.webContents));
  // Initial load
  sendFileTreeUpdate(win.webContents);
};

app.on('browser-window-created', (_, win) => {
  setupFileWatcher(win);
  win.webContents.send('workspace-root-changed', workspaceRoot);
});

ipcMain.on('request-file-tree', (event) => {
  sendFileTreeUpdate(event.sender);
});

ipcMain.handle('get-workspace-root', () => workspaceRoot);

ipcMain.handle('set-workspace-root', async (event, newRoot: string) => {
  if (!newRoot) return workspaceRoot;

  workspaceRoot = path.resolve(newRoot);
  orchestrator.setWorkspaceRoot(workspaceRoot);
  skillLoader.setWorkspaceRoot(workspaceRoot);
  ensureAIContextDir();
  if (mainWindow) {
    setupFileWatcher(mainWindow);
  }
  event.sender.send('workspace-root-changed', workspaceRoot);
  sendFileTreeUpdate(event.sender);

  // Load and send skills for the new workspace
  try {
    const skills = await skillLoader.loadAllSkills();
    event.sender.send('skills-loaded', skills);
  } catch (err: any) {
    logger.error(`Failed to load skills: ${err.message}`);
  }

  return workspaceRoot;
});

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

// --- IPC Handlers ---

ipcMain.on('read-file', (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    event.sender.send('file-content', { filePath, content });
  } catch (err: any) {
    event.sender.send('log', `[Error] Failed to read file: ${err.message}`);
  }
});

ipcMain.on('execute-task', async (event, { task, options }) => {
  const sender = event.sender;
  const selectedSkills = options?.skills || [];
  logger.info(`[IPC] Received task: ${task}, planner: ${options?.planner}, executor: ${options?.executor}, skills: ${selectedSkills.length}`);

  // Open Planner Window on task start
  createPlannerWindow();

  // Load skill contents for selected skills
  let skillContents: Skill[] = [];
  if (selectedSkills.length > 0) {
    for (const skillName of selectedSkills) {
      const skill = await skillLoader.getSkillByName(skillName);
      if (skill) {
        skillContents.push(skill);
      }
    }
    logger.info(`[IPC] Loaded ${skillContents.length} skill contents`);
  }

  try {
    sender.send('log', `[System] Received task: "${task}"`);
    sender.send('log', `[System] Planner: ${options?.planner || 'claude'}, Executor: ${options?.executor || 'claude'}`);
    if (skillContents.length > 0) {
      sender.send('log', `[System] Active Skills: ${skillContents.map(s => s.name).join(', ')}`);
    }
    sender.send('status-update', { phase: 'planning', status: 'running' });

    // Use runFullFlow with callbacks to stream updates to UI
    await orchestrator.runFullFlow(task, { planner: options?.planner, executor: options?.executor, skills: skillContents }, {
      onLog: (msg) => {
        sender.send('log', msg);
        // Also send to executor window
        if (executorWindow && !executorWindow.isDestroyed()) {
          executorWindow.webContents.send('executor-log', msg);
        }
      },
      onPlanCreated: (plan) => {
        sender.send('plan-created', plan);
        // Open executor window when plan is created and execution begins
        createExecutorWindow();
        if (executorWindow && !executorWindow.isDestroyed()) {
          executorWindow.webContents.send('executor-log', `[Plan] ${plan.subtasks.length} subtasks to execute`);
        }
      },
      onPlannerOutput: (chunk) => {
        // Send to Planner Window if open
        if (plannerWindow && !plannerWindow.isDestroyed()) {
            plannerWindow.webContents.send('planner-log', chunk);
        }
        // Also log to main window for record
        sender.send('log', chunk);
      },
      onSubtaskStart: (id, title) => {
        sender.send('log', `[Started] ${title}`);
        if (executorWindow && !executorWindow.isDestroyed()) {
          executorWindow.webContents.send('executor-log', `\n▶ Starting: ${title}`);
        }
      },
      onSubtaskComplete: (id, result) => {
        sender.send('log', `[Completed] Output: ${result.outputFile}`);
        if (executorWindow && !executorWindow.isDestroyed()) {
          executorWindow.webContents.send('executor-log', `✓ Completed (${result.executionTimeMs}ms)`);
        }
      },
      onSubtaskFail: (id, error) => {
        sender.send('log', `[Failed] ${error}`);
        if (executorWindow && !executorWindow.isDestroyed()) {
          executorWindow.webContents.send('executor-log', `✗ Failed: ${error}`);
        }
      },
      onPermissionRequest: (request, respond) => {
        logger.info(`[IPC] Permission request: ${request.type} - ${request.description}`);
        // Send to executor window
        if (executorWindow && !executorWindow.isDestroyed()) {
          executorWindow.webContents.send('permission-request', request);
        }
        // Also send to main window
        sender.send('permission-request', request);

        // Store the respond callback for later
        pendingPermissionRespond = respond;
      }
    });

    sender.send('status-update', { phase: 'execution', status: 'completed' });
    sender.send('refresh-explorer'); // Tell UI to reload file list

  } catch (error: any) {
    if (error.message === 'Cancelled') {
         sender.send('status-update', { phase: 'execution', status: 'failed' });
         // Already logged by Orchestrator
    } else {
        sender.send('log', `[Error] ${error.message}`);
        sender.send('status-update', { phase: 'execution', status: 'failed' });
    }
  }
});

ipcMain.on('cancel-task', () => {
    orchestrator.cancel();
});

// Handle permission response from UI
ipcMain.on('permission-respond', (event, { allow }: { allow: boolean }) => {
    logger.info(`[IPC] Permission response: ${allow ? 'ALLOW' : 'DENY'}`);
    if (pendingPermissionRespond) {
        pendingPermissionRespond(allow);
        pendingPermissionRespond = null;
    }
});

// --- Skill IPC Handlers ---

ipcMain.handle('load-skills', async () => {
  try {
    skillLoader.clearCache();
    const skills = await skillLoader.loadAllSkills();
    logger.info(`[IPC] Loaded skills: claude=${skills.claude.length}, gemini=${skills.gemini.length}, codex=${skills.codex.length}`);
    return skills;
  } catch (err: any) {
    logger.error(`[IPC] Failed to load skills: ${err.message}`);
    return { claude: [], gemini: [], codex: [] };
  }
});

ipcMain.handle('get-skill-content', async (event, skillName: string) => {
  try {
    const skill = await skillLoader.getSkillByName(skillName);
    return skill || null;
  } catch (err: any) {
    logger.error(`[IPC] Failed to get skill content: ${err.message}`);
    return null;
  }
});

ipcMain.handle('generate-skill', async (event, request: SkillGenerationRequest) => {
  logger.info(`[IPC] Generate skill request: ${request.name} for ${request.targetAgent}`);

  try {
    const result = await skillGenerator.generate(request, (msg) => {
      // Send log updates to the UI
      event.sender.send('skill-generation-log', msg);
    });

    if (result.success) {
      // Clear skill cache so the new skill appears
      skillLoader.clearCache();
    }

    return result;
  } catch (err: any) {
    logger.error(`[IPC] Skill generation failed: ${err.message}`);
    return { success: false, error: err.message };
  }
});
