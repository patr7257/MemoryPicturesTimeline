import { FamilyAdmin } from "@/components/family/FamilyAdmin";
import { FamilyView } from "@/components/family/FamilyView";
import { getViewer } from "@/lib/access";
import { canAdminister } from "@/lib/access-policy";
import { invitePersonId } from "@/lib/family-admin";
import { getViewerFamilies, getVisiblePeople } from "@/lib/family-queries";
import { getFamilyAdminData } from "@/lib/member-queries";
import { resolvePersonColors } from "@/lib/person-colors";

// /family?invite=<personId>#people opens the invite form for that person.
export default async function FamilyPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string | string[] }>;
}) {
  const viewer = await getViewer();

  if (!canAdminister(viewer)) {
    // Read-only: only the viewer's own families and the people they may see.
    const [families, people] = await Promise.all([
      getViewerFamilies(viewer),
      getVisiblePeople(viewer),
    ]);
    return <FamilyView families={families} people={people} hasPerson={viewer.personId !== null} />;
  }

  const { invite } = await searchParams;
  const data = await getFamilyAdminData();
  return (
    <FamilyAdmin
      families={data.families}
      people={data.people}
      logins={data.logins}
      colors={resolvePersonColors(data.people)}
      viewerEmail={viewer.email}
      invitePersonId={invitePersonId(
        invite,
        data.people.map((p) => p.id),
      )}
    />
  );
}
