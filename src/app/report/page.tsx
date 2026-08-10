import { Download, FileSpreadsheet } from "lucide-react";

export default function ReportPage() {
  return (
    <div className="space-y-6">
      <header className="border-b border-slate-200 pb-5">
        <div className="flex items-end gap-3">
          <span className="mb-1.5 h-8 w-1 rounded-full bg-slate-900" aria-hidden />
          <div>
            <p className="text-[11px] font-semibold tracking-[0.28em] text-slate-400 uppercase">
              Workspace
            </p>
            <h1 className="mt-0.5 text-3xl font-bold tracking-[-0.03em] text-slate-900 sm:text-[2.35rem]">
              Report
            </h1>
          </div>
        </div>
      </header>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-col gap-5 px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-[#1a3a32] p-3 text-white shadow-sm">
              <FileSpreadsheet className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Full Excel report
              </h2>
              <p className="mt-1 max-w-md text-sm leading-relaxed text-slate-500">
                Download the complete doctor podcast Excel file.
              </p>
            </div>
          </div>

          <a
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1a3a32] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#234f44] active:scale-[0.99]"
            download
            href="/api/report/excel"
          >
            <Download className="h-4 w-4" />
            Download Excel
          </a>
        </div>
      </section>
    </div>
  );
}
