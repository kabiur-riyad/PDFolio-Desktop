const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

let mainWindow;
const userDataPath = path.join(app.getPath('userData'), 'user-info.json');
let isDirty = false;
let waitingForSaveBeforeExit = false;
let quittingAfterSave = false;
let currentPortfolioPath = null;
let pendingActionAfterSave = null; // 'exit' | 'new' | null

function getAppFolder() {
  try {
    const exeDir = path.dirname(app.getPath('exe'));
    return exeDir || __dirname;
  } catch {
    return __dirname;
  }
}

function getDialogIcon() {
  try {
    const ico = path.join(__dirname, 'assets', 'icon.ico');
    const png = path.join(__dirname, 'assets', 'icon.png');
    const p = fsSync.existsSync(ico) ? ico : (fsSync.existsSync(png) ? png : null);
    return p ? nativeImage.createFromPath(p) : undefined;
  } catch {
    return undefined;
  }
}

function uniqueDefaultPath(baseDir, baseName) {
  const ext = path.extname(baseName);
  const name = path.basename(baseName, ext);
  let candidate = path.join(baseDir, baseName);
  let i = 2;
  while (fsSync.existsSync(candidate)) {
    candidate = path.join(baseDir, `${name} ${i}${ext}`);
    i++;
  }
  return candidate;
}

ipcMain.on('dirty-state-changed', (_event, dirty) => {
  isDirty = !!dirty;
});

// Allow renderer to request native theme changes for dialogs/menus
ipcMain.handle('set-native-theme', (_event, source) => {
  try {
    const allowed = ['system', 'light', 'dark'];
    if (allowed.includes(source)) nativeTheme.themeSource = source;
    return { success: true, themeSource: nativeTheme.themeSource };
  } catch (error) {
    return { success: false, error: String(error && error.message || error) };
  }
});

ipcMain.on('save-before-exit-complete', (_event, result) => {
  waitingForSaveBeforeExit = false;
  if (!result) return;

  if (result.success) {
    isDirty = false;
    if (pendingActionAfterSave === 'exit') {
      quittingAfterSave = true;
      pendingActionAfterSave = null;
      app.quit();
      return;
    }
    if (pendingActionAfterSave === 'new') {
      pendingActionAfterSave = null;
      if (mainWindow) mainWindow.webContents.send('menu-new');
      return;
    }
    return;
  }

  if (result.canceled) {
    return;
  }

  if (result.error && mainWindow) {
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      buttons: ['OK'],
      defaultId: 0,
      title: 'Save Failed',
      message: 'Could not save before exiting.',
      detail: String(result.error)
    }).catch((err) => console.error('Error showing save failure dialog:', err));
  }
});

function createWindow() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  let icon = null;
  try {
    if (fsSync.existsSync(iconPath)) {
      icon = iconPath;
    }
  } catch (e) {
    // Icon file doesn't exist, continue without it
  }

  try {
    mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      x: 100,
      y: 100,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      },
      ...(icon && { icon }),
      show: true
    });

    const htmlPath = path.join(__dirname, 'index.html');
    const preloadPath = path.join(__dirname, 'preload.js');
    
    console.log('Loading HTML from:', htmlPath);
    console.log('Preload script:', preloadPath);
    console.log('Preload exists:', fsSync.existsSync(preloadPath));
    
    // Verify files exist
    if (!fsSync.existsSync(htmlPath)) {
      throw new Error('index.html not found at: ' + htmlPath);
    }
    if (!fsSync.existsSync(preloadPath)) {
      throw new Error('preload.js not found at: ' + preloadPath);
    }
    
    mainWindow.loadFile(htmlPath);
    
    // Show window when ready
    mainWindow.once('ready-to-show', () => {
      console.log('Window is ready, showing...');
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.setAlwaysOnTop(true);
        setTimeout(() => mainWindow.setAlwaysOnTop(false), 1000);
      }
    });

    // Log errors
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      console.error('Failed to load:', errorCode, errorDescription, validatedURL);
    });

    mainWindow.webContents.on('crashed', () => {
      console.error('Window crashed');
    });
    
    mainWindow.webContents.on('did-finish-load', () => {
      console.log('Page loaded successfully!');
    });

  } catch (error) {
    console.error('Error creating window:', error);
    process.exit(1);
  }

  // Create and set application menu
  const menuTemplate = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            if (!mainWindow) return;
            if (isDirty) {
              promptBeforeNew();
            } else {
              mainWindow.webContents.send('menu-new');
            }
          }
        },
        {
          label: 'Open…',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            if (mainWindow) mainWindow.webContents.send('menu-open');
          }
        },
        {
          label: 'Export as PDF',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => {
            if (mainWindow) mainWindow.webContents.send('menu-export-pdf');
          }
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            if (mainWindow) mainWindow.webContents.send('menu-save');
          }
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
          { type: 'separator' },
          {
            label: 'Preferences…',
            accelerator: 'CmdOrCtrl+,',
            click: () => {
              if (mainWindow) mainWindow.webContents.send('menu-preferences');
            }
          }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('close', (event) => {
    if (!mainWindow) return;
    if (quittingAfterSave || waitingForSaveBeforeExit) return;
    if (!isDirty) return;
    event.preventDefault();
    promptBeforeExit();
  });
}

