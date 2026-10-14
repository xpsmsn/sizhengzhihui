// AI生成
// 单篇政策解读：速览 / 要点 / 背景 / 意义与影响 / 原文金句 / 对辅导员的启示 / 思考题 / 相关阅读，
// 附站内阅读与原文链接。配图取自条目原文，经图片代理签名。
import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/insight-detail";
import type { InsightDetail } from "@aihot/contracts/site";
import { SITE } from "@aihot/site";
import { cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { pageMeta } from "../lib/seo";
import type { Screen } from "../components/shell/screens";

export const handle: Screen = { tab: "daily", name: "解读" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ request, params }: Route.LoaderArgs) {
  const data = await loadOr404<InsightDetail>(`/api/site/insights/${encodeURIComponent(params.articleId)}`, { signal: request.signal });
  return cachedPage(120, { data });
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  const title = loaderData?.data.title ?? "政策解读";
  const description = loaderData?.data.tldr || loaderData?.data.background || `${SITE.name} 政策解读。`;
  return pageMeta({ title, description, path: location.pathname });
}

export default function InsightDetailPage() {
  const { data } = useLoaderData<typeof loader>();
  const tldr = data.tldr?.trim() ?? "";
  return (
    <article className="mx-auto max-w-3xl px-4 pb-12 pt-5">
      <div className="mb-2 flex items-center gap-2 text-[12.5px] text-ink-4">
        <Link viewTransition to="/daily" className="hover:text-accent">政策解读</Link>
        <span aria-hidden="true">·</span>
        <span className="truncate">{data.sourceName}</span>
        <span className="num ml-auto rounded-full bg-accent-soft px-2 py-0.5 font-semibold text-accent">{data.score}</span>
      </div>
      <h1 className="text-[24px] font-semibold leading-[1.4] text-ink">{data.title}</h1>

      {data.cover && (
        <figure className="mt-4 overflow-hidden rounded-card ring-1 ring-line-soft">
          <img
            src={data.cover.url}
            {...(data.cover.srcSet ? { srcSet: data.cover.srcSet } : {})}
            sizes="(min-width: 768px) 768px, 100vw"
            width={data.cover.width ?? undefined}
            height={data.cover.height ?? undefined}
            alt=""
            loading="eager"
            decoding="async"
            className="h-auto w-full object-cover"
          />
        </figure>
      )}

      {tldr ? (
        <p className="mt-4 rounded-card bg-accent-softer px-4 py-3 text-[15px] font-medium leading-[1.8] text-ink ring-1 ring-accent/15">
          {tldr}
        </p>
      ) : (
        <p className="mt-3 text-[15px] leading-[1.9] text-ink-2">{data.background}</p>
      )}

      {data.keyPoints.length > 0 && (
        <section className="mt-6">
          <h2 className="text-[15px] font-semibold text-ink">要点</h2>
          <ul className="mt-2 space-y-2">
            {data.keyPoints.map((p, i) => (
              <li key={i} className="flex gap-2.5 text-[14.5px] leading-[1.85] text-ink-2">
                <span className="num mt-0.5 shrink-0 text-accent">{i + 1}</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tldr && data.background && (
        <section className="mt-6">
          <h2 className="text-[15px] font-semibold text-ink">背景</h2>
          <p className="mt-2 text-[14.5px] leading-[1.85] text-ink-2">{data.background}</p>
        </section>
      )}

      {data.significance && (
        <section className="mt-6">
          <h2 className="text-[15px] font-semibold text-ink">意义与影响</h2>
          <p className="mt-2 text-[14.5px] leading-[1.85] text-ink-2">{data.significance}</p>
        </section>
      )}

      {data.quote && (
        <blockquote className="mt-6 border-l-2 border-accent/40 pl-4 text-[14.5px] italic leading-[1.85] text-ink-3">
          {data.quote}
        </blockquote>
      )}

      {data.implications && (
        <section className="mt-6 rounded-card bg-accent-softer p-4 ring-1 ring-accent/15">
          <h2 className="text-[15px] font-semibold text-ink">对辅导员意味着什么</h2>
          <p className="mt-2 text-[14.5px] leading-[1.85] text-ink-2">{data.implications}</p>
        </section>
      )}

      {data.questions.length > 0 && (
        <section className="mt-6">
          <h2 className="text-[15px] font-semibold text-ink">思考与讨论</h2>
          <ul className="mt-2 space-y-2">
            {data.questions.map((q, i) => (
              <li key={i} className="flex gap-2.5 text-[14.5px] leading-[1.85] text-ink-2">
                <span className="num mt-0.5 shrink-0 text-accent">Q{i + 1}</span>
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.related.length > 0 && (
        <section className="mt-7 border-t border-line-soft pt-4">
          <h2 className="text-[15px] font-semibold text-ink">相关阅读</h2>
          <ul className="mt-2 space-y-2">
            {data.related.map((r) => (
              <li key={r.id} className="flex items-baseline gap-2 text-[13.5px] leading-relaxed">
                <Link viewTransition to={`/items/${r.id}`} className="text-accent hover:underline">{r.title}</Link>
                <span className="shrink-0 text-[12px] text-ink-4">{r.sourceName}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-line-soft pt-4 text-[13px]">
        <Link viewTransition to={`/items/${data.articleId}`} className="text-accent hover:underline">站内阅读</Link>
        {data.originalUrl && (
          <a href={data.originalUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">查看原文</a>
        )}
        <span className="ml-auto text-[12px] text-ink-4">解读由 AI 依据公开来源生成，仅供参考；事实以原文为准。</span>
      </div>
    </article>
  );
}
