import initSqlJs from '../../common/js/libs/sql-wasm.js';

let SQL, db;

const init = async function () {
    SQL = await initSqlJs({
        locateFile: (file) => chrome.runtime.getURL(`common/js/libs/${file}`)
    });
    const buf = await new Promise((resolve, reject) => {
        chrome.storage.local.get('sqlite', (val) => {
            resolve(val?.sqlite);
        });
    });
    db = new SQL.Database(new Uint8Array(buf));
    db.run(`
        create table if not exists history
        (
            title         TEXT,
            url           TEXT,
            lastVisitTime REAL,
            typedCount    INT
        );
        create unique index if not exists history_lastVisitTime_url_uindex on history (lastVisitTime desc, url asc);
    `);
    return db.export();
};

const add = async function (historyItem) {
    try {
        let sql = `
            replace into history(title, url, lastVisitTime, typedCount)
            values ('${historyItem.title}', '${historyItem.url}', ${historyItem.lastVisitTime}, ${historyItem.typedCount ?? 0})
        `;
        db.run(sql);
        await save();
    } catch (e) {
        console.warn(e);
    }
};

const bulkAdd = async function (histories) {
    const sql =
        'replace into history(title, url, lastVisitTime, typedCount) values ' +
        new Array(histories.length).fill('(' + new Array(4).fill('?').join(',') + ')').join(',');
    let datas = [];
    histories.forEach((history) => Array.prototype.push.apply(datas, [history.title, history.url, history.lastVisitTime, history.typedCount ?? 0]));
    db.run(sql, datas);
};

const updateTitle = async function ({ url, title }) {
    db.run('update history set title = ? where url = ? order by lastVisitTime desc limit 100', [url, title]);
    await save();
};

const queryList = async function (param) {
    console.log(param);
    let { keyword, pageCount, page, type } = param;
    let arr = [];
    let conditions = '';
    let params = [];
    if (keyword || keyword === 0) {
        conditions = 'where ';
        const matchField = ['title', 'url'];
        switch (type) {
            case 'regex':
                conditions += matchField
                    .map((field) => {
                        params.push(keyword);
                        return `regexp(?, ${field})`;
                    })
                    .join(' or ');
                break;
            case 'include':
                conditions += matchField
                    .map((field) => {
                        params.push('%' + keyword + '%');
                        return `${field} like ?`;
                    })
                    .join(' or ');
                break;
            case 'keywords':
                conditions += matchField
                    .map((field) => {
                        let keywords = keyword.split(' ').filter((word) => word.length > 0);
                        return (
                            '(' +
                            keywords
                                .map((keyword) => {
                                    params.push('%' + keyword + '%');
                                    return `${field} like ?`;
                                })
                                .join(' and ') +
                            ')'
                        );
                    })
                    .join(' or ');
                break;
            default:
                conditions = '';
                break;
        }
        matchField.map((field) => {});
    }
    console.log(conditions);
    db.create_function('regexp', (regexp, text) => new RegExp(regexp, 'g').test(text));
    const stmt = db.prepare(`select * from history ${conditions} order by lastVisitTime desc limit ${(page - 1) * pageCount},${pageCount}`, params);
    console.log(stmt.getSQL(), params);
    while (stmt.step()) {
        arr.push(stmt.getAsObject());
    }
    return arr;
};

const exportTsv = async function () {
    let csvContent = 'data:text/tsv;charset=utf-8,';
    const stmt = db.prepare(`select *
                             from history`);
    while (stmt.step()) {
        let val = stmt.getAsObject();
        csvContent += val.url + '\tU' + val.lastVisitTime + '\t' + val.typedCount + '\t' + val.title + '\r\n';
    }
    csvContent = new Blob([csvContent], { type: 'text/tsv' });
    let csvUrl = URL.createObjectURL(csvContent);
    chrome.downloads.download({
        url: csvUrl,
        filename: 'export_history_' + new Date().toISOString().substring(0, 10).replaceAll('-', '') + '.tsv',
        conflictAction: 'uniquify'
    });
};

const save = async function () {
    chrome.storage.local.set({ sqlite: db.export() });
};

export default {
    init,
    add,
    bulkAdd,
    updateTitle,
    queryList,
    exportTsv,
    save
};
