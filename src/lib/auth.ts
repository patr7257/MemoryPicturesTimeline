import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";

import { getDb } from "@/db";
import { sendMagicLinkEmail } from "@/lib/email";

// Comma-separated family allowlist. Read per call so a Dokploy env change
// only needs a container restart, not a rebuild.
function familyEmails(): string[] {
  return (process.env.FAMILY_EMAILS ?? "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(getDb(), { provider: "pg" }),
  // No passwords, ever: magic link registers/signs in, passkeys for one-tap.
  emailAndPassword: { enabled: false },
  trustedOrigins: [
    "https://memories.patrickrobel.dk",
    "http://localhost:3000",
  ],
  plugins: [
    magicLink({
      expiresIn: 600,
      sendMagicLink: async ({ email, url }) => {
        if (!familyEmails().includes(email.toLowerCase())) {
          // Silently drop so the UI's generic "check your email" never
          // reveals who is on the family allowlist.
          console.warn("auth: magic-link request for non-family email dropped");
          return;
        }
        await sendMagicLinkEmail(email, url);
      },
    }),
    passkey({
      rpID: process.env.PASSKEY_RP_ID ?? "localhost",
      rpName: "Family Memories",
      origin: process.env.PASSKEY_ORIGIN ?? "http://localhost:3000",
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
