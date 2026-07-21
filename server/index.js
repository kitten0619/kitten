import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadEnv } from './supabase-client.js';
import supabaseConfigRouter from './routes/supabase-config.js';
import authRouter from './routes/auth.js';
import gameRouter from './routes/game.js';
import adminRouter from './routes/admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.DEPLOY_RUN_PORT || 5000;

// 加载环境变量
loadEnv();

// 中间件
app.use(cors());
app.use(express.json());

// API 路由
app.use('/api', supabaseConfigRouter);
app.use('/api', authRouter);
app.use('/api/game', gameRouter);
app.use('/api', adminRouter);

// 静态文件服务
app.use(express.static(join(__dirname, '..')));

// SPA 回退
app.get(/^(?!\/api\/).*$/, (req, res) => {
  res.sendFile(join(__dirname, '..', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`KET 单词大冒险服务器运行在 http://0.0.0.0:${PORT}`);
});
