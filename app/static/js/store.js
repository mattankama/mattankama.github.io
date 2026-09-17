/**
 * Rattlesnake — in-memory relational store.
 *
 * The whole point of this file is that the API logic in local-api.js never
 * learns where the data actually lives. At runtime the rows sit in these Maps
 * and IndexedDB is a write-behind mirror (persist.js); under `node --test` the
 * same Maps are the only storage there is. One implementation, two homes, and
 * the tests exercise the code that ships.
 *
 * Everything here is synchronous. A lifting log is kilobytes, so there is no
 * reason to pay for async reads — and staying synchronous is what lets a
 * multi-step write (start a session, lay out its entries, fill in their sets)
 * finish as one indivisible step instead of a half-written session.
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
    else root.RattlesnakeStore = exported;
})(typeof self !== "undefined" ? self : globalThis, function () {
"use strict";
const TABLES = [
    "exercises",
    "instances",
    "routines",
    "routine_exercises",
    "sessions",
    "session_entries",
    "session_sets",
];

function createStore(onChange) {
    const rows = new Map();
    const nextId = new Map();
    for (const table of TABLES) {
        rows.set(table, new Map());
        nextId.set(table, 1);
    }

    // Mirroring is fire-and-forget: a failed write to IndexedDB must never take
    // down the lift in progress. persist.js decides what to do about it.
    function emit(table, op, record) {
        if (onChange) onChange(table, op, record);
    }

    function table(name) {
        const t = rows.get(name);
        if (!t) throw new Error(`Unknown table: ${name}`);
        return t;
    }

    const store = {
        /** Every row of a table, in insertion order. */
        all(name) {
            return [...table(name).values()];
        },

        /** One row by id, or null. Ids arrive from URLs, so they may be junk. */
        get(name, id) {
            const key = Number(id);
            if (!Number.isInteger(key)) return null;
            return table(name).get(key) || null;
        },

        find(name, predicate) {
            for (const row of table(name).values()) {
                if (predicate(row)) return row;
            }
            return null;
        },

        filter(name, predicate) {
            return [...table(name).values()].filter(predicate);
        },

        /** Insert, assigning the next id for the table. */
        add(name, record) {
            const id = nextId.get(name);
            nextId.set(name, id + 1);
            const row = { ...record, id };
            table(name).set(id, row);
            emit(name, "put", row);
            return row;
        },

        /** Overwrite a row that already has an id. */
        put(name, record) {
            table(name).set(record.id, record);
            emit(name, "put", record);
            return record;
        },

        remove(name, id) {
            const key = Number(id);
            if (table(name).delete(key)) emit(name, "delete", { id: key });
        },

        removeWhere(name, predicate) {
            for (const row of [...table(name).values()]) {
                if (predicate(row)) store.remove(name, row.id);
            }
        },

        /**
         * Load rows straight from storage without re-numbering them. Only
         * persist.js calls this, on boot; ids must survive a reload or every
         * foreign key in the database would point at the wrong row.
         */
        load(name, records) {
            const t = table(name);
            let highest = 0;
            for (const record of records) {
                t.set(record.id, record);
                if (record.id > highest) highest = record.id;
            }
            nextId.set(name, highest + 1);
        },

        tables() {
            return [...TABLES];
        },
    };

    return store;
}

return { createStore, TABLES };
});
