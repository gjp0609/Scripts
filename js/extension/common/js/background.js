import historyDB from '../../history/js/historyDB.js';

let newTabUrl = null;
chrome.storage.local.get('newTabUrl', (val) => {
    newTabUrl = val?.newTabUrl;
});

(async () => {
    chrome.action.onClicked.addListener(() => {
        chrome.tabs.create({ url: chrome.runtime.getURL('history/index.html') });
    });

    // history
    historyDB.init().then(() => {
        chrome.history
            .search({
                text: '',
                maxResults: 5000
            })
            .then(async (histories) => {
                await historyDB.bulkAdd(histories);
                await historyDB.save();
            });
        chrome.history.onVisited.addListener(async (historyItem) => {
            await historyDB.add(historyItem);
        });
        chrome.history.onTitleChanged.addListener(async ({ url, title }) => {
            await historyDB.updateTitle({ url, title });
        });
    });

    // newTab
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (newTabUrl && changeInfo.status === 'loading' && changeInfo.url === 'about:blank') {
            chrome.tabs.update(tabId, { url: newTabUrl });
        }
    });

    // translate page
    chrome.menus.create({
        id: 'translate-page',
        title: chrome.i18n.getMessage('translate_page'),
        contexts: ['all']
    });
    chrome.menus.onClicked.addListener((info, tab) => {
        if (info.menuItemId === 'translate-page') {
            chrome.tabs.update(tab.id, { url: 'https://translate.google.com/translate?js=n&sl=auto&tl=zh-CN&u=' + tab.url });
        }
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        try {
            switch (message.from) {
                case 'history': {
                    switch (message.action) {
                        case 'queryList': {
                            historyDB.queryList(message.params).then((result) => {
                                sendResponse(result);
                            });
                            return true;
                        }
                        case 'import': {
                            (async () => {
                                let arr = message.params.split('\r\n');
                                let buf = [];
                                let bufSize = 5000;
                                for (let i = 0; i < arr.length; i++) {
                                    let line = arr[i];
                                    let split = line.split('\t');
                                    if (split.length === 4) {
                                        let [url, lastVisitTime, typedCount, title] = split;
                                        if (lastVisitTime.indexOf('U') === 0) {
                                            lastVisitTime = lastVisitTime.substring(1);
                                        }
                                        lastVisitTime = parseFloat(lastVisitTime);
                                        buf.push({ url, title, lastVisitTime, typedCount });
                                        if (buf.length === bufSize) {
                                            await historyDB.bulkAdd(buf);
                                            buf = [];
                                        }
                                    }
                                }
                                if (buf.length > 0) {
                                    await historyDB.bulkAdd(buf);
                                }
                                await historyDB.save();
                                sendResponse('ok');
                            })();
                            return true;
                        }
                        case 'export': {
                            historyDB.exportTsv();
                            break;
                        }
                    }
                    break;
                }
                case 'newTab': {
                    newTabUrl = message.params.url;
                    break;
                }
            }
        } catch (e) {
            console.warn(e);
            sendResponse({});
            return true;
        }
    });
})();

export default null;
