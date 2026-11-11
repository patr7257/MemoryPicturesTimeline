import { PushSettings } from "@/components/push/PushSettings";
import { requireSession } from "@/lib/session";

export default async function NotificationsPage() {
  await requireSession();
  return (
    <main className="mx-auto max-w-xl px-6 pb-24">
      <h1 className="py-6 font-hand text-4xl">Notifications</h1>
      <PushSettings />
    </main>
  );
}
