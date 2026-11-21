import { PersonDot } from "@/components/family/PersonDot";
import type { FamilyWithMembers, PersonChoice } from "@/lib/family-queries";
import { resolvePersonColors } from "@/lib/person-colors";

// Read-only /family for everyone who is not a super admin: their own families
// and the people in them. No emails, no roles, no buttons.
export function FamilyView({
  families,
  people,
  hasPerson,
}: {
  families: FamilyWithMembers[];
  people: PersonChoice[];
  hasPerson: boolean;
}) {
  const colors = resolvePersonColors(people);
  const byId = new Map(people.map((p) => [p.id, p]));

  return (
    <main className="mx-auto max-w-xl px-4 pt-6 pb-24 sm:px-6">
      <h1 className="font-hand mb-6 text-4xl">Family</h1>
      {!hasPerson ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          An admin has not linked your login to a person yet.
        </p>
      ) : families.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          You are not in a family yet. An admin can add you.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {families.map((f) => (
            <section key={f.id} aria-labelledby={`family-${f.id}`}>
              <h2 id={`family-${f.id}`} className="font-hand mb-2 text-2xl">
                {f.name}
              </h2>
              <ul className="flex flex-wrap gap-x-5 gap-y-2">
                {f.memberIds.map((id) => {
                  const p = byId.get(id);
                  if (!p) return null;
                  return (
                    <li key={id} className="flex items-center gap-2 text-base">
                      <PersonDot hex={colors[id]} />
                      {p.name}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
