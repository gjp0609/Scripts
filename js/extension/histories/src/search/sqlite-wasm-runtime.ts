import type {
  SqliteSearchDatabase,
  SqliteSearchRuntime,
  SqliteSearchStatement
} from './search-engine';

type Sqlite3Module = {
  version: {
    libVersion: string;
  };
  oo1: {
    DB: new (filename?: string, flags?: string) => {
      pointer: number;
      exec: (sql: string | string[]) => void;
      prepare: (sql: string) => {
        bind: (values: unknown[]) => unknown;
        step: () => boolean;
        stepReset?: () => void;
        reset?: () => void;
        get: (target?: unknown[] | Record<string, unknown>) => unknown[];
        finalize: () => void;
      };
      close: () => void;
    };
  };
  capi: {
    sqlite3_js_db_export: (pointer: number) => Uint8Array;
    sqlite3_js_posix_create_file: (filename: string, bytes: Uint8Array, nBytes: number) => void;
  };
};

type SqliteInitModule = () => Promise<Sqlite3Module>;

export type SqliteWasmRuntimeOptions = {
  scriptUrl?: string;
  initModule?: SqliteInitModule;
};

const DEFAULT_SQLITE_SCRIPT_PATH = '/sqlite/sqlite3.js';
let sqliteModulePromise: Promise<Sqlite3Module> | undefined;
let loadedScriptUrl: string | undefined;

export async function loadSqliteWasmSearchRuntime(
  options: SqliteWasmRuntimeOptions = {}
): Promise<SqliteSearchRuntime> {
  const sqlite3 = options.initModule
    ? await options.initModule()
    : await loadSqliteModule(options.scriptUrl ?? resolveDefaultSqliteScriptUrl());

  return {
    sqliteVersion: sqlite3.version.libVersion,
    openMemoryDatabase() {
      return wrapDatabase(new sqlite3.oo1.DB(':memory:'));
    },
    openSnapshotDatabase(bytes: Uint8Array) {
      const filename = `/histories-search-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite3`;
      sqlite3.capi.sqlite3_js_posix_create_file(filename, bytes, bytes.byteLength);
      return wrapDatabase(new sqlite3.oo1.DB(filename, 'c'));
    },
    exportDatabase(database: SqliteSearchDatabase) {
      return sqlite3.capi.sqlite3_js_db_export(unwrapDatabase(database).pointer);
    }
  };
}

export function resolveDefaultSqliteScriptUrl(): string {
  if (typeof location === 'undefined') {
    return DEFAULT_SQLITE_SCRIPT_PATH;
  }

  return new URL(DEFAULT_SQLITE_SCRIPT_PATH, location.href).toString();
}

async function loadSqliteModule(scriptUrl: string): Promise<Sqlite3Module> {
  if (sqliteModulePromise && loadedScriptUrl === scriptUrl) {
    return sqliteModulePromise;
  }

  sqliteModulePromise = (async () => {
    await ensureSqliteScript(scriptUrl);
    const initModule = (globalThis as typeof globalThis & {
      sqlite3InitModule?: SqliteInitModule;
    }).sqlite3InitModule;

    if (!initModule) {
      throw new Error(`sqlite3InitModule is not available after loading ${scriptUrl}`);
    }

    return await initModule();
  })();
  loadedScriptUrl = scriptUrl;
  return await sqliteModulePromise;
}

async function ensureSqliteScript(scriptUrl: string): Promise<void> {
  if ((globalThis as typeof globalThis & { sqlite3InitModule?: unknown }).sqlite3InitModule) {
    return;
  }

  if (typeof document === 'undefined') {
    throw new Error('SQLite WASM runtime currently requires a document context to load sqlite3.js.');
  }

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-histories-sqlite="${scriptUrl}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${scriptUrl}`)), {
        once: true
      });
      return;
    }

    const script = document.createElement('script');
    script.async = true;
    script.src = scriptUrl;
    script.dataset.historiesSqlite = scriptUrl;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${scriptUrl}`));
    document.head.append(script);
  });
}

function wrapDatabase(database: InstanceType<Sqlite3Module['oo1']['DB']>): SqliteSearchDatabase {
  return {
    exec: database.exec.bind(database),
    prepare(sql: string): SqliteSearchStatement {
      return wrapStatement(database.prepare(sql));
    },
    close: database.close.bind(database),
    __rawDb: database
  } as SqliteSearchDatabase & { __rawDb: typeof database };
}

function unwrapDatabase(database: SqliteSearchDatabase): InstanceType<Sqlite3Module['oo1']['DB']> {
  const rawDb = (database as SqliteSearchDatabase & {
    __rawDb?: InstanceType<Sqlite3Module['oo1']['DB']>;
  }).__rawDb;
  if (!rawDb) {
    throw new Error('SQLite runtime database wrapper is missing its raw DB reference.');
  }

  return rawDb;
}

function wrapStatement(statement: {
  bind: (values: unknown[]) => unknown;
  step: () => boolean;
  stepReset?: () => void;
  reset?: () => void;
  get: (target?: unknown[] | Record<string, unknown>) => unknown[];
  finalize: () => void;
}): SqliteSearchStatement {
  return {
    bind(values: unknown[]) {
      statement.bind(values);
      return this;
    },
    step: statement.step.bind(statement),
    stepReset: statement.stepReset?.bind(statement),
    reset: statement.reset?.bind(statement),
    get: statement.get.bind(statement),
    finalize: statement.finalize.bind(statement)
  };
}
