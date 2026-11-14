// Where the browser keeps the token of its account link. The token only names the link on the
// server: the API key or sign-in itself never reaches the browser.

const STORAGE_KEY = "motif.link";

// Used only when the browser blocks storage (some embedded and private windows): the token then
// lasts for the page.
let unstored: string | null = null;

export function readLinkToken(): string | null {
  // The server render has no browser, so no token: it must not remember one between requests.
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return unstored;
  }
}

export function writeLinkToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, token);
  } catch {
    unstored = token;
  }
}
