import db from './compatible.js';

(async () => {
    chrome.history.onVisited.addListener(async (historyItem) => {
        await db.add(historyItem);
    });
    chrome.browserAction.onClicked.addListener(() => {
        chrome.tabs.create({ url: chrome.extension.getURL('options.html') });
    });
})();
export default null;
