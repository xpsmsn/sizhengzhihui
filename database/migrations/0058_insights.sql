-- 政策解读：为高分条目（score >= 82）生成的原创解读（见 docs/discussions/2026-10-09-报告模块重构方案.md）。
-- 每个事件一篇：同事件取评分最高的条目；解读为再表达，正文不搬运，避免版权问题。
CREATE TABLE IF NOT EXISTS insights (
  article_id text PRIMARY KEY,
  fact_id integer,
  score integer NOT NULL,
  title text NOT NULL,
  source_name text NOT NULL,
  background text NOT NULL,
  key_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  implications text NOT NULL,
  model text,
  generated_at timestamptz NOT NULL DEFAULT now()
);