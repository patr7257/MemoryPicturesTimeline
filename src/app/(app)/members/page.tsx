import { notFound } from "next/navigation";

import { getViewer } from "@/lib/access";
import { canAdminister } from "@/lib/access-policy";
import { getMembersPageData } from "@/lib/member-queries";
import { MembersManager } from "@/components/members/MembersManager";

// /members?invite=<personId> opens the invite form with that person chosen.
export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string | string[] }>;
}) {
  const viewer = await getViewer();
  if (!canAdminister(viewer)) notFound();

  const { invite } = await searchParams;
  const { logins, people } = await getMembersPageData();
  const wanted = Array.isArray(invite) ? invite[0] : invite;
  const invitePersonId = people.some((p) => p.id === wanted) ? (wanted ?? null) : null;

  return (
    <main className="mx-auto max-w-2xl px-4 pt-6 pb-24 sm:px-6">
      <h1 className="font-hand mb-6 text-4xl">Members</h1>
      <MembersManager
        logins={logins}
        people={people}
        viewerEmail={viewer.email}
        invitePersonId={invitePersonId}
      />
    </main>
  );
}
