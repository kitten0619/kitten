-- KET单词大冒险数据库表结构
-- 执行此文件创建所有必要的表

-- 1. 用户表 (扩展 Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

-- 2. 单词表 (KET 词库)
CREATE TABLE IF NOT EXISTS public.words (
  id SERIAL PRIMARY KEY,
  word TEXT UNIQUE NOT NULL,
  meaning TEXT NOT NULL,
  phonetic TEXT,
  example TEXT,
  part_of_speech TEXT, -- 词性：noun, verb, adjective, etc.
  category TEXT, -- 主题分类：food, school, travel, family, etc.
  difficulty INTEGER DEFAULT 1, -- 1-5
  rarity TEXT DEFAULT 'N', -- N, R, SR, SSR
  power INTEGER DEFAULT 50,
  icon TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 用户进度表
CREATE TABLE IF NOT EXISTS public.user_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  stars INTEGER DEFAULT 0,
  gems INTEGER DEFAULT 0,
  card_fragments INTEGER DEFAULT 0,
  current_level INTEGER DEFAULT 1,
  current_stage INTEGER DEFAULT 1,
  mastered_count INTEGER DEFAULT 0,
  streak_days INTEGER DEFAULT 0,
  last_study_date DATE,
  total_battles INTEGER DEFAULT 0,
  battles_won INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 用户单词进度表
CREATE TABLE IF NOT EXISTS public.user_word_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  word_id INTEGER REFERENCES public.words(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'learning', -- learning, mastered, wrong
  correct_count INTEGER DEFAULT 0,
  wrong_count INTEGER DEFAULT 0,
  last_reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, word_id)
);

-- 5. 用户卡牌表
CREATE TABLE IF NOT EXISTS public.user_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  word_id INTEGER REFERENCES public.words(id) ON DELETE CASCADE,
  quantity INTEGER DEFAULT 1,
  obtained_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, word_id)
);

-- 6. 用户卡组表
CREATE TABLE IF NOT EXISTS public.user_decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id UUID REFERENCES public.user_cards(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL, -- 1-5
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, slot)
);

-- 7. 每日任务表
CREATE TABLE IF NOT EXISTS public.daily_tasks (
  id SERIAL PRIMARY KEY,
  task_type TEXT NOT NULL, -- study_words, answer_correct, review_wrong, battle, collect_card
  task_name TEXT NOT NULL,
  target_count INTEGER NOT NULL,
  reward_type TEXT NOT NULL, -- stars, gems
  reward_amount INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. 用户每日任务进度表
CREATE TABLE IF NOT EXISTS public.user_daily_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id INTEGER REFERENCES public.daily_tasks(id) ON DELETE CASCADE,
  task_date DATE NOT NULL DEFAULT CURRENT_DATE,
  current_progress INTEGER DEFAULT 0,
  is_completed BOOLEAN DEFAULT false,
  is_claimed BOOLEAN DEFAULT false,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, task_id, task_date)
);

-- 9. 战斗记录表
CREATE TABLE IF NOT EXISTS public.battle_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  enemy_name TEXT,
  enemy_wave INTEGER,
  result TEXT, -- win, lose
  hp_remaining INTEGER,
  accuracy DECIMAL(5,2),
  max_combo INTEGER,
  stars_earned INTEGER DEFAULT 0,
  gems_earned INTEGER DEFAULT 0,
  skill_used TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. 用户技能表
CREATE TABLE IF NOT EXISTS public.user_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_type TEXT NOT NULL, -- heal, revive, shield, crit, energy, combo
  skill_name TEXT NOT NULL,
  quantity INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, skill_type)
);

-- 11. 经济日志表
CREATE TABLE IF NOT EXISTS public.economy_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL, -- stars, gems, card_fragments
  change_amount INTEGER NOT NULL,
  before_amount INTEGER NOT NULL,
  after_amount INTEGER NOT NULL,
  business_type TEXT NOT NULL, -- quiz, battle, gacha, decompose, daily_task
  reference_id TEXT, -- 关联的任务或战斗ID
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. 卡牌分解记录表
CREATE TABLE IF NOT EXISTS public.decompose_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  word_id INTEGER REFERENCES public.words(id) ON DELETE CASCADE,
  quantity_decomposed INTEGER NOT NULL,
  fragments_obtained INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_user_word_progress_user ON public.user_word_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_cards_user ON public.user_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_user_decks_user ON public.user_decks(user_id);
CREATE INDEX IF NOT EXISTS idx_user_daily_tasks_user_date ON public.user_daily_tasks(user_id, task_date);
CREATE INDEX IF NOT EXISTS idx_battle_records_user ON public.battle_records(user_id);
CREATE INDEX IF NOT EXISTS idx_user_skills_user ON public.user_skills(user_id);
CREATE INDEX IF NOT EXISTS idx_economy_logs_user ON public.economy_logs(user_id);

-- 插入默认每日任务
INSERT INTO public.daily_tasks (task_type, task_name, target_count, reward_type, reward_amount) VALUES
('study_words', '学习新词', 10, 'stars', 30),
('answer_correct', '正确答题', 20, 'stars', 20),
('review_wrong', '复习错词', 10, 'stars', 20),
('battle', '完成对战', 1, 'gems', 1),
('collect_card', '收集卡牌', 1, 'stars', 20)
ON CONFLICT DO NOTHING;

-- 启用 RLS (Row Level Security)
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.words ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_word_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_daily_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battle_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.economy_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decompose_records ENABLE ROW LEVEL SECURITY;

-- RLS 策略：用户只能访问自己的数据
CREATE POLICY "Users can view own profile" ON public.user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.user_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Words are publicly readable" ON public.words
  FOR SELECT USING (true);

CREATE POLICY "Users can view own progress" ON public.user_progress
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own word progress" ON public.user_word_progress
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own cards" ON public.user_cards
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own decks" ON public.user_decks
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own daily tasks" ON public.user_daily_tasks
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own battle records" ON public.battle_records
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own skills" ON public.user_skills
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own economy logs" ON public.economy_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own economy logs" ON public.economy_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own decompose records" ON public.decompose_records
  FOR ALL USING (auth.uid() = user_id);
