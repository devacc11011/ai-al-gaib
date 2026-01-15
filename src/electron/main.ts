import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check if we are running in development mode
// We can check if the app is packaged, or an explicit env var
const isDev = !app.isPackaged || process.env.NODE_ENV === 'development';

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  if (isDev) {
    console.log('Running in development mode. Loading localhost:5173...');
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    console.log('Running in production mode. Loading built files...');
    // Adjust path to where vite builds: ../../ui/dist/index.html
    // This path is relative to dist/electron/main.js
    const indexPath = path.join(__dirname, '../../ui/dist/index.html');
    win.loadFile(indexPath);
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