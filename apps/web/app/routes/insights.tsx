// AI生成
// 政策解读页（原日报位）：列出为高分条目生成的原创解读，顶部保留周报入口。
import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/insights";
import type { InsightsResponse } from "@aihot/contracts/site";
import { SITE } from "@aihot/site";
import { cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { pageMeta } from "../lib/seo";
import { EmptyState } from "../components/ui/Page";
import type { Screen } from "../components/shell/screens";

export const handle: Screen = { tab: "daily", name: "解读" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ request }: Route.LoaderArgs) {
  const data = await loadOr404<InsightsResponse>("/api/site/insights", { signal: request.signal });
  return cachedPage(60, { data });
}

export function meta({ location }: Route.MetaArgs) {
  return pageMeta({ title: "政策解读", description: `${SITE.name} 针对重要政策与讲话的原创解读。`, path: location.pathname });
}

export default function Insights() {
  const { data } = useLoaderData<typeof loader>();
  return (
    <div className="mx-auto max-w-3xl px-4 pb-10 pt-5">
      <header className="mb-6">
        <h1 className="text-[24px] font-semibold leading-[1.3] text-ink">政策解读</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">
          针对重要政策与讲话的原创解读，帮你在几分钟内读懂要点与含义。每周另有一份
          <Link viewTransition to="/weekly" className="mx-0.5 text-accent hover:underline">周报</Link>。
        </p>
      </header>
      {data.items.length === 0 ? (
        <EmptyState title="暂无解读">出现评分 82 分以上的重要讲话或政策文件时，会在这里自动生成解读。</EmptyState>
      ) : (
        <ol className="space-y-3.5">
          {data.items.map((it) => (
            <li key={it.articleId}>
              <Link viewTransition to={`/daily/${it.articleId}`} className="card block p-4 transition-colors hover:bg-bg-sunk/60">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-[16px] font-semibold leading-[1.5] text-ink">{it.title}</h2>
                  <span className="num shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[12px] font-semibold text-accent">{it.score}</span>
                </div>
                <p className="mt-2 line-clamp-2 text-[13.5px] leading-relaxed text-ink-3">{it.tldr || it.background}</p>
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
    </div>
  );
}