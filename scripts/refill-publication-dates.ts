// AI生成
// 一次性脚本：为缺发布日期的回灌文章补日期（思政网来源）。
// 背景：这类文章因 published_at 为空 + backfill=true 被 publish.ts 的规则排除在公开池之外；
//      它们的详情页其实有“发布时间”，用项目自身的 fetchDetail（配置里的 .titbox .time）取回并写库，
//      再重置为待处理，让 worker 重新评估发布。
//
// 用法：
//   node --env-file-if-exists=.env scripts/refill-publication-dates.ts          # 试算，只打印，不写库
//   node --env-file-if-exists=.env scripts/refill-publication-dates.ts --apply  # 执行写库
import { closeDb, sql } from "@aihot/backend/db";
import { fetchDetail } from "@aihot/backend/sources/web-list";
import type { SourceRow } from "@aihot/backend/sources/types";

const apply = process.argv.includes("--apply");
const tag = `refill:${new Date().toISOString().slice(0, 10)}`;
const FUTURE_TOLERANCE_MS = 2 * 86_400_000;

const sources = new Map<string, SourceRow>(
  (await sql<SourceRow[]>`
    SELECT id, name, kind, config, tier, participation_mode, first_party, interval_minutes, enabled, cursor, fail_count
    FROM sources WHERE id LIKE 'szw-%' OR id = 'gov-push-v150203'`).map((s) => [s.id, s]),
);

const rows = await sql<{ id: string; url: string; source_id: string; discovered_at: Date }[]>`
  SELECT a.id, a.url, a.source_id, a.discovered_at FROM articles a
  WHERE (a.source_id LIKE 'szw-%' OR a.source_id = 'gov-push-v150203')
    AND (a.published_at IS NULL OR (extract(epoch from a.published_at)::bigint % 86400 = 0))
  ORDER BY a.discovered_at DESC`;

console.log(`思政网来源：${sources.size} 个；待补日期文章：${rows.length} 条\n`);

let fixed = 0;
let missed = 0;
let skipped = 0;
for (const r of rows) {
  const source = sources.get(r.source_id);
  if (!source) {
    skipped += 1;
    continue;
  }
  let publishedAt: Date | null = null;
  try {
    const got = await fetchDetail(r.url, source, { date: true, title: false, summary: false });
    publishedAt = got.publishedAt;
  } catch (error) {
    console.log(`  抓取失败 ${r.url}：${(error as Error).message}`);
  }
  if (!publishedAt || publishedAt.getTime() > r.discovered_at.getTime() + FUTURE_TOLERANCE_MS) {
    missed += 1;
    console.log(`  取不到有效日期 ${r.url}`);
    continue;
  }
  if (apply) {
    await sql`
      UPDATE articles SET published_at = ${publishedAt}, published_at_claim = ${publishedAt}, timeline_at = ${publishedAt},
        backfill_reason = NULL, processing_state = 'new', processing_attempts = 0, processing_retry_at = NULL,
        processing_error = NULL, processing_queued_at = NULL, processing_attempt_tag = ${tag}, updated_at = now()
      WHERE id = ${r.id}`;
    await sql`UPDATE publications SET timeline_at = ${publishedAt}, sort_at = ${publishedAt}, updated_at = now() WHERE article_id = ${r.id}`;
  }
  fixed += 1;
  console.log(`  ${apply ? "已补" : "可补"} ${publishedAt.toISOString()}  ${r.url}`);
}

console.log(`\n${apply ? "已写入" : "预计可补"} ${fixed} 条；取不到日期 ${missed} 条；跳过 ${skipped} 条。`);
if (!apply) console.log("确认后加 --apply 执行：node --env-file-if-exists=.env scripts/refill-publication-dates.ts --apply");
console.log("写库后 worker 的 sweep 会在几分钟内重新评估并发布。");
await closeDb();