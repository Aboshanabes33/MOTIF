import { createContext, useContext } from "react";

import type { LinkedAccount } from "./account-link";

export type AccountLinkState = {
  /** The account this browser has linked, or null. */
  account: LinkedAccount | null;
  /** False until the server has said whether an account is linked. */
  ready: boolean;
  /** Opens the pop-up that links, changes or unlinks the account. */
  openLink: () => void;
};

export const AccountLinkContext = createContext<AccountLinkState>({
  account: null,
  ready: false,
  openLink: () => {},
});

export function useAccountLink(): AccountLinkState {
  return useContext(AccountLinkContext);
}
