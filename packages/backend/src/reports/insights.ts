// AI生成
// 政策解读：为高分条目（score ≥ 82）生成一份结构化原创解读，供高校辅导员参考。
// 每个事件一篇：同事件取评分最高的条目；解读为再表达，原文只作输入，正文不搬运（避免版权问题）。
// 由定时任务 reports.insights 驱动，扫描“已精选、达到评分线、其事件还没有本版解读”的条目；版本升级时重建。
import { z } from "zod";
import type { InsightCover, InsightDetail, InsightRelated, InsightView } from "@aihot/contracts/site";
import { sql } from "../db.ts";
import { promptText, promptVersion } from "../editorial/prompts.ts";
import { modelFor } from "../editorial/models.ts";
import { chatJson } from "../providers/llm.ts";
import { completeReceipt, rejectReceivedResponse } from "../providers/receipts.ts";
import { shutdownSignal } from "../jobs/queue.ts";
import { logError } from "../lib/log-error.ts";
import { proxiedImage, proxiedImageSet } from "../media/imgproxy.ts";

export const INSIGHT_VERSION = promptVersion("insight");
/** 生成解读的评分线。 */
export const INSIGHT_MIN_SCORE = 82;
/** 送进模型的正文字数上限。 */
const MAX_BODY_CHARS = 6000;
/**
 * 单次生成的输出额度。八个部分写满约 1.1k 汉字，加 JSON 骨架与推理的余量；
 * 2200 常被写满而在中途截断，留下只有前两个字段的残篇（页面就只剩速览与背景）。
 * 它同时是付费回执 logical_key 的一部分：改这个值会让旧的残缺响应不再被复用，从而真正重调模型。
 */
const MAX_OUTPUT_TOKENS = 3600;
/** 同一篇的尝试上限（付费回执的 attempts），避免一直不完整的输出每 10 分钟重试一次、白花钱。 */
const MAX_ATTEMPTS = 3;

const InsightSchema = z.object({
  tldr: z.string().max(120).catch(""),
  background: z.string().max(400).catch(""),
  keyPoints: z.array(z.string().max(200)).max(6).catch([]),
  significance: z.string().max(800).catch(""),
  quote: z.string().max(300).catch(""),
  implications: z.string().max(600).catch(""),
  questions: z.array(z.string().max(200)).max(5).catch([]),
  tags: z.array(z.string().max(24)).max(8).catch([]),
});

/** 同事件报道的取材上限：最多并 3 篇、每篇截前 2000 字，拼合后再截 6000 字，避免把输入撑爆。 */
const SIBLING_MAX = 3;
const SIBLING_BODY_CHARS = 2000;
const MAX_RELATED_CHARS = 6000;

interface PendingRow {
  article_id: string;
  fact_id: number | null;
  score: number;
  title: string;
  summary: string | null;
  body_text: string | null;
  source_name: string;
  /** 同事件其他公开报道的拼合文本（出处 + 标题 + 正文片段）；没有则为 null。 */
  related_text: string | null;
}

/**
 * 待生成（或待重建）解读的条目：已公开、已精选、达到评分线，且其事件还没有本版解读。
 * 同事件的条目合并为一篇，取评分最高的那条；已存在但版本过旧的解读会被重建。
 */
async function pendingInsights(limit: number): Promise<PendingRow[]> {
  return sql<PendingRow[]>`
    SELECT * FROM (
      SELECT DISTINCT ON (coalesce(p.fact_id::text, p.article_id))
        p.article_id, p.fact_id, p.score, p.title, p.summary, a.body_text, s.name AS source_name,
        rel.text AS related_text
      FROM publications p
      JOIN sources s ON s.id = p.source_id
      JOIN articles a ON a.id = p.article_id
      -- 同事件的其他报道：通稿常常只有几百字，把同一事件的多篇报道并进来，模型手里才有足够
      -- 的可核验材料——解读的"丰富"应来自事实本身，而不是靠推测补空。
      LEFT JOIN LATERAL (
        SELECT string_agg(
                 '【' || sib.source_name || '】' || sib.title || E'\n' || left(coalesce(sib.body_text, ''), ${SIBLING_BODY_CHARS}),
                 E'\n\n' ORDER BY sib.first_party DESC, coalesce(sib.score, 0) DESC, sib.article_id
               ) AS text
        FROM (
          SELECT p2.article_id, p2.score, p2.first_party, p2.title, a2.body_text, s2.name AS source_name
          FROM publications p2
          JOIN sources s2 ON s2.id = p2.source_id
          JOIN articles a2 ON a2.id = p2.article_id
          WHERE p.fact_id IS NOT NULL AND p2.fact_id = p.fact_id
            AND p2.article_id <> p.article_id AND p2.visibility = 'public'
          ORDER BY p2.first_party DESC, coalesce(p2.score, 0) DESC, p2.article_id
          LIMIT ${SIBLING_MAX}
        ) sib
      ) rel ON true
      LEFT JOIN LATERAL (
        SELECT i.version FROM insights i
        WHERE i.article_id = p.article_id OR (p.fact_id IS NOT NULL AND i.fact_id = p.fact_id)
        ORDER BY (i.article_id = p.article_id) DESC
        LIMIT 1
      ) cur ON true
      WHERE p.visibility = 'public' AND p.selected AND p.score IS NOT NULL AND p.score >= ${INSIGHT_MIN_SCORE}
        AND (cur.version IS NULL OR cur.version IS DISTINCT FROM ${INSIGHT_VERSION})
        -- 同一版本试满 MAX_ATTEMPTS 次仍写不出来的，先放一放，别一直占着每轮的名额、一直花钱。
        -- 按 promptVersion 限定：换了提示词（版本变了）就重新给机会，不被旧版本留下的失败记录封死。
        AND NOT EXISTS (
          SELECT 1 FROM receipts rc
          WHERE rc.purpose = 'report_insight' AND rc.subject = 'insight:' || p.article_id
            AND rc.request->>'promptVersion' = ${INSIGHT_VERSION}
            AND rc.status = 'failed' AND rc.attempts >= ${MAX_ATTEMPTS}
        )
      ORDER BY coalesce(p.fact_id::text, p.article_id), p.score DESC
    ) sub
    ORDER BY score DESC
    LIMIT ${limit}`;
}

