// AI生成
// 批量重新评估：把已处理过的文章重置为待处理，由 worker 的 sweep 在几分钟内重新入队，
// 用当前提示词与分类体系重跑一遍判断。改了 industry/prompts/*.md 或 industry/taxonomy.ts 之后用它刷新存量数据。
//
// 用法：
//   node scripts/reanalyze.ts             # 试算：只统计会被重置的文章数，不改动
//   node scripts/reanalyze.ts --run       # 执行：重置全部已评估的文章
//   node scripts/reanalyze.ts --run <信源id>   # 执行：只重置某个信源
//
// 注意：重新评估会对每篇触发一次计费的模型调用。先在后台"设置 → 付费请求上限"里确认额度。
import { closeDb, sql } from "@aihot/backend/db";

const args = process.argv.slice(2);
const run = args.includes("--run");
const sourceId = args.find((a) => !a.startsWith("--"))?.trim() || null;
const tag = `reanalyze:${new Date().toISOString().slice(0, 10)}`;

const [{ count }] = await sql<{ count: number }[]>`
  SELECT count(*)::int AS count FROM articles a
  WHERE EXISTS (SELECT 1 FROM analyses an WHERE an.article_id = a.id)
    AND (${sourceId}::text IS NULL OR a.source_id = ${sourceId})`;

if (!run) {
  console.log(`[试算] 将重新评估 ${count} 篇${sourceId ? `（信源 ${sourceId}）` : ""}文章。`);
  console.log("确认后加 --run 执行：node scripts/reanalyze.ts --run" + (sourceId ? ` ${sourceId}` : ""));
  await closeDb();
} else {
  const rows = await sql<{ id: string }[]>`
    UPDATE articles a
    SET processing_state = 'new', processing_attempts = 0, processing_retry_at = NULL,
        processing_error = NULL, processing_queued_at = NULL,
        processing_attempt_tag = ${tag}
    WHERE EXISTS (SELECT 1 FROM analyses an WHERE an.article_id = a.id)
      AND (${sourceId}::text IS NULL OR a.source_id = ${sourceId})
    RETURNING a.id`;
  console.log(`已重置 ${rows.length} 篇文章（标签 ${tag}），worker 的 sweep 会在几分钟内逐批重新评估。`);
  console.log("可在后台「运行」页观察进度；付费上限见「设置」。");
  await closeDb();
}