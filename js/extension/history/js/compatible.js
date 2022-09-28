import { add, bulkAdd, updateTitle, queryList, clearTable, exportTsv } from './compatible.dexie.js';

export const isFirefox = chrome.runtime.getURL('').startsWith('moz-extension://');

export default {
    add,
    bulkAdd,
    updateTitle,
    queryList,
    clearTable,
    exportTsv
};
