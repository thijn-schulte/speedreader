import type { Book } from "./book";

const DB = "speedreader-local-v1";
const STORE = "reading";
const ACTIVE = "active-book-id";
export const MAX_BOOKS = 3;
export type BookInfo = Pick<Book, "id" | "title" | "author" | "kind" | "position" | "completed"> & { wordCount: number };

const key = (id: string) => `book:${id}`;
export const bookInfo = (book: Book): BookInfo => ({ id: book.id, title: book.title, author: book.author, kind: book.kind, position: book.position, completed: book.completed, wordCount: book.words.length });
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadLibrary(): Promise<{ books: BookInfo[]; active: Book | null }> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite"), store = tx.objectStore(STORE);
    let keys: IDBRequest<IDBValidKey[]>, values: IDBRequest<unknown[]>;
    const legacy = store.get("book");
    legacy.onsuccess = () => {
      const old = legacy.result as Book | undefined;
      if (old && typeof old.id === "string" && Array.isArray(old.words)) {
        // Move the old single-book record in one atomic transaction.
        const existing = store.getKey(key(old.id));
        existing.onsuccess = () => {
          if (!existing.result) store.put(old, key(old.id));
          store.put(old.id, ACTIVE);
          store.delete("book");
          keys = store.getAllKeys(); values = store.getAll();
        };
      } else { keys = store.getAllKeys(); values = store.getAll(); }
    };
    tx.oncomplete = () => {
      db.close();
      const items = keys.result.map((item, i) => ({ name: String(item), value: values.result[i] }));
      const books = items.filter(item => item.name.startsWith("book:")).map(item => item.value as Book);
      const activeId = items.find(item => item.name === ACTIVE)?.value;
      const active = books.find(book => book.id === activeId) || books[0] || null;
      resolve({ books: books.map(bookInfo), active });
    };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getBook(id: string): Promise<Book | null> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly"), request = tx.objectStore(STORE).get(key(id));
    request.onsuccess = () => resolve(request.result || null);
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

// A late progress write cannot recreate a book that has been removed.
export async function saveBook(book: Book): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite"), store = tx.objectStore(STORE);
    const existing = store.getKey(key(book.id));
    existing.onsuccess = () => { if (existing.result) store.put(book, key(book.id)); };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function addBook(book: Book): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite"), store = tx.objectStore(STORE);
    let full = false;
    const keys = store.getAllKeys();
    keys.onsuccess = () => {
      const all = keys.result.map(String);
      if (!all.includes(key(book.id)) && all.filter(item => item.startsWith("book:")).length >= MAX_BOOKS) {
        full = true; tx.abort(); return;
      }
      store.put(book, key(book.id)); store.put(book.id, ACTIVE);
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = () => { db.close(); reject(new Error(full ? "Je boekenlijst is vol. Verwijder eerst een boek." : "Het boek kon niet worden opgeslagen.")); };
  });
}

export async function setActiveBook(id: string): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite"), store = tx.objectStore(STORE);
    const request = store.get(key(id));
    request.onsuccess = () => { if (request.result) store.put(id, ACTIVE); };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function removeBook(id: string, nextActiveId: string | null): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite"), store = tx.objectStore(STORE);
    store.delete(key(id));
    if (nextActiveId) store.put(nextActiveId, ACTIVE); else store.delete(ACTIVE);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
