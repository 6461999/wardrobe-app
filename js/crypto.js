/**
 * crypto.js — 加密与账号系统
 *
 * 用浏览器原生 Web Crypto API 实现 AES-256-GCM 加密。
 * 流程：用户名 + 密码 → PBKDF2 派生密钥 → 加/解密数据
 *
 * 安全性：
 *   - 密码永不明文存储，只存随机盐值
 *   - 解密失败 = 密码错误（无法离线暴力破解）
 *   - 不同用户数据用不同密钥加密，互不可见
 *   - 密钥只在内存中，刷新页面后消失 → 需重新登录
 */
const Crypto = (() => {
  'use strict';

  // ── 常量 ──────────────────────────────
  const USERS_KEY   = 'wardrobe_users';
  const DATA_PREFIX = 'wardrobe_data_';
  const SESSION_KEY = 'wardrobe_session';
  const VERIFY_TEXT = 'WARDROBE_OK';

  const PBKDF2_ITER = 100000;   // 迭代次数
  const KEY_BITS     = 256;     // AES-256
  const SALT_BYTES   = 16;      // 128 位盐
  const IV_BYTES     = 12;      // GCM 推荐 12 字节 IV

  // ── 运行时状态 ────────────────────────
  let _key = null;              // CryptoKey（内存中，刷新后消失）

  // ── 编码工具 ──────────────────────────

  function buf2b64(buf) {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function b642buf(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  function str2buf(s) { return new TextEncoder().encode(s).buffer; }
  function buf2str(buf) { return new TextDecoder().decode(new Uint8Array(buf)); }

  function randBytes(n) { return crypto.getRandomValues(new Uint8Array(n)); }

  // ── 密码学操作 ────────────────────────

  /** 从密码 + 盐值派生 AES 密钥 */
  async function deriveKey(password, salt) {
    const km = await crypto.subtle.importKey('raw', str2buf(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' },
      km,
      { name: 'AES-GCM', length: KEY_BITS },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /** 加密明文 → { iv, ciphertext }（均为 Base64） */
  async function aesEncrypt(plaintext, key) {
    const iv = randBytes(IV_BYTES);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, str2buf(plaintext));
    return { iv: buf2b64(iv), ciphertext: buf2b64(ct) };
  }

  /** 解密 → 明文字符串。失败抛异常。 */
  async function aesDecrypt(encObj, key) {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b642buf(encObj.iv) },
      key,
      b642buf(encObj.ciphertext)
    );
    return buf2str(pt);
  }

  // ── 用户列表（明文存用户名+盐值，无密码） ──

  function readUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY)) || {}; }
    catch (e) { return {}; }
  }

  function writeUsers(u) { localStorage.setItem(USERS_KEY, JSON.stringify(u)); }

  // ── 公开方法 ──────────────────────────

  function getUsers() { return Object.keys(readUsers()); }

  function getCurrentUser() {
    try {
      const s = localStorage.getItem(SESSION_KEY);
      return s ? JSON.parse(s).username : null;
    } catch (e) { return null; }
  }

  function hasKey() { return _key !== null; }

  function clearKey() { _key = null; }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    _key = null;
  }

  /** 注册新用户 */
  async function register(username, password) {
    if (!username || username.length < 2) return { ok: false, error: '用户名至少 2 个字符' };
    if (!password || password.length < 4) return { ok: false, error: '密码至少 4 位' };

    const users = readUsers();
    if (users[username]) return { ok: false, error: '该用户名已存在' };

    const salt = randBytes(SALT_BYTES);
    const key  = await deriveKey(password, salt);
    const verify = await aesEncrypt(VERIFY_TEXT, key);

    const initData = JSON.stringify({
      items: [],
      outfits: [],
      settings: defaultSettings()
    });
    const dataEnc = await aesEncrypt(initData, key);

    users[username] = { salt: buf2b64(salt), verify };
    writeUsers(users);
    localStorage.setItem(DATA_PREFIX + username, JSON.stringify(dataEnc));
    localStorage.setItem(SESSION_KEY, JSON.stringify({ username }));

    _key = key;
    return { ok: true };
  }

  /** 登录 */
  async function login(username, password) {
    if (!username || !password) return { ok: false, error: '请输入用户名和密码' };

    const users = readUsers();
    const user  = users[username];
    if (!user) return { ok: false, error: '用户不存在' };

    const salt = b642buf(user.salt);
    let key;
    try { key = await deriveKey(password, salt); }
    catch (e) { return { ok: false, error: '登录失败，请重试' }; }

    // 验证密码：解密验证令牌
    try {
      const vt = await aesDecrypt(user.verify, key);
      if (vt !== VERIFY_TEXT) return { ok: false, error: '密码错误' };
    } catch (e) { return { ok: false, error: '密码错误' }; }

    // 验证数据完整性
    const raw = localStorage.getItem(DATA_PREFIX + username);
    if (raw) {
      try { await aesDecrypt(JSON.parse(raw), key); }
      catch (e) { return { ok: false, error: '数据损坏，无法读取' }; }
    }

    localStorage.setItem(SESSION_KEY, JSON.stringify({ username }));
    _key = key;
    return { ok: true };
  }

  /** 加载并解密数据 */
  async function loadData() {
    const u = getCurrentUser();
    if (!u) throw new Error('未登录');
    if (!_key) throw new Error('密钥已过期，请重新登录');

    const raw = localStorage.getItem(DATA_PREFIX + u);
    if (!raw) return { items: [], outfits: [], settings: defaultSettings() };

    const pt = await aesDecrypt(JSON.parse(raw), _key);
    return JSON.parse(pt);
  }

  /** 加密并保存数据 */
  async function saveData(data) {
    const u = getCurrentUser();
    if (!u) throw new Error('未登录');
    if (!_key) throw new Error('密钥已过期，请重新登录');

    const enc = await aesEncrypt(JSON.stringify(data), _key);
    localStorage.setItem(DATA_PREFIX + u, JSON.stringify(enc));
  }

  /** 修改密码 */
  async function changePassword(oldPw, newPw) {
    const u = getCurrentUser();
    if (!u) throw new Error('未登录');
    if (!newPw || newPw.length < 4) return { ok: false, error: '新密码至少 4 位' };

    const users = readUsers();
    const user  = users[u];
    const salt  = b642buf(user.salt);

    // 验证旧密码
    let oldKey;
    try { oldKey = await deriveKey(oldPw, salt); }
    catch (e) { return { ok: false, error: '原密码错误' }; }

    try {
      const vt = await aesDecrypt(user.verify, oldKey);
      if (vt !== VERIFY_TEXT) return { ok: false, error: '原密码错误' };
    } catch (e) { return { ok: false, error: '原密码错误' }; }

    // 解密数据
    let data = { items: [], outfits: [], settings: defaultSettings() };
    const raw = localStorage.getItem(DATA_PREFIX + u);
    if (raw) data = JSON.parse(await aesDecrypt(JSON.parse(raw), oldKey));

    // 用新密码重新加密
    const newSalt = randBytes(SALT_BYTES);
    const newKey  = await deriveKey(newPw, newSalt);
    const newVerify = await aesEncrypt(VERIFY_TEXT, newKey);
    const newData   = await aesEncrypt(JSON.stringify(data), newKey);

    users[u] = { salt: buf2b64(newSalt), verify: newVerify };
    writeUsers(users);
    localStorage.setItem(DATA_PREFIX + u, JSON.stringify(newData));
    _key = newKey;

    return { ok: true };
  }

  /** 删除用户 */
  async function deleteUser(username) {
    const users = readUsers();
    if (!users[username]) return { ok: false, error: '用户不存在' };
    delete users[username];
    writeUsers(users);
    localStorage.removeItem(DATA_PREFIX + username);
    if (getCurrentUser() === username) { logout(); }
    return { ok: true };
  }

  function defaultSettings() {
    return {
      categories: ['上衣', '裤子', '裙子', '外套', '鞋子', '配饰', '包包', '其他'],
      removeBgApiKey: '',
      outfitSlotMap: {
        '帽子': 'head', '配饰': 'head',
        '上衣': 'top',  '外套': 'top',
        '裙子': 'bottom', '裤子': 'bottom',
        '鞋子': 'feet',  '包包': 'feet',
        '其他': 'top'
      }
    };
  }

  return {
    getUsers, getCurrentUser, hasKey, clearKey,
    login, register, logout,
    loadData, saveData,
    changePassword, deleteUser,
    defaultSettings
  };
})();
