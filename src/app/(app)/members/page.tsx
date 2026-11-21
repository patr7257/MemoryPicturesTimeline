import { redirect } from "next/navigation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Old links /members?invite=<personId> land on the People tab of /family.
export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string | string[] }>;
}) {
  const { invite } = await searchParams;
  const wanted = Array.isArray(invite) ? invite[0] : invite;
  if (wanted && UUID.test(wanted)) redirect(`/family?invite=${wanted}#people`);
  redirect("/family#people");
}
