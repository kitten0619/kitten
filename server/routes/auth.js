import { Router } from 'express';
import { getSupabaseClient } from '../supabase-client.js';

const router = Router();

// 注册（支持昵称注册）
router.post('/auth/signup', async (req, res) => {
  try {
    const { nickname, password } = req.body;
    if (!nickname || !password) {
      return res.status(400).json({ error: '昵称和密码不能为空' });
    }

    // 验证昵称
    if (nickname.length < 2 || nickname.length > 20) {
      return res.status(400).json({ error: '昵称长度必须在2-20个字符之间' });
    }

    const supabase = getSupabaseClient();
    
    // 检查昵称是否已存在
    const { data: existingUser, error: checkError } = await supabase
      .from('user_profiles')
      .select('display_name')
      .eq('display_name', nickname)
      .single();
    
    if (existingUser) {
      return res.status(400).json({ error: '该昵称已被使用' });
    }

    // 生成虚拟邮箱（使用昵称 + 随机数）
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const email = `${nickname.toLowerCase().replace(/[^a-z0-9]/g, '')}_${randomSuffix}@ket-game.local`;

    // 创建用户
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: nickname
        }
      }
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // 创建用户资料
    if (data.user) {
      const { error: profileError } = await supabase
        .from('user_profiles')
        .insert({
          id: data.user.id,
          email: email,
          display_name: nickname
        });

      if (profileError) {
        console.error('创建用户资料失败:', profileError);
      }

      // 创建初始进度
      await supabase
        .from('user_progress')
        .insert({
          user_id: data.user.id,
          stars: 0,
          gems: 0,
          card_fragments: 0,
          current_level: 1,
          current_stage: 1,
          mastered_count: 0,
          streak_days: 0,
          total_battles: 0,
          battles_won: 0
        });
    }

    res.json({ user: { ...data.user, display_name: nickname }, session: data.session });
  } catch (error) {
    console.error('注册失败:', error);
    res.status(500).json({ error: '注册失败' });
  }
});

// 登录（支持昵称或邮箱登录）
router.post('/auth/login', async (req, res) => {
  try {
    const { nickname, email, password } = req.body;
    if ((!nickname && !email) || !password) {
      return res.status(400).json({ error: '昵称/邮箱和密码不能为空' });
    }

    const supabase = getSupabaseClient();
    let loginEmail = email;

    // 如果使用昵称登录，先查询对应的邮箱
    if (nickname) {
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('email')
        .eq('display_name', nickname)
        .single();

      if (profileError || !profile) {
        return res.status(400).json({ error: '该昵称不存在' });
      }
      loginEmail = profile.email;
    }

    // 使用邮箱登录
    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password,
    });

    if (error) {
      return res.status(400).json({ error: '密码错误' });
    }

    // 获取用户资料
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('display_name')
      .eq('id', data.user.id)
      .single();

    // 更新最后登录时间
    await supabase
      .from('user_profiles')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', data.user.id);

    res.json({ 
      user: { ...data.user, display_name: profile?.display_name || nickname }, 
      session: data.session 
    });
  } catch (error) {
    console.error('登录失败:', error);
    res.status(500).json({ error: '登录失败' });
  }
});

// 登出
router.post('/auth/logout', async (req, res) => {
  try {
    const token = req.headers['x-session'];
    const supabase = getSupabaseClient(token);
    await supabase.auth.signOut();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: '登出失败' });
  }
});

// 获取当前用户
router.get('/auth/user', async (req, res) => {
  try {
    const token = req.headers['x-session'];
    if (!token) {
      return res.status(401).json({ error: '未登录' });
    }

    const supabase = getSupabaseClient(token);
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error) {
      return res.status(401).json({ error: '获取用户信息失败' });
    }

    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

export default router;
