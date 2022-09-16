import { db, add } from './compatible.js';

(async () => {
    chrome.history.onVisited.addListener(async (historyItem) => {
        await add(db, historyItem);
    });
})();
export default null;
