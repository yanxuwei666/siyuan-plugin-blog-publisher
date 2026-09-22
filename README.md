[中文](README.zh-CN.md)

# SiYuan Blog Publisher

Publish selected SiYuan documents as Astro blog Markdown and sync them to a local Git repository.

Version 0.1 uses a localhost adapter: the plugin scans and converts documents, while `local-bridge.js` writes the sync plan into the configured `my-blog` repository. GitHub API synchronization is planned for v0.2.

## Features

- Select a notebook and scan its documents.
- Read `blog.status`, `blog.category`, `blog.tags`, `blog.slug`, `blog.pubDate`, and `blog.description` attributes.
- Generate Astro Content Collection frontmatter.
- Generate stable slugs, preserving `siyuanId` as the source identity.
- Copy `/assets/...` references to `public/images/blog/<slug>/` and rewrite Markdown URLs.
- Preview Markdown, show conversion warnings, select documents in batches, and sync them.
- Maintain `.siyuan-sync.json`; unchanged documents are skipped and manually edited blog files cause a conflict.
- Never delete blog files when a SiYuan document is deleted.

## Local setup

Start the bridge from this directory:

```powershell
node local-bridge.js
```

The default address is `http://127.0.0.1:18765`. Configure the notebook, local repository root, content directory, asset directory, and bridge URL in the plugin settings. Open the “Blog Publisher” top-bar button to scan and sync.

The first version does not run `git add`, `commit`, or `push` automatically.

## Development

The source lives in `src/index.js`; SiYuan loads the self-contained root `index.js`. Rebuild after source changes:

```powershell
npm install
npm run build
npm test
npm run check
```

See [README.zh-CN.md](README.zh-CN.md) for the full Chinese usage guide and [docs/siyuan-blog-publisher-plugin.md](docs/siyuan-blog-publisher-plugin.md) for the product design and v0.2 GitHub adapter plan.
