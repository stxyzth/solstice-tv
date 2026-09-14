/* Solstice TV — tiny IndexedDB key/value cache with graceful fallback. */
(function () {
    'use strict';
    var U = XTV.util;
    var DB_NAME = 'xtv-cache', STORE = 'kv';
    var dbp = null, memory = {};

    function open() {
        if (dbp) return dbp;
        dbp = new Promise(function (resolve) {
            var req;
            try {
                req = indexedDB.open(DB_NAME, 1);
            } catch (e) { return resolve(null); }
            req.onupgradeneeded = function () {
                try { req.result.createObjectStore(STORE); } catch (e) {}
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { resolve(null); };
        });
        return dbp;
    }

    function tx(mode, fn) {
        return open().then(function (db) {
            return new Promise(function (resolve) {
                if (!db) return resolve(undefined);
                var done = false;
                var finish = function (v) { if (!done) { done = true; resolve(v); } };
                try {
                    var t = db.transaction(STORE, mode);
                    var st = t.objectStore(STORE);
                    var out = fn(st);
                    t.oncomplete = function () { finish(out && out._res !== undefined ? out._res : undefined); };
                    t.onerror = t.onabort = function () { finish(undefined); };
                    if (out && out._req) {
                        out._req.onsuccess = function () { out._res = out._req.result; };
                        out._req.onerror = function () { out._res = undefined; };
                    }
                    // safety: some engines need explicit completion value
                    setTimeout(function () { finish(out && out._res !== undefined ? out._res : undefined); }, 3000);
                } catch (e) { finish(undefined); }
            });
        });
    }

    var IDB = {
        get: function (key) {
            return tx('readonly', function (st) {
                return { _req: st.get(key) };
            }).then(function (v) {
                if (v === undefined && !(key in memory)) return undefined;
                var val = v !== undefined ? v : memory[key];
                if (val && val.exp && Date.now() > val.exp) { IDB.del(key); return undefined; }
                return val ? val.v : undefined;
            });
        },
        set: function (key, value, ttlMs) {
            var rec = { v: value, exp: ttlMs ? Date.now() + ttlMs : 0 };
            memory[key] = rec;
            return tx('readwrite', function (st) {
                st.put(rec, key);
                return {};
            });
        },
        del: function (key) {
            delete memory[key];
            return tx('readwrite', function (st) { st['delete'](key); return {}; });
        },
        clear: function () {
            memory = {};
            return tx('readwrite', function (st) { st.clear(); return {}; });
        }
    };

    XTV.idb = IDB;
})();
