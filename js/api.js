// API 配置和调用模块
const API_BASE = window.location.origin;

// 获取 Supabase 配置
async function getSupabaseConfig() {
  const res = await fetch(`${API_BASE}/api/supabase-config`);
  return res.json();
}

// 认证相关 API
const authAPI = {
  async signup(nickname, password) {
    const res = await fetch(`${API_BASE}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname, password })
    });
    return res.json();
  },
  
  async login(nicknameOrEmail, password) {
    // 判断是昵称还是邮箱
    const isEmail = nicknameOrEmail.includes('@');
    const body = isEmail 
      ? { email: nicknameOrEmail, password }
      : { nickname: nicknameOrEmail, password };
    
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return res.json();
  },
  
  async logout() {
    const res = await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST'
    });
    return res.json();
  },
  
  async getSession() {
    const res = await fetch(`${API_BASE}/api/auth/session`);
    return res.json();
  }
};

// 游戏数据 API
const gameAPI = {
  async getProgress(token) {
    const res = await fetch(`${API_BASE}/api/game/progress`, {
      headers: { 'x-session': token }
    });
    return res.json();
  },
  
  async updateProgress(token, data) {
    const res = await fetch(`${API_BASE}/api/game/progress`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-session': token 
      },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  
  async getCards(token) {
    const res = await fetch(`${API_BASE}/api/game/cards`, {
      headers: { 'x-session': token }
    });
    return res.json();
  },
  
  async addCard(token, wordId) {
    const res = await fetch(`${API_BASE}/api/game/cards`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-session': token 
      },
      body: JSON.stringify({ word_id: wordId })
    });
    return res.json();
  },
  
  async decomposeCard(token, wordId, quantity) {
    const res = await fetch(`${API_BASE}/api/game/cards/decompose`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-session': token 
      },
      body: JSON.stringify({ word_id: wordId, quantity })
    });
    return res.json();
  },
  
  async getDailyTasks(token) {
    const res = await fetch(`${API_BASE}/api/game/daily-tasks`, {
      headers: { 'x-session': token }
    });
    return res.json();
  },
  
  async updateTaskProgress(token, taskType, increment = 1) {
    const res = await fetch(`${API_BASE}/api/game/daily-tasks/progress`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-session': token 
      },
      body: JSON.stringify({ task_type: taskType, increment })
    });
    return res.json();
  },
  
  async claimTaskReward(token, taskId) {
    const res = await fetch(`${API_BASE}/api/game/daily-tasks/claim`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-session': token 
      },
      body: JSON.stringify({ task_id: taskId })
    });
    return res.json();
  },
  
  async getWords(page = 1, limit = 50, filters = {}) {
    const params = new URLSearchParams({ page, limit });
    if (filters.category) params.append('category', filters.category);
    if (filters.rarity) params.append('rarity', filters.rarity);
    if (filters.part_of_speech) params.append('part_of_speech', filters.part_of_speech);
    if (filters.search) params.append('search', filters.search);
    
    const res = await fetch(`${API_BASE}/api/game/words?${params}`);
    return res.json();
  },
  
  async getSkills(token) {
    const res = await fetch(`${API_BASE}/api/game/skills`, {
      headers: { 'x-session': token }
    });
    return res.json();
  },
  
  async buySkill(token, skillType, skillName) {
    const res = await fetch(`${API_BASE}/api/game/skills`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-session': token 
      },
      body: JSON.stringify({ skill_type: skillType, skill_name: skillName })
    });
    return res.json();
  },
  
  async recordBattle(token, battleData) {
    const res = await fetch(`${API_BASE}/api/game/battles`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-session': token 
      },
      body: JSON.stringify(battleData)
    });
    return res.json();
  }
};

// 同步状态管理
const syncStatus = {
  status: 'idle', // idle, syncing, synced, failed
  lastSyncTime: null,
  error: null,
  
  update(status, error = null) {
    this.status = status;
    this.error = error;
    if (status === 'synced') {
      this.lastSyncTime = new Date();
    }
    this.render();
  },
  
  render() {
    const el = document.getElementById('sync-status');
    if (!el) return;
    
    const statusText = {
      idle: '未同步',
      syncing: '正在同步...',
      synced: '已同步',
      failed: '同步失败，请重试'
    };
    
    const statusColor = {
      idle: '#888',
      syncing: '#ffa500',
      synced: '#4ade80',
      failed: '#ef4444'
    };
    
    el.innerHTML = `
      <span style="color: ${statusColor[this.status]}">●</span>
      <span>${statusText[this.status]}</span>
      ${this.lastSyncTime ? `<small>${this.lastSyncTime.toLocaleTimeString('zh-CN')}</small>` : ''}
    `;
  }
};

// 导出
window.API = { getSupabaseConfig, authAPI, gameAPI, syncStatus };
