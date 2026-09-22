# 思源博客发布器插件开发文档

> 文档状态：Draft v0.1  
> 推荐插件名称：思源博客发布器  
> 推荐插件 ID：`siyuan-blog-publisher`  
> 推荐代码仓库名：`siyuan-plugin-blog-publisher`

## 1. 项目定位

这是一个将思源笔记中的指定文档转换为博客仓库内容的插件。

插件不负责把整个思源知识库导出，而是只处理用户明确加入博客发布范围的文档，并将其转换成当前 Astro 博客可以直接构建的内容：

- Markdown 正文
- Astro Content Collection frontmatter
- 博客图片和附件
- 文档来源、slug 和内容 hash
- 同步清单和同步结果

第一版先输出到指定的本地博客目录，方便反复测试转换效果；第二版增加 GitHub 提交适配器，让同步结果可以直接生成一次 Git commit。

## 2. 名称建议

### 推荐名称

| 用途 | 名称 |
| --- | --- |
| 插件显示名 | 思源博客发布器 |
| 插件 ID | `siyuan-blog-publisher` |
| GitHub 仓库名 | `siyuan-plugin-blog-publisher` |
| 英文显示名 | SiYuan Blog Publisher |

推荐使用 `siyuan-blog-publisher`，因为它表达的是“发布博客”，不绑定具体实现。

不建议使用 `sync-astro-github-cloudflare` 作为正式名称，原因是：

- GitHub 是传输目标，不一定永远是唯一目标；
- Astro 是当前博客技术栈，未来可能更换；
- Cloudflare 是部署平台，不应该成为内容同步插件的职责；
- 名称过长，不利于插件菜单、仓库和发布市场展示。

如果确定永远只服务当前 Astro 博客，可以使用备选名称：

- `siyuan-astro-publisher`
- `siyuan-static-blog-publisher`
- `siyuan-blog-sync`

最终建议仍然是 `siyuan-blog-publisher`。

## 3. 总体架构

```text
思源文档
   ↓
文档扫描器
   ↓
思源 Markdown 导出器
   ↓
博客格式转换器
   ├─ frontmatter
   ├─ slug
   ├─ 图片和附件路径
   └─ 不支持内容检测
   ↓
规范化内容 + SHA-256 hash
   ↓
重复检查 / 冲突检查
   ↓
SyncPlan
   ├─ LocalAdapter：写入本地博客目录
   └─ GitHubAdapter：创建一次 Git commit
```

核心转换逻辑必须与输出方式解耦。第一版和第二版只替换 Adapter，不重复实现文档转换、重复校验和资源处理。

## 4. 第一版与第二版范围

### 第一版：本地目录同步

目标是验证“思源文档是否能稳定转换为博客内容”。

包含：

- 配置默认发布笔记本；
- 扫描笔记本下的文档；
- 批量选择待发布文档；
- 导出为 Markdown；
- 生成 Astro frontmatter；
- 转换图片和附件路径；
- 写入指定本地博客目录；
- 重复检查；
- 生成同步清单；
- 预览同步计划和错误信息。

不包含：

- GitHub Token 管理；
- GitHub API；
- 自动提交；
- 自动删除博客文件；
- 后台监听每次编辑并立即同步。

### 第二版：GitHub 同步

在第一版的 `SyncPlan` 基础上增加：

- GitHub 仓库和分支配置；
- GitHub Token 配置；
- 远程文件读取；
- 远程 hash 和 commit 冲突检查；
- Markdown 和图片批量上传；
- 一次同步生成一个 commit；
- 返回 commit URL；
- GitHub Actions 触发博客构建和部署。

## 5. 本地目录模式的实现说明

思源插件运行在前端环境中，不能假设可以直接使用 Node.js 的 `fs` 写入任意电脑目录。思源官方建议通过内核文件 API 访问工作区文件；`/api/file/putFile` 的路径范围也是思源工作区内的路径。

因此，第一版的“指定本地博客目录”建议采用下面两种实现中的一种：

### 推荐：本地 Bridge

插件负责：

1. 导出和转换文档；
2. 生成 `SyncPlan`；
3. 通过 `http://127.0.0.1:<port>` 将同步计划发送给本地 Bridge。

本地 Bridge 负责：

1. 验证目标目录；
2. 写入 Markdown 和资源文件；
3. 更新 `.siyuan-sync.json`；
4. 返回写入结果。

Bridge 可以是一个很小的 Node.js 程序，第一版只需要支持本机运行，不需要公网服务。

### 备选：桌面端文件选择器

如果目标运行环境确认是桌面端 Chromium，可以尝试通过目录选择器获得目标目录权限。但这需要处理权限持久化、浏览器兼容和插件重启后的授权状态，因此不作为第一版的唯一实现方式。

### 不推荐

