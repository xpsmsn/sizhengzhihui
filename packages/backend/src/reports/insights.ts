// AI生成
// 政策解读：为高分条目（score ≥ 82）生成一份结构化原创解读，供高校辅导员参考。
// 每个事件一篇：同事件取评分最高的条目；解读为再表达，原文只作输入，正文不搬运（避免版权问题）。
// 由定时任务 reports.insights 驱动，扫描“已精选、达到评分线、其事件还没有本版解读”的条目；版本升级时重建。
import { z } from "zod";
import type { InsightCover, InsightDetail, InsightRelated, InsightTimelineItem, InsightView } from "@aihot/contracts/site";
import { sql } from "../db.ts";
import { promptText, promptVersion } from "../editorial/prompts.ts";
import { modelFor } from "../editorial/models.ts";
import { chatJson } from "../providers/llm.ts";
import { completeReceipt } from "../providers/receipts.ts";
import { shutdownSignal } from "../jobs/queue.ts";
import { logError } from "../lib/log-error.ts";
import { proxiedImage, proxiedImageSet } from "../media/imgproxy.ts";

export const INSIGHT_VERSION = promptVersion("insight");
/** 生成解读的评分线。 */
export const INSIGHT_MIN_SCORE = 82;
/** 送进模型的正文字数上限。 */
const MAX_BODY_CHARS = 6000;

const InsightSchema = z.object({
  tldr: z.string().max(120).catch(""),
  background: z.string().max(400).catch(""),
  keyPoints: z.array(z.string().max(200)).max(6).catch([]),
  significance: z.string().max(800).catch(""),
  quote: z.string().max(300).catch(""),
  implications: z.string().max(600).catch(""),
  questions: z.array(z.string().max(200)).max(5).catch([]),
});

interface PendingRow {
  article_id: string;
  fact_id: number | null;
  score: number;
  title: string;
  summary: string | null;
  body_text: string | null;
  source_name: string;
}

/**
 * 待生成（或待重建）解读的条目：已公开、已精选、达到评分线，且其事件还没有本版解读。
 * 同事件的条目合并为一篇，取评分最高的那条；已存在但版本过旧的解读会被重建。
 */
async function pendingInsights(limit: number): Promise<PendingRow[]> {
  return sql<PendingRow[]>`
    SELECT * FROM (
      SELECT DISTINCT ON (coalesce(p.fact_id::text, p.article_id))
        p.article_id, p.fact_id, p.score, p.title, p.summary, a.body_text, s.name AS source_name
      FROM publications p
      JOIN sources s ON s.id = p.source_id
      JOIN articles a ON a.id = p.article_id
      LEFT JOIN LATERAL (
        SELECT i.version FROM insights i
        WHERE i.article_id = p.article_id OR (p.fact_id IS NOT NULL AND i.fact_id = p.fact_id)
        ORDER BY (i.article_id = p.article_id) DESC
        LIMIT 1
      ) cur ON true
      WHERE p.visibility = 'public' AND p.selected AND p.score IS NOT NULL AND p.score >= ${INSIGHT_MIN_SCORE}
        AND (cur.version IS NULL OR cur.version IS DISTINCT FROM ${INSIGHT_VERSION})
      ORDER BY coalesce(p.fact_id::text, p.article_id), p.score DESC
    ) sub
    ORDER BY score DESC
    LIMIT ${limit}`;
}

