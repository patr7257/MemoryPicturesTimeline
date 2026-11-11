import { getViewer } from "@/lib/access";
import { canAdminister } from "@/lib/access-policy";
import { getPeopleView } from "@/lib/member-queries";
import { PeopleManager } from "@/components/people/PeopleManager";

export default async function PeoplePage() {
  const viewer = await getViewer();
  const isAdmin = canAdminister(viewer);
  const people = await getPeopleView(isAdmin);

  return (
    <main className="mx-auto max-w-xl px-4 pt-6 pb-24 sm:px-6">
      <h1 className="font-hand mb-6 text-4xl">People</h1>
      <PeopleManager people={people} isAdmin={isAdmin} />
    </main>
  );
}
