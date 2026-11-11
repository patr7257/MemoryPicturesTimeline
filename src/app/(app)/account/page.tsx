import Link from "next/link";
import { Bell } from "lucide-react";
import { eq } from "drizzle-orm";

import { PasskeyManager } from "@/components/auth/PasskeyManager";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDb } from "@/db";
import { people } from "@/db/schema";
import { getViewer } from "@/lib/access";

const heading = "text-sm font-semibold tracking-wide text-muted-foreground uppercase";

export default async function AccountPage() {
  const viewer = await getViewer();
  const person = viewer.personId
    ? await getDb().query.people.findFirst({ where: eq(people.id, viewer.personId) })
    : undefined;

  return (
    <main className="mx-auto max-w-xl space-y-8 px-6 pb-12">
      <h1 className="pt-6 font-hand text-4xl">Account</h1>

      <section aria-labelledby="profile-heading" className="space-y-3">
        <h2 id="profile-heading" className={heading}>
          Profile
        </h2>
        <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-2 border border-border bg-card p-4 text-sm">
          <dt className="text-muted-foreground">Name</dt>
          <dd className="min-w-0 truncate">{viewer.name}</dd>
          <dt className="text-muted-foreground">Email</dt>
          <dd className="min-w-0 truncate">{viewer.email}</dd>
          <dt className="text-muted-foreground">Role</dt>
          <dd>
            <Badge variant="secondary">{viewer.role === "super_admin" ? "Admin" : "Member"}</Badge>
          </dd>
          <dt className="text-muted-foreground">Person</dt>
          <dd>
            {person ? (
              person.name
            ) : (
              <span className="text-muted-foreground">Not linked to a person yet</span>
            )}
          </dd>
        </dl>
      </section>

      <section aria-labelledby="passkeys-heading" className="space-y-3">
        <h2 id="passkeys-heading" className={heading}>
          Passkeys
        </h2>
        <PasskeyManager />
      </section>

      <section aria-labelledby="settings-heading" className="space-y-3">
        <h2 id="settings-heading" className={heading}>
          Settings
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" nativeButton={false} render={<Link href="/notifications" />}>
            <Bell data-slot="icon" />
            Notification settings
          </Button>
          <SignOutButton />
        </div>
      </section>
    </main>
  );
}
