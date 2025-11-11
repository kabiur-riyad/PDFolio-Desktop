const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  exportPDF: (options) => ipcRenderer.invoke('export-pdf', options),
  selectImages: () => ipcRenderer.invoke('select-images'),
  onResetPortfolio: (callback) => ipcRenderer.on('reset-portfolio', callback),
  updateDirtyState: (dirty) => ipcRenderer.send('dirty-state-changed', dirty),
  onRequestSaveBeforeExit: (callback) => ipcRenderer.on('request-save-before-exit', () => callback()),
  respondSaveBeforeExit: (result) => ipcRenderer.send('save-before-exit-complete', result),
  savePortfolio: (jsonData) => ipcRenderer.invoke('save-portfolio', jsonData),
  createNewPortfolio: (jsonData) => ipcRenderer.invoke('create-new-portfolio', jsonData),
  openPortfolio: () => ipcRenderer.invoke('open-portfolio'),
  openPortfolioAt: (path) => ipcRenderer.invoke('open-portfolio-at', path),
  onMenuSave: (callback) => ipcRenderer.on('menu-save', () => callback()),
  onMenuOpen: (callback) => ipcRenderer.on('menu-open', () => callback()),
  onMenuNew: (callback) => ipcRenderer.on('menu-new', () => callback()),
  onMenuPreferences: (callback) => ipcRenderer.on('menu-preferences', () => callback()),
  onMenuExportPdf: (callback) => ipcRenderer.on('menu-export-pdf', () => callback()),
  setNativeTheme: (source) => ipcRenderer.invoke('set-native-theme', source)
});