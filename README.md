# Speedreader

A local-first EPUB and text speedreader for iPhone and desktop. Books, images, preferences and reading position are stored in the browser. The site has no account, server-side book storage or third-party book upload.

## GitHub Pages

This repository is a static Next.js export. The workflow in `.github/workflows/pages.yml` builds and publishes `out/` on every push to `main`. Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions** once when creating the repository. The workflow derives the correct URL path from the repository name; a project repository such as `speedreader` is published at `https://USERNAME.github.io/speedreader/`.

The public website and its JavaScript are accessible to anyone with the URL. A private repository, where supported by a paid plan, does **not** make the Pages website private. Do not commit EPUBs, backups or private information. The `.gitignore` excludes EPUB and ZIP files by default.

## Move your existing book

The old private Speedreader website and GitHub Pages have different browser origins. Local storage cannot move between them by itself.

1. On your iPhone, open the **old** Speedreader link and tap **Bewaar leesgegevens**. Keep the resulting `speedreader-leesgegevens.zip` in the Files app. This archive contains the full text and images of your book; keep it private.
2. Open the **new** GitHub Pages link on the same iPhone, tap **Zet leesgegevens terug**, and select the ZIP file.
3. Open the book to check the highlighted reading position. Add the new Pages link to your Home Screen if you use the app that way.

Keep the old link and ZIP until you have verified your book and position on the new link. The app's offline shell is cached separately for each website.

## Development

Requires Node.js 22 and pnpm 11.19.0.

```sh
pnpm install --frozen-lockfile
GITHUB_PAGES=true NEXT_PUBLIC_BASE_PATH=/speedreader pnpm run build:pages
```

The static output is `out/`. For a user-site repository named `USERNAME.github.io`, set `NEXT_PUBLIC_BASE_PATH` to an empty string.
