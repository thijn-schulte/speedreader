import JSZip from "jszip";
import type { Book } from "./book";

type SavedImage = { id: string; path: string; type: string };
type SavedBook = Omit<Book, "images"> & { images: SavedImage[] };

export async function makeBackup(book: Book, preferences: unknown): Promise<Blob> {
  const zip = new JSZip();
  const images = book.images.map(({ id, blob }, index) => {
    const path = `images/${index}`;
    zip.file(path, blob);
    return { id, path, type: blob.type || "application/octet-stream" };
  });
  zip.file("backup.json", JSON.stringify({ version: 1, book: { ...book, images }, preferences }));
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 4 } });
}

export async function readBackup(file: File): Promise<{ book: Book; preferences: unknown }> {
  if (!file.name.toLowerCase().endsWith(".zip") || file.size > 100_000_000) throw new Error("Kies een Speedreader-back-up van maximaal 100 MB (.zip).");
  const zip = await JSZip.loadAsync(file);
  const size = Object.values(zip.files).reduce((sum, item) => sum + ((item as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0), 0);
  if (size > 180_000_000) throw new Error("Deze back-up bevat te veel gegevens.");
  const raw = zip.file("backup.json");
  if (!raw) throw new Error("Dit is geen Speedreader-back-up.");
  const data: { version?: number; book?: SavedBook; preferences?: unknown } = JSON.parse(await raw.async("text"));
  const b = data.book;
  if (data.version !== 1 || !b || typeof b.id !== "string" || typeof b.title !== "string" || !["epub", "text"].includes(b.kind) || !Array.isArray(b.words) || !b.words.length || !Array.isArray(b.blocks) || !Array.isArray(b.chapters) || !Array.isArray(b.images) || !Number.isInteger(b.position)) throw new Error("De leesgegevens in deze back-up zijn ongeldig.");
  if (b.images.length > 1000 || b.images.some((image, i) => !image || typeof image.id !== "string" || image.path !== `images/${i}` || !zip.file(image.path))) throw new Error("Een afbeelding in deze back-up ontbreekt.");
  const images = await Promise.all(b.images.map(async image => ({ id: image.id, blob: new Blob([await zip.file(image.path)!.async("arraybuffer")], { type: image.type || "application/octet-stream" }) })));
  return { book: { ...b, images, position: Math.max(0, Math.min(b.position, b.words.length - 1)) }, preferences: data.preferences };
}
