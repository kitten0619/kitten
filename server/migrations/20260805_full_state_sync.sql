-- KET v6：完整游戏存档同步与管理员统计升级
ALTER TABLE public.user_progress ADD COLUMN IF NOT EXISTS state_snapshot JSONB;
ALTER TABLE public.user_progress ADD COLUMN IF NOT EXISTS state_revision BIGINT DEFAULT 0;
ALTER TABLE public.user_progress ADD COLUMN IF NOT EXISTS state_client_updated_at TIMESTAMPTZ;
ALTER TABLE public.user_progress ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
ALTER TABLE public.user_progress ADD COLUMN IF NOT EXISTS last_sync_device TEXT;

CREATE INDEX IF NOT EXISTS idx_user_progress_last_synced
  ON public.user_progress(last_synced_at DESC);
