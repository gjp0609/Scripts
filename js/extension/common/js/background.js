import db from '../../history/js/compatible.js';

let newTabUrl = null;
chrome.storage.local.get('newTabUrl', (val) => {
    newTabUrl = val?.newTabUrl;
});

(async () => {
    chrome.action.onClicked.addListener(() => {
        chrome.tabs.create({ url: chrome.runtime.getURL('history/index.html') });
    });

    // history
    chrome.history.onVisited.addListener(async (historyItem) => {
        await db.add(historyItem);
    });
    chrome.history.onTitleChanged.addListener(async ({ url, title }) => {
        await db.updateTitle({ url, title });
    });

    // newTab
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (newTabUrl && changeInfo.status === 'loading' && changeInfo.url === 'about:blank') {
            chrome.tabs.update(tabId, { url: newTabUrl });
        }
    });
    chrome.runtime.onMessage.addListener((message) => {
        if (message.newTabUrl) {
            newTabUrl = message.newTabUrl;
        }
    });
})();

export default null;