/** 生成一批待解读（或待重建）的条目。 */
export async function generatePendingInsights(limit = 5): Promise<{ generated: number; failed: number }> {
  const rows = await pendingInsights(limit);
  let generated = 0;
  let failed = 0;
  for (const r of rows) {
    if (shutdownSignal.signal.aborted) break;
    try {
      const model = await modelFor("report");
      const user = [
        `【标题】\n${r.title}`,
        r.summary ? `【摘要】\n${r.summary}` : "",
        r.body_text ? `【原文正文】\n${r.body_text.slice(0, MAX_BODY_CHARS)}` : "",
      ].filter(Boolean).join("\n\n");
      const res = await chatJson({
        model, purpose: "report_insight", subject: `insight:${r.article_id}`, promptVersion: INSIGHT_VERSION,
        system: promptText("insight"), user, schema: InsightSchema, temperature: 0.4, maxTokens: 2200,
      });
      const d = res.data;
      if (!d.tldr.trim() && !d.background.trim() && !d.implications.trim() && d.keyPoints.length === 0) {
        if (res.receiptId !== null) await completeReceipt(sql, res.receiptId);
        failed += 1;
        continue;
      }
      await sql.begin(async (tx) => {
        // 同一事件只保留最新一篇：代表条目若发生迁移，清掉旧代表上的遗留行。
        if (r.fact_id !== null) {
          await tx`DELETE FROM insights WHERE fact_id = ${r.fact_id} AND article_id <> ${r.article_id}`;
        }
        await tx`
          INSERT INTO insights (article_id, fact_id, score, title, source_name, tldr, background, key_points, significance, quote, implications, questions, model, version, generated_at)
          VALUES (${r.article_id}, ${r.fact_id}, ${r.score}, ${r.title}, ${r.source_name},
                  ${d.tldr}, ${d.background}, ${tx.json(d.keyPoints as never)}, ${d.significance}, ${d.quote},
                  ${d.implications}, ${tx.json(d.questions as never)}, ${model}, ${INSIGHT_VERSION}, now())
          ON CONFLICT (article_id) DO UPDATE SET
            fact_id = EXCLUDED.fact_id, score = EXCLUDED.score, title = EXCLUDED.title, source_name = EXCLUDED.source_name,
            tldr = EXCLUDED.tldr, background = EXCLUDED.background, key_points = EXCLUDED.key_points,
            significance = EXCLUDED.significance, quote = EXCLUDED.quote, implications = EXCLUDED.implications,
            questions = EXCLUDED.questions, model = EXCLUDED.model, version = EXCLUDED.version, generated_at = now()`;
        if (res.receiptId !== null) await completeReceipt(tx, res.receiptId);
      });
      generated += 1;
    } catch (error) {
      if (shutdownSignal.signal.aborted) throw error;
      failed += 1;
      console.error(JSON.stringify({ level: "error", msg: "insight failed", article: r.article_id, error: logError(error) }));
    }
  }
  return { generated, failed };
}

interface InsightRow {
  article_id: string;
  fact_id: number | null;
  title: string;
  source_name: string;
  score: number;
  tldr: string;
  background: string;
  key_points: string[] | null;
  significance: string;
  quote: string;
  implications: string;
  questions: string[] | null;
  generated_at: Date;
  url: string | null;
}

function toView(r: InsightRow): InsightView {
  return {
    articleId: r.article_id,
    title: r.title,
    sourceName: r.source_name,
    score: r.score,
    tldr: r.tldr,
    background: r.background,
    pointCount: (r.key_points ?? []).length,
    generatedAt: r.generated_at.toISOString(),
  };
}

const ROW_COLUMNS = sql`i.article_id, i.fact_id, i.title, i.source_name, i.score, i.tldr, i.background, i.key_points, i.significance, i.quote, i.implications, i.questions, i.generated_at, a.url`;

/** 解读列表，按生成时间倒序（展示在 /daily 页）。 */
export async function listInsights(limit = 30): Promise<InsightView[]> {
  const rows = await sql<InsightRow[]>`
    SELECT ${ROW_COLUMNS}
    FROM insights i LEFT JOIN articles a ON a.id = i.article_id
    ORDER BY i.generated_at DESC LIMIT ${limit}`;
  return rows.map(toView);
}

/**
 * 解读配图：条目原文（或其同事件报道）中足够宽的第一张正文图，经图片代理签名。
 * 与日报头图同一取图口径（宽 ≥ 480），正文摘要模式下不借图。
 */
