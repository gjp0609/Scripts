export const openOptions = function () {
    let createData = {
        url: 'options.html'
    };
    chrome.tabs.create(createData);
};

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
export const add = async function (db, historyItem) {
    await db.add('history', {
        url: historyItem.url,
        title: historyItem.title,
        lastVisitTime: historyItem.lastVisitTime,
        typedCount: historyItem.typedCount
    });
};

export const list = async function (db, param) {
    let { keyword, pageCount, page, type } = param;
    console.log('keyword', keyword);
    let cursor = await db.transaction('history').store.openCursor(null, 'prev');
    let count = 0;
    let arr = [];
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
                arr.push(val);
            }
        }
        cursor = await cursor.continue();
    }
    return arr;
};
