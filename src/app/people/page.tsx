import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { requireSession } from "@/lib/session";
import { getAllPeople } from "@/lib/queries";
import { PeopleManager } from "@/components/people/PeopleManager";

export default async function PeoplePage() {
  await requireSession();
  const people = await getAllPeople();

  return (
    <main className="mx-auto max-w-xl px-6 pb-24">
      <header className="flex items-center gap-3 py-6">
        <Link href="/" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="font-hand text-4xl">People</h1>
      </header>
      <PeopleManager people={people} />
    </main>
  );
}
