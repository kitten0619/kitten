import { Router } from 'express';
import { getSupabaseCredentials } from '../supabase-client.js';

const router = Router();

router.get('/supabase-config', (req, res) => {
  try {
    const { url, anonKey } = getSupabaseCredentials();
    res.json({ url, anonKey });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get Supabase config' });
  }
});

export default router;
