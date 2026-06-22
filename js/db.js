/**
 * db.js — 数据层抽象
 *
 * 元数据（items, outfits, settings）→ 经 Crypto 加密后存 localStorage
 * 图片 Blob → 存 IndexedDB（不加密，但不含元数据，无法关联用户）
 *
 * 设计：后续切换到 Supabase 只需改这个文件，上层代码不变。
 */

const DB = (() => {
  'use strict';

  const IDB_NAME  = 'wardrobe_img';
  const IDB_STORE = 'images';
  const IDB_VER   = 1;

  let _idb = null; // IndexedDB 实例

  // ── IndexedDB 初始化 ──────────────────

  function openIDB() {
    if (_idb) return Promise.resolve(_idb);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, IDB_VER);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = (e) => { _idb = e.target.result; resolve(_idb); };
      req.onerror   = () => reject(req.error);
    });
  }

  // ── 图片操作（IndexedDB） ─────────────

  /** 保存图片 Blob，返回数字 ID */
  async function saveImage(blob) {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.add({ blob });
      req.onsuccess = () => resolve(req.result); // 自增 ID
      req.onerror   = () => reject(req.error);
    });
  }

  /** 根据 ID 获取图片 Blob */
  async function getImage(id) {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(id);
      req.onsuccess = () => {
        resolve(req.result ? req.result.blob : null);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /** 删除图片 */
  async function deleteImage(id) {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  }

  /** 将 Blob 转为 base64 缩略图（列表显示用，最大宽 200px） */
  function blobToThumbnail(blob, maxWidth = 200) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('图片加载失败'));
      };
      img.src = url;
    });
  }

  // ── 元数据读写（通过 Crypto 加密） ────

  async function readMeta() {
    return Crypto.loadData();
  }

  async function writeMeta(data) {
    return Crypto.saveData(data);
  }

  // ── UUID 生成 ─────────────────────────

  function uuid() {
    return crypto.randomUUID
      ? crypto.randomUUID()
      : 'xxxx-xxxx-4xxx-yxxx-xxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0;
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
  }

  function now() {
    return new Date().toISOString();
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  // ── 衣服 CRUD ─────────────────────────

  async function getItems() {
    const data = await readMeta();
    return data.items || [];
  }

  async function getItem(id) {
    const items = await getItems();
    return items.find(i => i.id === id) || null;
  }

  async function addItem(itemData) {
    const data = await readMeta();
    const item = {
      id: uuid(),
      name: itemData.name || '',
      category: itemData.category || '其他',
      imageBlobId: itemData.imageBlobId || null,
      thumbnail: itemData.thumbnail || '',
      createdAt: now()
    };
    data.items.push(item);
    await writeMeta(data);
    return item;
  }

  async function updateItem(id, updates) {
    const data = await readMeta();
    const idx = data.items.findIndex(i => i.id === id);
    if (idx === -1) throw new Error('衣服不存在');
    // 不允许修改 id 和 createdAt
    const { id: _, createdAt: __, ...safe } = updates;
    Object.assign(data.items[idx], safe);
    await writeMeta(data);
    return data.items[idx];
  }

  async function deleteItem(id) {
    const data = await readMeta();
    const idx = data.items.findIndex(i => i.id === id);
    if (idx === -1) throw new Error('衣服不存在');
    const item = data.items[idx];
    // 删除关联的图片
    if (item.imageBlobId) {
      try { await deleteImage(item.imageBlobId); } catch (e) { /* ignore */ }
    }
    data.items.splice(idx, 1);
    // 从搭配中移除引用
    data.outfits = (data.outfits || []).map(o => ({
      ...o,
      itemIds: o.itemIds.filter(iid => iid !== id)
    })).filter(o => o.itemIds.length >= 2); // 少于2件的搭配自动删除
    await writeMeta(data);
  }

  // ── 搭配 CRUD ─────────────────────────

  async function getOutfits() {
    const data = await readMeta();
    return data.outfits || [];
  }

  /** 获取搭配详情（包含每件衣服的完整数据） */
  async function getOutfit(id) {
    const data = await readMeta();
    const outfit = (data.outfits || []).find(o => o.id === id);
    if (!outfit) return null;
    const items = data.items || [];
    const resolvedItems = outfit.itemIds
      .map(iid => items.find(i => i.id === iid))
      .filter(Boolean);
    return { ...outfit, items: resolvedItems };
  }

  async function addOutfit(outfitData) {
    const data = await readMeta();
    if (!outfitData.itemIds || outfitData.itemIds.length < 2) {
      throw new Error('至少选择 2 件衣服');
    }
    const outfit = {
      id: uuid(),
      name: outfitData.name || '未命名搭配',
      itemIds: outfitData.itemIds,
      createdAt: now()
    };
    data.outfits = data.outfits || [];
    data.outfits.push(outfit);
    await writeMeta(data);
    return outfit;
  }

  async function updateOutfit(id, updates) {
    const data = await readMeta();
    const idx = (data.outfits || []).findIndex(o => o.id === id);
    if (idx === -1) throw new Error('搭配不存在');
    const { id: _, createdAt: __, ...safe } = updates;
    Object.assign(data.outfits[idx], safe);
    await writeMeta(data);
    return data.outfits[idx];
  }

  async function deleteOutfit(id) {
    const data = await readMeta();
    data.outfits = (data.outfits || []).filter(o => o.id !== id);
    await writeMeta(data);
  }

  // ── 设置 ──────────────────────────────

  async function getSettings() {
    const data = await readMeta();
    return data.settings || Crypto.defaultSettings();
  }

  async function saveSettings(settings) {
    const data = await readMeta();
    data.settings = settings;
    await writeMeta(data);
  }

  // ── 统计 ──────────────────────────────

  async function getStats() {
    const data = await readMeta();
    const items = data.items || [];
    const outfits = data.outfits || [];

    // 最常穿
    const mostWorn = [];

    // 最近添加
    const recent = [...items]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5);

    // 分类统计
    const catCount = {};
    items.forEach(i => {
      catCount[i.category] = (catCount[i.category] || 0) + 1;
    });

    return {
      totalItems: items.length,
      totalOutfits: outfits.length,
      totalWears: 0,
      mostWorn,
      recentItems: recent,
      categoryCount: catCount
    };
  }

  // ── 导出 ──────────────────────────────
  return {
    // 图片
    saveImage, getImage, deleteImage, blobToThumbnail,
    // 衣服
    getItems, getItem, addItem, updateItem, deleteItem,
    // 搭配
    getOutfits, getOutfit, addOutfit, updateOutfit, deleteOutfit,
    // 设置 & 统计
    getSettings, saveSettings, getStats,
    // 工具
    uuid, today
  };
})();
