import './dexie.min.js';

const doDatabaseStuff = async function () {
    let database = new Dexie('HistoriesDatabase');
    await database.version(1).stores({
        histories: '++id, title, url, typedCount, *lastVisitTime'
    });
    return database;
};

export const db = await doDatabaseStuff();

export const add = async function (historyItem) {
    db.histories.add({
        url: historyItem.url,
        title: historyItem.title,
        lastVisitTime: historyItem.lastVisitTime,
        typedCount: historyItem.typedCount
    });
};

export const bulkAdd = async function (histories) {
    await db.histories.bulkAdd(histories).catch((e) => {
        console.warn(e);
    });
};

export const updateTitle = async function ({  url, title }) {
    let histories = await db.histories.orderBy('lastVisitTime').reverse().offset(0).limit(100).toArray();
    for (let history of histories) {
        if (history.url === url) {
            history.title = title;
            await db.histories.put(history);
        }
    }
};

export const clearTable = async function () {
    await db.histories.clear();
};

export const exportTsv = async function () {
    let csvContent = 'data:text/tsv;charset=utf-8,';
    let arr = await db.histories.toArray();
    for (let val of arr) {
        csvContent += val.url + '\tU' + val.lastVisitTime + '\t' + val.typedCount + '\t' + val.title + '\r\n';
    }
    return csvContent;
};
export const queryList = async function (param) {
    let { keyword, pageCount, page, type } = param;
    const globalRegex = new RegExp(keyword, 'g');
    const matchField = ['title', 'url'];
    return await db.histories
        .orderBy('lastVisitTime')
        .reverse()
        .filter((history) => {
            let isMatch = !keyword && keyword !== 0;
            if (!isMatch) {
                for (let field of matchField) {
                    if (type === 1 ? globalRegex.test(history[field]) : history[field].toLowerCase().includes(keyword.toLowerCase())) {
                        isMatch = true;
                        break;
                    }
                }
            }
            return isMatch;
        })
        .offset((page - 1) * pageCount)
        .limit(pageCount)
        .toArray();
};
