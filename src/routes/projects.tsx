import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "@/components/Shell";
import {
  createDraft,
  listDrafts,
  maxNameLength,
  type ProjectDraft,
} from "@/lib/projects/local-drafts";

export const Route = createFileRoute("/projects")({
  head: () => ({ meta: [{ title: "Projects — Motif" }] }),
  validateSearch: (search): { project?: string } =>
    typeof search["project"] === "string" ? { project: search["project"] } : {},
  component: Projects,
});

function Projects() {
  const { project } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [drafts, setDrafts] = useState<ProjectDraft[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    function load() {
      try {
        setDrafts(listDrafts(window.localStorage));
        setError("");
      } catch {
        setDrafts(null);
        setError("Browser storage is unavailable. Enable it to open or create local drafts.");
      }
    }
    load();
    window.addEventListener("storage", load);
    return () => window.removeEventListener("storage", load);
  }, []);
  function create(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    let draft: ProjectDraft;
    try {
      draft = createDraft(window.localStorage, name);
    } catch {
      setError(
        "Could not save this project. Check that browser storage is enabled and has free space.",
      );
      return;
    }
    setError("");
    setDrafts((current) => [draft, ...(current ?? [])]);
    setName("");
    void navigate({ search: { project: draft.id } });
  }
  const selected = drafts?.find((item) => item.id === project);
  return (
    <AppShell title="Projects">
      <div className="mx-auto h-full max-w-2xl space-y-6 overflow-y-auto p-6">
        <div>
          <h1 className="text-2xl font-bold">
            {project ? (selected?.name ?? "Project") : "Local projects"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Drafts are saved only in this browser profile. Anyone using this profile can open them.
            Clearing site data removes them.
          </p>
        </div>
        {error && <p role="alert">{error}</p>}
        {drafts === null ? (
          !error && <p role="status">Loading projects…</p>
        ) : project ? (
          <>
            <p>
              {selected
                ? "This project is empty. No media is attached."
                : "Project not found in this browser profile."}
            </p>
            <Link to="/projects" search={{}} className="underline">
              All projects
            </Link>
          </>
        ) : (
          <>
            <form onSubmit={create} className="space-y-2">
              <label htmlFor="project-name" className="block text-sm font-medium">
                Project name
              </label>
              <div className="flex gap-2">
                <input
                  id="project-name"
                  required
                  maxLength={maxNameLength}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2"
                />
                <button
                  disabled={!name.trim()}
                  className="rounded-md bg-primary px-3 text-primary-foreground disabled:opacity-50"
                >
                  Create project
                </button>
              </div>
            </form>
            <section>
              <h2 className="mb-2 font-semibold">Recent projects</h2>
              {drafts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No local projects yet.</p>
              ) : (
                <ul className="space-y-1">
                  {drafts.map((item) => (
                    <li key={item.id}>
                      <Link
                        to="/projects"
                        search={{ project: item.id }}
                        className="block truncate rounded-md border border-border p-3 hover:bg-accent"
                      >
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
