import { Router } from 'express';
import { supabase } from '../supabase-client.js';

const router = Router();

// 中间件：验证用户登录
const requireAuth = async (req, res, next) => {
  const token = req.headers['x-session'];
  if (!token) {
    return res.status(401).json({ error: '未登录' });
  }
  
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return res.status(401).json({ error: '认证失败' });
  }
  
  req.user = user;
  next();
};

// 获取用户进度
router.get('/progress', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', req.user.id)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    
    if (!data) {
      const { data: newData, error: createError } = await supabase
        .from('user_progress')
        .insert({ user_id: req.user.id })
        .select()
        .single();
      
      if (createError) throw createError;
      return res.json(newData);
    }
    
    res.json(data);
  } catch (error) {
    console.error('获取进度失败:', error);
    res.status(500).json({ error: '获取进度失败' });
  }
});

// 更新用户进度
router.post('/progress', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('user_progress')
      .upsert({
        user_id: req.user.id,
        ...req.body,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('更新进度失败:', error);
    res.status(500).json({ error: '更新进度失败' });
  }
});

// 获取用户卡牌
router.get('/cards', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('user_cards')
      .select(`
        *,
        words:word_id (*)
      `)
      .eq('user_id', req.user.id);
    
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('获取卡牌失败:', error);
    res.status(500).json({ error: '获取卡牌失败' });
  }
});

// 添加卡牌（抽卡）
router.post('/cards', requireAuth, async (req, res) => {
  try {
    const { word_id } = req.body;
    
    const { data: existing } = await supabase
      .from('user_cards')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('word_id', word_id)
      .single();
    
    if (existing) {
      const { data, error } = await supabase
        .from('user_cards')
        .update({ quantity: existing.quantity + 1 })
        .eq('id', existing.id)
        .select()
        .single();
      
      if (error) throw error;
      res.json({ ...data, is_duplicate: true });
    } else {
      const { data, error } = await supabase
        .from('user_cards')
        .insert({ user_id: req.user.id, word_id })
        .select(`
          *,
          words:word_id (*)
        `)
        .single();
      
      if (error) throw error;
      res.json({ ...data, is_duplicate: false });
    }
  } catch (error) {
    console.error('添加卡牌失败:', error);
    res.status(500).json({ error: '添加卡牌失败' });
  }
});

// 分解卡牌
router.post('/cards/decompose', requireAuth, async (req, res) => {
  try {
    const { word_id, quantity } = req.body;
    
    if (quantity < 1) {
      return res.status(400).json({ error: '分解数量至少为 1' });
    }
    
    const { data: card } = await supabase
      .from('user_cards')
      .select(`
        *,
        words:word_id (rarity)
      `)
      .eq('user_id', req.user.id)
      .eq('word_id', word_id)
      .single();
    
    if (!card) {
      return res.status(404).json({ error: '卡牌不存在' });
    }
    
    if (card.quantity - quantity < 1) {
      return res.status(400).json({ error: '至少保留一张卡牌' });
    }
    
    const rarityFragments = { N: 1, R: 3, SR: 8, SSR: 20 };
    const fragmentsPerCard = rarityFragments[card.words.rarity] || 1;
    const totalFragments = fragmentsPerCard * quantity;
    
    const { error: updateError } = await supabase
      .from('user_cards')
      .update({ quantity: card.quantity - quantity })
      .eq('id', card.id);
    
    if (updateError) throw updateError;
    
    const { data: progress } = await supabase
      .from('user_progress')
      .select('card_fragments')
      .eq('user_id', req.user.id)
      .single();
    
    const newFragments = (progress?.card_fragments || 0) + totalFragments;
    await supabase
      .from('user_progress')
      .update({ card_fragments: newFragments })
      .eq('user_id', req.user.id);
    
    await supabase.from('decompose_records').insert({
      user_id: req.user.id,
      word_id,
      quantity_decomposed: quantity,
      fragments_obtained: totalFragments
    });
    
    res.json({
      success: true,
      fragments_obtained: totalFragments,
      new_quantity: card.quantity - quantity
    });
  } catch (error) {
    console.error('分解卡牌失败:', error);
    res.status(500).json({ error: '分解卡牌失败' });
  }
});

// 获取每日任务
router.get('/daily-tasks', requireAuth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const { data: tasks, error } = await supabase
      .from('daily_tasks')
      .select('*')
      .eq('is_active', true);
    
    if (error) throw error;
    
    const { data: userTasks } = await supabase
      .from('user_daily_tasks')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('task_date', today);
    
    const progressMap = {};
    userTasks?.forEach(ut => {
      progressMap[ut.task_id] = ut;
    });
    
    const result = tasks.map(task => ({
      ...task,
      current_progress: progressMap[task.id]?.current_progress || 0,
      is_completed: progressMap[task.id]?.is_completed || false,
      is_claimed: progressMap[task.id]?.is_claimed || false
    }));
    
    res.json(result);
  } catch (error) {
    console.error('获取每日任务失败:', error);
    res.status(500).json({ error: '获取每日任务失败' });
  }
});

