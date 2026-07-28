import { desc } from "drizzle-orm";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { getDb } from "@/db";
import { trips } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { UploadForm } from "@/components/upload/UploadForm";

export default async function UploadPage() {
  await requireSession();
  const tripOptions = await getDb()
    .select({ id: trips.id, title: trips.title, startDate: trips.startDate })
    .from(trips)
    .orderBy(desc(trips.startDate));

  return (
    <main className="mx-auto max-w-2xl p-6">
      <header className="flex items-center gap-3 pb-8">
        <Link href="/" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="font-hand text-4xl">Add memories</h1>
      </header>
      <UploadForm trips={tripOptions} />
    </main>
  );
}
