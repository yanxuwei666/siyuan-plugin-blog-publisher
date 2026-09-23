[中文](README.zh-CN.md)

# SiYuan Blog Publisher

Convert selected SiYuan documents to Astro blog Markdown and sync them into the local blog project directory. The plugin does not create Git commits or push to a remote repository; use the blog project's own Git workflow from that project's code directory.

## Features

- Select a notebook and scan its documents.
- Read SiYuan custom attributes for status, category, tags, slug, publication date, and description.
- Maintain an editable category list and assign categories per post or in bulk.
- Generate Astro Content Collection frontmatter and stable slugs.
- Copy `/assets/...` references to the configured public asset directory and rewrite Markdown URLs.
- Preview Markdown, show conversion warnings, select documents in batches, and sync them locally.
- Maintain `.siyuan-sync.json`; unchanged documents are skipped and manually edited blog files cause a conflict.
- Keep the first sync date as `pubDate`; add `updatedDate` after a later content change.
- Reuse the same output file when a SiYuan document is renamed.
- Never delete blog files when a SiYuan document is deleted.

## Local setup

In plugin settings or the publisher, click “Choose blog project folder” and select the repository root. Direct sync writes Markdown to `src/content/blog`, images to `public/images/blog`, and the sync manifest to `.siyuan-sync.json` at the repository root.

Choose the folder once in SiYuan on Windows and once on macOS. Each computer keeps its folder permission in local browser storage; it is not part of synced SiYuan settings. If the system asks again later, grant read and write access. The plugin does not need the absolute path or a running Bridge.

In the publisher, scan documents, review the generated Markdown, and click “Sync to local repository”. Commit and push the resulting files separately from the blog project's own code directory with your usual Git client or terminal.

If the current environment does not support the folder picker, configure the Bridge fallback in plugin settings. Run it on the computer that holds the repository and configure the Windows and macOS paths and access token as before.

## Development

The source lives in `src/index.js`; SiYuan loads the self-contained root `index.js`. `npm run build` regenerates the entry file and the SiYuan plugin archive `package.zip`:

```sh
npm install
npm run build
npm run check
```

See [README.zh-CN.md](README.zh-CN.md) for the full Chinese usage guide and [docs/siyuan-blog-publisher-plugin.md](docs/siyuan-blog-publisher-plugin.md) for the product and sync-flow design.
