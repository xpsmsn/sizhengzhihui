-- 政策解读结构化扩写（P0）之四：新增思考与讨论题 questions（JSON 数组）。
ALTER TABLE insights ADD COLUMN IF NOT EXISTS questions jsonb NOT NULL DEFAULT '[]'::jsonb;
