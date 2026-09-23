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

Start the Bridge on the computer that has the blog project directory:

```sh
node local-bridge.js
```

On first start, the Bridge generates and prints an access token. Paste it into the plugin's “Bridge access token” setting. The token is stored in `~/.siyuan-blog-publisher/bridge-token` (Windows: `%USERPROFILE%\.siyuan-blog-publisher\bridge-token`); the Bridge listens only on `http://127.0.0.1:18765`.

In plugin settings, configure both the Windows blog project path and the macOS blog project path. The Bridge reports its operating system, and the plugin automatically selects the matching path when scanning or syncing. For example, enter `D:\Code\personal\my-blog` for Windows and `~/Code/personal/my-blog` for macOS. SiYuan and Bridge must be able to access the same project directory on the computer in use.

In the publisher, scan documents, review the generated Markdown, and click “Sync to local repository”. Commit and push the resulting files separately from the blog project's own code directory with your usual Git client or terminal.

## Development

The source lives in `src/index.js`; SiYuan loads the self-contained root `index.js`. `npm run build` regenerates the entry file and the SiYuan plugin archive `package.zip`:

```sh
npm install
npm run build
npm run check
```

See [README.zh-CN.md](README.zh-CN.md) for the full Chinese usage guide and [docs/siyuan-blog-publisher-plugin.md](docs/siyuan-blog-publisher-plugin.md) for the product and sync-flow design.
