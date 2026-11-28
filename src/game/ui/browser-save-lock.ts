import { SAVE_KEY, type KeyValueStore } from '../persistence/storage';

// Plain HTTP may provide IndexedDB without Web Locks. A readwrite transaction
// serializes callbacks for this object store even across browser processes.
function withDatabaseLock(name: string, operation: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(name, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('lock');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const transaction = db.transaction('lock', 'readwrite');
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onabort = () => { db.close(); reject(transaction.error); };
      transaction.objectStore('lock').get('slot').onsuccess = () => {
        try { operation(); } catch (error) { transaction.abort(); reject(error); }
      };
    };
  });
}

/** Mount under the same lock as subsequent writes: loading may discard an invalid save. */
export async function mountWithSaveLock(base: KeyValueStore, prefix: string, mount: (store: KeyValueStore) => void): Promise<void> {
  let held = false;
  const name = prefix + SAVE_KEY;
  let tail = Promise.resolve();
  function withSaveLock(operation: () => void): Promise<void> {
    const run = () => {
      const exclusive = () => {
        held = true;
        try { operation(); } finally { held = false; }
      };
      return navigator.locks ? navigator.locks.request(name, exclusive) : withDatabaseLock(name, exclusive);
    };
    const next = tail.then(run);
    tail = next.catch(() => {});
    return next;
  }

  function requireLock(key: string): void {
    if (key === SAVE_KEY && base.durable && !held) throw new Error('Save lock unavailable');
  }
  let pendingWrites = 0;
  const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
    event.preventDefault();
    event.returnValue = true;
  };
  function protectPendingWrite(operation: () => void): Promise<void> {
    if (++pendingWrites === 1) window.addEventListener('beforeunload', warnBeforeLeaving);
    return withSaveLock(operation).finally(() => {
      if (--pendingWrites === 0) window.removeEventListener('beforeunload', warnBeforeLeaving);
    });
  }
  const store: KeyValueStore = {
    durable: base.durable,
    getItem: key => base.getItem(prefix + key),
    setItem(key, value) { requireLock(key); base.setItem(prefix + key, value); },
    removeItem(key) { requireLock(key); base.removeItem(prefix + key); },
    ...(base.durable ? { withSaveLock: protectPendingWrite } : {}),
  };
  if (!base.durable) { mount(store); return; }
  let mounted = false;
  try {
    await withSaveLock(() => { mounted = true; mount(store); });
  } catch (error) {
    if (mounted) throw error;
    // The browser may allow reading a save even when it denies the lock.
    mount(store);
  }
}
