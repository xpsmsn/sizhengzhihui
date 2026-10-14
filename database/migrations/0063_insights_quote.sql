-- 政策解读结构化扩写（P0）之三：新增原文金句 quote。
ALTER TABLE insights ADD COLUMN IF NOT EXISTS quote text NOT NULL DEFAULT '';
