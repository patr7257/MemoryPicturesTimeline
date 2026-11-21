import type { CountryStats } from "@/lib/countries";
import { SHARED_COLOR, type Hex } from "@/lib/person-colors";

type Props =
  | { mode: "single"; label: string; stats: CountryStats }
  | {
      mode: "multi";
      people: { name: string; color: Hex; count: number }[];
      shared: number;
      total: number;
    };

const countriesText = (n: number) =>
  n === 1 ? "1 country or territory" : `${n} countries and territories`;

// Stats count visited only. Every coloured swatch sits next to its words, so
// nothing is told by colour alone.
export function CountryStatsPanel(props: Props) {
  if (props.mode === "multi") {
    const { people, shared, total } = props;
    return (
      <section aria-labelledby="country-stats" className="flex flex-col gap-4">
        <h2 id="country-stats" className="sr-only">
          Stats
        </h2>
        <p className="font-hand text-3xl leading-tight">{countriesText(total)} together</p>
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {people.map((p, i) => (
            <Part key={`${i}:${p.name}`} color={p.color} label={p.name} value={p.count} />
          ))}
          <Part color={SHARED_COLOR} label="Shared" value={shared} />
        </ul>
      </section>
    );
  }

  const { label, stats } = props;
  return (
    <section aria-labelledby="country-stats" className="flex flex-col gap-4">
      <h2 id="country-stats" className="sr-only">
        Stats for {label}
      </h2>
      <div className="flex flex-col gap-1">
        <p className="font-hand text-3xl leading-tight">{countriesText(stats.total)}</p>
        <p className="text-sm text-muted-foreground">
          {stats.unMembers} of {stats.unTotal} UN countries, {stats.percent}% of the world
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-4">
        {stats.continents.map((c) => (
          <div key={c.continent} className="flex items-baseline justify-between gap-2 border-b border-border/70 pb-1">
            <dt className="truncate text-muted-foreground">{c.continent}</dt>
            <dd className="font-semibold tabular-nums">
              {c.visited}/{c.total}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Part({ color, label, value }: { color: Hex; label: string; value: number }) {
  return (
    <li className="flex items-center gap-2">
      <span aria-hidden className="size-3 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: color }} />
      <span>
        {label}: <span className="font-semibold tabular-nums">{value}</span>
      </span>
    </li>
  );
}
