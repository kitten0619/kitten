import { Router } from 'express';
import { getSupabaseClient } from '../supabase-client.js';
import crypto from 'crypto';

const router = Router();

// 简单的管理员认证（实际生产环境应该使用更安全的方案）
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET || 'ket-admin-secret-key-2026';

// 生成管理员 token
function generateAdminToken() {
  const payload = {
    username: ADMIN_USERNAME,
    timestamp: Date.now(),
    random: crypto.randomBytes(16).toString('hex')
  };
  const data = JSON.stringify(payload);
  const hash = crypto.createHmac('sha256', ADMIN_TOKEN_SECRET).update(data).digest('hex');
  return Buffer.from(data).toString('base64') + '.' + hash;
}

// 验证管理员 token
function verifyAdminToken(token) {
  try {
    const [dataB64, hash] = token.split('.');
    const data = Buffer.from(dataB64, 'base64').toString();
    const expectedHash = crypto.createHmac('sha256', ADMIN_TOKEN_SECRET).update(data).digest('hex');
    return hash === expectedHash;
  } catch (error) {
    return false;
  }
}

// 管理员认证中间件
function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token || !verifyAdminToken(token)) {
    return res.status(401).json({ error: '未授权访问' });
  }
  next();
}

// 管理员登录
router.post('/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      const token = generateAdminToken();
      res.json({ token, username });
    } else {
      res.status(401).json({ error: '用户名或密码错误' });
    }
  } catch (error) {
    res.status(500).json({ error: '登录失败' });
  }
});

// 获取统计数据
router.get('/admin/stats', adminAuth, async (req, res) => {
  try {
    const supabase = getSupabaseClient();
    
    // 总用户数
    const { count: totalUsers } = await supabase
      .from('user_profiles')
      .select('*', { count: 'exact', head: true });
    
    // 总单词数
    const { count: totalWords } = await supabase
      .from('words')
      .select('*', { count: 'exact', head: true });
    
    // 总战斗次数
    const { count: totalBattles } = await supabase
      .from('battle_records')
      .select('*', { count: 'exact', head: true });
    
    // 今日活跃用户
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count: todayActiveUsers } = await supabase
      .from('user_profiles')
      .select('*', { count: 'exact', head: true })
      .gte('last_login_at', today.toISOString());
    
    res.json({
      totalUsers: totalUsers || 0,
      totalWords: totalWords || 0,
      totalBattles: totalBattles || 0,
      todayActiveUsers: todayActiveUsers || 0
    });
  } catch (error) {
    console.error('获取统计数据失败:', error);
    res.status(500).json({ error: '获取统计数据失败' });
  }
});

// 获取最近注册用户
router.get('/admin/users/recent', adminAuth, async (req, res) => {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('获取最近用户失败:', error);
    res.status(500).json({ error: '获取最近用户失败' });
  }
});

// 获取所有用户
router.get('/admin/users', adminAuth, async (req, res) => {
  try {
    const supabase = getSupabaseClient();
    
    // 获取用户资料
    const { data: profiles, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (profileError) throw profileError;
    
    // 获取用户进度
    const { data: progressList, error: progressError } = await supabase
      .from('user_progress')
      .select('*');
    
    if (progressError) throw progressError;
    
    // 获取用户卡牌数量
    const { data: cards, error: cardError } = await supabase
      .from('user_cards')
      .select('user_id, quantity');
    
    if (cardError) throw cardError;
    
    // 合并数据
    const users = profiles.map(p => {
      const progress = progressList?.find(pr => pr.user_id === p.id) || {};
      const userCards = cards?.filter(c => c.user_id === p.id) || [];
      const cardCount = userCards.reduce((sum, c) => sum + (c.quantity || 1), 0);
      
      return {
        ...p,
        ...progress,
        card_count: cardCount
      };
    });
    
    res.json(users);
  } catch (error) {
    console.error('获取用户列表失败:', error);
    res.status(500).json({ error: '获取用户列表失败' });
  }
});

// 获取用户详情
router.get('/admin/users/:userId', adminAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const supabase = getSupabaseClient();
    
    // 获取用户资料
    const { data: user, error: userError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (userError) throw userError;
    
    // 获取用户进度
    const { data: progress, error: progressError } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (progressError) throw progressError;
    
    // 获取用户卡牌
    const { data: cards, error: cardError } = await supabase
      .from('user_cards')
      .select(`
        *,
        words (
          word,
          rarity
        )
      `)
      .eq('user_id', userId);
    
    if (cardError) throw cardError;
    
    res.json({
      user,
      progress,
      cards: cards || []
    });
  } catch (error) {
    console.error('获取用户详情失败:', error);
    res.status(500).json({ error: '获取用户详情失败' });
  }
});

