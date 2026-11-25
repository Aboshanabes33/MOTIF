import { contextBridge, ipcRenderer } from 'electron';
import { Request, Reply, type MotifBridge } from './contract.js';
const bridge: MotifBridge = Object.freeze({
  async request(value: Request) { return Reply.parse(await ipcRenderer.invoke('motif:request', Request.parse(value))); },
});
contextBridge.exposeInMainWorld('motif', bridge);
