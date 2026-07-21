// 认证模块
class AuthManager {
  constructor() {
    this.user = null;
    this.token = null;
    this.isGuest = true;
    this.loadFromStorage();
  }
  
  loadFromStorage() {
    const saved = localStorage.getItem('ket_auth');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        this.user = data.user;
        this.token = data.token;
        this.isGuest = false;
      } catch (e) {}
    }
  }
  
  saveToStorage() {
    if (this.user && this.token) {
      localStorage.setItem('ket_auth', JSON.stringify({
        user: this.user,
        token: this.token
      }));
    } else {
      localStorage.removeItem('ket_auth');
    }
  }
  
  async login(nicknameOrEmail, password) {
    API.syncStatus.update('syncing');
    try {
      const result = await API.authAPI.login(nicknameOrEmail, password);
      if (result.error) {
        API.syncStatus.update('failed', result.error);
        return result;
      }
      
      this.user = result.user;
      this.token = result.session.access_token;
      this.isGuest = false;
      this.saveToStorage();
      API.syncStatus.update('synced');
      return result;
    } catch (error) {
      API.syncStatus.update('failed', error.message);
      return { error: error.message };
    }
  }
  
  async signup(nickname, password) {
    API.syncStatus.update('syncing');
    try {
      const result = await API.authAPI.signup(nickname, password);
      if (result.error) {
        API.syncStatus.update('failed', result.error);
        return result;
      }
      
      this.user = result.user;
      this.token = result.session.access_token;
      this.isGuest = false;
      this.saveToStorage();
      API.syncStatus.update('synced');
      return result;
    } catch (error) {
      API.syncStatus.update('failed', error.message);
      return { error: error.message };
    }
  }
  
  logout() {
    this.user = null;
    this.token = null;
    this.isGuest = true;
    this.saveToStorage();
    API.syncStatus.update('idle');
  }
  
  isLoggedIn() {
    return !this.isGuest && !!this.token;
  }
  
  getUserEmail() {
    return this.user?.display_name || this.user?.email || '游客';
  }
}

// 创建全局实例
window.auth = new AuthManager();

// 登录弹窗
function showLoginModal() {
  const modal = document.createElement('div');
  modal.className = 'login-modal';
  modal.innerHTML = `
    <div class="login-content">
      <h2>🎮 KET单词大冒险</h2>
      <p class="login-subtitle">登录以同步学习进度</p>
      
      <div class="login-tabs">
        <button class="tab-btn active" data-tab="login">登录</button>
        <button class="tab-btn" data-tab="signup">注册</button>
      </div>
      
      <form id="login-form">
        <input type="text" id="login-nickname" placeholder="昵称或邮箱" required>
        <input type="password" id="login-password" placeholder="密码 (至少6位)" required minlength="6">
        <button type="submit" class="login-submit">登录</button>
      </form>
      
      <form id="signup-form" style="display:none">
        <input type="text" id="signup-nickname" placeholder="昵称 (2-20个字符)" required minlength="2" maxlength="20">
        <input type="password" id="signup-password" placeholder="密码 (至少6位)" required minlength="6">
        <button type="submit" class="login-submit">注册</button>
      </form>
      
      <div class="login-guest">
        <button id="guest-btn">继续作为游客</button>
      </div>
      
      <button class="login-close" onclick="this.closest('.login-modal').remove()">✕</button>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // 添加样式
  const style = document.createElement('style');
  style.textContent = `
    .login-modal {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.8);
      display: grid;
      place-items: center;
      z-index: 1000;
    }
    .login-content {
      background: linear-gradient(145deg, #1a1a4e, #0f0f3d);
      border: 2px solid #4a4790;
      border-radius: 20px;
      padding: 30px;
      max-width: 400px;
      width: 90%;
      position: relative;
    }
    .login-content h2 {
      margin: 0 0 10px;
      text-align: center;
      font-size: 24px;
    }
    .login-subtitle {
      text-align: center;
      color: #888;
      margin: 0 0 20px;
    }
    .login-tabs {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
    }
    .tab-btn {
      flex: 1;
      padding: 10px;
      background: #1a1845;
      border: 1px solid #4a4790;
      color: #888;
      border-radius: 8px;
      cursor: pointer;
    }
    .tab-btn.active {
      background: #2a2560;
      color: #fff;
      border-color: #8a7dff;
    }
    .login-content input {
      width: 100%;
      padding: 12px;
      margin-bottom: 12px;
      background: #0f0f3d;
      border: 1px solid #4a4790;
      border-radius: 8px;
      color: #fff;
      font-size: 14px;
    }
    .login-submit {
      width: 100%;
      padding: 12px;
      background: linear-gradient(180deg, #ffe65a, #ffb900);
      border: none;
      border-radius: 8px;
      color: #2c1600;
      font-weight: 900;
      font-size: 16px;
      cursor: pointer;
    }
    .login-guest {
      text-align: center;
      margin-top: 15px;
    }
    .login-guest button {
      background: transparent;
      border: 1px solid #4a4790;
      color: #888;
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
    }
    .login-close {
      position: absolute;
      top: 10px;
      right: 10px;
      background: transparent;
      border: none;
      color: #888;
      font-size: 20px;
      cursor: pointer;
    }
  `;
  document.head.appendChild(style);
  
  // 标签切换
  modal.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      modal.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById('login-form').style.display = tab === 'login' ? 'block' : 'none';
      document.getElementById('signup-form').style.display = tab === 'signup' ? 'block' : 'none';
    };
  });
  
  // 登录表单
  document.getElementById('login-form').onsubmit = async (e) => {
    e.preventDefault();
    const nicknameOrEmail = document.getElementById('login-nickname').value.trim();
    const password = document.getElementById('login-password').value;
    const result = await auth.login(nicknameOrEmail, password);
    if (result.error) {
      alert('登录失败：' + result.error);
    } else {
      modal.remove();
      updateAuthUI();
    }
  };
  
  // 注册表单
  document.getElementById('signup-form').onsubmit = async (e) => {
    e.preventDefault();
    const nickname = document.getElementById('signup-nickname').value.trim();
    const password = document.getElementById('signup-password').value;
    const result = await auth.signup(nickname, password);
    if (result.error) {
      alert('注册失败：' + result.error);
    } else {
      modal.remove();
      updateAuthUI();
    }
  };
  
  // 游客模式
  document.getElementById('guest-btn').onclick = () => {
    modal.remove();
  };
}

// 更新认证 UI
function updateAuthUI() {
  const authBtn = document.getElementById('auth-btn');
  const syncStatus = document.getElementById('sync-status');
  
  if (authBtn) {
    if (auth.isLoggedIn()) {
      authBtn.innerHTML = `👤 ${auth.getUserEmail()}`;
      authBtn.onclick = () => {
        if (confirm('确定要退出登录吗？')) {
          auth.logout();
          updateAuthUI();
        }
      };
    } else {
      authBtn.innerHTML = '🔐 登录';
      authBtn.onclick = showLoginModal;
    }
  }
  
  if (syncStatus) {
    if (auth.isLoggedIn()) {
      syncStatus.style.display = 'flex';
      API.syncStatus.render();
    } else {
      syncStatus.style.display = 'none';
    }
  }
}

// 页面加载时更新 UI
document.addEventListener('DOMContentLoaded', () => {
  updateAuthUI();
});
