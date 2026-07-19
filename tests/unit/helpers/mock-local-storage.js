/**
 * Mock explícito de localStorage (idiom de storage-adapter.test.js):
 * o storage-adapter cai para localStorage quando GM_* não existe.
 */

export function installMockLocalStorage() {
    global.localStorage = {
        _data: new Map(),
        getItem(key) {
            return this._data.has(key) ? this._data.get(key) : null;
        },
        setItem(key, value) {
            this._data.set(key, String(value));
        },
        removeItem(key) {
            this._data.delete(key);
        },
        clear() {
            this._data.clear();
        }
    };
    return global.localStorage;
}
