// AI生成
// 一次性脚本：清除已取消的日报数据（reports 里 kind='daily' 的期，及其修订记录）。
// 用法：node --env-file-if-exists=.env scripts/clear-daily-reports.ts
import { closeDb, sql } from "@aihot/backend/db";

const dailies = await sql<{ id: number; key: string }[]>`
  SELECT id, key FROM reports WHERE kind = 'daily' ORDER BY key`;

console.log(`日报期数：${dailies.length}${dailies.length ? " —— " + dailies.map((d) => d.key).join(", ") : ""}`);

if (dailies.length) {
  const ids = dailies.map((d) => d.id);
  const revisions = await sql`DELETE FROM report_revisions WHERE report_id = ANY(${ids}::int[])`;
  const reports = await sql`DELETE FROM reports WHERE kind = 'daily' RETURNING key`;
  console.log(`已删除修订记录 ${revisions.count} 条、日报 ${reports.count} 期。`);
} else {
  console.log("没有日报可删。");
}
await closeDb();