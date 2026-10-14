// AI生成
// 标签总览：所有主体标签及其解读数（标签云）。
import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/tags";
import type { InsightTagsResponse } from "@aihot/contracts/site";
import { cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { pageMeta } from "../lib/seo";
import { EmptyState, ReadingLayout } from "../components/ui/Page";
import type { Screen } from "../components/shell/screens";

export const handle: Screen = { tab: "daily", name: "标签" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ request }: Route.LoaderArgs) {
  const data = await loadOr404<InsightTagsResponse>("/api/site/tags", { signal: request.signal });
  return cachedPage(120, { data });
}

export function meta({ location }: Route.MetaArgs) {
  return pageMeta({ title: "标签 · 政策解读", description: "按部门、文件、群体浏览政策解读。", path: location.pathname });
}

export default function TagsIndex() {
  const { data } = useLoaderData<typeof loader>();
  return (
    <ReadingLayout>
      <header className="mb-5">
        <nav className="mb-2 flex items-center gap-2 text-[12.5px] text-ink-4">
          <Link viewTransition to="/daily" className="transition-colors hover:text-accent">政策解读</Link>
          <span aria-hidden="true">·</span>
          <span>标签</span>
        </nav>
        <h1 className="text-[24px] font-semibold leading-[1.3] text-ink lg:text-[28px]">标签</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">按涉及的部门、文件与群体，浏览相关解读。</p>
      </header>
      {data.items.length === 0 ? (
        <EmptyState title="暂无标签">解读生成后会带上主体标签，汇总在这里。</EmptyState>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {data.items.map((t) => (
            <Link
              key={t.tag}
              viewTransition
              to={`/tags/${encodeURIComponent(t.tag)}`}
              className="rounded-full bg-bg-sunk px-2.5 py-1 text-[13px] text-ink-3 transition-colors hover:bg-accent-soft hover:text-accent"
            >
              {t.tag}
              <span className="num ml-1 text-[11px] text-ink-4">{t.count}</span>
            </Link>
          ))}
        </div>
      )}
    </ReadingLayout>
  );
}
