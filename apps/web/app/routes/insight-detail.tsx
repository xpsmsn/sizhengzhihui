// AI生成
// 单篇政策解读：速览 / 要点 / 背景 / 事件时间轴 / 意义与影响 / 原文金句 / 对辅导员的启示 / 思考题 / 相关阅读。
// 沿用站点统一长文布局（ArticleLayout：2xl 双侧栏，lg 右侧栏，手机单列），
// 阅读列限宽 760px，避免宽屏两侧留白。配图取自条目原文，经图片代理签名。
import type { ReactNode } from "react";
import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/insight-detail";
import type { InsightDetail } from "@aihot/contracts/site";
import { SITE } from "@aihot/site";
import { cachedPage, loadOr404 } from "../lib/api.server";
import { monthDayTime } from "../lib/format";
import { pageReuse } from "../lib/page-reuse";
import { pageMeta } from "../lib/seo";
import { ArticleLayout, RailSection } from "../components/ui/Page";
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

/** 统一的解读小节：小标题 + 正文，保持通篇一致的节奏。 */
function Section({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mt-7 scroll-mt-6 lg:mt-8">
      <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      <div className="mt-2.5 text-[15.5px] leading-[1.9] text-ink-2">{children}</div>
    </section>
  );
}

export default function InsightDetailPage() {
  const { data } = useLoaderData<typeof loader>();
  const tldr = data.tldr?.trim() ?? "";
  const timeline = data.timeline ?? [];

  const outline = [
    data.keyPoints.length > 0 && { id: "points", label: "要点" },
    tldr && data.background && { id: "background", label: "背景" },
    timeline.length > 1 && { id: "timeline", label: "事件时间轴" },
    data.significance && { id: "significance", label: "意义与影响" },
    data.implications && { id: "implications", label: "对辅导员意味着什么" },
    data.questions.length > 0 && { id: "questions", label: "思考与讨论" },
  ].filter(Boolean) as { id: string; label: string }[];

  const left = (
    <>
      <RailSection title="来源">
        <div className="text-[13px] font-semibold text-ink">{data.sourceName}</div>
        <div className="mt-2">
          <span className="num rounded-full bg-accent-soft px-2 py-0.5 text-[12px] font-semibold text-accent">评分 {data.score}</span>
        </div>
      </RailSection>
      {outline.length > 0 && (
        <RailSection title="本篇目录">
          <ul className="space-y-1.5">
            {outline.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-[12.5px] leading-relaxed text-ink-3 transition-colors hover:text-accent">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </RailSection>
      )}
    </>
  );

  const right = (
    <>
      <RailSection title="更多">
        <Link viewTransition to="/daily" className="text-[12.5px] font-semibold text-accent hover:text-accent-ink">
          全部政策解读
        </Link>
      </RailSection>
      <p className="text-[11.5px] leading-relaxed text-ink-4">
        解读由 AI 依据公开来源生成，仅供参考；事实以原文为准。
      </p>
    </>
  );

  return (
    <ArticleLayout left={left} right={right}>
      <article className="pb-8 pt-3 lg:pt-2 2xl:pt-1">
        <nav className="mb-3 flex items-center gap-2 text-[12.5px] text-ink-4">
          <Link viewTransition to="/daily" className="transition-colors hover:text-accent">政策解读</Link>
          <span aria-hidden="true">·</span>
          <span className="truncate">{data.sourceName}</span>
          <span className="num ml-auto shrink-0 rounded-full bg-accent-soft px-2 py-0.5 font-semibold text-accent lg:hidden">{data.score}</span>
        </nav>

        <h1 data-page-title="" className="text-[26px] font-bold leading-[1.38] tracking-[-0.01em] text-ink lg:text-[32px] lg:leading-[1.34] xl:text-[34px]">{data.title}</h1>

        {data.cover && (
          <figure className="mt-5 overflow-hidden rounded-card ring-1 ring-line-soft">
            <img
              src={data.cover.url}
              {...(data.cover.srcSet ? { srcSet: data.cover.srcSet } : {})}
              sizes="(min-width: 1024px) 760px, 100vw"
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
          <p className="mt-5 rounded-card bg-accent-softer px-4 py-3 text-[15.5px] font-medium leading-[1.85] text-ink ring-1 ring-accent/15">{tldr}</p>
        ) : (
          data.background && <p className="mt-5 text-[15.5px] leading-[1.9] text-ink-2">{data.background}</p>
        )}

        {data.keyPoints.length > 0 && (
          <Section id="points" title="要点">
            <ul className="space-y-2">
              {data.keyPoints.map((p, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="num mt-0.5 shrink-0 text-accent">{i + 1}</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {tldr && data.background && (
          <Section id="background" title="背景">
            <p>{data.background}</p>
          </Section>
        )}

        {timeline.length > 1 && (
          <Section id="timeline" title="事件时间轴">
            <ol className="border-l border-line">
              {timeline.map((t) => (
                <li key={t.id} className="relative pb-3.5 pl-4 last:pb-0">
                  <span
                    className={`absolute -left-[4.5px] top-[7px] h-2 w-2 rounded-full ring-2 ring-surface ${t.current ? "bg-accent" : "bg-line-strong"}`}
                    aria-hidden="true"
                  />
                  <div className="flex flex-wrap items-baseline gap-x-2 text-[12px] leading-[18px] text-ink-4">
                    <time dateTime={t.date} className="mono">{monthDayTime(t.date)}</time>
                    <span className="min-w-0 truncate">{t.sourceName}</span>
                    {t.current && <span className="rounded-full bg-accent-soft px-1.5 py-0.5 font-semibold text-accent">本篇</span>}
                  </div>
                  <Link viewTransition to={`/items/${t.id}`} className="mt-0.5 block text-[14.5px] leading-[1.6] text-ink transition-colors hover:text-accent">
                    {t.title}
                  </Link>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {data.significance && (
          <Section id="significance" title="意义与影响">
            <p>{data.significance}</p>
          </Section>
        )}

        {data.quote && (
          <blockquote className="mt-7 border-l-2 border-accent/40 pl-4 text-[15.5px] italic leading-[1.9] text-ink-3 lg:mt-8">
            {data.quote}
          </blockquote>
        )}

        {data.implications && (
          <section id="implications" className="mt-7 scroll-mt-6 rounded-card bg-accent-softer p-4 ring-1 ring-accent/15 lg:mt-8 lg:p-5">
            <h2 className="text-[15px] font-semibold text-ink">对辅导员意味着什么</h2>
            <p className="mt-2 text-[15.5px] leading-[1.9] text-ink-2">{data.implications}</p>
          </section>
        )}

        {data.questions.length > 0 && (
          <Section id="questions" title="思考与讨论">
            <ul className="space-y-2">
              {data.questions.map((q, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="num mt-0.5 shrink-0 text-accent">Q{i + 1}</span>
                  <span>{q}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {data.related.length > 0 && (
          <Section title="相关阅读">
            <ul className="divide-y divide-line-soft">
              {data.related.map((r) => (
                <li key={r.id} className="flex items-baseline gap-2 py-2 text-[14px] leading-relaxed">
                  <Link viewTransition to={`/items/${r.id}`} className="text-accent hover:underline">{r.title}</Link>
                  <span className="ml-auto shrink-0 text-[12px] text-ink-4">{r.sourceName}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4 text-[13.5px]">
          <Link viewTransition to={`/items/${data.articleId}`} className="font-semibold text-accent hover:text-accent-ink">站内阅读</Link>
          {data.originalUrl && (
            <a href={data.originalUrl} target="_blank" rel="noreferrer" className="font-semibold text-accent hover:text-accent-ink">查看原文</a>
          )}
        </div>
      </article>
    </ArticleLayout>
  );
}
