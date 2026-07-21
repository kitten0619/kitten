import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';

let envLoaded = false;

function loadEnv() {
  if (envLoaded || (process.env.COZE_SUPABASE_URL && process.env.COZE_SUPABASE_ANON_KEY)) {
    return;
  }

  try {
    const pythonCode = `
import os
import sys
try:
    from coze_workload_identity import Client
    client = Client()
    env_vars = client.get_project_env_vars()
    client.close()
    for env_var in env_vars:
        print(f"{env_var.key}={env_var.value}")
except Exception as e:
    print(f"# Error: {e}", file=sys.stderr)
`;

    const output = execSync(`python3 -c '${pythonCode.replace(/'/g, "'\"'\"'")}'`, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const lines = output.trim().split('\n');
    for (const line of lines) {
      if (line.startsWith('#')) continue;
      const eqIndex = line.indexOf('=');
      if (eqIndex > 0) {
        const key = line.substring(0, eqIndex);
        let value = line.substring(eqIndex + 1);
        if ((value.startsWith("'") && value.endsWith("'")) ||
            (value.startsWith('"') && value.endsWith('"'))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }

    envLoaded = true;
  } catch (e) {
    console.error('Failed to load env:', e.message);
  }
}

function getSupabaseCredentials() {
  loadEnv();

  const url = process.env.COZE_SUPABASE_URL;
  const anonKey = process.env.COZE_SUPABASE_ANON_KEY;

  if (!url) throw new Error('COZE_SUPABASE_URL is not set');
  if (!anonKey) throw new Error('COZE_SUPABASE_ANON_KEY is not set');

  return { url, anonKey };
}

function getSupabaseClient(token) {
  const { url, anonKey } = getSupabaseCredentials();
  const key = token ? anonKey : (process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || anonKey);

  const options = {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  };

  if (token) {
    options.global = { headers: { Authorization: `Bearer ${token}` } };
  }

  return createClient(url, key, options);
}

// 默认管理员客户端（用于服务端操作）。使用延迟初始化，确保未配置
// Supabase 时静态页面仍可正常启动，只有调用相关 API 时才返回配置错误。
let defaultClient;

function getDefaultSupabaseClient() {
  if (!defaultClient) {
    defaultClient = getSupabaseClient();
  }
  return defaultClient;
}

export const supabase = new Proxy({}, {
  get(_target, property) {
    const client = getDefaultSupabaseClient();
    const value = client[property];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

export { loadEnv, getSupabaseCredentials, getSupabaseClient };
