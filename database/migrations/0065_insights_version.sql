-- 政策解读结构化扩写（P0）之五：记录生成版本，供解读在模板升级后按版本重建。
ALTER TABLE insights ADD COLUMN IF NOT EXISTS version text NOT NULL DEFAULT '';