async function insightCover(articleId: string, factId: number | null): Promise<InsightCover | null> {
  const scope = factId === null
    ? sql`p.article_id = ${articleId}`
    : sql`(p.article_id = ${articleId} OR p.fact_id = ${factId})`;
  const [row] = await sql<{ url: string; width: number | null; height: number | null }[]>`
    SELECT img.m->>'url' AS url, nullif(img.m->>'width', '')::int AS width, nullif(img.m->>'height', '')::int AS height
    FROM publications p JOIN articles a ON a.id = p.article_id
    CROSS JOIN LATERAL (
      SELECT m FROM jsonb_array_elements(coalesce(a.media, '[]'::jsonb)) m
      WHERE m->>'kind' = 'image' AND coalesce((m->>'width')::numeric, 800) >= 480 LIMIT 1
    ) img
    WHERE ${scope} AND p.visibility = 'public' AND p.body_mode <> 'summary'
    ORDER BY (p.article_id = ${articleId}) DESC, p.first_party DESC, coalesce(p.score, 0) DESC, p.article_id
    LIMIT 1`;
  const source = row?.url;
  if (!source) return null;
  const url = proxiedImage(source, "full");
  if (!url) return null;
  const srcSet = proxiedImageSet(source, "hero");
  return { url, ...(srcSet ? { srcSet } : {}), width: row.width ?? null, height: row.height ?? null };
}

/** 同一事件的其他公开报道，供"相关阅读"。 */
async function insightRelated(articleId: string, factId: number | null): Promise<InsightRelated[]> {
  if (factId === null) return [];
  const rows = await sql<{ id: string; title: string; source_name: string; url: string | null }[]>`
    SELECT p.article_id AS id, p.title, s.name AS source_name, a.url
    FROM publications p JOIN sources s ON s.id = p.source_id JOIN articles a ON a.id = p.article_id
    WHERE p.fact_id = ${factId} AND p.visibility = 'public' AND p.article_id <> ${articleId}
    ORDER BY coalesce(p.score, 0) DESC, p.timeline_at DESC
    LIMIT 6`;
  return rows.map((r) => ({ id: r.id, title: r.title, sourceName: r.source_name, originalUrl: r.url ?? "" }));
}

/**
 * 同一事件（fact）下的公开报道，按报道时间升序，排出“来龙去脉”，供详情页“事件时间轴”。
 * 时间取 coalesce(published_at, discovered_at)，与站内其余时间口径一致；无事件归并时为空。
 */
async function insightTimeline(articleId: string, factId: number | null): Promise<InsightTimelineItem[]> {
  if (factId === null) return [];
  const rows = await sql<{ id: string; title: string; source_name: string; at: Date }[]>`
    SELECT p.article_id AS id, p.title, s.name AS source_name, coalesce(p.published_at, p.discovered_at) AS at
    FROM publications p JOIN sources s ON s.id = p.source_id
    WHERE p.fact_id = ${factId} AND p.visibility = 'public'
    ORDER BY coalesce(p.published_at, p.discovered_at), p.article_id
    LIMIT 20`;
  return rows.map((r) => ({ id: r.id, title: r.title, sourceName: r.source_name, date: r.at.toISOString(), current: r.id === articleId }));
}

/** 单篇解读；找不到返回 null。 */
export async function insightDetail(articleId: string): Promise<InsightDetail | null> {
  const [r] = await sql<InsightRow[]>`
    SELECT ${ROW_COLUMNS}
    FROM insights i LEFT JOIN articles a ON a.id = i.article_id
    WHERE i.article_id = ${articleId}`;
  if (!r) return null;
  const [cover, related, timeline] = await Promise.all([
    insightCover(r.article_id, r.fact_id),
    insightRelated(r.article_id, r.fact_id),
    insightTimeline(r.article_id, r.fact_id),
  ]);
  return {
    ...toView(r),
    keyPoints: r.key_points ?? [],
    significance: r.significance,
    quote: r.quote,
    implications: r.implications,
    questions: r.questions ?? [],
    cover,
    related,
    timeline,
    originalUrl: r.url ?? "",
  };
}