// 获取词库
router.get('/admin/words', adminAuth, async (req, res) => {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('words')
      .select('*')
      .order('id', { ascending: true });
    
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('获取词库失败:', error);
    res.status(500).json({ error: '获取词库失败' });
  }
});

// 获取卡牌统计
router.get('/admin/cards/stats', adminAuth, async (req, res) => {
  try {
    const supabase = getSupabaseClient();
    
    // 获取所有卡牌
    const { data: cards, error: cardError } = await supabase
      .from('user_cards')
      .select(`
        user_id,
        quantity,
        words (
          rarity
        )
      `);
    
    if (cardError) throw cardError;
    
    // 获取用户资料
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, display_name');
    
    // 按用户统计
    const stats = {};
    cards?.forEach(card => {
      if (!stats[card.user_id]) {
        const profile = profiles?.find(p => p.id === card.user_id);
        stats[card.user_id] = {
          user_id: card.user_id,
          display_name: profile?.display_name || card.user_id.substring(0, 8),
          total_cards: 0,
          n_count: 0,
          r_count: 0,
          sr_count: 0,
          ssr_count: 0
        };
      }
      
      const qty = card.quantity || 1;
      stats[card.user_id].total_cards += qty;
      
      const rarity = card.words?.rarity || 'N';
      switch(rarity) {
        case 'N': stats[card.user_id].n_count += qty; break;
        case 'R': stats[card.user_id].r_count += qty; break;
        case 'SR': stats[card.user_id].sr_count += qty; break;
        case 'SSR': stats[card.user_id].ssr_count += qty; break;
      }
    });
    
    res.json(Object.values(stats));
  } catch (error) {
    console.error('获取卡牌统计失败:', error);
    res.status(500).json({ error: '获取卡牌统计失败' });
  }
});

// 获取战斗记录
router.get('/admin/battles', adminAuth, async (req, res) => {
  try {
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from('battle_records')
      .select(`
        *,
        user_profiles (
          display_name
        )
      `)
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (error) throw error;
    
    const battles = data?.map(b => ({
      ...b,
      display_name: b.user_profiles?.display_name || b.user_id.substring(0, 8)
    })) || [];
    
    res.json(battles);
  } catch (error) {
    console.error('获取战斗记录失败:', error);
    res.status(500).json({ error: '获取战斗记录失败' });
  }
});

// 获取今日任务完成情况
router.get('/admin/tasks/today', adminAuth, async (req, res) => {
  try {
    const supabase = getSupabaseClient();
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const { data, error } = await supabase
      .from('user_daily_tasks')
      .select(`
        *,
        daily_tasks (
          task_name,
          target_count
        ),
        user_profiles (
          display_name
        )
      `)
      .eq('task_date', today.toISOString().split('T')[0])
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    const tasks = data?.map(t => ({
      ...t,
      display_name: t.user_profiles?.display_name || t.user_id.substring(0, 8),
      task_name: t.daily_tasks?.task_name || '-',
      target_count: t.daily_tasks?.target_count || 0
    })) || [];
    
    res.json(tasks);
  } catch (error) {
    console.error('获取任务数据失败:', error);
    res.status(500).json({ error: '获取任务数据失败' });
  }
});

export default router;