不要在插件前端中直接依赖 `fs`、`child_process` 或 Electron 私有 API。这样会导致桌面端、移动端和未来思源版本之间的兼容性很差。

## 6. 用户操作流程

### 6.1 初次配置

设置页面包含：

- 发布笔记本；
- 本地博客目录；
- 博客内容目录，默认 `src/content/blog`；
- 博客资源目录，默认 `public/images/blog`；
- 是否保留文档标题作为正文一级标题；
- 默认分类；
- 默认发布时间规则；
- Bridge 地址和端口。

### 6.2 发布中心

插件提供一个发布中心，至少包含以下状态：

```text
待发布  |  有更新  |  已发布  |  有冲突  |  转换失败
```

列表展示：

- 文档标题；
- 思源文档路径；
- 最后修改时间；
- 当前发布状态；
- 目标文件路径；
- 是否有图片；
- 是否存在转换警告。

主要操作：

- 扫描发布笔记本；
- 全选待发布；
- 选择同步；
- 预览 Markdown；
- 预览文件变更；
- 打开本地博客目录；
- 重试失败项。

### 6.3 发布状态

建议在思源文档上使用自定义属性：

```text
blog.status   = draft | pending | published | archived
blog.category = 工程实践
blog.tags     = redis, cache, backend
blog.slug     = redis-cache-penetration
blog.pubDate  = 2026-09-22
```

状态含义：

| 状态 | 含义 |
| --- | --- |
| `draft` | 只在思源中保存，不进入同步列表 |
| `pending` | 等待用户选择或发布 |
| `published` | 已经成功写入博客目录或 GitHub |
| `archived` | 已下线，不再更新博客内容 |

## 7. 博客格式转换规则

### 7.1 目标文件路径

默认目标：

```text
src/content/blog/<slug>.md
```

文件名优先使用显式的 `blog.slug`。如果没有配置，则第一次同步时由标题生成 slug，并保存到同步清单中。

不要每次根据标题重新生成文件名，否则标题修改会导致博客 URL 改变。

### 7.2 Frontmatter

示例：

```yaml
---
title: "Redis 缓存击穿排查"
description: "从现象、定位到修复缓存击穿问题。"
pubDate: 2026-09-22
updatedDate: 2026-09-22
category: "后端开发"
tags: [redis, cache, backend]
draft: false
source: "siyuan"
siyuanId: "20260922123456-abcdefg"
sourceHash: "sha256:..."
---
```

字段映射：

| 思源内容 | 博客字段 |
| --- | --- |
| 文档标题 | `title` |
| 首段摘要或 `blog.description` | `description` |
| `blog.pubDate` 或首次发布日 | `pubDate` |
| 本次同步时间 | `updatedDate` |
| `blog.category` | `category` |
| `blog.tags` | `tags` |
| `blog.status` | `draft` |
| 思源文档 ID | `siyuanId` |
| 转换后内容 hash | `sourceHash` |

### 7.3 正文标题

默认不在 Markdown 正文中重复生成文档标题，因为 Astro 页面通常已经单独渲染标题。

插件设置中可以提供：

```text
[ ] 将文档标题写入正文一级标题
```

默认关闭。

### 7.4 图片和附件

思源中的资源引用需要被转换为博客仓库的相对路径：

```text
思源资源：/assets/image-abc.png
博客资源：/images/blog/<slug>/image-abc.png
```

转换器需要：

1. 找出 Markdown 中的资源引用；
2. 读取思源资源文件；
3. 复制到目标资源目录；
4. 重写 Markdown 引用；
5. 对资源内容计算 hash，避免重复上传。

### 7.5 暂不支持的内容

第一版遇到以下内容时不要静默丢弃：

- 数据库查询块；
- 属性视图；
- 思源特有的嵌入块；
- 需要登录才能访问的外部内容；
- 不可转换的自定义块；
- 失效的图片引用。

处理方式：

- 能转换则转换；
- 不能转换则保留可读文本或占位提示；
- 在同步预览中显示警告；
- 允许用户取消本次同步。

## 8. 重复和冲突校验

### 8.1 文档 ID 校验

以 `siyuanId` 作为唯一来源标识。文档标题相同不代表是同一篇文章。

### 8.2 内容 hash 校验

对“转换完成后的最终 Markdown”计算 SHA-256，而不是对思源内部 `.sy` 文件计算 hash。

这样可以避免：

- 思源内部元数据变化导致误同步；
- Markdown 等价格式变化导致误同步；
- 图片引用变化无法被发现。

### 8.3 slug 冲突校验

以下情况必须阻止同步：

- 两个不同思源文档使用同一个 slug；
- slug 生成后与仓库已有非思源文章重名；
- 目标路径超出允许目录；
- 目标路径包含 `..` 或绝对路径。

### 8.4 远程冲突校验

第二版需要记录：

