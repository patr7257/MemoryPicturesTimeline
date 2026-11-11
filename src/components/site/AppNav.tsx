import type { Role } from "@/lib/access-policy";

import { Header } from "./Header";

export type NavViewer = { name: string; email: string; role: Role };

// Placeholder shell: the persistent navigation (desktop top bar, mobile tab
// bar) replaces this body. The props are the contract with the layout.
export function AppNav({ viewer: _viewer }: { viewer: NavViewer }) {
  return <Header />;
}
