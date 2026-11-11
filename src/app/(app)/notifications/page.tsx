import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PushSettings } from "@/components/push/PushSettings";
import { requireSession } from "@/lib/session";

export default async function NotificationsPage() {
  await requireSession();
  return (
    <main className="mx-auto max-w-xl px-6 pb-24">
      <header className="flex items-center gap-3 py-6">
        <Link href="/" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="font-hand text-4xl">Notifications</h1>
      </header>
      <PushSettings />
    </main>
  );
}
