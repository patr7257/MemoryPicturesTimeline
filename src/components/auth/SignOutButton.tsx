"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";

import { SignOutDialog } from "@/components/auth/SignOutDialog";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <LogOut data-slot="icon" />
        Sign out
      </Button>
      <SignOutDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
