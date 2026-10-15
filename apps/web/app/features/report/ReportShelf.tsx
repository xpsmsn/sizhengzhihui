// AI生成
// 本期报告：把周报、月报的最新一期收进政策解读页的一条刊头带。
// 刊名、路径与导语沿用报告页同一套来源（features/report/format 与 site/site.ts），不另起文案。
import { Link } from "react-router";
import type { ReportKind, ReportLatestPage } from "@aihot/contracts/site";
import { REPORTS } from "@aihot/site";
import { IconChevronRight } from "../../components/icons";
import { KIND_LABEL, KIND_PATH } from "./format";

/** 政策解读页能直达的报告刊物：日报的位子已让给解读，只剩周报与月报两刊。 */
const SHELF_KINDS: ReportKind[] = ["weekly", "monthly"];

/** 刊名第一个字，做一枚栏目印。 */
const SHELF_MARK: Record<ReportKind, string> = { daily: "日", weekly: "周", monthly: "月" };

function ShelfTile({ kind, page }: { kind: ReportKind; page: ReportLatestPage | null }) {
  const report = page?.report ?? null;
  const label = KIND_LABEL[kind];
  const meta = [report?.issueNumber != null ? `第 ${report.issueNumber} 期` : null, report?.readingMinutes ? `${report.readingMinutes} 分钟` : null].filter((m): m is string => m !== null);
  return (
    <Link viewTransition to={KIND_PATH[kind]} className="group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-bg-sunk/60 sm:px-5">
      <span aria-hidden="true" className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-tile bg-accent-softer text-[15px] font-semibold text-accent">
        {SHELF_MARK[kind]}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5 text-[12px] text-ink-4">
          <span className="font-semibold text-ink">{label}</span>
          {meta.length > 0 ? <span className="num">{meta.join(" · ")}</span> : null}
        </span>
        <span className="mt-1 block text-[14.5px] font-semibold leading-[1.5] text-ink transition-colors group-hover:text-accent">
          {report?.title ?? "第一期发布后出现在这里"}
        </span>
        <span className="mt-0.5 block truncate text-[12.5px] leading-[1.6] text-ink-3">{REPORTS.descriptions[kind]}</span>
      </span>
      <IconChevronRight size={14} className="mt-1 shrink-0 text-ink-4 transition-colors group-hover:text-accent" />
    </Link>
  );
}

/**
 * 政策解读页的「本期报告」刊头带：周报、月报各一格，给出最新一期的期号、标题与栏目导语。
 * 数据来自 /api/site/reports/{kind}/latest-page；某一刊尚未出刊（page 为 null 或 report 为空）时，
 * 仍保留入口与导语，只是不显示期号。
 */
export function ReportShelf({ weekly, monthly }: { weekly: ReportLatestPage | null; monthly: ReportLatestPage | null }) {
  const pages: Record<ReportKind, ReportLatestPage | null> = { daily: null, weekly, monthly };
  return (
    <section aria-labelledby="report-shelf-title" className="mb-5">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 id="report-shelf-title" className="text-[13px] font-semibold text-ink">本期报告</h2>
        <span className="text-[12px] text-ink-4">每周综合回顾 · 每月盘点</span>
      </div>
      <div className="card grid grid-cols-1 divide-y divide-line overflow-hidden sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        {SHELF_KINDS.map((kind) => (
          <ShelfTile key={kind} kind={kind} page={pages[kind]} />
        ))}
      </div>
    </section>
  );
}
