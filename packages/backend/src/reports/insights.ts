// AI生成
// 政策解读：为高分条目（score ≥ 82）生成一段原创解读，供高校辅导员参考。
// 每个事件一篇：同事件取评分最高的条目；解读为再表达，原文只作输入，正文不搬运（避免版权问题）。
// 由定时任务 reports.insights 驱动，扫描“已精选、达到评分线、其事件还没有解读”的条目。
import { z } from "zod";
import type { InsightDetail, InsightView } from "@aihot/contracts/site";
import { sql } from "../db.ts";
import { promptText, promptVersion } from "../editorial/prompts.ts";
import { modelFor } from "../editorial/models.ts";
import { chatJson } from "../providers/llm.ts";
import { completeReceipt } from "../providers/receipts.ts";
import { shutdownSignal } from "../jobs/queue.ts";
import { logError } from "../lib/log-error.ts";

export const INSIGHT_VERSION = promptVersion("insight");
/** 生成解读的评分线。 */
export const INSIGHT_MIN_SCORE = 82;
/** 送进模型的正文字数上限。 */
const MAX_BODY_CHARS = 6000;

const InsightSchema = z.object({
  background: z.string().max(400).catch(""),
  keyPoints: z.array(z.string().max(200)).max(6).catch([]),
  implications: z.string().max(600).catch(""),
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
 * 待生成解读的条目：已公开、已精选、达到评分线，且其事件还没有解读。
 * 同事件的条目合并为一篇，取评分最高的那条。
 */
async function pendingInsights(limit: number): Promise<PendingRow[]> {
  return sql<PendingRow[]>`
    SELECT * FROM (
      SELECT DISTINCT ON (coalesce(p.fact_id::text, p.article_id))
        p.article_id, p.fact_id, p.score, p.title, p.summary, a.body_text, s.name AS source_name
      FROM publications p
      JOIN sources s ON s.id = p.source_id
      JOIN articles a ON a.id = p.article_id
      WHERE p.visibility = 'public' AND p.selected AND p.score IS NOT NULL AND p.score >= ${INSIGHT_MIN_SCORE}
        AND NOT EXISTS (SELECT 1 FROM insights i WHERE i.article_id = p.article_id)
        AND NOT EXISTS (SELECT 1 FROM insights i WHERE p.fact_id IS NOT NULL AND i.fact_id = p.fact_id)
      ORDER BY coalesce(p.fact_id::text, p.article_id), p.score DESC
    ) sub
    ORDER BY score DESC
    LIMIT ${limit}`;
}

/** 生成一批待解读的条目。 */
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
        system: promptText("insight"), user, schema: InsightSchema, temperature: 0.4, maxTokens: 1600,
      });
      const d = res.data;
      if (!d.background.trim() && !d.implications.trim() && d.keyPoints.length === 0) {
        if (res.receiptId !== null) await completeReceipt(sql, res.receiptId);
        failed += 1;
        continue;
      }
      await sql.begin(async (tx) => {
        await tx`
          INSERT INTO insights (article_id, fact_id, score, title, source_name, background, key_points, implications, model)
          VALUES (${r.article_id}, ${r.fact_id}, ${r.score}, ${r.title}, ${r.source_name},
                  ${d.background}, ${tx.json(d.keyPoints as never)}, ${d.implications}, ${model})
          ON CONFLICT (article_id) DO NOTHING`;
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
  title: string;
  source_name: string;
  score: number;
  background: string;
  key_points: string[] | null;
  implications: string;
  generated_at: Date;
  url: string | null;
}

function toView(r: InsightRow): InsightView {
  return {
    articleId: r.article_id,
    title: r.title,
    sourceName: r.source_name,
    score: r.score,
    background: r.background,
    pointCount: (r.key_points ?? []).length,
    generatedAt: r.generated_at.toISOString(),
  };
}

/** 解读列表，按生成时间倒序（展示在 /daily 页）。 */
export async function listInsights(limit = 30): Promise<InsightView[]> {
  const rows = await sql<InsightRow[]>`
    SELECT i.article_id, i.title, i.source_name, i.score, i.background, i.key_points, i.implications, i.generated_at, a.url
    FROM insights i LEFT JOIN articles a ON a.id = i.article_id
    ORDER BY i.generated_at DESC LIMIT ${limit}`;
  return rows.map(toView);
}

/** 单篇解读；找不到返回 null。 */
export async function insightDetail(articleId: string): Promise<InsightDetail | null> {
  const [r] = await sql<InsightRow[]>`
    SELECT i.article_id, i.title, i.source_name, i.score, i.background, i.key_points, i.implications, i.generated_at, a.url
    FROM insights i LEFT JOIN articles a ON a.id = i.article_id
    WHERE i.article_id = ${articleId}`;
  if (!r) return null;
  return { ...toView(r), keyPoints: r.key_points ?? [], implications: r.implications, originalUrl: r.url ?? "" };
}