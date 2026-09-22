[English](README.md)

# 思源博客发布器

将思源笔记中选定笔记本的文档转换为 Astro 博客 Markdown，并同步到本地博客 Git 仓库。

当前版本是第一版本地目录适配器：插件负责扫描、转换和生成同步计划；一个只监听 `127.0.0.1` 的本地 Bridge 负责向 `my-blog` 写入文件。GitHub API 同步放在第二版。

## 当前功能

- 选择发布笔记本并扫描文档。
- 读取 `blog.status`、`blog.category`、`blog.tags`、`blog.slug`、`blog.pubDate` 和 `blog.description` 属性。
- 生成 Astro Content Collection frontmatter。
- 中文标题生成稳定 slug；同一文档使用 `siyuanId` 作为来源标识。
- 复制 `/assets/...` 图片到 `public/images/blog/<slug>/`，并重写 Markdown 引用。
- 预览 Markdown、显示警告、批量选择和同步。
- 维护 `.siyuan-sync.json`，重复同步会跳过，检测到博客文件被手动修改会阻止覆盖。
- 不会因为思源删除文档而自动删除博客文件。

## 使用方式

### 1. 启动本地 Bridge

在插件目录执行：

```powershell
node local-bridge.js
```

默认地址是 `http://127.0.0.1:18765`。需要换端口时：

```powershell
node local-bridge.js --port 18766
```

### 2. 配置插件

打开思源插件设置，填写：

- 发布笔记本：要扫描的笔记本。
- 本地博客仓库路径：本地 `my-blog` Git 仓库根目录，例如 `E:\projects\my-blog`。
- 博客内容目录：默认 `src/content/blog`。
- 博客资源目录：默认 `public/images/blog`。
- Bridge 地址：默认 `http://127.0.0.1:18765`。

然后打开顶部的“博客发布中心”，扫描并同步。

### 3. 文档属性

思源自定义属性可以使用下面的名字：

```text
blog.status      = pending | published | draft | archived
blog.category    = 工程实践
blog.tags        = redis, cache, backend
blog.slug        = redis-cache-penetration
blog.pubDate     = 2026-09-22
blog.description = 从现象、定位到修复缓存击穿问题。
```

`draft` 和 `archived` 不会被选中同步；没有设置 `blog.slug` 时，插件会根据标题生成稳定 slug。纯中文标题会生成 `post-xxxxxxxx` 形式的 ASCII 文件名。

## 开发与验证

插件源码在 `src/index.js`，思源实际加载根目录下的单文件 `index.js`。修改源码后先重新打包，再重新加载插件：

```powershell
npm install
npm run build
npm test
npm run check
```

`tests/blog-core.test.js` 覆盖 slug、frontmatter、资源路径和稳定 hash；开发时也可以用一个临时目录向 Bridge 发送同步计划，验证实际写入、同步清单以及第二次 `skip` 行为。

## 目录说明

```text
index.js          思源插件入口、设置页和发布中心
blog-core.js      与输出方式无关的转换器和 SyncPlan
siyuan-api.js     思源文档、属性、Markdown 和资源读取
local-adapter.js  第一版本地 Bridge 适配器
local-bridge.js   本地文件写入服务
docs/             产品和第二版 GitHub 适配器设计
```

## 注意事项

- Bridge 只绑定本机回环地址，不要把端口暴露到局域网或公网。
- 同步前请确认填写的是博客仓库根目录，不是 `src/content/blog` 子目录。
- 目标文件如果不是本插件上次写入的版本，会显示冲突并停止整批同步，不会静默覆盖。
- 第一版不会自动执行 `git add`、`commit` 或 `push`。

## 参考

- [思源笔记 API](https://github.com/siyuan-note/siyuan/blob/master/docs/API.zh-CN.md)
- [第一版需求与第二版设计](docs/siyuan-blog-publisher-plugin.md)
