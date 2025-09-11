export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    console.log('Bookmark Manager Content Script Loaded');

    // 监听来自background的消息
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'SHOW_BOOKMARK_MODAL') {
        // 显示添加书签的模态框
        showBookmarkModal(message.data);
      }
    });

    // 显示书签模态框
    function showBookmarkModal(data: { url: string; title: string; favIconUrl?: string }) {
      // 创建模态框容器
      const modalContainer = document.createElement('div');
      modalContainer.id = 'bookmark-modal-container';
      modalContainer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `;

      // 创建模态框内容
      const modal = document.createElement('div');
      modal.style.cssText = `
        background: white;
        border-radius: 8px;
        padding: 24px;
        width: 480px;
        max-width: 90vw;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
      `;

      modal.innerHTML = `
        <div style="margin-bottom: 20px;">
          <h3 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #1f2937;">添加书签</h3>
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 4px; font-size: 14px; font-weight: 500; color: #374151;">标题</label>
            <input type="text" id="bookmark-title" value="${escapeHtml(data.title)}" style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 14px;">
          </div>
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 4px; font-size: 14px; font-weight: 500; color: #374151;">URL</label>
            <input type="text" id="bookmark-url" value="${escapeHtml(data.url)}" style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 14px;">
          </div>
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 4px; font-size: 14px; font-weight: 500; color: #374151;">标签 (用逗号分隔)</label>
            <input type="text" id="bookmark-tags" placeholder="例如: 工作, 学习, 技术" style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 14px;">
          </div>
          <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 4px; font-size: 14px; font-weight: 500; color: #374151;">描述</label>
            <textarea id="bookmark-description" rows="3" style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 14px; resize: vertical;"></textarea>
          </div>
          <div style="display: flex; gap: 12px; justify-content: flex-end;">
            <button id="bookmark-cancel" style="padding: 8px 16px; border: 1px solid #d1d5db; background: white; color: #374151; border-radius: 4px; font-size: 14px; cursor: pointer;">取消</button>
            <button id="bookmark-save" style="padding: 8px 16px; border: none; background: #3b82f6; color: white; border-radius: 4px; font-size: 14px; cursor: pointer;">保存</button>
          </div>
        </div>
      `;

      modalContainer.appendChild(modal);
      document.body.appendChild(modalContainer);

      // 绑定事件
      const titleInput = modal.querySelector('#bookmark-title') as HTMLInputElement;
      const urlInput = modal.querySelector('#bookmark-url') as HTMLInputElement;
      const tagsInput = modal.querySelector('#bookmark-tags') as HTMLInputElement;
      const descriptionInput = modal.querySelector('#bookmark-description') as HTMLTextAreaElement;
      const cancelBtn = modal.querySelector('#bookmark-cancel') as HTMLButtonElement;
      const saveBtn = modal.querySelector('#bookmark-save') as HTMLButtonElement;

      // 取消按钮
      cancelBtn.addEventListener('click', () => {
        document.body.removeChild(modalContainer);
      });

      // 点击背景关闭
      modalContainer.addEventListener('click', (e) => {
        if (e.target === modalContainer) {
          document.body.removeChild(modalContainer);
        }
      });

      // 保存按钮
      saveBtn.addEventListener('click', async () => {
        const title = titleInput.value.trim();
        const url = urlInput.value.trim();
        const tags = tagsInput.value.split(',').map(tag => tag.trim()).filter(tag => tag);
        const description = descriptionInput.value.trim();

        if (!title || !url) {
          alert('请填写标题和URL');
          return;
        }

        try {
          // 发送消息给background script保存书签
          await browser.runtime.sendMessage({
            type: 'ADD_BOOKMARK',
            data: {
              title,
              url,
              tags,
              description
            }
          });

          document.body.removeChild(modalContainer);

          // 显示成功提示
          showToast('书签添加成功！');
        } catch (error) {
          console.error('Failed to add bookmark:', error);
          alert('添加书签失败，请重试');
        }
      });

      // 聚焦到标题输入框
      titleInput.focus();
      titleInput.select();
    }

    // 显示Toast提示
    function showToast(message: string) {
      const toast = document.createElement('div');
      toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #10b981;
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        z-index: 1000000;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        animation: slideIn 0.3s ease-out;
      `;

      // 添加动画样式
      const style = document.createElement('style');
      style.textContent = `
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `;
      document.head.appendChild(style);

      toast.textContent = message;
      document.body.appendChild(toast);

      // 3秒后自动移除
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
        if (style.parentNode) {
          style.parentNode.removeChild(style);
        }
      }, 3000);
    }

    // HTML转义函数
    function escapeHtml(text: string): string {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  },
});
