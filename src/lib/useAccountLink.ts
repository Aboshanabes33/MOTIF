import { createContext, useContext } from "react";

import type { LinkedAccount } from "./provider-registry";

export type AccountLinkState = {
  /** The active connection this browser principal uses, or null. */
  account: LinkedAccount | null;
  /** Every validated connection for this principal. */
  accounts: LinkedAccount[];
  /** False until the server has said what this principal has connected. */
  ready: boolean;
  /** Opens the dialog that connects, selects, or disconnects providers. */
  openLink: () => void;
};

export const AccountLinkContext = createContext<AccountLinkState>({
  account: null,
  accounts: [],
  ready: false,
  openLink: () => {},
});

export function useAccountLink(): AccountLinkState {
  return useContext(AccountLinkContext);
}
