import { app, BrowserWindow, ipcMain, WebContents, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { Orchestrator } from '../orchestrator/Orchestrator.js';
import chokidar, { FSWatcher } from 'chokidar';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged || process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;
const orchestrator = new Orchestrator();

let workspaceRoot = path.resolve(__dirname, '../../../');
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
      contextIsolation: false, // Allowing direct IPC usage for prototype
      webSecurity: false // Allowing local file access for preview
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
const buildFileTree = (dir: string): any => {
  const name = path.basename(dir);
  const stats = fs.statSync(dir);
  
  if (!stats.isDirectory()) {
    return { name, path: dir, type: 'file' };
  }
  
  const children = fs.readdirSync(dir)
    .filter(file => !file.startsWith('.')) // Hide dotfiles
    .map(child => buildFileTree(path.join(dir, child)));
    
  return { name, path: dir, type: 'folder', children };
};

const sendFileTreeUpdate = (target: WebContents) => {
  try {
    const dir = ensureAIContextDir();
    if (fs.existsSync(dir)) {
      const tree = buildFileTree(dir);
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
  ensureAIContextDir();
  if (mainWindow) {
    setupFileWatcher(mainWindow);
  }
  event.sender.send('workspace-root-changed', workspaceRoot);
  sendFileTreeUpdate(event.sender);
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
  let planCompleted = false;
  
  try {
    process.chdir(workspaceRoot);
    sender.send('log', `[System] Received task: "${task}"`);
    sender.send('status-update', { phase: 'planning', status: 'running' });

    // Use runFullFlow with callbacks to stream updates to UI
    await orchestrator.runFullFlow(task, { planner: options?.planner }, {
      onLog: (msg) => sender.send('log', msg),
      onPlanCreated: (plan) => {
        planCompleted = true;
        sender.send('plan-created', plan);
        sender.send('status-update', { phase: 'planning', status: 'completed' });
        sender.send('status-update', { phase: 'execution', status: 'running' });
      },
      onSubtaskStart: (id, title) => {
        sender.send('log', `[Started] ${title}`);
        // Could send specific event for progress bar
      },
      onSubtaskComplete: (id, result) => {
        sender.send('log', `[Completed] Output: ${result.outputFile}`);
      },
      onSubtaskFail: (id, error) => {
        sender.send('log', `[Failed] ${error}`);
      }
    });

    sender.send('status-update', { phase: 'execution', status: 'completed' });
    sender.send('refresh-explorer'); // Tell UI to reload file list

  } catch (error: any) {
    sender.send('log', `[Error] ${error.message}`);
    sender.send('status-update', { phase: 'planning', status: planCompleted ? 'completed' : 'failed' });
    sender.send('status-update', { phase: 'execution', status: 'failed' });
  }
});