/** 句末标点（允许后面跟一个收尾引号/括号）。 */
const SENTENCE_END = /[。！？…；：]["”』」）)】]*$/;
/** 悬空的连接词/助词：段落停在这些字上，说明句子被写断了（"…规划纲要（2024—2035年）》中"）。 */
const DANGLING_TAIL = /(中|的|和|与|及|在|对|为|以|而|并|等|是|了|把|将|由|其|该|这|那)$/;

/**
 * 收尾修剪：段落结尾停在悬空连接词上时，裁到最后一个句末标点。
 * 提示词已要求"宁可少写一段，不写半句"，但实测模型仍会写断句——而且这类断句的 finish_reason 是 stop，
 * 不会被"截断判定"拦下。所以在落库前做一道确定性的兜底：宁可少一句，也不给读者留半句。
 * 裁不动（没有句末标点，或裁完剩下太少）就原样保留，避免误伤短材料。
 */
function tidyTail(text: string): string {
  const t = text.trim();
  if (!t || SENTENCE_END.test(t) || !DANGLING_TAIL.test(t)) return t;
  const cut = t.replace(/[。！？…；：]["”』」）)】]*[^。！？…；：]*$/, "").trim();
  return cut.length >= 12 ? cut : t;
}

/**
 * 这次输出里没写的部分，仅用于观测日志。
 * 它不决定成败：原文本来就短时，模型主动少写是对的——硬逼它补齐段落，换来的只会是过度解读，
 * 那比缺一段的风险大得多。记下来只是为了在日志里看见"哪一段经常缺"。
 */
function sparseFields(d: z.infer<typeof InsightSchema>): string[] {
  return [
    !d.tldr.trim() && "tldr",
    !d.background.trim() && "background",
    !d.significance.trim() && "significance",
    !d.implications.trim() && "implications",
    d.keyPoints.length === 0 && "keyPoints",
    d.questions.length === 0 && "questions",
  ].filter((v): v is string => typeof v === "string");
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
        // 同事件的其他报道：补足事实与表述，让解读有料可写，而不是靠推测填空。
        r.related_text ? `【同事件其他报道】\n${r.related_text.slice(0, MAX_RELATED_CHARS)}` : "",
      ].filter(Boolean).join("\n\n");
      const res = await chatJson({
        model, purpose: "report_insight", subject: `insight:${r.article_id}`, promptVersion: INSIGHT_VERSION,
        system: promptText("insight"), user, schema: InsightSchema, temperature: 0.4, maxTokens: MAX_OUTPUT_TOKENS,
      });
      const raw = res.data;
      // 收尾修剪后再落库：段落停在悬空连接词上的（"…规划纲要（2024—2035年）》中"）裁到最后一个句末标点。
      const d = {
        ...raw,
        tldr: tidyTail(raw.tldr),
        background: tidyTail(raw.background),
        significance: tidyTail(raw.significance),
        quote: tidyTail(raw.quote),
        implications: tidyTail(raw.implications),
      };
      // 只退回两种情况：① 输出撞上 max_tokens 被切断（finish_reason=length，是半成品）；
      // ② 连"速览 + 要点"都没写出来——这是提示词自己承诺的最低限度，缺了页面就是残缺的。
      // 其余的"少写"都接受：原文短就少写，宁短勿编，逼它写满只会换来过度解读。
      const truncated = res.finishReason === "length";
      const unusable = !d.tldr.trim() || d.keyPoints.length === 0;
      if (truncated || unusable) {
        // 标为 failed 而不是 completed：下次会真正重调模型，而不是复用这份残缺响应（重试次数由 MAX_ATTEMPTS 封顶）。
        if (res.receiptId !== null) {
          await rejectReceivedResponse(res.receiptId, truncated ? "output truncated at MAX_OUTPUT_TOKENS (finish_reason=length)" : "insight output without tldr/keyPoints");
        }
        failed += 1;
        console.error(JSON.stringify({ level: "warn", msg: "insight unusable", article: r.article_id, truncated, unusable }));
        continue;
      }
      const sparse = sparseFields(d);
      if (sparse.length > 0) {
        console.log(JSON.stringify({ level: "info", msg: "insight sparse", article: r.article_id, finish: res.finishReason, sparse }));
      }
      await sql.begin(async (tx) => {
        // 同一事件只保留最新一篇：代表条目若发生迁移，清掉旧代表上的遗留行。
        if (r.fact_id !== null) {
          await tx`DELETE FROM insights WHERE fact_id = ${r.fact_id} AND article_id <> ${r.article_id}`;
        }
        await tx`
          INSERT INTO insights (article_id, fact_id, score, title, source_name, tldr, background, key_points, significance, quote, implications, questions, tags, model, version, generated_at)
          VALUES (${r.article_id}, ${r.fact_id}, ${r.score}, ${r.title}, ${r.source_name},
                  ${d.tldr}, ${d.background}, ${tx.json(d.keyPoints as never)}, ${d.significance}, ${d.quote},
                  ${d.implications}, ${tx.json(d.questions as never)}, ${tx.json(d.tags as never)}, ${model}, ${INSIGHT_VERSION}, now())
          ON CONFLICT (article_id) DO UPDATE SET
            fact_id = EXCLUDED.fact_id, score = EXCLUDED.score, title = EXCLUDED.title, source_name = EXCLUDED.source_name,
            tldr = EXCLUDED.tldr, background = EXCLUDED.background, key_points = EXCLUDED.key_points,
            significance = EXCLUDED.significance, quote = EXCLUDED.quote, implications = EXCLUDED.implications,
            questions = EXCLUDED.questions, tags = EXCLUDED.tags, model = EXCLUDED.model, version = EXCLUDED.version, generated_at = now()`;
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
  tags: string[] | null;
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
    tags: r.tags ?? [],
    generatedAt: r.generated_at.toISOString(),
  };
}

const ROW_COLUMNS = sql`i.article_id, i.fact_id, i.title, i.source_name, i.score, i.tldr, i.background, i.key_points, i.significance, i.quote, i.implications, i.questions, i.tags, i.generated_at, a.url`;

/** 解读列表，按生成时间倒序（展示在 /daily 页）。 */
export async function listInsights(limit = 30): Promise<InsightView[]> {
  const rows = await sql<InsightRow[]>`
    SELECT ${ROW_COLUMNS}
    FROM insights i LEFT JOIN articles a ON a.id = i.article_id
    ORDER BY i.generated_at DESC LIMIT ${limit}`;
  return rows.map(toView);
}

/** 标签云：所有解读的主体标签及其数量，按数量倒序（供标签页与详情页）。 */
export async function listInsightTags(limit = 30): Promise<{ tag: string; count: number }[]> {
  return sql<{ tag: string; count: number }[]>`
    SELECT t.tag, count(*)::int AS count
    FROM insights i CROSS JOIN LATERAL jsonb_array_elements_text(i.tags) AS t(tag)
    GROUP BY t.tag ORDER BY count DESC, t.tag LIMIT ${limit}`;
}

/** 带某个标签的解读，按生成时间倒序（供标签页）。 */
export async function listInsightsByTag(tag: string, limit = 50): Promise<InsightView[]> {
  const rows = await sql<InsightRow[]>`
    SELECT ${ROW_COLUMNS}
    FROM insights i LEFT JOIN articles a ON a.id = i.article_id
    WHERE i.tags @> ${sql.json([tag])}
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

/** 与当前解读共用主体标签的其他解读，供"相关解读"。 */
async function insightRelated(articleId: string, tags: string[]): Promise<InsightRelated[]> {
  if (tags.length === 0) return [];
  const rows = await sql<{ id: string; title: string; source_name: string; overlap: number }[]>`
    WITH want(tag) AS (SELECT jsonb_array_elements_text(${sql.json(tags)}))
    SELECT i.article_id AS id, i.title, i.source_name,
           (SELECT count(*) FROM jsonb_array_elements_text(i.tags) t WHERE t IN (SELECT tag FROM want))::int AS overlap
    FROM insights i
    WHERE i.article_id <> ${articleId}
      AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(i.tags) t WHERE t IN (SELECT tag FROM want))
    ORDER BY overlap DESC, i.score DESC, i.generated_at DESC
    LIMIT 6`;
  return rows.map((r) => ({ id: r.id, title: r.title, sourceName: r.source_name }));
}

/** 单篇解读；找不到返回 null。 */
export async function insightDetail(articleId: string): Promise<InsightDetail | null> {
  const [r] = await sql<InsightRow[]>`
    SELECT ${ROW_COLUMNS}
    FROM insights i LEFT JOIN articles a ON a.id = i.article_id
    WHERE i.article_id = ${articleId}`;
  if (!r) return null;
  const [cover, related] = await Promise.all([
    insightCover(r.article_id, r.fact_id),
    insightRelated(r.article_id, r.tags ?? []),
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
    originalUrl: r.url ?? "",
  };
}
