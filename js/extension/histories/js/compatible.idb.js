import { openDB } from './idb.js';

const doDatabaseStuff = async function () {
    return await openDB('Test', 1, {
        upgrade(db) {
            const store = db.createObjectStore('history', {
                keyPath: 'id',
                autoIncrement: true
            });
            store.createIndex('lastVisitTime', 'lastVisitTime');
        }
    });
};

export const db = await doDatabaseStuff();

export const add = async function (history) {
    await db.add('history', {
        url: history.url,
        title: history.title,
        lastVisitTime: history.lastVisitTime,
        typedCount: history.typedCount
    });
};

export const bulkAdd = async function (histories) {
    const tx = db.transaction('history', 'readwrite');
    await Promise.all([...histories.map((history) => tx.store.add(history))]);
    await tx.done;
};

export const clearTable = async function () {
    await db.clear('history');
};

export const exportTsv = async function () {
    let csvContent = 'data:text/tsv;charset=utf-8,';
    let cursor = await db.transaction('history').store.openCursor(null);
    while (cursor) {
        let val = cursor.value;
        csvContent += val.url + '\t' + val.lastVisitTime + '\t' + val.typedCount + '\t' + val.title + '\r\n';
        cursor = await cursor.continue();
    }
    return csvContent;
};
export const queryList = async function (param) {
    let { keyword, pageCount, page, type } = param;
    let cursor = await db.transaction('history').store.index('lastVisitTime').openCursor(null, 'prev');
    let count = 0;
    let histories = [];
    const matchField = ['title', 'url'];
    const globalRegex = new RegExp(keyword, 'g');
    while (cursor && count < page * pageCount) {
        let val = cursor.value;
        let isMatch = !keyword || keyword === 0;
        if (!isMatch) {
            for (let field of matchField) {
                if (type === 1 ? globalRegex.test(val[field]) : val[field].toLowerCase().includes(keyword.toLowerCase())) {
                    isMatch = true;
                    break;
                }
            }
        }
        if (isMatch) {
            count++;
            if (count > pageCount * (page - 1)) {
                histories.push(val);
            }
        }
        cursor = await cursor.continue();
    }
    return histories;
};
