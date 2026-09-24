import JSZip from "jszip";

export type Word = { text: string; chapter: number; block: number; sentenceStart: number; bold?: boolean; italic?: boolean };
export type Block = { type: "text" | "heading" | "image"; chapter: number; start: number; end: number; imageId?: string; alt?: string };
export type Chapter = { title: string; start: number; end: number; blockStart: number; depth?: number };
export type Book = { id: string; title: string; author?: string; kind: "text" | "epub"; words: Word[]; blocks: Block[]; chapters: Chapter[]; images: { id: string; blob: Blob }[]; position: number; completed: boolean; pendingImage?: string };

const elements = (root: Element | Document, name: string) => Array.from(root.getElementsByTagName("*")).filter((e) => e.localName === name);
const direct = (root: Element, name: string) => Array.from(root.children).find((e) => e.localName === name);
const attr = (el: Element | undefined, name: string) => el?.getAttribute(name) || "";
const xml = (str: string) => { const doc = new DOMParser().parseFromString(str, "application/xml"); if (doc.querySelector("parsererror")) throw new Error("Dit EPUB-bestand bevat ongeldige boekgegevens."); return doc; };
const normPath = (base: string, href: string) => {
  const raw = href.split("#")[0];
  const parts: string[] = [];
  for (const part of `${base}/${raw}`.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop(); else parts.push(part);
  }
  return decodeURIComponent(parts.join("/"));
};
const pathDir = (path: string) => path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
const newId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const sentenceEnd = (word: string) => {
  if (!/[.!?][”’"')\]]*$/.test(word)) return false;
  const core = word.replace(/[”’"')\]]+$/, "").toLowerCase();
  return !/^(dhr|mevr|dr|mr|prof|etc|bijv|ca|nr|blz|m\.a\.w)\.$/.test(core) && !/\d\.\d/.test(core);
};
const appendWords = (book: Book, text: string, chapter: number, block: number, startSentence: number) => {
  const parts = text.replace(/\s+/g, " ").trim().match(/\S+/g) || [];
  let sentence = startSentence;
  for (let part of parts) {
    if (!/[\p{L}\p{N}]/u.test(part)) {
      if (book.words.length) book.words[book.words.length - 1].text += part;
      continue;
    }
    part = part.normalize("NFC");
    book.words.push({ text: part, chapter, block, sentenceStart: sentence });
    if (sentenceEnd(part)) sentence = book.words.length;
  }
  return sentence;
};

type StyledText = { text: string; bold: boolean; italic: boolean };
// Keep one word when inline markup starts or ends in the middle of it.
const appendStyledWords = (book: Book, runs: StyledText[], chapter: number, block: number, startSentence: number) => {
  let sentence = startSentence, text = "", bold = false, italic = false;
  const flush = () => {
    if (!text) return;
    if (!/[\p{L}\p{N}]/u.test(text)) {
      const previous = book.words[book.words.length - 1];
      if (previous) { previous.text += text; previous.bold ||= bold; previous.italic ||= italic; }
    } else {
      const word: Word = { text: text.normalize("NFC"), chapter, block, sentenceStart: sentence };
      if (bold) word.bold = true;
      if (italic) word.italic = true;
      book.words.push(word);
      if (sentenceEnd(word.text)) sentence = book.words.length;
    }
    text = ""; bold = false; italic = false;
  };
  for (const run of runs) {
    for (const part of run.text.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) flush();
      else { text += part; bold ||= run.bold; italic ||= run.italic; }
    }
  }
  flush();
  return sentence;
};

export function bookFromText(input: string): Book {
  const book: Book = { id: newId(), title: "Mijn tekst", kind: "text", words: [], blocks: [], chapters: [{ title: "Mijn tekst", start: 0, end: 0, blockStart: 0 }], images: [], position: 0, completed: false };
  let sentence = 0;
  for (const para of input.trim().split(/\n\s*\n|\n/g)) {
    if (!para.trim()) continue;
    const start = book.words.length;
    const block = book.blocks.length;
    sentence = appendWords(book, para, 0, block, sentence);
    if (book.words.length > start) book.blocks.push({ type: "text", chapter: 0, start, end: book.words.length });
  }
  book.chapters[0].end = book.words.length;
  return book;
}

export async function bookFromEpub(file: File): Promise<Book> {
  if (!file.name.toLowerCase().endsWith(".epub")) throw new Error("Kies een bestand dat eindigt op .epub.");
  if (file.size > 35_000_000) throw new Error("Dit boek is te groot voor deze versie (maximaal 35 MB).");
  const zip = await JSZip.loadAsync(file);
  const total = Object.values(zip.files).reduce((sum, f) => sum + ((f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0), 0);
  if (total > 110_000_000) throw new Error("Dit EPUB-bestand bevat te veel gegevens.");
  if (zip.file("META-INF/encryption.xml")) throw new Error("Een beveiligde EPUB kan deze versie nog niet openen.");
  const container = zip.file("META-INF/container.xml");
  if (!container) throw new Error("De EPUB bevat geen geldige boekstructuur.");
  const containerDoc = xml(await container.async("text"));
  const opfPath = attr(elements(containerDoc, "rootfile")[0], "full-path");
  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new Error("De boekstructuur kon niet worden gelezen.");
  const opf = xml(await opfFile.async("text"));
  const base = pathDir(opfPath);
  const metadata = elements(opf, "metadata")[0];
  const title = elements(metadata || opf, "title")[0]?.textContent?.trim() || file.name.replace(/\.epub$/i, "");
  const author = elements(metadata || opf, "creator")[0]?.textContent?.trim() || undefined;
  if (elements(opf, "meta").some((e) => attr(e, "name") === "fixed-layout" || (attr(e, "property") === "rendition:layout" && e.textContent?.trim() === "pre-paginated"))) throw new Error("Een EPUB met vaste pagina-indeling kan deze versie nog niet lezen.");
  const manifest = new Map(elements(opf, "item").map((e) => [attr(e, "id"), { path: normPath(base, attr(e, "href")), type: attr(e, "media-type"), props: attr(e, "properties") }]));
  const classStyles = new Map<string, { bold: boolean; italic: boolean }>();
  for (const item of manifest.values()) {
    if (item.type !== "text/css" || !zip.file(item.path)) continue;
    const css = await zip.file(item.path)!.async("text");
    for (const [, selector, declarations] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const bold = /(?:^|;)\s*font-weight\s*:\s*(?:bold|bolder|[6-9]00)\b/i.test(declarations);
      const italic = /(?:^|;)\s*font-style\s*:\s*(?:italic|oblique)\b/i.test(declarations);
      if (!bold && !italic) continue;
      for (const part of selector.split(",")) {
        const match = /^\.([\w-]+)$/.exec(part.trim());
        if (!match) continue;
        const previous = classStyles.get(match[1]);
        classStyles.set(match[1], { bold: bold || !!previous?.bold, italic: italic || !!previous?.italic });
      }
    }
  }
  const spine = elements(opf, "spine")[0];
  const sections = spine ? Array.from(spine.children).filter((e) => e.localName === "itemref").map((e) => manifest.get(attr(e, "idref"))).filter((x): x is NonNullable<typeof x> => !!x) : [];
  if (!sections.length) throw new Error("In dit EPUB-bestand is geen leesvolgorde gevonden.");
  const toc = new Map<string, { title: string; depth: number }>();
  const nav = [...manifest.values()].find((m) => m.props.split(/\s+/).includes("nav"));
  if (nav && zip.file(nav.path)) {
    const doc = xml(await zip.file(nav.path)!.async("text"));
    const tocNav = elements(doc, "nav").find((e) => attr(e, "type") === "toc" || attr(e, "epub:type") === "toc") || elements(doc, "nav")[0];
    for (const link of tocNav ? elements(tocNav, "a") : []) {
      const full = normPath(pathDir(nav.path), attr(link, "href"));
      let level = 0;
      for (let parent = link.parentElement; parent && parent !== tocNav; parent = parent.parentElement) if (parent.localName === "li") level++;
      if (!toc.has(full)) toc.set(full, { title: link.textContent?.trim() || "", depth: Math.max(0, level - 1) });
    }
  }
  const ncx = [...manifest.values()].find((m) => m.type === "application/x-dtbncx+xml");
  if (ncx && zip.file(ncx.path)) {
    const doc = xml(await zip.file(ncx.path)!.async("text"));
    for (const point of elements(doc, "navPoint")) {
      const content = elements(point, "content")[0];
      const label = elements(point, "navLabel")[0];
      const full = normPath(pathDir(ncx.path), attr(content, "src"));
      let level = 0;
      for (let parent: Element | null = point; parent; parent = parent.parentElement) if (parent.localName === "navPoint") level++;
      if (!toc.has(full)) toc.set(full, { title: label?.textContent?.trim() || "", depth: Math.max(0, level - 1) });
    }
  }
  const book: Book = { id: newId(), title, author, kind: "epub", words: [], blocks: [], chapters: [], images: [], position: 0, completed: false };
  let sentence = 0;
  for (const section of sections) {
    if (!/xhtml\+xml|text\/html/.test(section.type)) continue;
    const entry = zip.file(section.path);
    if (!entry) continue;
    const doc = xml(await entry.async("text"));
    const body = elements(doc, "body")[0];
    if (!body) continue;
    const heading = elements(body, "h1")[0]?.textContent?.trim() || elements(body, "h2")[0]?.textContent?.trim();
    const entryTitle = toc.get(section.path);
    const sectionTitle = entryTitle?.title || heading;
    if (!book.chapters.length || (sectionTitle && sectionTitle !== book.chapters[book.chapters.length - 1].title)) {
      book.chapters.push({ title: sectionTitle || "Voorwerk", start: book.words.length, end: book.words.length, blockStart: book.blocks.length, depth: entryTitle?.depth || 0 });
    }
    const chapter = book.chapters.length - 1;
    const addText = (runs: StyledText[], type: "text" | "heading") => {
      const start = book.words.length, index = book.blocks.length;
      sentence = appendStyledWords(book, runs, chapter, index, sentence);
      if (book.words.length > start) book.blocks.push({ type, chapter, start, end: book.words.length });
    };
    const walk = async (node: Element): Promise<void> => {
      const tag = node.localName.toLowerCase();
      if (["script", "style", "iframe", "form", "nav", "head", "audio", "video"].includes(tag)) return;
      if (tag === "svg") {
        const nested = elements(node, "image");
        if (nested.length) for (const image of nested) await walk(image);
        else book.blocks.push({ type: "image", chapter, start: book.words.length, end: book.words.length, imageId: `${chapter}-${book.blocks.length}`, alt: "Vectorafbeelding uit het boek" });
        return;
      }
      if (tag === "img" || tag === "image") {
        const raw = attr(node, "src") || attr(node, "href") || attr(node, "xlink:href");
        const full = normPath(pathDir(section.path), raw);
        const item = [...manifest.values()].find((m) => m.path === full);
        const id = `${chapter}-${book.blocks.length}`;
        if (item && /^image\/(jpeg|png|gif|webp)$/.test(item.type) && zip.file(full)) {
          const bytes = await zip.file(full)!.async("uint8array");
          book.images.push({ id, blob: new Blob([new Uint8Array(bytes)], { type: item.type }) });
        }
        book.blocks.push({ type: "image", chapter, start: book.words.length, end: book.words.length, imageId: id, alt: attr(node, "alt") });
        return;
      }
      if (["p", "h1", "h2", "h3", "h4", "li", "blockquote"].includes(tag)) {
        let runs: StyledText[] = [];
        const flush = () => { if (runs.some(run => run.text.trim())) addText(runs, tag.startsWith("h") ? "heading" : "text"); runs = []; };
        const collect = async (child: Node, bold: boolean, italic: boolean): Promise<void> => {
          if (child.nodeType === Node.TEXT_NODE) { runs.push({ text: child.textContent || "", bold, italic }); return; }
          if (child.nodeType !== Node.ELEMENT_NODE) return;
          const el = child as Element;
          if (["img", "image", "svg"].includes(el.localName)) { flush(); await walk(el); return; }
          if (["script", "style", "audio", "iframe"].includes(el.localName)) return;
          const name = el.localName.toLowerCase(), style = attr(el, "style");
          const classes = attr(el, "class").split(/\s+/).map(key => classStyles.get(key));
          const nextBold = bold || ["b", "strong"].includes(name) || /(?:^|;)\s*font-weight\s*:\s*(?:bold|bolder|[6-9]00)\b/i.test(style) || classes.some(value => value?.bold);
          const nextItalic = italic || ["i", "em", "cite", "dfn"].includes(name) || /(?:^|;)\s*font-style\s*:\s*(?:italic|oblique)\b/i.test(style) || classes.some(value => value?.italic);
          for (const n of Array.from(el.childNodes)) await collect(n, nextBold, nextItalic);
        };
        const blockStyle = attr(node, "style"), blockClasses = attr(node, "class").split(/\s+/).map(key => classStyles.get(key));
        const blockBold = /(?:^|;)\s*font-weight\s*:\s*(?:bold|bolder|[6-9]00)\b/i.test(blockStyle) || blockClasses.some(value => value?.bold);
        const blockItalic = /(?:^|;)\s*font-style\s*:\s*(?:italic|oblique)\b/i.test(blockStyle) || blockClasses.some(value => value?.italic);
        for (const child of Array.from(node.childNodes)) await collect(child, blockBold, blockItalic);
        flush();
        return;
      }
      for (const child of Array.from(node.children)) await walk(child);
    };
    await walk(body);
    book.chapters[chapter].end = book.words.length;
  }
  if (!book.words.length) throw new Error("Dit EPUB-bestand heeft geen tekst die deze lezer kan tonen.");
  return book;
}
