// The only bridge between the window and the background process.
const { contextBridge, ipcRenderer } = require('electron')

const listen = (channel) => (fn) => {
  const handler = (_e, ...args) => fn(...args)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('ww', {
  call: async (name, ...args) => {
    const res = await ipcRenderer.invoke('ww', name, args)
    if (res && res.error) throw new Error(res.error)
    return res ? res.value : undefined
  },
  on: {
    friends: listen('friends'),
    friendRecords: listen('friend-records'),
    economy: listen('economy'),
    lobbyFriend: listen('lobby-friend'),
    friendCode: listen('friend-code'),
    progress: listen('progress'),
    lobby: listen('lobby'),
    lobbyEvent: listen('lobby-event'),
    lobbyClosed: listen('lobby-closed'),
    duel: listen('duel'),
    duelClosed: listen('duel-closed'),
    update: listen('update')
  }
})
