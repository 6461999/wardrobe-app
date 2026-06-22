/**
 * ui.js — 页面渲染引擎
 *
 * 每个页面一个渲染函数，接收数据，返回 DOM。
 * 所有用户输入内容用 textContent（防 XSS）。
 * 事件通过 data-action 属性委托处理（在 app.js 里统一监听）。
 */

const UI = (() => {
  'use strict';

  const LAYER_LABELS = { head: '帽子/配饰', top: '上装/外套', bottom: '下装', feet: '鞋子/包包' };
  const LAYER_ORDER  = ['head', 'top', 'bottom', 'feet'];

  // ── DOM 工具 ───────────────────────────

  function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'className') e.className = v;
      else if (k === 'textContent') e.textContent = v;
      else if (k === 'src') e.src = v;
      else if (k === 'alt') e.alt = v;
      else if (k === 'href') e.href = v;
      else if (k === 'type') e.type = v;
      else if (k === 'placeholder') e.placeholder = v;
      else if (k === 'value') e.value = v;
      else if (k.startsWith('data-')) e.setAttribute(k, v);
      else if (k === 'style') Object.assign(e.style, v);
      else if (k === 'innerHTML') e.innerHTML = v;
      else e.setAttribute(k, v);
    }
    for (const child of children) {
      if (typeof child === 'string') e.appendChild(document.createTextNode(child));
      else if (child) e.appendChild(child);
    }
    return e;
  }

  /** 清空并渲染 */
  function render(container, ...children) {
    container.innerHTML = '';
    for (const c of children) if (c) container.appendChild(c);
  }

  // ── 面包屑导航 ─────────────────────────

  function pageHeader(title, backHref, rightBtn) {
    const left = backHref
      ? el('a', { href: backHref, className: 'btn btn-ghost btn-sm', textContent: '← 返回' })
      : null;
    const right = rightBtn || null;
    return el('div', { className: 'page-header' }, [
      left || el('span'),
      el('div', { className: 'page-title', textContent: title }),
      right || el('span')
    ]);
  }

  // ── Toast ──────────────────────────────

  function showToast(message, type = '') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'toast ' + type;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.className = 'toast hidden'; }, 2200);
  }

  // ── Modal ──────────────────────────────

  function showModal(content, onClose) {
    const overlay = document.getElementById('modal-overlay');
    if (!overlay) return;
    overlay.innerHTML = '';
    const sheet = el('div', { className: 'modal-sheet' }, [content]);
    overlay.appendChild(sheet);
    overlay.className = 'modal-overlay';
    overlay.onclick = (e) => {
      if (e.target === overlay) { hideModal(); if (onClose) onClose(); }
    };
  }

  function hideModal() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.className = 'modal-overlay hidden';
  }

  // =====================================================
  //  页面渲染函数
  // =====================================================

  /** 登录 / 注册页面 */
  function renderLogin(existingUsers) {
    const users = existingUsers || [];

    // 已有账号列表（快速切换）
    let userListSection = null;
    if (users.length > 0) {
      const userItems = users.map(u => el('button', {
        className: 'category-pill',
        textContent: '👤 ' + u,
        'data-action': 'selectUser',
        'data-username': u
      }));
      userListSection = el('div', { className: 'mb-12' }, [
        el('div', { className: 'form-hint mb-8', textContent: '已有账号，点击切换（仍需输入密码）' }),
        el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } }, userItems)
      ]);
    }

    const container = el('div', { className: 'login-container' }, [
      el('div', { className: 'login-logo', textContent: '👗' }),
      el('h1', { className: 'login-title', textContent: '智能衣橱' }),
      el('p', { className: 'login-desc', textContent: '管理你的每一件衣服' }),
      userListSection,
      el('div', { className: 'login-tabs' }, [
        el('button', { className: 'login-tab active', textContent: '登录', 'data-action': 'loginTab', 'data-tab': 'login' }),
        el('button', { className: 'login-tab', textContent: '注册', 'data-action': 'loginTab', 'data-tab': 'register' })
      ]),
      el('div', { id: 'login-error', className: 'login-error' }),
      el('div', { className: 'login-form' }, [
        el('div', { className: 'form-group' }, [
          el('label', { className: 'form-label', textContent: '用户名' }),
          el('input', { id: 'login-username', className: 'form-input', type: 'text', placeholder: '输入用户名', autocomplete: 'username' })
        ]),
        el('div', { className: 'form-group' }, [
          el('label', { className: 'form-label', textContent: '密码' }),
          el('input', { id: 'login-password', className: 'form-input', type: 'password', placeholder: '输入密码', autocomplete: 'current-password' })
        ]),
        el('button', { id: 'login-submit', className: 'btn btn-primary btn-block mt-12', textContent: '登录', 'data-action': 'loginSubmit' })
      ])
    ]);
    return container;
  }

  // ── 首页仪表盘 ────────────────────────

  function renderDashboard(stats) {
    var s = stats || { totalItems: 0, totalOutfits: 0, totalWears: 0, mostWorn: [], recentItems: [], categoryCount: {} };
    var curUser = Crypto.getCurrentUser() || '';
    var settings = s.settings || {};
    var cats = settings.categories || ['上衣', '裤子', '裙子', '外套', '鞋子', '配饰', '包包', '其他'];

    // 空状态
    if (s.totalItems === 0) {
      var emptyFrag = document.createDocumentFragment();
      emptyFrag.appendChild(dashHeader('我的衣橱'));
      emptyFrag.appendChild(el('div', { className: 'empty-state mt-20' }, [
        el('div', { className: 'empty-state-icon', textContent: '👗' }),
        el('div', { className: 'empty-state-text', textContent: '衣橱还是空的' }),
        el('div', { className: 'empty-state-hint', textContent: '点右下角 + 添加第一件衣服' })
      ]));
      emptyFrag.appendChild(fabBtn());
      return emptyFrag;
    }

    // 分类列表卡片
    var catCards = cats.map(function(c) {
      var cnt = (s.categoryCount || {})[c] || 0;
      var firstItem = null;
      if (s.recentItems) {
        firstItem = s.recentItems.find(function(i) { return i.category === c; });
      }
      return catListCard(c, cnt, firstItem);
    });

    var frag = document.createDocumentFragment();
    frag.appendChild(dashHeader('我的衣橱'));
    frag.appendChild(el('div', { className: 'cat-list' }, catCards));
    frag.appendChild(fabBtn());
    return frag;
  }

  /** 首页标题栏: "我的衣橱 ▼" | 🔍 ⊞ ⋮ */
  function dashHeader(title) {
    return el('div', { className: 'dash-header' }, [
      el('div', { className: 'dash-title-row' }, [
        el('span', { className: 'dash-title', textContent: title }),
        el('span', { className: 'dash-title-arrow', textContent: '▼' })
      ]),
      el('div', { className: 'dash-header-icons' }, [
        el('button', { className: 'dash-header-icon', textContent: '🔍', 'data-action': 'searchItems' }),
        el('button', { className: 'dash-header-icon', textContent: '⊞', 'data-action': 'gridView' }),
        el('button', { className: 'dash-header-icon', textContent: '⋯', 'data-action': 'moreOptions' })
      ])
    ]);
  }

  /** 单张分类列表卡片 */
  function catListCard(catName, count, firstItem) {
    var imgArea;
    if (firstItem && firstItem.thumbnail) {
      imgArea = el('img', { className: 'cat-list-thumb', src: firstItem.thumbnail, alt: catName });
    } else {
      imgArea = el('div', { className: 'cat-list-left' }, [
        el('span', { className: 'cat-placeholder', textContent: '+' })
      ]);
    }
    return el('a', { href: '#/wardrobe/' + encodeURIComponent(catName), className: 'cat-list-card' }, [
      imgArea,
      el('div', { className: 'cat-list-info' }, [
        el('div', { className: 'cat-list-name', textContent: catName }),
        el('div', { className: 'cat-list-count', textContent: '· ' + count + ' 个' })
      ]),
      el('button', { className: 'cat-list-more', textContent: '☰', 'data-action': 'catMore', 'data-category': catName })
    ]);
  }

  /** FAB 悬浮按钮 */
  function fabBtn() {
    return el('a', { href: '#/add', className: 'fab', textContent: '+' });
  }

  function miniItemCard(item) {
    return el('a', {
      href: '#/detail/' + item.id,
      className: 'item-card',
      title: item.name
    }, [
      el('img', {
        className: 'item-card-img',
        src: item.thumbnail || './assets/placeholder.png',
        alt: item.name,
        loading: 'lazy'
      }),
      el('div', { className: 'item-card-body' }, [
        el('div', { className: 'item-card-name', textContent: item.name }),
        el('div', { className: 'item-card-meta' }, [
          el('span', { textContent: item.category }),
          item.wearCount > 0
            ? el('span', { className: 'wear-badge', textContent: '穿过 ' + item.wearCount + ' 次' })
            : el('span', { textContent: '未穿过' })
        ])
      ])
    ]);
  }

  // ── 灵感页（占位） ────────────────────

  function renderInspire() {
    var frag = document.createDocumentFragment();
    frag.appendChild(dashHeader('灵感'));
    frag.appendChild(el('div', { className: 'empty-state mt-20' }, [
      el('div', { className: 'empty-state-icon', textContent: '✨' }),
      el('div', { className: 'empty-state-text', textContent: '穿搭灵感' }),
      el('div', { className: 'empty-state-hint', textContent: '此功能即将上线，敬请期待' })
    ]));
    return frag;
  }

  // ── 添加衣服页 ────────────────────────

  function renderAddForm(settings) {
    const cats = settings.categories || ['上衣', '裤子', '裙子', '外套', '鞋子', '配饰', '包包', '其他'];
    const hasApiKey = !!(settings.removeBgApiKey && settings.removeBgApiKey.trim());

    const header = pageHeader('添加衣服', '#/');

    // 图片上传区域
    const uploadArea = el('div', { id: 'upload-area', className: 'upload-area', 'data-action': 'pickImage' }, [
      el('div', { className: 'upload-area-icon', textContent: '📸' }),
      el('div', { className: 'upload-area-text', textContent: '点击拍照或选择图片' }),
      el('div', { className: 'upload-area-hint', textContent: '支持手机拍照和相册选取' })
    ]);

    // 图片预览区域（默认隐藏）
    const previewArea = el('div', { id: 'preview-area', style: { display: 'none' } }, [
      el('img', { id: 'preview-img', className: 'upload-preview', src: '' }),
      el('div', { className: 'upload-actions' }, [
        el('button', { className: 'btn btn-outline btn-sm', textContent: '📷 重拍', 'data-action': 'pickImage' }),
        hasApiKey
          ? el('button', { id: 'btn-remove-bg', className: 'btn btn-outline btn-sm', textContent: '✨ AI 抠图', 'data-action': 'removeBg' })
          : null,
        el('button', { id: 'btn-process', className: 'btn btn-outline btn-sm', textContent: '🔄 压缩', 'data-action': 'compress' })
      ].filter(Boolean))
    ]);

    // 处理中状态
    const processing = el('div', { id: 'processing', className: 'processing', style: { display: 'none' } }, [
      el('div', { className: 'spinner' }),
      el('span', { textContent: 'AI 正在抠图，请稍候...' })
    ]);

    // 表单
    const form = el('div', { className: 'mt-12' }, [
      el('div', { className: 'form-group' }, [
        el('label', { className: 'form-label', textContent: '衣服名称 *' }),
        el('input', { id: 'item-name', className: 'form-input', type: 'text', placeholder: '例如：白色纯棉T恤' })
      ]),
      el('div', { className: 'form-group' }, [
        el('label', { className: 'form-label', textContent: '分类' }),
        el('select', { id: 'item-category', className: 'form-select' },
          cats.map(c => el('option', { value: c, textContent: c }))
        )
      ]),
      el('div', { className: 'form-group' }, [
        el('label', { className: 'form-label', textContent: '购买日期' }),
        el('input', { id: 'item-date', className: 'form-input', type: 'date', value: DB.today() })
      ]),
      el('button', { id: 'btn-save', className: 'btn btn-primary btn-block mt-12', textContent: '💾 保存衣服', 'data-action': 'saveItem' })
    ]);

    const frag = document.createDocumentFragment();
    frag.appendChild(header);
    frag.appendChild(uploadArea);
    frag.appendChild(previewArea);
    frag.appendChild(processing);
    frag.appendChild(form);
    return frag;
  }

  // ── 衣橱浏览页 ────────────────────────

  function renderWardrobe(items, filterCategory, settings) {
    const cats = settings.categories || [];
    const header = pageHeader('衣橱', '#/');

    // 分类筛选
    const pills = cats.map(c => {
      const cls = 'category-pill' + (c === filterCategory ? ' active' : '');
      return el('button', {
        className: cls,
        textContent: c,
        'data-action': 'filterCategory',
        'data-category': c
      });
    });

    const allCls = 'category-pill' + (!filterCategory ? ' active' : '');
    const allPill = el('button', {
      className: allCls,
      textContent: '全部 (' + items.length + ')',
      'data-action': 'filterCategory',
      'data-category': ''
    });

    const filterBar = el('div', { className: 'category-filter' }, [allPill, ...pills]);

    // 无结果
    if (items.length === 0) {
      const empty = el('div', { className: 'empty-state mt-20' }, [
        el('div', { className: 'empty-state-icon', textContent: '🫙' }),
        el('div', { className: 'empty-state-text', textContent: filterCategory ? `"${filterCategory}"分类暂无衣服` : '衣橱是空的' }),
        el('a', { href: '#/add', className: 'btn btn-primary mt-16', textContent: '➕ 添加衣服' })
      ]);
      const frag = document.createDocumentFragment();
      frag.appendChild(header);
      frag.appendChild(filterBar);
      frag.appendChild(empty);
      return frag;
    }

    const grid = el('div', { className: 'item-grid' },
      items.map(i => miniItemCard(i))
    );

    const frag = document.createDocumentFragment();
    frag.appendChild(header);
    frag.appendChild(filterBar);
    frag.appendChild(grid);
    return frag;
  }

  // ── 衣服详情页 ────────────────────────

  function renderDetail(item) {
    const header = pageHeader(item.name, '#/wardrobe',
      el('div', { className: 'gap-8' }, [
        el('a', { href: '#/detail/' + item.id + '/edit', className: 'btn btn-ghost btn-sm', textContent: '✏️ 编辑', 'data-action': 'editItem' }),
        el('button', { className: 'btn btn-ghost btn-sm', textContent: '🗑️ 删除', 'data-action': 'deleteItem', 'data-id': item.id, style: { color: 'var(--accent)' } })
      ])
    );

    const img = el('img', {
      className: 'detail-img',
      src: item.thumbnail || './assets/placeholder.png',
      alt: item.name,
      id: 'detail-img'
    });
    // 如果有原图，异步加载
    if (item.imageBlobId) {
      img.setAttribute('data-img-id', item.imageBlobId);
      loadDetailImage(img, item.imageBlobId);
    }

    const info = el('div', { className: 'detail-info' }, [
      detailRow('分类', item.category),
      detailRow('购买日期', item.purchaseDate || '未设置'),
      detailRow('穿着次数', el('span', { className: 'wear-badge', textContent: String(item.wearCount || 0) + ' 次' })),
      detailRow('录入时间', new Date(item.createdAt).toLocaleDateString('zh-CN'))
    ]);

    const actions = el('div', { className: 'detail-actions' }, [
      el('button', { className: 'btn btn-primary', textContent: '👆 今天穿了', 'data-action': 'woreToday', 'data-id': item.id }),
      el('a', { href: '#/wardrobe', className: 'btn btn-outline', textContent: '返回衣橱' })
    ]);

    const frag = document.createDocumentFragment();
    frag.appendChild(header);
    frag.appendChild(img);
    frag.appendChild(info);
    frag.appendChild(actions);
    return frag;
  }

  async function loadDetailImage(imgEl, blobId) {
    try {
      const blob = await DB.getImage(blobId);
      if (blob) imgEl.src = URL.createObjectURL(blob);
    } catch (e) { /* 保留缩略图 */ }
  }

  function detailRow(label, value) {
    return el('div', { className: 'detail-row' }, [
      el('span', { className: 'detail-label', textContent: label }),
      typeof value === 'string' || typeof value === 'number'
        ? el('span', { className: 'detail-value', textContent: String(value) })
        : el('span', { className: 'detail-value' }, [value])
    ]);
  }

  // ── 编辑衣服页 ────────────────────────

  function renderEditItem(item, settings) {
    const cats = settings.categories || [];
    const header = pageHeader('编辑: ' + item.name, '#/detail/' + item.id);

    const form = el('div', {}, [
      el('div', { className: 'form-group' }, [
        el('label', { className: 'form-label', textContent: '衣服名称' }),
        el('input', { id: 'edit-name', className: 'form-input', type: 'text', value: item.name })
      ]),
      el('div', { className: 'form-group' }, [
        el('label', { className: 'form-label', textContent: '分类' }),
        el('select', { id: 'edit-category', className: 'form-select' },
          cats.map(c => el('option', { value: c, textContent: c, ...(c === item.category ? { selected: true } : {}) }))
        )
      ]),
      el('div', { className: 'form-group' }, [
        el('label', { className: 'form-label', textContent: '购买日期' }),
        el('input', { id: 'edit-date', className: 'form-input', type: 'date', value: item.purchaseDate || '' })
      ]),
      el('button', { className: 'btn btn-primary btn-block mt-12', textContent: '💾 保存修改', 'data-action': 'saveEdit', 'data-id': item.id })
    ]);

    const frag = document.createDocumentFragment();
    frag.appendChild(header);
    frag.appendChild(form);
    return frag;
  }

  // ── 搭配列表页 ────────────────────────

  function renderOutfitList(outfits, allItems) {
    const header = pageHeader('搭配', '#/',
      el('a', { href: '#/outfit/new', className: 'btn btn-primary btn-sm', textContent: '➕ 新建搭配' })
    );

    if (!outfits || outfits.length === 0) {
      const empty = el('div', { className: 'empty-state mt-20' }, [
        el('div', { className: 'empty-state-icon', textContent: '🧩' }),
        el('div', { className: 'empty-state-text', textContent: '还没有搭配' }),
        el('div', { className: 'empty-state-hint', textContent: '把多件衣服组合成搭配吧' }),
        el('a', { href: '#/outfit/new', className: 'btn btn-primary mt-16', textContent: '创建第一套搭配' })
      ]);
      const frag = document.createDocumentFragment();
      frag.appendChild(header);
      frag.appendChild(empty);
      return frag;
    }

    const itemMap = {};
    (allItems || []).forEach(i => { itemMap[i.id] = i; });

    const cards = outfits.map(o => {
      const previewItems = (o.itemIds || [])
        .map(id => itemMap[id])
        .filter(Boolean)
        .slice(0, 4);

      const thumbs = el('div', { className: 'gap-8', style: { padding: '10px', overflow: 'hidden' } },
        previewItems.map(i => el('img', {
          className: 'outfit-item-thumb',
          src: i.thumbnail || './assets/placeholder.png',
          alt: i.name,
          style: { width: '56px', height: '56px' }
        }))
      );

      const meta = el('div', { className: 'item-card-body' }, [
        el('div', { className: 'item-card-name', textContent: o.name }),
        el('div', { className: 'item-card-meta', textContent: o.itemIds.length + ' 件 · ' + new Date(o.createdAt).toLocaleDateString('zh-CN') })
      ]);

      return el('a', {
        href: '#/outfit/' + o.id,
        className: 'item-card'
      }, [thumbs, meta]);
    });

    const grid = el('div', { className: 'item-grid' }, cards);

    const frag = document.createDocumentFragment();
    frag.appendChild(header);
    frag.appendChild(grid);
    return frag;
  }

  // ── 搭配详情页（四层展示） ────────────

  function renderOutfitDetail(outfit, settings) {
    const slotMap = settings.outfitSlotMap || {};
    const header = pageHeader(outfit.name, '#/outfits',
      el('div', { className: 'gap-8' }, [
        el('button', { className: 'btn btn-ghost btn-sm', textContent: '🗑️ 删除', 'data-action': 'deleteOutfit', 'data-id': outfit.id, style: { color: 'var(--accent)' } })
      ])
    );

    // 按四层分組
    const layers = { head: [], top: [], bottom: [], feet: [] };
    (outfit.items || []).forEach(item => {
      const slot = slotMap[item.category] || 'top';
      if (layers[slot]) layers[slot].push(item);
    });

    const layerEls = LAYER_ORDER
      .filter(key => layers[key].length > 0)
      .map(key => renderOutfitLayer(key, layers[key]));

    const layerContainer = el('div', { className: 'outfit-layers' }, layerEls);

    const info = el('div', { className: 'detail-info mt-16' }, [
      detailRow('包含件数', String(outfit.itemIds.length) + ' 件'),
      detailRow('创建时间', new Date(outfit.createdAt).toLocaleDateString('zh-CN'))
    ]);

    const frag = document.createDocumentFragment();
    frag.appendChild(header);
    frag.appendChild(layerContainer);
    frag.appendChild(info);
    return frag;
  }

  function renderOutfitLayer(layerKey, items) {
    const label = LAYER_LABELS[layerKey] || layerKey;
    return el('div', { className: 'outfit-layer' }, [
      el('div', { className: 'outfit-layer-label', textContent: label }),
      el('div', { className: 'outfit-layer-items' },
        items.map(i => el('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' } }, [
          el('img', {
            className: 'outfit-item-thumb',
            src: i.thumbnail || './assets/placeholder.png',
            alt: i.name
          }),
          el('span', { className: 'outfit-item-name', textContent: i.name })
        ]))
      )
    ]);
  }

  // ── 新建搭配页 ────────────────────────

  function renderOutfitBuilder(allItems) {
    const header = pageHeader('新建搭配', '#/outfits');

    if (!allItems || allItems.length < 2) {
      const empty = el('div', { className: 'empty-state mt-20' }, [
        el('div', { className: 'empty-state-icon', textContent: '🫙' }),
        el('div', { className: 'empty-state-text', textContent: '至少需要 2 件衣服才能创建搭配' }),
        el('a', { href: '#/add', className: 'btn btn-primary mt-16', textContent: '➕ 先添加衣服' })
      ]);
      const frag = document.createDocumentFragment();
      frag.appendChild(header);
      frag.appendChild(empty);
      return frag;
    }

    // 选择网格
    const grid = el('div', { className: 'select-grid', id: 'outfit-select-grid' },
      allItems.map(i => el('div', {
        className: 'select-card',
        'data-action': 'toggleOutfitItem',
        'data-id': i.id
      }, [
        el('div', { className: 'select-card-check', textContent: '✓' }),
        el('img', { className: 'select-card-img', src: i.thumbnail || './assets/placeholder.png', alt: i.name }),
        el('div', { className: 'select-card-name', textContent: i.name })
      ]))
    );

    // 预览区域
    const preview = el('div', { id: 'outfit-preview', className: 'outfit-layers mt-12', style: { display: 'none' } });

    // 名称输入
    const nameInput = el('div', { className: 'form-group mt-12' }, [
      el('label', { className: 'form-label', textContent: '搭配名称' }),
      el('input', { id: 'outfit-name', className: 'form-input', type: 'text', placeholder: '例如：夏日通勤装' })
    ]);

    const saveBtn = el('button', {
      id: 'btn-save-outfit',
      className: 'btn btn-primary btn-block mt-12',
      textContent: '💾 保存搭配',
      'data-action': 'saveOutfit',
      disabled: true
    });
    saveBtn.style.opacity = '0.5';

    const frag = document.createDocumentFragment();
    frag.appendChild(header);
    frag.appendChild(el('p', { className: 'form-hint mb-8', textContent: '点击衣服卡片来选择和取消' }));
    frag.appendChild(grid);
    frag.appendChild(preview);
    frag.appendChild(nameInput);
    frag.appendChild(saveBtn);
    return frag;
  }

  // ── 设置页 ────────────────────────────

  function renderSettings(settings, users) {
    const header = pageHeader('设置', '#/');

    // 分类管理
    const cats = settings.categories || [];
    const tagList = el('div', { className: 'tag-list' },
      cats.map(c => el('span', { className: 'tag-item' }, [
        el('span', { textContent: c }),
        cats.length > 1
          ? el('span', { className: 'tag-delete', textContent: '×', 'data-action': 'deleteCategory', 'data-category': c })
          : null
      ].filter(Boolean)))
    );

    const addCatForm = el('div', { className: 'gap-8 mt-12' }, [
      el('input', { id: 'new-category', className: 'form-input', type: 'text', placeholder: '新分类名称', style: { flex: 1 } }),
      el('button', { className: 'btn btn-primary btn-sm', textContent: '添加', 'data-action': 'addCategory' })
    ]);

    // API Key
    const apiSection = el('div', { className: 'settings-section' }, [
      el('div', { className: 'settings-section-title', textContent: '🔑 remove.bg API Key' }),
      el('div', { className: 'form-group' }, [
        el('input', { id: 'api-key', className: 'form-input', type: 'password', placeholder: '输入你的 remove.bg API Key', value: settings.removeBgApiKey || '' }),
        el('div', { className: 'form-hint', textContent: '每月免费 50 张抠图。去 remove.bg 注册获取。' })
      ]),
      el('button', { className: 'btn btn-outline btn-sm', textContent: '💾 保存 API Key', 'data-action': 'saveApiKey' })
    ]);

    // 账户管理
    const userItems = (users || []).map(u => {
      const isSelf = u === Crypto.getCurrentUser();
      return el('li', { className: 'user-list-item' }, [
        el('span', { className: 'user-list-name', textContent: u }),
        el('div', { className: 'gap-8' }, [
          isSelf ? el('span', { className: 'user-list-badge you', textContent: '当前' }) : null,
          !isSelf
            ? el('button', { className: 'btn btn-ghost btn-sm', textContent: '🗑️', 'data-action': 'deleteUser', 'data-username': u, style: { color: 'var(--accent)' } })
            : null
        ].filter(Boolean))
      ]);
    });

    const accountSection = el('div', { className: 'settings-section' }, [
      el('div', { className: 'settings-section-title', textContent: '👥 账户管理' }),
      el('ul', { className: 'user-list' }, userItems),
      el('div', { className: 'form-hint', textContent: '不同账户数据互相加密隔离。可帮家人朋友创建账户。' })
    ]);

    // 修改密码
    const pwdSection = el('div', { className: 'settings-section' }, [
      el('div', { className: 'settings-section-title', textContent: '🔒 修改密码' }),
      el('div', { className: 'form-group' }, [
        el('input', { id: 'old-password', className: 'form-input', type: 'password', placeholder: '原密码' })
      ]),
      el('div', { className: 'form-group' }, [
        el('input', { id: 'new-password', className: 'form-input', type: 'password', placeholder: '新密码（至少 4 位）' })
      ]),
      el('button', { className: 'btn btn-outline btn-sm', textContent: '修改密码', 'data-action': 'changePassword' })
    ]);

    // 退出登录
    const logoutBtn = el('button', {
      className: 'btn btn-danger btn-block mt-20',
      textContent: '🚪 退出登录',
      'data-action': 'logout'
    });

    const frag = document.createDocumentFragment();
    frag.appendChild(header);
    frag.appendChild(el('div', { className: 'settings-section' }, [
      el('div', { className: 'settings-section-title', textContent: '📂 分类管理' }),
      tagList,
      addCatForm
    ]));
    frag.appendChild(apiSection);
    frag.appendChild(accountSection);
    frag.appendChild(pwdSection);
    frag.appendChild(logoutBtn);
    return frag;
  }

  // ── 更新搭配预览（供 app.js 调用） ────

  function updateOutfitPreview(selectedIds, allItems, settings) {
    const slotMap = settings?.outfitSlotMap || {};
    const selectedItems = allItems.filter(i => selectedIds.includes(i.id));

    const layers = { head: [], top: [], bottom: [], feet: [] };
    selectedItems.forEach(item => {
      const slot = slotMap[item.category] || 'top';
      if (layers[slot]) layers[slot].push(item);
    });

    const preview = document.getElementById('outfit-preview');
    if (!preview) return;

    if (selectedItems.length === 0) {
      preview.style.display = 'none';
      preview.innerHTML = '';
      return;
    }

    preview.style.display = '';
    preview.innerHTML = '';

    LAYER_ORDER
      .filter(key => layers[key].length > 0)
      .forEach(key => {
        preview.appendChild(renderOutfitLayer(key, layers[key]));
      });

    // 更新保存按钮
    const btn = document.getElementById('btn-save-outfit');
    if (btn) {
      if (selectedItems.length >= 2) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.textContent = '💾 保存搭配 (' + selectedItems.length + ' 件)';
      } else {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.textContent = '💾 保存搭配（至少选 2 件）';
      }
    }
  }

  // ── 公开 ──────────────────────────────
  return {
    render,
    el,
    showToast,
    showModal,
    hideModal,
    renderLogin,
    renderDashboard,
    renderAddForm,
    renderWardrobe,
    renderDetail,
    renderEditItem,
    renderOutfitList,
    renderOutfitDetail,
    renderOutfitBuilder,
    renderInspire,
    renderSettings,
    updateOutfitPreview
  };
})();
