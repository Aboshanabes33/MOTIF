import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppearanceSelect, AppearanceSettings } from "@/components/Appearance";

function show() {
  return render(
    <AppearanceSettings>
      <AppearanceSelect />
    </AppearanceSettings>,
  );
}
const control = () => screen.getByRole("combobox", { name: "Appearance" });
const choose = (value: string) => fireEvent.change(control(), { target: { value } });
const isDark = () => document.documentElement.classList.contains("dark");

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

describe("appearance", () => {
  it("keeps the original dark default and restores a saved choice", () => {
    localStorage.setItem("motif.appearance", "unknown");
    const first = show();
    expect(control()).toHaveValue("dark");
    expect(isDark()).toBe(true);
    choose("light");
    expect(isDark()).toBe(false);
    first.unmount();
    show();
    expect(control()).toHaveValue("light");
    expect(isDark()).toBe(false);
  });

  it("tracks system changes only while System is selected", () => {
    const media = Object.assign(new EventTarget(), { matches: false });
    vi.spyOn(window, "matchMedia").mockReturnValue(media as MediaQueryList);
    show();
    choose("system");
    expect(isDark()).toBe(false);
    media.matches = true;
    act(() => {
      media.dispatchEvent(new Event("change"));
    });
    expect(isDark()).toBe(true);
    choose("light");
    act(() => {
      media.dispatchEvent(new Event("change"));
    });
    expect(isDark()).toBe(false);
  });

  it("lets the user switch for this visit even when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    show();
    choose("light");
    expect(control()).toHaveValue("light");
    expect(isDark()).toBe(false);
  });
});
