import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

// Call at the top of every page and API route except /login and /api/auth.
export async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return session;
}

// Non-redirecting variant for API routes that should answer 401 instead.
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}
