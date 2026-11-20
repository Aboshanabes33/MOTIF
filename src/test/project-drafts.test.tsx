import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { randomUUID } from "node:crypto";
import { Route as projectRoute } from "@/routes/projects";
import { createDraft, listDrafts } from "@/lib/projects/local-drafts";

vi.mock("@/components/Shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
function open(url: string) {
  const root = createRootRoute();
  const route = projectRoute.update({
    id: "/projects",
    path: "/projects",
    getParentRoute: () => root,
  } as Parameters<typeof projectRoute.update>[0]);
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  return { router, ...render(<RouterProvider router={router} />) };
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

it("creates a named empty draft, reopens its URL after remount, and handles missing local data", async () => {
  vi.stubGlobal("crypto", { randomUUID });
  const first = open("/projects");
  const input = await screen.findByLabelText("Project name");
  fireEvent.change(input, { target: { value: "  Product launch  " } });
  fireEvent.click(screen.getByRole("button", { name: "Create project" }));
  await screen.findByText("This project is empty. No media is attached.");
  const url = first.router.state.location.href;
  expect(url).toMatch(/project=/);
  first.unmount();
  const second = open(url);
  await screen.findByRole("heading", { name: "Product launch" });
  fireEvent.click(screen.getByRole("link", { name: "All projects" }));
  expect(await screen.findByRole("link", { name: "Product launch" })).toHaveAttribute("href", url);
  second.unmount();
  localStorage.clear();
  open(url);
  await screen.findByText("Project not found in this browser profile.");
});

it("keeps the form and name when storage refuses a write", async () => {
  vi.stubGlobal("crypto", { randomUUID });
  open("/projects");
  const input = await screen.findByLabelText("Project name");
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("full");
  });
  fireEvent.change(input, { target: { value: "Unsaved" } });
  fireEvent.click(screen.getByRole("button", { name: "Create project" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Could not save"));
  expect(input).toHaveValue("Unsaved");
});

it("rejects empty and oversized names without writing", () => {
  for (const name of ["   ", "a".repeat(101)])
    expect(() => createDraft(localStorage, name)).toThrow();
  expect(listDrafts(localStorage)).toEqual([]);
});
