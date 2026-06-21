/**
 * app.js — 应用主入口
 *
 * 职责：SPA 路由、事件委托、PWA 注册、页面编排。
 * 所有用户操作在这里统一处理，调用 DB / Crypto / Camera / UI 模块。
 */

const App = (() => {
  'use strict';

  // ── 运行时状态 ────────────────────────
  let selectedOutfitIds = [];   // 搭配构建器中已选的衣服 ID
  let currentImageBlob = null;  // 当前待保存的图片 Blob
  let currentThumbnail = '';    // 当前待保存的缩略图
  let loginMode = 'login';     // 'login' | 'register'

  // ── 路由解析 ──────────────────────────

  function parseRoute() {
    const hash = location.hash || '#/';
    const path = hash.replace(/^#/, '');
    const parts = path.split('/').filter(Boolean);

    // #/ → 首页
    if (parts.length === 0) return { page: 'home', params: {} };

    const page = parts[0];

    // #/login
    if (page === 'login') return { page: 'login', params: {} };

    // #/detail/:id
    if (page === 'detail' && parts.length >= 2) {
      // #/detail/:id/edit
      if (parts[2] === 'edit') return { page: 'editItem', params: { id: parts[1] } };
      return { page: 'detail', params: { id: parts[1] } };
    }

    // #/outfit/new
    if (page === 'outfit' && parts[1] === 'new') return { page: 'outfitNew', params: {} };
    // #/outfit/:id
    if (page === 'outfit' && parts.length >= 2) return { page: 'outfitDetail', params: { id: parts[1] } };

    // 简单路由
    const simplePages = ['add', 'wardrobe', 'outfits', 'settings'];
    if (simplePages.includes(page)) return { page, params: {} };

    // 默认首页
    return { page: 'home', params: {} };
  }

  // ── 页面渲染（包装 UI 模块，处理数据加载） ──

  async function renderPage(page, params) {
    const app = document.getElementById('app');
    if (!app) return;

    // 检查登录状态
    if (page !== 'login') {
      const curUser = Crypto.getCurrentUser();
      if (!curUser) { location.hash = '#/login'; return; }
      if (!Crypto.hasKey()) {
        // 刷新后密钥丢失，提示重新登录
        Crypto.clearKey();
        localStorage.removeItem('wardrobe_session');
        location.hash = '#/login';
        return;
      }
    }

    let content;
    switch (page) {
      case 'login':
        content = UI.renderLogin();
        break;
      case 'home':
        content = await showDashboard();
        break;
      case 'add':
        content = await showAddForm();
        break;
      case 'wardrobe':
        content = await showWardrobe();
        break;
      case 'detail':
        content = await showDetail(params.id);
        break;
      case 'editItem':
        content = await showEditItem(params.id);
        break;
      case 'outfits':
        content = await showOutfits();
        break;
      case 'outfitNew':
        content = await showOutfitNew();
        break;
      case 'outfitDetail':
        content = await showOutfitDetail(params.id);
        break;
      case 'settings':
        content = await showSettings();
        break;
      default:
        content = await showDashboard();
    }

    UI.render(app, content);
    updateNavHighlight(page);
  }

  // ── 各页面数据加载 ────────────────────

  async function showDashboard() {
    const stats = await DB.getStats();
    return UI.renderDashboard(stats);
  }

  async function showAddForm() {
    currentImageBlob = null;
    currentThumbnail = '';
    const settings = await DB.getSettings();
    return UI.renderAddForm(settings);
  }

  async function showWardrobe() {
    const items = await DB.getItems();
    const settings = await DB.getSettings();
    // 从 URL query 读取分类筛选（可选扩展，暂时默认全部）
    return UI.renderWardrobe(items, '', settings);
  }

  async function showDetail(id) {
    const item = await DB.getItem(id);
    if (!item) { location.hash = '#/wardrobe'; return; }
    return UI.renderDetail(item);
  }

  async function showEditItem(id) {
    const item = await DB.getItem(id);
    if (!item) { location.hash = '#/wardrobe'; return; }
    const settings = await DB.getSettings();
    return UI.renderEditItem(item, settings);
  }

  async function showOutfits() {
    const [outfits, items] = await Promise.all([DB.getOutfits(), DB.getItems()]);
    return UI.renderOutfitList(outfits, items);
  }

  async function showOutfitNew() {
    const items = await DB.getItems();
    selectedOutfitIds = [];
    return UI.renderOutfitBuilder(items);
  }

  async function showOutfitDetail(id) {
    const outfit = await DB.getOutfit(id);
    if (!outfit) { location.hash = '#/outfits'; return; }
    const settings = await DB.getSettings();
    return UI.renderOutfitDetail(outfit, settings);
  }

  async function showSettings() {
    const [settings, users] = await Promise.all([
      DB.getSettings(),
      Promise.resolve(Crypto.getUsers())
    ]);
    return UI.renderSettings(settings, users);
  }

  // ── 底部导航高亮 ──────────────────────

  function updateNavHighlight(page) {
    const navMap = {
      home: 'home', add: 'add', wardrobe: 'wardrobe',
      detail: 'wardrobe', editItem: 'wardrobe',
      outfits: 'outfits', outfitNew: 'outfits', outfitDetail: 'outfits',
      settings: null
    };
    const active = navMap[page];
    document.querySelectorAll('.nav-item').forEach(el => {
      const key = el.getAttribute('data-page');
      if (key === active) el.classList.add('active');
      else el.classList.remove('active');
    });
    // 隐藏登录页的导航
    const nav = document.getElementById('bottom-nav');
    if (nav) {
      nav.style.display = (page === 'login') ? 'none' : 'flex';
    }
  }

  // ── 事件委托 ──────────────────────────

  async function handleClick(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return;

    const action = target.getAttribute('data-action');

    // 只对需要拦截的动作阻止默认行为
    // "pass-through" 类动作（如 quickAction）让浏览器正常处理链接跳转
    const passthroughActions = ['quickAction', 'editItem'];
    const modalActions = ['confirmDeleteItem', 'confirmDeleteOutfit', 'confirmDeleteCategory',
      'confirmDeleteUser', 'closeModal'];

    if (!passthroughActions.includes(action) && !modalActions.includes(action)) {
      e.preventDefault();
    }

    switch (action) {
      // ── 登录相关 ──
      case 'loginTab':
        loginMode = target.getAttribute('data-tab') || 'login';
        document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
        target.classList.add('active');
        const submitBtn = document.getElementById('login-submit');
        if (submitBtn) submitBtn.textContent = loginMode === 'register' ? '注册' : '登录';
        const errorEl = document.getElementById('login-error');
        if (errorEl) errorEl.classList.remove('show');
        break;

      case 'loginSubmit':
        await handleLoginSubmit();
        break;

      case 'logout':
        Crypto.logout();
        location.hash = '#/login';
        location.reload();
        break;

      // ── 拍照/选图 ──
      case 'pickImage':
        await handlePickImage();
        break;

      case 'removeBg':
        await handleRemoveBg();
        break;

      case 'compress':
        await handleCompress();
        break;

      // ── 保存衣服 ──
      case 'saveItem':
        await handleSaveItem();
        break;

      // ── 衣橱筛选 ──
      case 'filterCategory':
        await handleFilterCategory(target.getAttribute('data-category'));
        break;

      // ── 穿着 ──
      case 'woreToday':
        await handleWoreToday(target.getAttribute('data-id'));
        break;

      // ── 编辑 ──
      case 'editItem':
        location.hash = '#/detail/' + target.closest('[data-id]')?.getAttribute('data-id') + '/edit';
        break;

      case 'saveEdit':
        await handleSaveEdit(target.getAttribute('data-id'));
        break;

      // ── 删除衣服 ──
      case 'deleteItem':
        await handleDeleteItem(target.getAttribute('data-id'));
        break;

      // ── 搭配选择 ──
      case 'toggleOutfitItem':
        await handleToggleOutfitItem(target);
        break;

      case 'saveOutfit':
        await handleSaveOutfit();
        break;

      case 'deleteOutfit':
        await handleDeleteOutfit(target.getAttribute('data-id'));
        break;

      // ── 设置 ──
      case 'addCategory':
        await handleAddCategory();
        break;

      case 'deleteCategory':
        await handleDeleteCategory(target.getAttribute('data-category'));
        break;

      case 'saveApiKey':
        await handleSaveApiKey();
        break;

      case 'changePassword':
        await handleChangePassword();
        break;

      case 'deleteUser':
        await handleDeleteUser(target.getAttribute('data-username'));
        break;

      default:
        break;
    }
  }

  // =====================================================
  //  动作处理函数
  // =====================================================

  // ── 登录 ──────────────────────────────

  async function handleLoginSubmit() {
    const username = document.getElementById('login-username')?.value.trim();
    const password = document.getElementById('login-password')?.value;
    const errorEl = document.getElementById('login-error');

    if (!username || !password) {
      if (errorEl) { errorEl.textContent = '请填写用户名和密码'; errorEl.classList.add('show'); }
      return;
    }

    const isRegister = loginMode === 'register';

    // 注册前检查是否已有用户（若没有，第一个注册的是管理员）
    const result = isRegister
      ? await Crypto.register(username, password)
      : await Crypto.login(username, password);

    if (!result.ok) {
      if (errorEl) { errorEl.textContent = result.error; errorEl.classList.add('show'); }
      return;
    }

    // 成功 → 跳转首页
    location.hash = '#/';
  }

  // ── 拍照/选图 ─────────────────────────

  async function handlePickImage() {
    try {
      const blob = await Camera.pickImage();
      if (!blob) return;

      currentImageBlob = blob;
      currentThumbnail = await DB.blobToThumbnail(blob, 200);

      // 显示预览
      const previewArea = document.getElementById('preview-area');
      const previewImg  = document.getElementById('preview-img');
      const uploadArea  = document.getElementById('upload-area');

      if (previewArea) previewArea.style.display = '';
      if (uploadArea) uploadArea.style.display = 'none';
      if (previewImg) {
        const oldUrl = previewImg.src;
        previewImg.src = URL.createObjectURL(blob);
        if (oldUrl && oldUrl.startsWith('blob:')) URL.revokeObjectURL(oldUrl);
      }
    } catch (e) {
      UI.showToast('图片选择失败: ' + e.message, 'error');
    }
  }

  // ── AI 抠图 ───────────────────────────

  async function handleRemoveBg() {
    if (!currentImageBlob) { UI.showToast('请先选择图片', 'error'); return; }

    const settings = await DB.getSettings();
    if (!settings.removeBgApiKey) {
      UI.showToast('请先在设置中填写 remove.bg API Key', 'error');
      return;
    }

    const processing = document.getElementById('processing');
    if (processing) processing.style.display = '';

    try {
      const processedBlob = await Camera.removeBackground(currentImageBlob, settings.removeBgApiKey);
      if (processedBlob) {
        currentImageBlob = processedBlob;
        currentThumbnail = await DB.blobToThumbnail(processedBlob, 200);
        const previewImg = document.getElementById('preview-img');
        if (previewImg) {
          const oldUrl = previewImg.src;
          previewImg.src = URL.createObjectURL(processedBlob);
          if (oldUrl && oldUrl.startsWith('blob:')) URL.revokeObjectURL(oldUrl);
        }
        UI.showToast('AI 抠图完成！', 'success');
      }
    } catch (e) {
      UI.showToast('抠图失败: ' + e.message, 'error');
    } finally {
      if (processing) processing.style.display = 'none';
    }
  }

  // ── 压缩 ──────────────────────────────

  async function handleCompress() {
    if (!currentImageBlob) { UI.showToast('请先选择图片', 'error'); return; }

    try {
      const compressed = await Camera.compressBlob(currentImageBlob, 800, 0.7);
      currentImageBlob = compressed;
      currentThumbnail = await DB.blobToThumbnail(compressed, 200);
      const previewImg = document.getElementById('preview-img');
      if (previewImg) {
        const oldUrl = previewImg.src;
        previewImg.src = URL.createObjectURL(compressed);
        if (oldUrl && oldUrl.startsWith('blob:')) URL.revokeObjectURL(oldUrl);
      }
      UI.showToast('图片已压缩', 'success');
    } catch (e) {
      UI.showToast('压缩失败: ' + e.message, 'error');
    }
  }

  // ── 保存衣服 ──────────────────────────

  async function handleSaveItem() {
    const name = document.getElementById('item-name')?.value.trim();
    const category = document.getElementById('item-category')?.value;
    const purchaseDate = document.getElementById('item-date')?.value;

    if (!name) { UI.showToast('请输入衣服名称', 'error'); return; }
    if (!currentImageBlob) { UI.showToast('请先拍照或选择图片', 'error'); return; }

    try {
      // 保存图片到 IndexedDB
      const blobId = await DB.saveImage(currentImageBlob);

      // 保存元数据
      await DB.addItem({
        name,
        category,
        purchaseDate: purchaseDate || DB.today(),
        imageBlobId: blobId,
        thumbnail: currentThumbnail
      });

      UI.showToast('衣服已保存！', 'success');

      // 跳转到衣橱
      setTimeout(() => { location.hash = '#/wardrobe'; }, 300);
    } catch (e) {
      UI.showToast('保存失败: ' + e.message, 'error');
    }
  }

  // ── 分类筛选 ──────────────────────────

  async function handleFilterCategory(category) {
    const items = await DB.getItems();
    const settings = await DB.getSettings();
    const filtered = category
      ? items.filter(i => i.category === category)
      : items;

    const app = document.getElementById('app');
    if (app) UI.render(app, UI.renderWardrobe(filtered, category || '', settings));
  }

  // ── 穿着记录 ──────────────────────────

  async function handleWoreToday(id) {
    try {
      const newCount = await DB.incrementWear(id);
      UI.showToast('已记录！👆 累计穿着 ' + newCount + ' 次', 'success');
      // 重新渲染详情页
      const item = await DB.getItem(id);
      if (item) {
        const app = document.getElementById('app');
        if (app) UI.render(app, UI.renderDetail(item));
      }
    } catch (e) {
      UI.showToast('操作失败: ' + e.message, 'error');
    }
  }

  // ── 编辑衣服 ──────────────────────────

  async function handleSaveEdit(id) {
    const name = document.getElementById('edit-name')?.value.trim();
    const category = document.getElementById('edit-category')?.value;
    const purchaseDate = document.getElementById('edit-date')?.value;

    if (!name) { UI.showToast('名称不能为空', 'error'); return; }

    try {
      await DB.updateItem(id, { name, category, purchaseDate });
      UI.showToast('修改已保存', 'success');
      location.hash = '#/detail/' + id;
    } catch (e) {
      UI.showToast('保存失败: ' + e.message, 'error');
    }
  }

  // ── 删除衣服 ──────────────────────────

  async function handleDeleteItem(id) {
    UI.showModal(
      UI.el('div', {}, [
        UI.el('div', { className: 'modal-title', textContent: '确认删除' }),
        UI.el('p', { className: 'text-center mb-16', textContent: '删除后无法恢复，确定要删除这件衣服吗？同时会从搭配中移除。' }),
        UI.el('div', { className: 'gap-10', style: { justifyContent: 'center' } }, [
          UI.el('button', { className: 'btn btn-danger', textContent: '确认删除', 'data-action': 'confirmDeleteItem', 'data-id': id }),
          UI.el('button', { className: 'btn btn-outline', textContent: '取消', 'data-action': 'closeModal' })
        ])
      ])
    );
  }

  // ── 搭配勾选 ──────────────────────────

  async function handleToggleOutfitItem(target) {
    const id = target.getAttribute('data-id');
    if (!id) return;

    const idx = selectedOutfitIds.indexOf(id);
    if (idx >= 0) {
      selectedOutfitIds.splice(idx, 1);
      target.classList.remove('active');
    } else {
      selectedOutfitIds.push(id);
      target.classList.add('active');
    }

    // 更新预览
    const items = await DB.getItems();
    const settings = await DB.getSettings();
    UI.updateOutfitPreview(selectedOutfitIds, items, settings);
  }

  // ── 保存搭配 ──────────────────────────

  async function handleSaveOutfit() {
    if (selectedOutfitIds.length < 2) {
      UI.showToast('请至少选择 2 件衣服', 'error');
      return;
    }

    const name = document.getElementById('outfit-name')?.value.trim() || '未命名搭配';

    try {
      await DB.addOutfit({ name, itemIds: [...selectedOutfitIds] });
      UI.showToast('搭配创建成功！', 'success');
      setTimeout(() => { location.hash = '#/outfits'; }, 300);
    } catch (e) {
      UI.showToast('保存失败: ' + e.message, 'error');
    }
  }

  // ── 删除搭配 ──────────────────────────

  async function handleDeleteOutfit(id) {
    UI.showModal(
      UI.el('div', {}, [
        UI.el('div', { className: 'modal-title', textContent: '删除搭配' }),
        UI.el('p', { className: 'text-center mb-16', textContent: '确定要删除这套搭配吗？衣服不会被删除。' }),
        UI.el('div', { className: 'gap-10', style: { justifyContent: 'center' } }, [
          UI.el('button', { className: 'btn btn-danger', textContent: '确认删除', 'data-action': 'confirmDeleteOutfit', 'data-id': id }),
          UI.el('button', { className: 'btn btn-outline', textContent: '取消', 'data-action': 'closeModal' })
        ])
      ])
    );
  }

  // ── 设置操作 ──────────────────────────

  async function handleAddCategory() {
    const input = document.getElementById('new-category');
    const name = input?.value.trim();
    if (!name) { UI.showToast('请输入分类名称', 'error'); return; }

    const settings = await DB.getSettings();
    if (settings.categories.includes(name)) {
      UI.showToast('该分类已存在', 'error');
      return;
    }

    settings.categories.push(name);
    // 自动添加到 outfitSlotMap
    if (!settings.outfitSlotMap[name]) {
      settings.outfitSlotMap[name] = 'top';
    }

    await DB.saveSettings(settings);
    if (input) input.value = '';
    // 重新渲染设置页
    const app = document.getElementById('app');
    const users = Crypto.getUsers();
    if (app) UI.render(app, UI.renderSettings(settings, users));
    UI.showToast('分类 "' + name + '" 已添加', 'success');
  }

  async function handleDeleteCategory(category) {
    const settings = await DB.getSettings();
    if (settings.categories.length <= 1) {
      UI.showToast('至少保留一个分类', 'error');
      return;
    }

    // 确认
    UI.showModal(
      UI.el('div', {}, [
        UI.el('div', { className: 'modal-title', textContent: '删除分类' }),
        UI.el('p', { className: 'text-center mb-16', textContent: '删除分类 "' + category + '" 后，该分类下的衣服将自动归到"其他"。' }),
        UI.el('div', { className: 'gap-10', style: { justifyContent: 'center' } }, [
          UI.el('button', { className: 'btn btn-danger', textContent: '确认删除', 'data-action': 'confirmDeleteCategory', 'data-category': category }),
          UI.el('button', { className: 'btn btn-outline', textContent: '取消', 'data-action': 'closeModal' })
        ])
      ])
    );
  }

  async function handleSaveApiKey() {
    const key = document.getElementById('api-key')?.value.trim();
    const settings = await DB.getSettings();
    settings.removeBgApiKey = key || '';
    await DB.saveSettings(settings);
    UI.showToast('API Key 已保存', 'success');
  }

  async function handleChangePassword() {
    const oldPw = document.getElementById('old-password')?.value;
    const newPw = document.getElementById('new-password')?.value;

    if (!oldPw || !newPw) { UI.showToast('请填写原密码和新密码', 'error'); return; }
    if (newPw.length < 4) { UI.showToast('新密码至少 4 位', 'error'); return; }

    const result = await Crypto.changePassword(oldPw, newPw);
    if (result.ok) {
      UI.showToast('密码已修改', 'success');
      document.getElementById('old-password').value = '';
      document.getElementById('new-password').value = '';
    } else {
      UI.showToast(result.error, 'error');
    }
  }

  async function handleDeleteUser(username) {
    if (username === Crypto.getCurrentUser()) {
      UI.showToast('不能删除自己，请用"退出登录"', 'error');
      return;
    }

    UI.showModal(
      UI.el('div', {}, [
        UI.el('div', { className: 'modal-title', textContent: '删除用户' }),
        UI.el('p', { className: 'text-center mb-16', textContent: '确定删除用户 "' + username + '" 吗？其所有数据将被永久删除。' }),
        UI.el('div', { className: 'gap-10', style: { justifyContent: 'center' } }, [
          UI.el('button', { className: 'btn btn-danger', textContent: '确认删除', 'data-action': 'confirmDeleteUser', 'data-username': username }),
          UI.el('button', { className: 'btn btn-outline', textContent: '取消', 'data-action': 'closeModal' })
        ])
      ])
    );
  }

  // ── Modal 确认动作 ─────────────────────

  // 这些在全局 click handler 中捕获

  // ── PWA 注册 ──────────────────────────

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('./sw.js')
      .then(reg => {
        console.log('✅ Service Worker 已注册:', reg.scope);
      })
      .catch(err => {
        console.warn('⚠️ Service Worker 注册失败:', err);
      });
  }

  // ── 键盘回车登录 ──────────────────────

  function setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const loginPassword = document.getElementById('login-password');
        if (loginPassword && document.activeElement === loginPassword) {
          handleLoginSubmit();
        }
      }
    });
  }

  // =====================================================
  //  全局事件分发（处理 Modal 确认、直接动作等）
  // =====================================================

  async function handleGlobalClick(e) {
    // 先走委托
    const target = e.target.closest('[data-action]');
    if (!target) return;
    const action = target.getAttribute('data-action');

    switch (action) {
      // Modal 确认动作
      case 'confirmDeleteItem':
        UI.hideModal();
        try {
          await DB.deleteItem(target.getAttribute('data-id'));
          UI.showToast('已删除', 'success');
          location.hash = '#/wardrobe';
        } catch (err) { UI.showToast('删除失败: ' + err.message, 'error'); }
        break;

      case 'confirmDeleteOutfit':
        UI.hideModal();
        try {
          await DB.deleteOutfit(target.getAttribute('data-id'));
          UI.showToast('搭配已删除', 'success');
          location.hash = '#/outfits';
        } catch (err) { UI.showToast('删除失败: ' + err.message, 'error'); }
        break;

      case 'confirmDeleteCategory':
        UI.hideModal();
        await confirmDeleteCategory(target.getAttribute('data-category'));
        break;

      case 'confirmDeleteUser':
        UI.hideModal();
        await confirmDeleteUser(target.getAttribute('data-username'));
        break;

      case 'closeModal':
        UI.hideModal();
        break;

      default:
        // 交给 handleClick 处理
        break;
    }
  }

  async function confirmDeleteCategory(category) {
    const settings = await DB.getSettings();
    const idx = settings.categories.indexOf(category);
    if (idx >= 0) settings.categories.splice(idx, 1);

    // 该分类下的衣服归到"其他"
    let data;
    try { data = await Crypto.loadData(); } catch (e) { return; }
    const defaultCat = settings.categories[0] || '其他';
    data.items = data.items.map(i => {
      if (i.category === category) i.category = defaultCat;
      return i;
    });
    data.settings = settings;
    await Crypto.saveData(data);

    const users = Crypto.getUsers();
    const app = document.getElementById('app');
    if (app) UI.render(app, UI.renderSettings(settings, users));
    UI.showToast('分类 "' + category + '" 已删除', 'success');
  }

  async function confirmDeleteUser(username) {
    const result = await Crypto.deleteUser(username);
    if (result.ok) {
      UI.showToast('用户 "' + username + '" 已删除', 'success');
      const settings = await DB.getSettings();
      const users = Crypto.getUsers();
      const app = document.getElementById('app');
      if (app) UI.render(app, UI.renderSettings(settings, users));
    } else {
      UI.showToast(result.error, 'error');
    }
  }

  // ── 初始化 ────────────────────────────

  async function init() {
    registerSW();
    setupKeyboard();

    // 全局点击监听
    document.addEventListener('click', async (e) => {
      await handleClick(e);
      await handleGlobalClick(e);
    });

    // 路由监听
    window.addEventListener('hashchange', async () => {
      const { page, params } = parseRoute();
      await renderPage(page, params);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // 首次加载
    const { page, params } = parseRoute();
    await renderPage(page, params);

    console.log('👗 智能衣橱已就绪');
  }

  // ── 导出 ──────────────────────────────
  return { init, parseRoute, renderPage };
})();

// ── 启动 ────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
