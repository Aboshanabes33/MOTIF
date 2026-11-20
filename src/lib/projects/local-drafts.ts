import { z } from "zod";

const prefix = "motif.project-draft.v1:";
export const maxNameLength = 100;
const nameSchema = z.string().trim().min(1).max(maxNameLength);
const draftSchema = z.object({
  id: z.string().uuid(),
  name: nameSchema,
  createdAt: z.number().int().nonnegative(),
});
export type ProjectDraft = z.infer<typeof draftSchema>;

// One key per draft so simultaneous creations in different tabs never replace a shared list.
export function createDraft(storage: Storage, name: string): ProjectDraft {
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success)
    throw new Error(`Enter a project name between 1 and ${maxNameLength} characters.`);
  const draft = { id: crypto.randomUUID(), name: parsed.data, createdAt: Date.now() };
  storage.setItem(prefix + draft.id, JSON.stringify(draft));
  return draft;
}

export function listDrafts(storage: Storage): ProjectDraft[] {
  const drafts: ProjectDraft[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(prefix)) continue;
    const raw = storage.getItem(key);
    if (raw === null) continue;
    try {
      const parsed = draftSchema.safeParse(JSON.parse(raw));
      if (parsed.success && key === prefix + parsed.data.id) drafts.push(parsed.data);
    } catch {
      // Ignore malformed entries without rewriting the user's storage.
    }
  }
  return drafts.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
}
