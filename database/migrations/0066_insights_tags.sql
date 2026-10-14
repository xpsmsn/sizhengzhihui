-- 政策解读标签（P1）：从解读中抽取的“涉及部门 / 文件 / 群体”，供详情页标签与标签页串接。
ALTER TABLE insights ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb;
