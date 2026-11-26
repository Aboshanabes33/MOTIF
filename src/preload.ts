import { contextBridge, ipcRenderer } from 'electron';
import { Request, Reply, type MotifBridge } from './contract.js';
const bridge: MotifBridge = Object.freeze({
  async request(value: Request) { let parsed:Request;try{parsed=Request.parse(value);}catch{throw Error('Invalid app request');}return Reply.parse(await ipcRenderer.invoke('motif:request', parsed)); },
});
contextBridge.exposeInMainWorld('motif', bridge);
