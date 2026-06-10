import { CheckCircle2, Filter, Users, Video } from "lucide-react";

export function DashboardStats({
  total,
  processing,
  published,
  pending,
}: {
  total: number;
  processing: number;
  published: number;
  pending: number;
}) {
  const cards = [
    {
      label: "Total Doctors",
      value: total,
      hint: "All podcast links",
      icon: Users,
    },
    {
      label: "Processing",
      value: processing,
      hint: "In edit or recording",
      icon: Video,
    },
    {
      label: "Published",
      value: published,
      hint: "Available on Spotify",
      icon: CheckCircle2,
    },
    {
      label: "Pending Actions",
      value: pending,
      hint: "Requires review",
      icon: Filter,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <article
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          key={card.label}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-500">{card.label}</p>
              <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
                {card.value}
              </p>
              <p className="mt-1 text-xs text-slate-400">{card.hint}</p>
            </div>
            <div className="rounded-lg bg-slate-100 p-2 text-slate-500">
              <card.icon className="h-5 w-5" />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
