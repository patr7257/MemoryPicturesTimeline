"use client";

import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

// Same-origin app: no baseURL needed, the client talks to /api/auth on the
// current origin in both dev and prod.
export const authClient = createAuthClient({
  plugins: [magicLinkClient(), passkeyClient()],
});
