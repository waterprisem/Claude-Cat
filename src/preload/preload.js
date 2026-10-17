// The only bridge between the cat window and the main process.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cat', {
  onInit: (cb) => ipcRenderer.on('cat:init', (_event, init) => cb(init)),
  onState: (cb) => ipcRenderer.on('cat:state', (_event, state) => cb(state)),
  ready: () => ipcRenderer.send('cat:ready'),
  setInteractive: (value) => ipcRenderer.send('cat:interactive', value === true),
  resize: (dir) => ipcRenderer.send('cat:resize', dir === 1 ? 1 : -1),
  dragStart: () => ipcRenderer.send('cat:drag-start'),
  dragMove: () => ipcRenderer.send('cat:drag-move'),
  dragEnd: () => ipcRenderer.send('cat:drag-end'),
});
