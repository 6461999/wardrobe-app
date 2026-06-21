/**
 * camera.js — 拍照/选图 + Canvas 压缩 + remove.bg AI 抠图
 *
 * 用法：
 *   const blob = await Camera.pickImage();          // 拍照或选图
 *   const blob = await Camera.compressBlob(blob);    // 压缩
 *   const blob = await Camera.removeBackground(blob, apiKey);  // AI 抠图
 */

const Camera = (() => {
  'use strict';

  // ── 选图：优先弹选择框（拍照 / 相册） ──

  /**
   * 弹出选择方式（拍照 or 相册），返回 Blob
   * 在手机上会弹出系统选择器
   */
  function pickImage() {
    return new Promise((resolve, reject) => {
      // 创建文件输入
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';

      // 在移动端加上 capture 属性（部分浏览器支持直接拍照）
      // 但保留不带 capture 的也允许选相册
      // 用两个按钮的方式更好，但这里简化：弹出文件选择器
      // 手机上这个会同时显示"拍照"和"相册"选项

      input.onchange = async () => {
        const file = input.files[0];
        if (!file) { resolve(null); return; }

        // 校验类型
        if (!file.type.startsWith('image/')) {
          reject(new Error('请选择图片文件'));
          return;
        }

        // 校验大小（限制 20MB）
        if (file.size > 20 * 1024 * 1024) {
          reject(new Error('图片太大，请选择小于 20MB 的图片'));
          return;
        }

        resolve(file);  // 返回原始 File（也是 Blob）
      };

      input.oncancel = () => resolve(null);

      // 触发选择
      input.click();
    });
  }

  // ── Canvas 压缩 ────────────────────────

  /**
   * 压缩 Blob 图片到指定尺寸和质量
   * @param {Blob} blob    - 原始图片
   * @param {number} maxW  - 最大宽度（默认 800px）
   * @param {number} quality - JPEG 质量 0~1（默认 0.7）
   * @returns {Promise<Blob>} 压缩后的 JPEG Blob
   */
  function compressBlob(blob, maxW = 800, quality = 0.7) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);

      img.onload = () => {
        URL.revokeObjectURL(url);

        const origW = img.width;
        const origH = img.height;

        // 如果原图已经小于目标宽度，直接返回
        if (origW <= maxW) {
          resolve(blob);
          return;
        }

        // 等比例缩放
        const scale = maxW / origW;
        const w = Math.round(origW * scale);
        const h = Math.round(origH * scale);

        const canvas = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;

        const ctx = canvas.getContext('2d');
        // 高质量缩放
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'medium';
        ctx.drawImage(img, 0, 0, w, h);

        canvas.toBlob(
          (compressed) => {
            if (compressed) {
              resolve(compressed);
            } else {
              // 降级：返回原图
              resolve(blob);
            }
          },
          'image/jpeg',
          quality
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('图片加载失败'));
      };

      img.src = url;
    });
  }

  // ── remove.bg AI 抠图 ──────────────────

  /**
   * 调用 remove.bg API 去除背景
   * @param {Blob} blob    - 原始图片
   * @param {string} apiKey - remove.bg API Key
   * @returns {Promise<Blob>} 抠图后的 PNG Blob（透明背景 → 转白底 JPEG）
   */
  async function removeBackground(blob, apiKey) {
    if (!apiKey) throw new Error('请先在设置中填写 remove.bg API Key');

    const formData = new FormData();
    formData.append('image_file', blob, 'clothing.jpg');
    formData.append('size', 'auto');

    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey
      },
      body: formData
    });

    if (!response.ok) {
      // 解析错误信息
      let errorMsg = '抠图服务异常';
      try {
        const errData = await response.json();
        if (errData.errors && errData.errors.length > 0) {
          errorMsg = errData.errors[0].title || errorMsg;
        }
      } catch (e) { /* ignore */ }

      if (response.status === 402) {
        errorMsg = 'remove.bg 免费额度已用完（每月 50 张），下个月自动恢复';
      } else if (response.status === 403) {
        errorMsg = 'API Key 无效，请检查设置';
      }

      throw new Error(errorMsg);
    }

    // 返回处理后的图片 Blob（PNG，透明背景）
    const processedBlob = await response.blob();

    // 把透明背景转成白色背景（更适合衣橱展示）
    return convertToWhiteBg(processedBlob);
  }

  /**
   * 把透明 PNG 转成白底 JPEG
   * remove.bg 返回的是透明背景 PNG，衣橱卡片上透明部分会显示为黑色
   * 所以我们垫一层白色背景再导出
   */
  function convertToWhiteBg(blob) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);

      img.onload = () => {
        URL.revokeObjectURL(url);

        const canvas = document.createElement('canvas');
        canvas.width  = img.width;
        canvas.height = img.height;

        const ctx = canvas.getContext('2d');

        // 先铺满白色背景
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 再画上抠好图的 PNG
        ctx.drawImage(img, 0, 0);

        canvas.toBlob(
          (result) => {
            if (result) resolve(result);
            else resolve(blob); // 降级
          },
          'image/jpeg',
          0.85
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('抠图结果处理失败'));
      };

      img.src = url;
    });
  }

  /**
   * 获取当前图片的 Blob（用于编辑场景，从 data URL 或已有 blob）
   * 主要用于后续扩展
   */
  function dataURLtoBlob(dataURL) {
    const parts = dataURL.split(',');
    const mime = parts[0].match(/:(.*?);/)[1];
    const bytes = atob(parts[1]);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      arr[i] = bytes.charCodeAt(i);
    }
    return new Blob([arr], { type: mime });
  }

  // ── 导出 ──────────────────────────────
  return {
    pickImage,
    compressBlob,
    removeBackground,
    convertToWhiteBg,
    dataURLtoBlob
  };
})();
