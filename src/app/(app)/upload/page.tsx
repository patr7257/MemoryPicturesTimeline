import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { getViewer } from "@/lib/access";
import { getVisibleTripOptions } from "@/lib/queries";
import { UploadForm } from "@/components/upload/UploadForm";

export default async function UploadPage() {
  const tripOptions = await getVisibleTripOptions(await getViewer());

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
