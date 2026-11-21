import { PushSettings } from "@/components/push/PushSettings";
import { requireSession } from "@/lib/session";

export default async function SettingsPage() {
  await requireSession();
  return (
    <main className="mx-auto max-w-xl px-6 pb-24">
      <h1 className="py-6 font-hand text-4xl">Settings</h1>
      <section aria-labelledby="alerts-heading" className="space-y-3">
        <h2 id="alerts-heading" className="font-hand text-2xl">
          Alerts
        </h2>
        <PushSettings />
      </section>
    </main>
  );
}