// 更新任务进度
router.post('/daily-tasks/progress', requireAuth, async (req, res) => {
  try {
    const { task_type, increment = 1 } = req.body;
    const today = new Date().toISOString().split('T')[0];
    
    const { data: task } = await supabase
      .from('daily_tasks')
      .select('*')
      .eq('task_type', task_type)
      .eq('is_active', true)
      .single();
    
    if (!task) {
      return res.status(404).json({ error: '任务不存在' });
    }
    
    const { data: existing } = await supabase
      .from('user_daily_tasks')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('task_id', task.id)
      .eq('task_date', today)
      .single();
    
    let newProgress = (existing?.current_progress || 0) + increment;
    const isCompleted = newProgress >= task.target_count;
    
    if (existing) {
      await supabase
        .from('user_daily_tasks')
        .update({
          current_progress: newProgress,
          is_completed: isCompleted
        })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('user_daily_tasks')
        .insert({
          user_id: req.user.id,
          task_id: task.id,
          task_date: today,
          current_progress: newProgress,
          is_completed: isCompleted
        });
    }
    
    res.json({
      task_type,
      current_progress: newProgress,
      target: task.target_count,
      is_completed: isCompleted
    });
  } catch (error) {
    console.error('更新任务进度失败:', error);
    res.status(500).json({ error: '更新任务进度失败' });
  }
});

// 领取任务奖励
router.post('/daily-tasks/claim', requireAuth, async (req, res) => {
  try {
    const { task_id } = req.body;
    const today = new Date().toISOString().split('T')[0];
    
    const { data: task } = await supabase
      .from('daily_tasks')
      .select('*')
      .eq('id', task_id)
      .single();
    
    if (!task) {
      return res.status(404).json({ error: '任务不存在' });
    }
    
    const { data: userTask } = await supabase
      .from('user_daily_tasks')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('task_id', task_id)
      .eq('task_date', today)
      .single();
    
    if (!userTask || !userTask.is_completed) {
      return res.status(400).json({ error: '任务未完成' });
    }
    
    if (userTask.is_claimed) {
      return res.status(400).json({ error: '奖励已领取' });
    }
    
    await supabase
      .from('user_daily_tasks')
      .update({
        is_claimed: true,
        claimed_at: new Date().toISOString()
      })
      .eq('id', userTask.id);
    
    const { data: progress } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', req.user.id)
      .single();
    
    let updateData = {};
    if (task.reward_type === 'stars') {
      updateData.stars = (progress?.stars || 0) + task.reward_amount;
    } else if (task.reward_type === 'gems') {
      updateData.gems = (progress?.gems || 0) + task.reward_amount;
    }
    
    await supabase
      .from('user_progress')
      .update(updateData)
      .eq('user_id', req.user.id);
    
    res.json({
      success: true,
      reward_type: task.reward_type,
      reward_amount: task.reward_amount
    });
  } catch (error) {
    console.error('领取奖励失败:', error);
    res.status(500).json({ error: '领取奖励失败' });
  }
});

// 获取单词列表
router.get('/words', async (req, res) => {
  try {
    const { category, rarity, part_of_speech, search, page = 1, limit = 1000 } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 1000;
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;
    
    let query = supabase.from('words').select('*', { count: 'exact' });
    
    if (category) query = query.eq('category', category);
    if (rarity) query = query.eq('rarity', rarity);
    if (part_of_speech) query = query.eq('part_of_speech', part_of_speech);
    if (search) query = query.ilike('word', `%${search}%`);
    
    const { data, error, count } = await query.range(from, to);
    
    if (error) throw error;
    
    res.json({ data: data || [], total: count || 0, page: pageNum, limit: limitNum });
  } catch (error) {
    console.error('获取单词列表失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取用户技能
router.get('/skills', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('user_skills')
      .select('*')
      .eq('user_id', req.user.id);
    
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('获取技能失败:', error);
    res.status(500).json({ error: '获取技能失败' });
  }
});

// 购买技能
router.post('/skills', requireAuth, async (req, res) => {
  try {
    const { skill_type, skill_name } = req.body;
    const cost = 3;
    
    const { data: progress } = await supabase
      .from('user_progress')
      .select('gems')
      .eq('user_id', req.user.id)
      .single();
    
    if ((progress?.gems || 0) < cost) {
      return res.status(400).json({ error: '钻石不足' });
    }
    
    await supabase
      .from('user_progress')
      .update({ gems: (progress?.gems || 0) - cost })
      .eq('user_id', req.user.id);
    
    const { data: existing } = await supabase
      .from('user_skills')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('skill_type', skill_type)
      .single();
    
    if (existing) {
      await supabase
        .from('user_skills')
        .update({
          quantity: existing.quantity + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('user_skills')
        .insert({
          user_id: req.user.id,
          skill_type,
          skill_name,
          quantity: 1
        });
    }
    
    res.json({ success: true, cost });
  } catch (error) {
    console.error('购买技能失败:', error);
    res.status(500).json({ error: '购买技能失败' });
  }
});

// 记录战斗
router.post('/battles', requireAuth, async (req, res) => {
  try {
    const { enemy_name, enemy_wave, result, hp_remaining, accuracy, max_combo, stars_earned, gems_earned, skill_used } = req.body;
    
    const { data, error } = await supabase
      .from('battle_records')
      .insert({
        user_id: req.user.id,
        enemy_name,
        enemy_wave,
        result,
        hp_remaining,
        accuracy,
        max_combo,
        stars_earned: stars_earned || 0,
        gems_earned: gems_earned || 0,
        skill_used
      })
      .select()
      .single();
    
    if (error) throw error;
    
    const { data: progress } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', req.user.id)
      .single();
    
    const updateData = {
      total_battles: (progress?.total_battles || 0) + 1,
      stars: (progress?.stars || 0) + (stars_earned || 0),
      gems: (progress?.gems || 0) + (gems_earned || 0)
    };
    
    if (result === 'win') {
      updateData.battles_won = (progress?.battles_won || 0) + 1;
    }
    
    await supabase
      .from('user_progress')
      .update(updateData)
      .eq('user_id', req.user.id);
    
    res.json(data);
  } catch (error) {
    console.error('记录战斗失败:', error);
    res.status(500).json({ error: '记录战斗失败' });
  }
});

export default router;