- 上次同步时的 Git commit；
- 上次同步文件的 blob SHA；
- 上次生成的内容 hash。

如果仓库文件已经被手动修改，插件应显示“远程冲突”，不能默认覆盖。

## 9. 同步清单

建议在博客仓库根目录维护：

```text
.siyuan-sync.json
```

示例：

```json
{
  "version": 1,
  "project": "my-blog",
  "documents": {
    "20260922123456-abcdefg": {
      "path": "src/content/blog/redis-cache-penetration.md",
      "assetDir": "public/images/blog/redis-cache-penetration",
      "slug": "redis-cache-penetration",
      "sourceHash": "sha256:...",
      "lastSyncAt": "2026-09-22T10:00:00.000Z",
      "lastCommit": null
    }
  }
}
```

同步清单只由插件维护，用户手动修改时需要提示风险。

## 10. SyncPlan 数据结构

转换器不直接写磁盘或调用 GitHub，而是输出统一的同步计划：

```ts
interface SyncPlan {
  sourceId: string;
  sourcePath: string;
  title: string;
  targetPath: string;
  content: string;
  sourceHash: string;
  assets: SyncAsset[];
  action: "create" | "update" | "skip" | "conflict";
  warnings: SyncWarning[];
}

interface SyncAsset {
  sourcePath: string;
  targetPath: string;
  content: ArrayBuffer;
  hash: string;
}
```

Adapter 只负责执行：

```ts
interface SyncAdapter {
  preview(plans: SyncPlan[]): Promise<SyncResult>;
  apply(plans: SyncPlan[]): Promise<SyncResult>;
}
```

## 11. 第二版 GitHub 提交策略

第二版不建议逐个调用文件 Contents API，因为一批文章和图片会产生很多独立 commit。

推荐流程：

```text
读取目标分支 HEAD
  ↓
创建或复用 blobs
  ↓
创建 tree
  ↓
创建 commit
  ↓
更新 refs/heads/<branch>
```

结果是一批内容对应一个 commit，例如：

```text
publish: sync 3 SiYuan documents
```

GitHub Token 最小权限使用目标仓库的 `Contents: write`。Token 不写入思源文档、Markdown 文件或同步清单。

## 12. 当前博客项目需要的改动

当前博客已经使用 Astro Content Collection，可以在 [`src/content.config.ts`](../src/content.config.ts) 中增加可选字段：

```ts
source: z.enum(["issue", "siyuan"]).optional(),
siyuanId: z.string().optional(),
slug: z.string().optional(),
sourceHash: z.string().optional(),
```

现有的 [`scripts/sync-issues.js`](../scripts/sync-issues.js) 可以暂时保留，以兼容旧文章。

注意：Issue 同步和思源同步不能写入同一个文件，否则会出现互相覆盖。建议：

- 旧文章继续由 Issue 管理；
- 新文章标记 `source: "siyuan"`；
- 两套同步清单分开管理；
- 后续再决定是否完全迁移到思源。

## 13. 开发阶段拆分

### Milestone 1：转换器

- 导出单篇思源文档；
- 转换为 Markdown；
- 生成 frontmatter；
- 处理 slug；
- 处理图片；
- 输出转换警告。

### Milestone 2：发布中心

- 选择笔记本；
- 扫描文档；
- 批量勾选；
- 显示待发布和有更新状态；
- 预览转换结果。

### Milestone 3：本地 Adapter

- 配置本地博客目录；
- 连接 Local Bridge；
- 写入 Markdown 和资源；
- 更新同步清单；
- 支持重复同步跳过。

### Milestone 4：GitHub Adapter

- 配置仓库、分支和 Token；
- 读取远程分支；
- 批量生成 Git tree 和 commit；
- 处理远程冲突；
- 返回 commit URL。

## 14. 第一版验收标准

完成以下测试后，第一版才算可用：

- 可以扫描指定笔记本；
- 可以批量选择文档；
- 一篇文档可以生成正确的 Markdown；
- 标题、日期、分类、标签和 draft 字段正确；
- 中文标题可以生成稳定 slug；
- 图片可以复制到博客资源目录；
- 同一篇文档重复同步不会生成重复文件；
- 内容未变化时不会重复写入；
- slug 冲突会阻止同步；
- 转换失败时不会写入半成品；
- 同步失败后可以重试；
- 不会因为思源删除文档而自动删除博客文件；
- 现有 Issue 文章不受影响。

## 15. 官方参考

- [思源笔记 API 文档](https://github.com/siyuan-note/siyuan/blob/master/docs/API.md)
- [思源笔记插件示例](https://github.com/siyuan-note/plugin-sample)
- [GitHub Repository Contents API](https://docs.github.com/en/rest/repos/contents)
- [GitHub Git Trees API](https://docs.github.com/en/rest/git/trees)
- [GitHub Git References API](https://docs.github.com/en/rest/git/refs)
