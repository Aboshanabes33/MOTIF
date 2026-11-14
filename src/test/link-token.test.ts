import { afterEach, describe, expect, it, vi } from "vitest";

import { readLinkToken, writeLinkToken } from "@/lib/link-token";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  writeLinkToken(null);
});

describe("the link token in the browser", () => {
  it("is kept in local storage, so a reload and other tabs find it", () => {
    expect(readLinkToken()).toBeNull();

    writeLinkToken("Jw3_token-of-43-characters-0000000000000000");

    expect(window.localStorage.getItem("motif.link")).toBe(
      "Jw3_token-of-43-characters-0000000000000000",
    );
    expect(readLinkToken()).toBe("Jw3_token-of-43-characters-0000000000000000");

    writeLinkToken(null);

    expect(window.localStorage.getItem("motif.link")).toBeNull();
    expect(readLinkToken()).toBeNull();
  });

  it("lasts for the page when the browser blocks storage", () => {
    const blocked = () => {
      throw new DOMException("Access is denied for this document.", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(blocked);

    expect(readLinkToken()).toBeNull();
    writeLinkToken("Jw3_token-of-43-characters-0000000000000000");
    expect(readLinkToken()).toBe("Jw3_token-of-43-characters-0000000000000000");
    writeLinkToken(null);
    expect(readLinkToken()).toBeNull();
  });
});
