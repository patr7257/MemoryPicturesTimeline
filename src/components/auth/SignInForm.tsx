"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint, Mail } from "lucide-react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  // iOS Safari requires the WebAuthn call to run inside the user gesture:
  // no awaits before signIn.passkey() in this handler.
  function signInWithPasskey() {
    void authClient.signIn.passkey().then((res) => {
      if (res?.error) {
        toast.error("Passkey sign-in did not work. Use the email link below.");
      } else {
        router.push("/");
        router.refresh();
      }
    });
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    const address = email.trim();
    if (!address) return;
    setSending(true);
    await authClient.signIn.magicLink({ email: address, callbackURL: "/" });
    setSending(false);
    // Always the same message: never reveals whether the address is family.
    setSent(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <Button size="lg" className="w-full" onClick={signInWithPasskey}>
        <Fingerprint data-slot="icon" />
        Sign in with passkey
      </Button>

      <div className="flex items-center gap-3 text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase tracking-wide">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {sent ? (
        <p className="text-center text-sm text-muted-foreground">
          If that address is in the family, a sign-in link is on its way.
          Check your email.
        </p>
      ) : (
        <form onSubmit={sendMagicLink} className="flex flex-col gap-3">
          <Label htmlFor="email">Email me a sign-in link</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={sending}
            className="w-full"
          >
            <Mail data-slot="icon" />
            {sending ? "Sending..." : "Send link"}
          </Button>
        </form>
      )}
    </div>
  );
}
