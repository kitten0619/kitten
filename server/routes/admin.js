import { Router } from 'express';
import { getAdminSupabaseClient } from '../supabase-client.js';
import { summarizeSnapshot, snapshotCards } from '../game-state.js';
import crypto from 'crypto';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const router = Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const words = JSON.parse(readFileSync(join(__dirname, '../../assets/cards-data-v5.json'), 'utf8'));
const wordsById = new Map(words.map(word => [Number(word.id), word]));
const TOKEN_TTL = 12 * 60 * 60 * 1000;

function adminConfig() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.ADMIN_TOKEN_SECRET;
  if (!username || !password || !secret) throw new Error('管理员环境变量未配置完整');
  return { username, password, secret };
}

function generateAdminToken() {
  const { username, secret } = adminConfig();
  const payload = { username, timestamp: Date.now(), random: crypto.randomBytes(16).toString('hex') };
  const data = JSON.stringify(payload);
  const hash = crypto.createHmac('sha256', secret).update(data).digest('hex');
  return `${Buffer.from(data).toString('base64url')}.${hash}`;
}

function verifyAdminToken(token) {
  try {
    const { username, secret } = adminConfig();
    const [dataB64, hash] = String(token || '').split('.');
    if (!dataB64 || !hash) return false;
    const data = Buffer.from(dataB64, 'base64url').toString();
    const expected = crypto.createHmac('sha256', secret).update(data).digest('hex');
    if (hash.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expected))) return false;
    const payload = JSON.parse(data);
    return payload.username === username && Date.now() - Number(payload.timestamp) < TOKEN_TTL;
  } catch (_) { return false; }
}

function adminAuth(req, res, next) {
  if (!verifyAdminToken(req.headers['x-admin-token'])) return res.status(401).json({ error: '管理员登录已失效' });
  next();
}

function apiError(res, label, error) {
  console.error(label, error);
  const configError = /not set|环境变量|service.role/i.test(error.message || '');
  res.status(configError ? 503 : 500).json({ error: configError ? '后台数据库服务未配置' : label, detail: error.message });
}

async function loadUsers() {
  const supabase = getAdminSupabaseClient();
  const [{ data: profiles, error: profileError }, { data: progress, error: progressError }] = await Promise.all([
    supabase.from('user_profiles').select('*').order('created_at', { ascending: false }),
    supabase.from('user_progress').select('*'),
  ]);
  if (profileError) throw profileError;
  if (progressError) throw progressError;
  const rows = new Map((progress || []).map(row => [row.user_id, row]));
  return (profiles || []).map(profile => {
    const row = rows.get(profile.id) || {};
    const summary = row.state_snapshot ? summarizeSnapshot(row.state_snapshot) : {
      stars: row.stars || 0, gems: row.gems || 0, learned_count: row.mastered_count || 0,
      mastered_count: row.mastered_count || 0, wrong_count: 0, streak_days: row.streak_days || 0,
      unique_cards: 0, card_copies: 0, total_battles: row.total_battles || 0,
      battles_won: row.battles_won || 0, daily: null, daily_plan: null,
    };
    return {
      ...profile, ...summary, snapshot: row.state_snapshot || null,
      state_revision: Number(row.state_revision) || 0,
      last_synced_at: row.last_synced_at || null,
      last_sync_device: row.last_sync_device || null,
      last_active_at: row.last_synced_at || row.updated_at || profile.last_login_at || profile.created_at,
    };
  });
}

router.post('/admin/login', (req, res) => {
  try {
    const { username, password } = adminConfig();
    if (req.body?.username !== username || req.body?.password !== password) return res.status(401).json({ error: '用户名或密码错误' });
    res.json({ token: generateAdminToken(), username });
  } catch (error) { apiError(res, '管理员登录失败', error); }
});

router.get('/admin/health', adminAuth, async (_req, res) => {
  try {
    const supabase = getAdminSupabaseClient();
    const { error } = await supabase.from('user_progress').select('state_revision').limit(1);
    if (error) throw error;
    res.json({ ok: true, database: 'connected', stateSyncSchema: true, build: 'ket-v6-sync-admin-20260805' });
  } catch (error) { apiError(res, '后台健康检查失败', error); }
});

