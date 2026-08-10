import { Clock3, FilePlus2, Music2, Users } from "lucide-react";

export function DashboardStats({
  total,
  created,
  processing,
  published,
}: {
  total: number;
  created: number;
  processing: number;
  published: number;
}) {
  const cards = [
    {
      label: "Total doctors",
      value: total,
      hint: "In your scope",
      icon: Users,
    },
    {
      label: "Pending",
      value: created,
      hint: "Awaiting recordings",
      icon: FilePlus2,
    },
    {
      label: "Processing",
      value: processing,
      hint: "Recordings complete",
      icon: Clock3,
    },
    {
      label: "Published",
      value: published,
      hint: "Live on Spotify",
      icon: Music2,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
      {cards.map((card) => (
        <article
          className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5"
          key={card.label}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase sm:text-xs">
                {card.label}
              </p>
              <p className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                {card.value}
              </p>
              <p className="mt-1 text-[11px] text-slate-400 sm:text-xs">{card.hint}</p>
            </div>
            <div className="shrink-0 rounded-lg bg-slate-100 p-2 text-slate-500">
              <card.icon className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
