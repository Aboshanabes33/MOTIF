import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";

type Mode = "dark" | "light" | "system";
const key = "motif.appearance";
const parseMode = (value: string | null): Mode =>
  value === "light" || value === "system" ? value : "dark";
const AppearanceContext = createContext<{ mode: Mode; choose: (mode: Mode) => void } | null>(null);

export function AppearanceSettings({ children }: { children: ReactNode }) {
  // Match the server's existing dark appearance until the browser preference is available.
  const [mode, setMode] = useState<Mode>("dark");
  useLayoutEffect(() => {
    try {
      setMode(parseMode(localStorage.getItem(key)));
    } catch {
      // Storage can be disabled; the control still works for this visit.
    }
  }, []);
  useLayoutEffect(() => {
    const media = mode === "system" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    const apply = () =>
      document.documentElement.classList.toggle("dark", mode === "dark" || !!media?.matches);
    apply();
    media?.addEventListener("change", apply);
    return () => media?.removeEventListener("change", apply);
  }, [mode]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.storageArea === localStorage && (event.key === key || event.key === null)) {
        setMode(parseMode(event.newValue));
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  function choose(value: Mode) {
    setMode(value);
    try {
      localStorage.setItem(key, value);
    } catch {
      // Keep the in-memory preference if storage is unavailable.
    }
  }
  return (
    <AppearanceContext.Provider value={{ mode, choose }}>{children}</AppearanceContext.Provider>
  );
}

export function AppearanceSelect() {
  const settings = useContext(AppearanceContext);
  if (!settings) throw new Error("AppearanceSelect requires AppearanceSettings");
  return (
    <label className="flex items-center justify-between gap-2 px-2 pt-3 text-sm">
      Appearance
      <select
        value={settings.mode}
        onChange={(event) => settings.choose(parseMode(event.target.value))}
        className="rounded-md border border-border bg-secondary px-2 py-1 text-foreground"
      >
        <option value="dark">Dark</option>
        <option value="light">Light</option>
        <option value="system">System</option>
      </select>
    </label>
  );
}
