import { contextBridge, ipcRenderer } from 'electron'

const on = (channel) => (cb) => {
  const listener = (_e, payload) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('iv', {
  engine: {
    status: () => ipcRenderer.invoke('engine:status'),
    install: () => ipcRenderer.invoke('engine:install'),
    onProgress: on('engine:progress')
  },
  app: {
    update: () => ipcRenderer.invoke('update:state'),
    checkForUpdate: () => ipcRenderer.invoke('update:check'),
    installUpdate: () => ipcRenderer.invoke('update:install'),
    onUpdate: on('update:changed')
  },
  probe: (url) => ipcRenderer.invoke('probe', url),
  queue: {
    list: () => ipcRenderer.invoke('queue:list'),
    add: (requests) => ipcRenderer.invoke('queue:add', requests),
    cancel: (id) => ipcRenderer.invoke('queue:cancel', id),
    retry: (id) => ipcRenderer.invoke('queue:retry', id),
    remove: (id) => ipcRenderer.invoke('queue:remove', id),
    clearFinished: () => ipcRenderer.invoke('queue:clear'),
    onChange: on('queue:changed')
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
    chooseFolder: () => ipcRenderer.invoke('settings:chooseFolder'),
    chooseCookies: () => ipcRenderer.invoke('settings:chooseCookies')
  },
  clipboardUrl: () => ipcRenderer.invoke('clipboard:readUrl'),
  reveal: (p) => ipcRenderer.invoke('file:reveal', p),
  open: (p) => ipcRenderer.invoke('file:open', p),
  openFolder: () => ipcRenderer.invoke('folder:open'),
  openLicenses: () => ipcRenderer.invoke('about:licenses')
})
