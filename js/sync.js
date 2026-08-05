(function () {
  'use strict';

  const STATE_KEY = 'ket-card-adventure';
  const DEVICE_KEY = 'ket-device-id';
  const PERSISTENT_KEYS = [
    'v', 'build', 'score', 'gems', 'mastered', 'streakDays', 'lastStudyDate',
    'owned', 'cardCopies', 'deck', 'wrong', 'skills', 'daily', 'dailyPlan',
    'wordProgress', 'totalBattles', 'battlesWon', 'battleHistory',
  ];
  let suppressUpload = false;
  let timer = null;
  let pushing = null;
  let dirty = false;

  function deviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = window.crypto?.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  }

  function metaKey() {
    return `ket-sync-meta:${auth.user?.id || 'guest'}`;
  }

  function getMeta() {
    try { return JSON.parse(localStorage.getItem(metaKey()) || '{}'); } catch (_) { return {}; }
  }

  function setMeta(value) {
    localStorage.setItem(metaKey(), JSON.stringify({ ...getMeta(), ...value, userId: auth.user?.id, deviceId: deviceId() }));
  }

  function readLocal() {
    let value = {};
    try { value = JSON.parse(localStorage.getItem(STATE_KEY) || '{}'); } catch (_) {}
    return { ...value, v: 6, build: window.__KET_BUILD__, deviceId: deviceId(), clientUpdatedAt: value.clientUpdatedAt || new Date().toISOString() };
  }

  function stampLocal() {
    const value = readLocal();
    value.clientUpdatedAt = new Date().toISOString();
    value.deviceId = deviceId();
    value.v = 6;
    value.build = window.__KET_BUILD__;
    localStorage.setItem(STATE_KEY, JSON.stringify(value));
    return value;
  }

  const unique = values => [...new Set((values || []).map(Number).filter(Number.isFinite))];
  const latest = (left, right) => String(left?.clientUpdatedAt || '') >= String(right?.clientUpdatedAt || '') ? left : right;

  function mergeStates(remote, local) {
    if (!remote) return local;
    if (!local) return remote;
    const newer = latest(remote, local);
    const older = newer === local ? remote : local;
    const merged = { ...older, ...newer };
    merged.cardCopies = { ...(older.cardCopies || {}) };
    Object.entries(newer.cardCopies || {}).forEach(([id, quantity]) => {
      merged.cardCopies[id] = Math.max(Number(merged.cardCopies[id]) || 0, Number(quantity) || 0);
    });
    merged.owned = unique([...Object.keys(merged.cardCopies), ...(older.owned || []), ...(newer.owned || [])]);
    merged.deck = unique(newer.deck || older.deck).filter(id => merged.owned.includes(id)).slice(0, 5);
    merged.wordProgress = { ...(older.wordProgress || {}) };
    Object.entries(newer.wordProgress || {}).forEach(([id, progress]) => {
      const previous = merged.wordProgress[id];
      merged.wordProgress[id] = !previous || String(progress?.lastAttemptAt || progress?.lastReviewedAt || '') >= String(previous?.lastAttemptAt || previous?.lastReviewedAt || '') ? progress : previous;
    });
    merged.wrong = unique([...(older.wrong || []), ...(newer.wrong || [])]).filter(id => merged.wordProgress[id]?.status !== 'mastered');
    if (older.daily?.date === newer.daily?.date) {
      merged.daily = {
        ...older.daily, ...newer.daily,
        learned: Math.max(older.daily.learned || 0, newer.daily.learned || 0),
        cards: Math.max(older.daily.cards || 0, newer.daily.cards || 0),
        battles: Math.max(older.daily.battles || 0, newer.daily.battles || 0),
        claimed: {
          learned: Boolean(older.daily.claimed?.learned || newer.daily.claimed?.learned),
          cards: Boolean(older.daily.claimed?.cards || newer.daily.claimed?.cards),
          battles: Boolean(older.daily.claimed?.battles || newer.daily.claimed?.battles),
          all: Boolean(older.daily.claimed?.all || newer.daily.claimed?.all),
        },
      };
    }
    if (older.dailyPlan?.date === newer.dailyPlan?.date) {
      merged.dailyPlan = {
        ...older.dailyPlan, ...newer.dailyPlan,
        newIds: unique(newer.dailyPlan.newIds || older.dailyPlan.newIds).slice(0, 6),
        reviewIds: unique([...(older.dailyPlan.reviewIds || []), ...(newer.dailyPlan.reviewIds || [])]).slice(0, 18),
        completedNewIds: unique([...(older.dailyPlan.completedNewIds || []), ...(newer.dailyPlan.completedNewIds || [])]),
        completedReviewIds: unique([...(older.dailyPlan.completedReviewIds || []), ...(newer.dailyPlan.completedReviewIds || [])]),
        reinforcedIds: unique([...(older.dailyPlan.reinforcedIds || []), ...(newer.dailyPlan.reinforcedIds || [])]),
        freePackClaimed: Boolean(older.dailyPlan.freePackClaimed || newer.dailyPlan.freePackClaimed),
        reviewRewardClaimed: Boolean(older.dailyPlan.reviewRewardClaimed || newer.dailyPlan.reviewRewardClaimed),
      };
    }
    const histories = [...(newer.battleHistory || []), ...(older.battleHistory || [])];
    merged.battleHistory = [...new Map(histories.map(item => [item.id, item])).values()].slice(0, 50);
    merged.totalBattles = Math.max(older.totalBattles || 0, newer.totalBattles || 0, merged.battleHistory.length);
    merged.battlesWon = Math.max(older.battlesWon || 0, newer.battlesWon || 0);
    merged.clientUpdatedAt = newer.clientUpdatedAt || new Date().toISOString();
    merged.deviceId = deviceId();
    merged.v = 6;
    merged.build = window.__KET_BUILD__;
    return merged;
  }

  function applyState(snapshot) {
    if (!snapshot) return;
    suppressUpload = true;
    const clean = { ...snapshot, deviceId: deviceId() };
    localStorage.setItem(STATE_KEY, JSON.stringify(clean));
    PERSISTENT_KEYS.forEach(key => {
      if (clean[key] !== undefined) state[key] = clean[key];
    });
    state.selected = null;
    state.newCard = null;
    state.screen = 'home';
    suppressUpload = false;
    render();
  }

  async function token() {
    return auth.ensureValidToken ? auth.ensureValidToken() : auth.token;
  }

  async function pull() {
    const accessToken = await token();
    if (!accessToken) throw new Error('登录会话已失效，请重新登录');
    const result = await API.gameAPI.getState(accessToken);
    if (result.error) throw new Error(result.detail || result.error);
    return result;
  }

  async function push(snapshot = stampLocal(), expectedRevision = getMeta().revision || 0) {
    if (!auth.isLoggedIn()) return null;
    if (pushing) { dirty = true; return pushing; }
    dirty = false;
    pushing = (async () => {
      API.syncStatus.update('syncing');
      const accessToken = await token();
      if (!accessToken) throw new Error('登录会话已失效，请重新登录');
      let result = await API.gameAPI.updateState(accessToken, snapshot, expectedRevision);
      if (result._status === 409 && result.conflict) {
        const merged = mergeStates(result.state, snapshot);
        applyState(merged);
        result = await API.gameAPI.updateState(accessToken, merged, result.revision);
      }
      if (result.error) throw new Error(result.detail || result.error);
      setMeta({ revision: result.revision, lastSyncedAt: result.lastSyncedAt });
      API.syncStatus.update('synced');
      return result;
    })().catch(error => {
      console.error('[KET SYNC]', error);
      API.syncStatus.update('failed', error.message);
      throw error;
    }).finally(() => {
      pushing = null;
      if (dirty) schedule();
    });
    return pushing;
  }

  function schedule() {
    if (suppressUpload || !auth.isLoggedIn()) return;
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(() => push().catch(() => {}), 700);
  }

  async function onLogin() {
    API.syncStatus.update('syncing');
    const remote = await pull();
    const local = readLocal();
    const knownDevice = getMeta().userId === auth.user?.id;
    if (!remote.state) {
      await push(local, remote.revision || 0);
    } else if (knownDevice && String(local.clientUpdatedAt || '') > String(remote.clientUpdatedAt || '')) {
      await push(mergeStates(remote.state, local), remote.revision || 0);
    } else {
      applyState(remote.state);
      setMeta({ revision: remote.revision, lastSyncedAt: remote.lastSyncedAt });
      API.syncStatus.update('synced');
    }
    updateAuthUI();
  }

  const baseSaveState = saveState;
  saveState = function () {
    baseSaveState();
    if (!suppressUpload) {
      stampLocal();
      schedule();
    }
  };

  window.KETSync = {
    onLogin,
    forceSync: () => push(),
    diagnostics: () => ({ user: auth.user?.id || null, deviceId: deviceId(), meta: getMeta(), local: readLocal() }),
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && auth.isLoggedIn()) push().catch(() => {});
  });
  if (auth.isLoggedIn()) onLogin().catch(error => console.error('[KET SYNC BOOT]', error));
})();
