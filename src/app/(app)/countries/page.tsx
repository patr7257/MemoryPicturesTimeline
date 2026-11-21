import { notFound } from "next/navigation";

import { CountriesPicker } from "@/components/countries/CountriesPicker";
import { CountriesView, type CountriesViewProps } from "@/components/countries/CountriesView";
import { getViewer } from "@/lib/access";
import {
  getCountrySuggestions,
  getPersonCountries,
  getPersonTarget,
  getVisitedByPerson,
} from "@/lib/country-queries";
import { resolveSelection } from "@/lib/countries";
import { parsePersonParam, type PersonParam } from "@/lib/person-filter";
import { getAllPeople } from "@/lib/queries";

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export default async function CountriesPage({
  searchParams,
}: {
  searchParams: Promise<{ person?: PersonParam; view?: string | string[] }>;
}) {
  const viewer = await getViewer();

  const params = await searchParams;
  const family = params.view === "family";
  const allPeople = await getAllPeople();
  const nameOf = new Map(allPeople.map((p) => [p.id, p.name]));
  // Unknown or deleted ids drop out here, so a stale link never errors.
  const picked = family ? [] : parsePersonParam(params.person).filter((id) => nameOf.has(id));
  const selection = resolveSelection({
    personIds: picked,
    family,
    viewerPersonId: viewer.personId,
    allPersonIds: allPeople.map((p) => p.id),
  });

  let view: CountriesViewProps;
  let viewKey: string;
  if (selection.mode === "single") {
    const target = await getPersonTarget(selection.personId);
    if (!target) notFound();
    const [{ tier, marks }, suggestions] = await Promise.all([
      getPersonCountries(viewer, target),
      getCountrySuggestions(viewer, target),
    ]);
    view = { mode: "single", person: { id: target.id, name: target.name }, tier, marks, suggestions };
    viewKey = `single:${target.id}`;
  } else if (selection.mode === "compare") {
    const visited = await getVisitedByPerson([selection.a, selection.b]);
    view = {
      mode: "compare",
      a: { id: selection.a, name: nameOf.get(selection.a) ?? "", visited: visited[selection.a] ?? [] },
      b: { id: selection.b, name: nameOf.get(selection.b) ?? "", visited: visited[selection.b] ?? [] },
    };
    viewKey = `compare:${selection.a},${selection.b}`;
  } else {
    const visited = await getVisitedByPerson(selection.personIds);
    const union = [...new Set(Object.values(visited).flat())].sort();
    const everyone = picked.length < 3;
    view = {
      mode: "union",
      label: everyone ? "The family" : joinNames(selection.personIds.map((id) => nameOf.get(id) ?? "")),
      visited: union,
      everyone,
    };
    viewKey = everyone ? "union:family" : `union:${selection.personIds.join(",")}`;
  }

  const meActive = !family && picked.length === 0 && selection.mode === "single";
  const familyActive = family || (picked.length === 0 && selection.mode === "union");

  return (
    <main className="mx-auto max-w-3xl px-4 pt-6 pb-24 sm:px-6">
      <h1 className="font-hand text-4xl">Countries</h1>
      {viewer.personId === null && (
        <p className="mt-2 text-sm text-muted-foreground">
          You are not linked to a person yet, so you have no map of your own. An admin can link you
          on the Members page.
        </p>
      )}
      <CountriesPicker
        people={allPeople}
        picked={picked}
        showMe={viewer.personId !== null}
        meActive={meActive}
        familyActive={familyActive}
      />
      <CountriesView key={viewKey} {...view} />
    </main>
  );
}
