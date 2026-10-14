// AI生成
// 标签页：带某个主体标签的解读，把跨事件的同类解读串起来；
// 顶部给“主题趋势”（近 6 个月解读数的数据驱动小图），侧栏给“全部标签”。
import { Link, useLoaderData, useParams } from "react-router";
import type { Route } from "./+types/tag";
import type { InsightsResponse, InsightTagsResponse } from "@aihot/contracts/site";
import { cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { pageMeta } from "../lib/seo";
import { AsideCard, EmptyState, ReadingLayout } from "../components/ui/Page";
import type { Screen } from "../components/shell/screens";

export const handle: Screen = { tab: "daily", name: "标签" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ request, params }: Route.LoaderArgs) {
  const tag = params.tag;
  const [data, tags] = await Promise.all([
    loadOr404<InsightsResponse>(`/api/site/tags/${encodeURIComponent(tag)}`, { signal: request.signal }),
    loadOr404<InsightTagsResponse>("/api/site/tags", { signal: request.signal }),
  ]);
  return cachedPage(60, { data, tags, tag });
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  const tag = loaderData?.tag ?? "标签";
  return pageMeta({ title: `${tag} · 政策解读`, description: `带“${tag}”标签的政策解读。`, path: location.pathname });
}

/** 近 6 个月（含本月）的解读数量，用于标签页的主题趋势小图。 */
function monthlyCounts(items: InsightsResponse["items"]) {
  const now = new Date();
  const buckets: { key: string; label: string; count: number }[] = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    buckets.push({ key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, label: `${d.getUTCMonth() + 1}月`, count: 0 });
  }
  const index = new Map(buckets.map((b) => [b.key, b]));
  for (const it of items) {
    const bucket = index.get(it.generatedAt.slice(0, 7));
    if (bucket) bucket.count += 1;
  }
  return buckets;
}

export default function TagPage() {
  const { data, tags } = useLoaderData<typeof loader>();
  const { tag = "" } = useParams();
  const months = monthlyCounts(data.items);
  const maxCount = Math.max(...months.map((m) => m.count));
  const aside = (
    <AsideCard title="全部标签">
      <div className="flex flex-wrap gap-1.5">
        {tags.items.map((t) => (
          <Link
            key={t.tag}
            viewTransition
            to={`/tags/${encodeURIComponent(t.tag)}`}
            className={`rounded-full px-2.5 py-1 text-[12.5px] transition-colors ${t.tag === tag ? "bg-accent-soft font-semibold text-accent" : "bg-bg-sunk text-ink-3 hover:bg-accent-soft hover:text-accent"}`}
          >
            {t.tag}
            <span className="num ml-1 text-[11px] text-ink-4">{t.count}</span>
          </Link>
        ))}
      </div>
    </AsideCard>
  );
  return (
    <ReadingLayout aside={aside}>
      <header className="mb-5">
        <nav className="mb-2 flex items-center gap-2 text-[12.5px] text-ink-4">
          <Link viewTransition to="/daily" className="transition-colors hover:text-accent">政策解读</Link>
          <span aria-hidden="true">·</span>
          <span>标签</span>
        </nav>
        <h1 className="text-[24px] font-semibold leading-[1.3] text-ink lg:text-[28px]">{tag}</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">带该标签的解读，按生成时间排列。</p>
      </header>

      {data.items.length > 0 && (
        <div className="mb-5 rounded-card bg-bg-sunk/60 p-4 ring-1 ring-line-soft">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[13px] font-semibold text-ink">主题趋势</h2>
            <span className="text-[12px] text-ink-4">近 6 个月解读数</span>
          </div>
          <div className="mt-3 flex items-end gap-2">
            {months.map((m) => (
              <div key={m.key} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-16 w-full items-end">
                  <div
                    className="w-full rounded-t-[3px] bg-accent"
                    style={{ height: m.count > 0 ? `${Math.max(6, Math.round((m.count / maxCount) * 64))}px` : "0px" }}
                  />
                </div>
                <span className="num text-[11px] text-ink-4">{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.items.length === 0 ? (
        <EmptyState title="暂无相关解读">这个标签下暂时还没有解读。</EmptyState>
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
