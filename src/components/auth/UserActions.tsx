"use client";

import { useRouter } from "next/navigation";
import { Fingerprint, LogOut } from "lucide-react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function UserActions() {
  const router = useRouter();

  // Runs directly in the click handler (WebAuthn user-gesture requirement).
  function addPasskey() {
    void authClient.passkey.addPasskey().then((res) => {
      if (res?.error) {
        toast.error("Could not add a passkey on this device.");
      } else {
        toast.success("Passkey added. Next time, sign in with one tap.");
      }
    });
  }

  async function signOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={addPasskey}>
        <Fingerprint data-slot="icon" />
        Add passkey
      </Button>
      <Button variant="ghost" size="sm" onClick={signOut}>
        <LogOut data-slot="icon" />
        Sign out
      </Button>
    </div>
  );
}