router.get('/admin/stats', adminAuth, async (_req, res) => {
  try {
    const users = await loadUsers();
    const now = Date.now();
    const activeWithin = days => users.filter(user => now - new Date(user.last_active_at).getTime() <= days * 86400000).length;
    const sum = field => users.reduce((total, user) => total + (Number(user[field]) || 0), 0);
    res.json({
      totalUsers: users.length,
      syncedUsers: users.filter(user => user.state_revision > 0).length,
      syncCoverage: users.length ? Math.round(users.filter(user => user.state_revision > 0).length / users.length * 100) : 0,
      totalWords: words.length,
      todayActiveUsers: activeWithin(1),
      sevenDayActiveUsers: activeWithin(7),
      thirtyDayActiveUsers: activeWithin(30),
      totalLearned: sum('learned_count'),
      totalMastered: sum('mastered_count'),
      totalUniqueCards: sum('unique_cards'),
      totalCardCopies: sum('card_copies'),
      totalBattles: sum('total_battles'),
      battlesWon: sum('battles_won'),
      totalStars: sum('stars'),
      totalGems: sum('gems'),
    });
  } catch (error) { apiError(res, '获取统计数据失败', error); }
});

router.get('/admin/users/recent', adminAuth, async (_req, res) => {
  try { res.json((await loadUsers()).slice(0, 10).map(({ snapshot, ...user }) => user)); }
  catch (error) { apiError(res, '获取最近用户失败', error); }
});

router.get('/admin/users', adminAuth, async (_req, res) => {
  try { res.json((await loadUsers()).map(({ snapshot, ...user }) => user)); }
  catch (error) { apiError(res, '获取用户列表失败', error); }
});

router.get('/admin/users/:userId', adminAuth, async (req, res) => {
  try {
    const user = (await loadUsers()).find(item => item.id === req.params.userId);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    const cards = snapshotCards(user.snapshot, wordsById);
    const { snapshot, ...profile } = user;
    res.json({ user: profile, progress: profile, cards, daily: profile.daily, dailyPlan: profile.daily_plan });
  } catch (error) { apiError(res, '获取用户详情失败', error); }
});

router.get('/admin/words', adminAuth, (_req, res) => res.json(words));

router.get('/admin/cards/stats', adminAuth, async (_req, res) => {
  try {
    const users = await loadUsers();
    res.json(users.map(user => {
      const cards = snapshotCards(user.snapshot, wordsById);
      const result = { user_id: user.id, display_name: user.display_name, total_cards: 0, unique_cards: cards.length, n_count: 0, r_count: 0, sr_count: 0, ssr_count: 0 };
      cards.forEach(card => {
        result.total_cards += card.quantity;
        const key = `${String(card.rarity).toLowerCase()}_count`;
        if (key in result) result[key] += card.quantity;
      });
      return result;
    }));
  } catch (error) { apiError(res, '获取卡牌统计失败', error); }
});

router.get('/admin/battles', adminAuth, async (_req, res) => {
  try {
    const users = await loadUsers();
    const records = users.flatMap(user => (user.snapshot?.battleHistory || []).map(record => ({
      ...record, user_id: user.id, display_name: user.display_name,
      is_won: record.result === 'win',
    }))).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 200);
    res.json(records);
  } catch (error) { apiError(res, '获取战斗记录失败', error); }
});

router.get('/admin/tasks/today', adminAuth, async (_req, res) => {
  try {
    const users = await loadUsers();
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: process.env.APP_TIMEZONE || 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const rows = [];
    users.forEach(user => {
      if (user.daily?.date !== today) return;
      const plan = user.daily_plan || {};
      const definitions = [
        ['学习新词', plan.completedNewIds?.length || user.daily.learned || 0, plan.newIds?.length || 6, user.daily.claimed?.learned],
        ['到期复习', plan.completedReviewIds?.length || 0, plan.reviewIds?.length || 0, plan.reviewRewardClaimed || !(plan.reviewIds?.length)],
        ['获得卡牌', user.daily.cards || 0, 2, user.daily.claimed?.cards],
        ['完成对战', user.daily.battles || 0, 1, user.daily.claimed?.battles],
      ];
      definitions.forEach(([task_name, current_progress, target_count, is_completed], index) => rows.push({
        id: `${user.id}-${index}`, user_id: user.id, display_name: user.display_name,
        task_name, current_progress, target_count, is_completed: Boolean(is_completed),
        completed_at: is_completed ? user.last_synced_at : null,
      }));
    });
    res.json(rows);
  } catch (error) { apiError(res, '获取任务数据失败', error); }
});

export default router;
