import { Clapperboard, Music2, Video } from "lucide-react";

export function AdminStats({
  total,
  withRecordings,
  withMerged,
  spotifyDone,
}: {
  total: number;
  withRecordings: number;
  withMerged: number;
  spotifyDone: number;
}) {
  const cards = [
    {
      label: "Total doctors",
      value: total,
      hint: "All podcast links",
      icon: Video,
    },
    {
      label: "With recordings",
      value: withRecordings,
      hint: "Submitted answers",
      icon: Clapperboard,
    },
    {
      label: "Merged uploaded",
      value: withMerged,
      hint: "Final video ready",
      icon: Clapperboard,
    },
    {
      label: "Spotify done",
      value: spotifyDone,
      hint: "Published episodes",
      icon: Music2,
    },
  ];

  return (
    <div className="flex flex-wrap gap-3 sm:gap-4">
      {cards.map((card) => (
        <article
          className="min-w-[calc(50%-0.375rem)] flex-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:min-w-[calc(50%-0.5rem)] sm:p-5 lg:min-w-[calc(25%-0.75rem)]"
          key={card.label}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500 sm:text-sm">{card.label}</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:mt-2 sm:text-3xl">
                {card.value}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-400 sm:mt-1 sm:text-xs">{card.hint}</p>
            </div>
            <div className="shrink-0 rounded-lg bg-slate-100 p-1.5 text-slate-500 sm:p-2">
              <card.icon className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
