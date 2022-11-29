// ==UserScript==
// @name         * 动漫花园批量复制下载地址
// @namespace    https://github.com/gjp0609/Scripts/
// @version      0.1
// @description  动漫花园批量复制下载地址
// @author       onysakura
// @include      https://dmhy.org/*
// @icon         https://www.google.com/s2/favicons?domain=dmhy.org
// ==/UserScript==

(function () {
    // 表头添加复选框
    let th = document.createElement('th');
    th.style.width = '20px';
    let allChecked = false;
    let checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.addEventListener('click', () => {
        allChecked = !allChecked;
        document.querySelectorAll('.container .main #topic_list tbody tr td:first-child input[type=checkbox]').forEach((checkbox) => {
            checkbox.checked = allChecked ? 'checked' : null;
        });
    });
    th.appendChild(checkbox);
    document.querySelector('.container .main #topic_list thead tr th').before(th);
    // 列表添加复选框
    let tds = document.querySelectorAll('.container .main #topic_list tbody tr td:first-child');
    tds.forEach((td) => {
        let td1 = document.createElement('td');
        let input = document.createElement('input');
        input.type = 'checkbox';
        td1.appendChild(input);
        td.before(td1);
    });
    // 添加复制按钮
    let copy = document.createElement('a');
    copy.href = 'javascript:void(0);';
    copy.innerText = '复制';
    copy.style.cursor = 'pointer';
    copy.style.float = 'left';
    copy.style.marginRight = '5px';
    document.querySelector('.main > .table.clear > .nav_title > div:first-child').before(copy);
    copy.addEventListener('click', () => {
        let urls = [...document.querySelectorAll('.container .main #topic_list tbody tr td:first-child input[type=checkbox]')]
            .filter((checkbox) => checkbox.checked)
            .map((checkbox) => checkbox.parentElement.parentElement.querySelector('a.download-arrow.arrow-magnet').href);
        navigator.clipboard.writeText(urls.join('\n')).then(() => alert(`已复制${urls.length}条！`));
    });
})();
