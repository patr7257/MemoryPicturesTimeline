import type { CountryStats } from "@/lib/countries";

type Props =
  | { mode: "single"; label: string; stats: CountryStats }
  | {
      mode: "compare";
      a: { name: string; total: number };
      b: { name: string; total: number };
      onlyA: number;
      onlyB: number;
      both: number;
    };

const countriesText = (n: number) =>
  n === 1 ? "1 country or territory" : `${n} countries and territories`;

// Stats count visited only (countryStats). Every coloured swatch sits next to
// its words, so nothing is told by colour alone.
export function CountryStatsPanel(props: Props) {
  if (props.mode === "compare") {
    const { a, b, onlyA, onlyB, both } = props;
    return (
      <section aria-labelledby="country-stats" className="flex flex-col gap-4">
        <h2 id="country-stats" className="sr-only">
          Stats
        </h2>
        <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
          <p className="font-hand text-3xl leading-tight">
            {a.name}: {countriesText(a.total)}
          </p>
          <p className="font-hand text-3xl leading-tight">
            {b.name}: {countriesText(b.total)}
          </p>
        </div>
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Part swatch="bg-country-a" label={`Only ${a.name}`} value={onlyA} />
          <Part swatch="bg-country-b" label={`Only ${b.name}`} value={onlyB} />
          <Part swatch="bg-country-both" label="Both" value={both} />
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

function Part({ swatch, label, value }: { swatch: string; label: string; value: number }) {
  return (
    <li className="flex items-center gap-2">
      <span aria-hidden className={`size-3 shrink-0 rounded-full ${swatch}`} />
      <span>
        {label}: <span className="font-semibold tabular-nums">{value}</span>
      </span>
    </li>
  );
}