app.whenReady().then(() => {
  console.log('App is ready, creating window...');
  console.log('Current directory:', __dirname);
  console.log('Index.html path:', path.join(__dirname, 'index.html'));
  console.log('Preload path:', path.join(__dirname, 'preload.js'));
  createWindow();
});

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

function promptBeforeExit() {
  if (!mainWindow || waitingForSaveBeforeExit) return;
  waitingForSaveBeforeExit = true;
  dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['Save & Exit', 'Exit Without Saving', 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    title: 'Unsaved Changes',
    message: 'You have unsaved changes in your portfolio.',
    detail: 'Choose “Save & Exit” to save your portfolio before leaving, or “Exit Without Saving” to close immediately.',
    noLink: true,
    icon: getDialogIcon()
  }).then(({ response }) => {
    waitingForSaveBeforeExit = false;
    if (!mainWindow) return;
    if (response === 0) {
      waitingForSaveBeforeExit = true;
      pendingActionAfterSave = 'exit';
      mainWindow.webContents.send('request-save-before-exit');
    } else if (response === 1) {
      isDirty = false;
      quittingAfterSave = true;
      app.quit();
    }
  }).catch((err) => {
    console.error('Error showing before-exit dialog:', err);
    waitingForSaveBeforeExit = false;
  });
}

function promptBeforeNew() {
  if (!mainWindow) return;
  dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['Save & Create', 'Create Without Saving', 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    title: 'Unsaved Changes',
    message: 'Create a new portfolio?',
    detail: 'You have unsaved changes. Save your current portfolio before creating a new one?',
    noLink: true,
    icon: getDialogIcon()
  }).then(({ response }) => {
    if (!mainWindow) return;
    if (response === 0) {
      pendingActionAfterSave = 'new';
      waitingForSaveBeforeExit = true;
      mainWindow.webContents.send('request-save-before-exit');
    } else if (response === 1) {
      isDirty = false;
      mainWindow.webContents.send('menu-new');
    }
  }).catch((err) => console.error('Error showing new warning dialog:', err));
}

// Handle PDF export
ipcMain.handle('export-pdf', async (event, options) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save PDF',
      defaultPath: 'portfolio.pdf',
      filters: [
        { name: 'PDF Files', extensions: ['pdf'] }
      ]
    });

    if (canceled) {
      return { success: false, canceled: true };
    }

    const pdfOptions = {
      marginsType: 1, // No margins
      pageSize: 'A4',
      printBackground: true,
      printSelectionOnly: false,
      landscape: false,
      scaleFactor: 100
    };

    const data = await mainWindow.webContents.printToPDF(pdfOptions);
    await fs.writeFile(filePath, data);

    return { success: true, filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Portfolio file persistence
ipcMain.handle('create-new-portfolio', async (_event, jsonData) => {
  try {
    const baseDir = getAppFolder();
    const suggested = uniqueDefaultPath(baseDir, 'Portfolio.json');
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Create Portfolio',
      defaultPath: suggested,
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });
    if (canceled || !filePath) return { success: false, canceled: true };
    await fs.writeFile(filePath, jsonData || '{"userInfo":{},"pages":[]}', 'utf8');
    currentPortfolioPath = filePath;
    return { success: true, filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-portfolio', async (_event, jsonData) => {
  try {
    let target = currentPortfolioPath;
    if (!target) {
      const baseDir = getAppFolder();
      const suggested = uniqueDefaultPath(baseDir, 'Portfolio.json');
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Portfolio',
        defaultPath: suggested,
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
      });
      if (canceled || !filePath) return { success: false, canceled: true };
      target = filePath;
      currentPortfolioPath = filePath;
    }
    await fs.writeFile(target, jsonData, 'utf8');
    return { success: true, filePath: target };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-portfolio', async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Open Portfolio',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (canceled || !filePaths || filePaths.length === 0) return { success: false, canceled: true };
    const filePath = filePaths[0];
    const data = await fs.readFile(filePath, 'utf8');
    currentPortfolioPath = filePath;
    return { success: true, data, filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-portfolio-at', async (_event, filePath) => {
  try {
    if (!filePath || !fsSync.existsSync(filePath)) return { success: false, error: 'File not found' };
    const data = await fs.readFile(filePath, 'utf8');
    currentPortfolioPath = filePath;
    return { success: true, data, filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Handle image file selection
ipcMain.handle('select-images', async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Images',
      filters: [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] }
      ],
      properties: ['openFile', 'multiSelections']
    });

    if (canceled || !filePaths || filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    // Read image files and convert to base64 data URLs
    const imageData = await Promise.all(filePaths.map(async (filePath) => {
      const fileBuffer = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase().slice(1);
      const mimeType = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'bmp': 'image/bmp',
        'webp': 'image/webp'
      }[ext] || 'image/jpeg';
      
      const base64 = fileBuffer.toString('base64');
      return `data:${mimeType};base64,${base64}`;
    }));

    return { success: true, imageData };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Remove legacy user-info persistence; portfolio file handles persistence now