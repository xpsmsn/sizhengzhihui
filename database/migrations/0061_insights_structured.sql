-- 政策解读结构化扩写（P0）之一：新增一句话速览 tldr。
-- 既有解读保留原内容，该列取默认值；由 reports.insights 按版本差异逐步重建。
ALTER TABLE insights ADD COLUMN IF NOT EXISTS tldr text NOT NULL DEFAULT '';
