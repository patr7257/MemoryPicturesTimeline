import { requireSession } from "@/lib/session";
import { UserActions } from "@/components/auth/UserActions";

export default async function TimelinePage() {
  const session = await requireSession();

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="flex items-center justify-between gap-4 pb-10">
        <h1 className="font-hand text-4xl">Family Memories</h1>
        <UserActions />
      </header>

      {/* M3 replaces this with the real scrapbook timeline. */}
      <section className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
        <p className="font-hand text-2xl">
          Hi {session.user.name || session.user.email}!
        </p>
        <p className="mt-2 text-sm">
          The timeline is on its way. Soon this page scrolls down memory lane.
        </p>
      </section>
    </main>
  );
}
