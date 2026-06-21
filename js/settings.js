/**
 * settings.js — 设置辅助工具
 *
 * 提供搭配层级映射、分类默认值等辅助功能。
 * 核心设置读写通过 DB.getSettings() / DB.saveSettings()。
 */

const Settings = (() => {
  'use strict';

  /** 默认的搭配展示层级 */
  const DEFAULT_SLOT_MAP = {
    '帽子': 'head', '配饰': 'head',
    '上衣': 'top',  '外套': 'top',
    '裙子': 'bottom', '裤子': 'bottom',
    '鞋子': 'feet',  '包包': 'feet',
    '其他': 'top'
  };

  /** 层级显示顺序和中文名 */
  const LAYER_ORDER = ['head', 'top', 'bottom', 'feet'];
  const LAYER_LABELS = {
    head: '帽子/配饰',
    top: '上装/外套',
    bottom: '下装',
    feet: '鞋子/包包'
  };

  /**
   * 根据分类和 slotMap 确定该衣服属于哪一层
   * @param {string} category  - 衣服分类
   * @param {object} slotMap   - 分类→层级映射表（来自 settings.outfitSlotMap）
   * @returns {string} 层级 key: 'head' | 'top' | 'bottom' | 'feet'
   */
  function getSlot(category, slotMap) {
    return (slotMap && slotMap[category]) || DEFAULT_SLOT_MAP[category] || 'top';
  }

  /**
   * 将衣服列表按搭配层级分组
   * @param {Array} items     - 衣服对象数组
   * @param {object} slotMap  - 分类→层级映射表
   * @returns {object} { head: [...], top: [...], bottom: [...], feet: [...] }
   */
  function groupByLayer(items, slotMap) {
    const groups = { head: [], top: [], bottom: [], feet: [] };
    items.forEach(item => {
      const slot = getSlot(item.category, slotMap);
      if (groups[slot]) groups[slot].push(item);
    });
    return groups;
  }

  /**
   * 为新添加的分类自动推测合适层级
   * 根据分类名称的关键词判断
   */
  function guessSlot(categoryName) {
    const name = categoryName.toLowerCase();
    if (/帽|头饰|发|耳|项链|围巾|手套/.test(name)) return 'head';
    if (/上|衣|衫|T恤|衬|卫|毛衣|外套|夹克|大衣|风衣|羽绒|马甲|披肩/.test(name)) return 'top';
    if (/裙|裤|短|长|半身|阔腿|紧身|牛仔/.test(name)) return 'bottom';
    if (/鞋|靴|拖|凉|运动|帆布|高跟|平底|包/.test(name)) return 'feet';
    return 'top'; // 默认归上装
  }

  return {
    DEFAULT_SLOT_MAP,
    LAYER_ORDER,
    LAYER_LABELS,
    getSlot,
    groupByLayer,
    guessSlot
  };
})();
