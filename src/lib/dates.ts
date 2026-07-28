// Date-range formatting for trip headers, e.g. "12 Jul 2019" or
// "12 Jul - 19 Jul 2019" or "28 Dec 2019 - 3 Jan 2020".
const FMT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const FMT_Y = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatTripDates(startDate: string, endDate: string | null): string {
  const start = new Date(startDate + "T00:00:00");
  if (!endDate || endDate === startDate) return FMT_Y.format(start);
  const end = new Date(endDate + "T00:00:00");
  if (start.getFullYear() === end.getFullYear()) {
    return `${FMT.format(start)} - ${FMT_Y.format(end)}`;
  }
  return `${FMT_Y.format(start)} - ${FMT_Y.format(end)}`;
}
