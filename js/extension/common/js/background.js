import db from '../../history/js/compatible.js';

(async () => {
    // history
    chrome.history.onVisited.addListener(async (historyItem) => {
        await db.add(historyItem);
    });
    chrome.browserAction.onClicked.addListener(() => {
        chrome.tabs.create({ url: chrome.extension.getURL('history/index.html') });
    });
})();
export default null;
