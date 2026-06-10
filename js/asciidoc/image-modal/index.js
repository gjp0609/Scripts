
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.createElement('div');
    modal.className = 'modal-container';

    const modalImg = document.createElement('img');
    modalImg.className = 'modal-image';

    modal.appendChild(modalImg);
    document.body.appendChild(modal);

    let scale = 1;
    let isDragging = false;
    let startX, startY, translateX = 0, translateY = 0;
    let lastTranslateX = 0, lastTranslateY = 0;

    // 点击图片打开弹窗
    document.querySelectorAll('.image img, .imageblock img').forEach(img => {
        img.style.cursor = 'pointer';
        img.addEventListener('click', () => {
            modal.style.display = 'block';
            modalImg.src = img.src;
            scale = 1;
            translateX = 0;
            translateY = 0;
            lastTranslateX = 0;
            lastTranslateY = 0;
            updateTransform();
        });
    });

    // ESC键退出预览
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display === 'block') {
            modal.style.display = 'none';
        }
    });

    // 点击背景关闭弹窗
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    // 缩放功能
    modal.addEventListener('wheel', (e) => {
        e.preventDefault();

        // 获取鼠标相对于图片的位置
        const rect = modalImg.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // 计算鼠标位置相对于图片中心的偏移
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        // 记录缩放前的比例
        const oldScale = scale;

        // 计算新的缩放比例
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        scale *= delta;
        scale = Math.min(Math.max(0.1, scale), 5);

        // 计算缩放导致的位置偏移
        const scaleChange = scale / oldScale;
        translateX += (mouseX - centerX) * (1 - scaleChange);
        translateY += (mouseY - centerY) * (1 - scaleChange);

        lastTranslateX = translateX;
        lastTranslateY = translateY;

        updateTransform();
    });

    // 拖动功能
    modal.addEventListener('mousedown', (e) => {
        if (e.target === modal) return;
        isDragging = true;
        startX = e.clientX - lastTranslateX;
        startY = e.clientY - lastTranslateY;
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        translateX = e.clientX - startX;
        translateY = e.clientY - startY;
        lastTranslateX = translateX;
        lastTranslateY = translateY;
        updateTransform();
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });

    function updateTransform() {
        modalImg.style.transform = `translate(-50%, -50%) translate(${translateX}px, ${translateY}px) scale(${scale})`;
    }
});
