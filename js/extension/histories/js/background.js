import db from './compatible.js';

(async () => {
    chrome.history.onVisited.addListener(async (historyItem) => {
        await db.add(historyItem);
    });
})();
export default null;
