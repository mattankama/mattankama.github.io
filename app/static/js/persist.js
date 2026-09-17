/**
 * Rattlesnake — keeping the store on the phone.
 *
 * The store in store.js is the source of truth while the app is open; this file
 * is the mirror underneath it. On boot every row is read out of IndexedDB into
 * memory, and from then on each change is written back.
 *
 * Writes are batched, but a caller can wait for them. `settled()` is how: the
 * screens navigate the instant a call returns — saving a routine sets
 * location.href on the next line — and a queued write does not survive the page
 * going away. So fetchJSON awaits settled() after anything that changes data,
 * which restores exactly the guarantee the old HTTP call gave for free: by the
 * time you have an answer, it is written down.
 */
// Wrapped so none of these names reach the page's shared script scope.
//
// Every file here is a plain <script>, and the screen scripts declare functions
// of their own called updateSet, addSet, completeSession and deleteRoutine —
// exactly the names this module uses. They load last, so their definitions won
// and four API routes quietly ran UI code instead. A namespace per file, and
// the two sets of names can never see each other again.
(function (root, factory) {
    const exported = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = exported;
    else root.RattlesnakePersist = exported;
})(typeof self !== "undefined" ? self : globalThis, function () {
"use strict";
const DB_NAME = "rattlesnake";
const DB_VERSION = 1;

function openDatabase(tables) {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === "undefined") {
            reject(new Error("IndexedDB is not available"));
            return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            for (const table of tables) {
                // Ids are assigned by store.js, not by IndexedDB: they have to
                // match the foreign keys already written in the other stores.
                if (!db.objectStoreNames.contains(table)) {
                    db.createObjectStore(table, { keyPath: "id" });
                }
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("IndexedDB upgrade blocked by another tab"));
    });
}

function readTable(db, table) {
    return new Promise((resolve, reject) => {
        const request = db.transaction(table, "readonly").objectStore(table).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Ask the browser to treat this data as worth keeping.
 *
 * WebKit clears an origin's storage after seven days without a visit, and a web
 * app added to the Home Screen is exempt — it keeps its own clock, reset by use.
 * That exemption is what makes this app safe to rely on, so the install prompt
 * in the UI is a durability feature, not a nicety. This call asks for the
 * stronger guarantee on top; browsers may decline, and there is nothing to do
 * about it if they do.
 */
async function requestPersistence() {
    try {
        if (navigator.storage && navigator.storage.persist) {
            if (await navigator.storage.persisted()) return true;
            return await navigator.storage.persist();
        }
    } catch (err) {
        console.warn("[rattlesnake] could not request persistent storage", err);
    }
    return false;
}

/**
 * Load everything into a store and keep IndexedDB in step with it.
 *
 * Returns `{store, persistent, durable}`. `durable` false means the writes are
 * going nowhere — the caller has to tell the lifter, because an app that
 * silently forgets a session is worse than one that says it cannot remember.
 */
async function boot(createStore, tables, onWriteFailure) {
    let db = null;
    const queue = [];
    let waiters = [];
    let flushing = false;

    /** Release anyone awaiting settled(), once there is nothing left in flight. */
    function settle() {
        if (flushing || queue.length > 0) return;
        const pending = waiters;
        waiters = [];
        for (const resolve of pending) resolve();
    }

    function failed(error) {
        console.error("[rattlesnake] write failed", error);
        // The rows are still in memory, so this workout carries on; what is lost
        // is the next reload. Only the caller can say that out loud.
        if (onWriteFailure) onWriteFailure();
    }

    function flush() {
        if (flushing || queue.length === 0 || !db) return;
        flushing = true;

        const batch = queue.splice(0, queue.length);
        const affected = [...new Set(batch.map((change) => change.table))];

        try {
            const tx = db.transaction(affected, "readwrite");
            for (const { table, op, record } of batch) {
                const objectStore = tx.objectStore(table);
                if (op === "put") objectStore.put(record);
                else objectStore.delete(record.id);
            }
            tx.oncomplete = () => {
                flushing = false;
                flush();
                settle();
            };
            tx.onerror = tx.onabort = () => {
                flushing = false;
                failed(tx.error);
                // Settle anyway: a caller blocked forever on a dead write would
                // freeze the screen mid-set, which is worse than a lost write.
                settle();
            };
        } catch (err) {
            flushing = false;
            failed(err);
            settle();
        }
    }

    function onChange(table, op, record) {
        queue.push({ table, op, record: op === "put" ? { ...record } : record });
        queueMicrotask(flush);
    }

    /** Resolves once everything changed so far is actually on disk. */
    function settled() {
        if (!flushing && queue.length === 0) return Promise.resolve();
        // flush() is queued on a microtask by onChange; make sure one is pending
        // even if that microtask has already run and left work behind.
        queueMicrotask(flush);
        return new Promise((resolve) => waiters.push(resolve));
    }

    try {
        db = await openDatabase(tables);
    } catch (err) {
        // Private browsing, a blocked upgrade, or a browser without IndexedDB.
        // The app still runs; it just cannot remember anything.
        console.error("[rattlesnake] storage unavailable", err);
        return {
            store: createStore(),
            persistent: false,
            durable: false,
            settled: () => Promise.resolve(),
        };
    }

    const store = createStore(onChange);
    for (const table of tables) {
        store.load(table, await readTable(db, table));
    }

    return { store, persistent: await requestPersistence(), durable: true, settled };
}

return { boot, requestPersistence, DB_NAME, DB_VERSION };
});
