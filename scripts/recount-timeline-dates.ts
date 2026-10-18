// AI生成
// 一次性脚本：按“归日 = 发布时间”重算历史条目的时间线（timeline_at）并同步 publications（含事实锚点 sort_at）。
// 背景：旧规则把正常条目按“首次收录时间”归日——10-16 23:30 发布、午夜后才采到的新闻会挂到 10-17。
//      归日代码（content/materials.ts 的 decideTimeline）修复后只影响新采集，本脚本重算已有条目。
//      重算后重放 publication 决定（publish.ts 的同一套规则），不重新分析、不重新推送（旧推送只在
//      条目“新入选”时发出，这里都已入选过；其时效判断看收录时间，不受归日影响）。
//
// 默认只试算、打印，不写库。写库加 --apply。
//
// A. 归日重算：正常（非回灌）、有发布时间、且 timeline_at 仍等于 discovered_at 的条目
//    → timeline_at = published_at。跳过后台“校正发布日期”人工决定过时间线的文章；
//      时间线独立于收录/发布时间的文章（timeline_at 两者都不等）天然不在范围内。
//
// B. --fix-shifted（可选）：RSS 里不带时区的时间曾被 Date.parse 按服务器时区（Docker 为 UTC）读取，
//    北京时间书写被 +8 小时。这一错位被“发布时间容差”丢弃的条目留下指纹：
//    published_at 为空、backfill_reason='unknown-publication-time'、
//    且 published_at_claim 落在 (discovered_at + 1h, discovered_at + 8h]。
//    这些条目当时被排除在公开池之外。--fix-shifted 视其为北京时间书写：
//    published_at = published_at_claim - 8 小时，再按现行规则归日、重算 sort_at、重放公开决定。
//    注意：错位较小时（claim 早于 discovered + 1h）只写错日期、未被丢弃的历史条目无法自动识别，
//    只能逐条用后台“校正发布日期”核对更正。
//
// 用法：
//   node --env-file-if-exists=.env scripts/recount-timeline-dates.ts                          # 试算
//   node --env-file-if-exists=.env scripts/recount-timeline-dates.ts --apply                  # 执行 A
//   node --env-file-if-exists=.env scripts/recount-timeline-dates.ts --apply --fix-shifted    # 执行 A + B
import { closeDb, sql } from "@aihot/backend/db";
import { beijingDate } from "@aihot/contracts/time";
import { decideTimeline } from "@aihot/backend/content/materials";
import { publishArticleTx } from "@aihot/backend/publication/publish";

const apply = process.argv.includes("--apply");
const fixShifted = process.argv.includes("--fix-shifted");
const SHIFT_MS = 8 * 3600_000;

/** A. 旧规则下按收录时间落位、但已有发布时间的正常条目。 */
const dated = await sql<{ id: string; url: string; published_at: Date; discovered_at: Date }[]>`
  SELECT a.id, a.url, a.published_at, a.discovered_at FROM articles a
  WHERE NOT a.backfill AND a.published_at IS NOT NULL
    AND a.timeline_at = a.discovered_at AND a.published_at <> a.discovered_at
    AND NOT EXISTS (SELECT 1 FROM audit_log al
      WHERE al.subject = 'content:' || a.id AND al.action = 'content.correct-publication-date')
  ORDER BY a.published_at DESC`;

const moved = dated.filter((r) => beijingDate(r.discovered_at) !== beijingDate(r.published_at));
console.log(`A. 归日重算候选：${dated.length} 条，其中 ${moved.length} 条会从「收录日」挪回「发布日」：`);
for (const r of moved.slice(0, 15)) {
  console.log(`   ${beijingDate(r.discovered_at)} → ${beijingDate(r.published_at)}  ${r.published_at.toISOString()}  ${r.url}`);
}
if (moved.length > 15) console.log(`   …另 ${moved.length - 15} 条`);
for (const r of moved.length < 15 ? dated.filter((r) => beijingDate(r.discovered_at) === beijingDate(r.published_at)).slice(0, 3) : []) {
  console.log(`   同日改时 ${r.published_at.toISOString()}  ${r.url}`);
}

let done = 0;
for (const r of dated) {
  if (!apply) break;
  await sql`UPDATE articles SET timeline_at = ${r.published_at}, updated_at = now() WHERE id = ${r.id}`;
  // The one entrance that owns the publication projection (timeline_at, sort_at fact anchors, seats).
  await sql.begin((tx) => publishArticleTx(tx, r.id));
  done += 1;
}

let shifted = 0;
let shiftedPlanned = 0;
if (fixShifted) {
  const rows = await sql<{ id: string; url: string; published_at_claim: Date; discovered_at: Date }[]>`
    SELECT id, url, published_at_claim, discovered_at FROM articles
    WHERE published_at IS NULL AND published_at_claim IS NOT NULL
      AND backfill_reason = 'unknown-publication-time'
      AND published_at_claim > discovered_at + interval '1 hour'
      AND published_at_claim <= discovered_at + interval '8 hours'
    ORDER BY discovered_at DESC`;
  console.log(`\nB. 疑似 +8 小时错位（声称时间在未来而被丢弃）：${rows.length} 条`);
  shiftedPlanned = rows.length;
  for (const r of rows) {
    const fixed = new Date(r.published_at_claim.getTime() - SHIFT_MS);
    const t = decideTimeline(fixed, r.discovered_at);
    if (!t.publishedAt) {
      console.log(`   跳过（修正后仍在未来） ${r.url}`);
      continue;
    }
    console.log(`   ${apply ? "已修" : "可修"} ${r.published_at_claim.toISOString()} → ${t.publishedAt.toISOString()}  ${r.url}`);
    if (!apply) continue;
    await sql`UPDATE articles SET published_at = ${t.publishedAt}, published_at_claim = ${t.publishedAt},
      timeline_at = ${t.timelineAt}, backfill = ${t.backfill}, backfill_reason = ${t.backfillReason}, updated_at = now()
      WHERE id = ${r.id}`;
    await sql.begin((tx) => publishArticleTx(tx, r.id));
    shifted += 1;
  }
}

console.log(`\n${apply ? "已写入" : "预计重算"} A：${apply ? done : dated.length} 条${fixShifted ? `；B：${apply ? shifted : shiftedPlanned} 条` : ""}。`);
if (!apply) {
  console.log("确认后执行：node --env-file-if-exists=.env scripts/recount-timeline-dates.ts --apply");
  console.log("如需一并修复被丢弃的 +8 小时错位条目：在上面命令后加 --fix-shifted");
}
await closeDb();
