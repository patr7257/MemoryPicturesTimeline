import { notFound } from "next/navigation";

import { CountriesView, type CountriesViewProps } from "@/components/countries/CountriesView";
import { PeopleFilter } from "@/components/filter/PeopleFilter";
import { getViewer } from "@/lib/access";
import { canSeeCountries } from "@/lib/access-policy";
import { getPersonCountries, getPersonTarget, getVisitedByPerson } from "@/lib/country-queries";
import { getViewerFamilies, getVisiblePeople } from "@/lib/family-queries";
import { resolvePersonColors } from "@/lib/person-colors";
import { parseFilterParams, resolveFilter, type FilterParams } from "@/lib/person-filter";

const PICK_SOMEONE = "Pick a person or a family to see their map.";

export default async function CountriesPage({ searchParams }: { searchParams: Promise<FilterParams> }) {
  const viewer = await getViewer();
  const params = await searchParams;
  const [families, people] = await Promise.all([getViewerFamilies(viewer), getVisiblePeople(viewer)]);

  // The bare URL is the viewer's own map with their own chip on. Turning the
  // last chip off gives `pick=none` (emptyAs "none"), which is not bare, so
  // it shows the empty map. Ids the viewer may not see are dropped by
  // resolveFilter and behave as absent.
  const parsed = parseFilterParams(params);
  const ownId = viewer.personId;
  const ownVisible = ownId !== null && people.some((p) => p.id === ownId);
  const selection = parsed.bare && ownVisible ? { familyIds: [], personIds: [ownId] } : parsed.selection;
  const resolved = resolveFilter({ selection, families, people });
  const effective = resolved.effective ?? [];

  let view: CountriesViewProps;
  if (effective.length === 0) {
    view = { mode: "empty", message: PICK_SOMEONE };
  } else if (effective.length === 1) {
    const target = await getPersonTarget(effective[0]);
    if (!target || !canSeeCountries(viewer, target)) notFound();
    const { tier, marks } = await getPersonCountries(viewer, target);
    view = { mode: "single", person: { id: target.id, name: target.name }, tier, marks };
  } else {
    // Visited rows only, and only for people the viewer may see.
    const visited = await getVisitedByPerson(viewer, effective);
    const colors = resolvePersonColors(people);
    const nameOf = new Map(people.map((p) => [p.id, p.name]));
    view = {
      mode: "multi",
      people: effective
        .filter((id) => visited[id] !== undefined && colors[id] !== undefined)
        .map((id) => ({ id, name: nameOf.get(id) ?? "", color: colors[id], visited: visited[id] })),
    };
  }
  const viewKey = view.mode === "empty" ? "empty" : `${view.mode}:${effective.join(",")}`;

  return (
    <main className="mx-auto max-w-3xl px-4 pt-6 pb-24 sm:px-6">
      <h1 className="font-hand text-4xl">Countries</h1>
      {viewer.personId === null && (
        <p className="mt-2 text-sm text-muted-foreground">
          You are not linked to a person yet, so you have no map of your own. An admin can link you
          on the Family page.
        </p>
      )}
      <div className="-mx-4 sm:-mx-6">
        <PeopleFilter pathname="/countries" resolved={resolved} families={families} emptyAs="none" />
      </div>
      <CountriesView key={viewKey} {...view} />
    </main>
  );
}
