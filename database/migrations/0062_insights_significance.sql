-- 政策解读结构化扩写（P0）之二：新增意义与影响 significance。
ALTER TABLE insights ADD COLUMN IF NOT EXISTS significance text NOT NULL DEFAULT '';
