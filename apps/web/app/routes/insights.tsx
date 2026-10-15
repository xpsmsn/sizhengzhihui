// AI生成
// 政策解读页（原日报位）：主列顶部一条「本期报告」刊头带（周报、月报最新一期），下面列出为高分条目
// 生成的原创解读，沿用站点统一阅读布局（主列 + 侧栏）。
import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/insights";
import type { InsightsResponse, ReportLatestPage } from "@aihot/contracts/site";
import { SITE } from "@aihot/site";
import { cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { pageMeta } from "../lib/seo";
import { AsideCard, EmptyState, ReadingLayout } from "../components/ui/Page";
import { ReportShelf } from "../features/report/ReportShelf";
import type { Screen } from "../components/shell/screens";

export const handle: Screen = { tab: "daily", name: "解读" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ request }: Route.LoaderArgs) {
  // 本期报告带：周报、月报各取最新一期（含归档索引）。取报告失败不该拖垮解读列表，故降级为不显示。
  const [data, weekly, monthly] = await Promise.all([
    loadOr404<InsightsResponse>("/api/site/insights", { signal: request.signal }),
    loadOr404<ReportLatestPage>("/api/site/reports/weekly/latest-page", { signal: request.signal }).catch(() => null),
    loadOr404<ReportLatestPage>("/api/site/reports/monthly/latest-page", { signal: request.signal }).catch(() => null),
  ]);
  return cachedPage(60, { data, weekly, monthly });
}

export function meta({ location }: Route.MetaArgs) {
  return pageMeta({ title: "政策解读", description: `${SITE.name} 针对重要政策与讲话的原创解读。`, path: location.pathname });
}

export default function Insights() {
  const { data, weekly, monthly } = useLoaderData<typeof loader>();
  const aside = (
    <AsideCard title="怎么读">
      <p className="text-[12.5px] leading-[1.75] text-ink-3">
        每篇解读都由 AI 依据公开来源生成，只挑评分 <span className="num font-semibold text-ink">82</span> 分以上的重要讲话与政策文件，帮你在几分钟内读懂要点与含义。
      </p>
      <p className="mt-3 border-t border-line-soft pt-3 text-[12px] leading-relaxed text-ink-4">
        解读仅供参考，事实以原文为准。
      </p>
    </AsideCard>
  );
  return (
    <ReadingLayout aside={aside}>
      <header className="mb-5">
        <h1 className="text-[24px] font-semibold leading-[1.3] text-ink lg:text-[28px]">政策解读</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">针对重要政策与讲话的原创解读，帮你在几分钟内读懂要点与含义。</p>
      </header>
      <ReportShelf weekly={weekly} monthly={monthly} />
      {data.items.length === 0 ? (
        <EmptyState title="暂无解读">出现评分 82 分以上的重要讲话或政策文件时，会在这里自动生成解读。</EmptyState>
      ) : (
        <ol className="space-y-3.5">
          {data.items.map((it) => (
            <li key={it.articleId}>
              <Link viewTransition to={`/daily/${it.articleId}`} className="card block p-4 transition-colors hover:bg-bg-sunk/60 lg:p-5">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-[16px] font-semibold leading-[1.5] text-ink lg:text-[17px]">{it.title}</h2>
                  <span className="num shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[12px] font-semibold text-accent">{it.score}</span>
                </div>
                <p className="mt-2 line-clamp-2 text-[13.5px] leading-[1.75] text-ink-3 lg:text-[14px]">{it.tldr || it.background}</p>
                <div className="mt-2.5 flex items-center gap-2 text-[12px] text-ink-4">
                  <span className="truncate">{it.sourceName}</span>
                  <span aria-hidden="true">·</span>
                  <span>要点 {it.pointCount} 条</span>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </ReadingLayout>
  );
}
