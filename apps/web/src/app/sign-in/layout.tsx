import type { ReactNode } from "react";
import { AccountsOnly } from "../../account/AccountsOnly.tsx";

export default function Layout({ children }: { children: ReactNode }) {
  return <AccountsOnly>{children}</AccountsOnly>;
}
