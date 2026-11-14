type P = { id: string; text: string; files: string[] } | null;
let v: P = null;
export const pendingSend = { set: (p: P) => { v = p; }, take: (id: string) => { if (v?.id === id) { const r = v; v = null; return r; } return null; } };
