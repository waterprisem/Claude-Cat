// The only bridge between the cat window and the main process.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cat', {
  onInit: (cb) => ipcRenderer.on('cat:init', (_event, init) => cb(init)),
  onState: (cb) => ipcRenderer.on('cat:state', (_event, state) => cb(state)),
  onLayout: (cb) => ipcRenderer.on('cat:layout', (_event, layout) => cb(layout)),
  ready: () => ipcRenderer.send('cat:ready'),
  setInteractive: (value) => ipcRenderer.send('cat:interactive', value === true),
  resizeStart: () => ipcRenderer.send('cat:resize-start'),
  resizeMove: () => ipcRenderer.send('cat:resize-move'),
  resizeEnd: () => ipcRenderer.send('cat:resize-end'),
  dragStart: () => ipcRenderer.send('cat:drag-start'),
  dragMove: () => ipcRenderer.send('cat:drag-move'),
  dragEnd: () => ipcRenderer.send('cat:drag-end'),
  clicked: () => ipcRenderer.send('cat:click'),
  bubbleZone: (height) => ipcRenderer.send('cat:bubble-zone', Number(height)),
});
