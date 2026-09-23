# 思源博客发布器插件开发文档

> 文档状态：实现说明 v0.3.0
>
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

插件通过用户授权的本机目录句柄将选中的文档和资源写入博客项目目录。Windows 与 macOS 分别在各自电脑上选择一次目录；授权保存在本机 IndexedDB，不写入会随思源同步的插件配置。插件不执行 Git 提交或远端推送；同步后的文件由用户在博客项目代码目录中按既有流程提交。

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

- 插件不绑定博客仓库的托管平台；
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
   ├─ DirectorySyncAdapter：经目录授权直接写入选定的博客项目目录
   │  └─ 更新 .siyuan-sync.json 并返回同步结果
   └─ LocalAdapter：仅在目录选择器不可用时，经本机 Bridge 备用写入
```

核心转换逻辑与文件写入解耦。标准桌面流程使用浏览器 File System Access API；不支持目录选择器时仍可使用原 Bridge 备用实现。

## 4. 当前版本范围

### Windows 与 macOS 本地同步

当前版本支持：

- 配置发布笔记本并扫描其中的文档；
- 导出为 Markdown，生成 Astro frontmatter 和稳定 slug；
- 转换图片和附件路径并复制资源；
- 维护分类清单，并逐篇或批量设置分类；
- 预览转换结果、警告和目标路径；
- 经目录授权直接写入博客项目目录并更新同步清单；
- 根据首次同步日期生成 `pubDate`，后续内容变化时更新 `updatedDate`；
- 通过同步清单识别同一思源文档，改名后继续更新原有文件；
- 检测目标文件冲突，避免覆盖用户手动改动的内容。

目录句柄按当前系统分别保存在本机：Windows 使用 Windows 目录句柄，macOS 使用 macOS 目录句柄。插件只负责本地文件同步，不调用 Git，不创建提交，也不访问 GitHub。需要提交和推送时，请在博客项目的代码目录中使用现有 Git 工作流。

暂不支持：

- Bridge 备用方式下的 Linux 自动路径选择；
- 自动删除博客文件；
- 后台监听每次编辑并立即同步；
- 在插件内创建 Git 提交或推送远端。

## 5. 本地目录访问

思源插件运行在前端环境中，不能直接调用 Node.js 的 `fs` 写入任意电脑目录。思源内核文件 API 的写入范围是思源工作区，无法直接覆盖用户工作区之外的博客仓库。标准流程改用浏览器目录授权 API，让用户通过系统目录选择器显式选择仓库根目录。

### 直接目录授权

插件在设置或发布中心提供“选择博客项目目录”按钮。用户在每台电脑首次使用时选一次仓库根目录，插件把返回的目录句柄存入当前电脑的 IndexedDB。句柄不会保存到 `saveData` 插件配置中，因此 Windows 与 macOS 可以各自指向该机的仓库位置。

直接目录同步负责读取同步清单、检查目标文件和资源 hash、检测冲突、写入 Markdown 与资源，并在最后更新 `.siyuan-sync.json`。写入中途出错时，会尝试用先前内容回滚已写文件。

目录授权需要运行环境在安全上下文中支持 `showDirectoryPicker()` 和 IndexedDB。权限被撤销或运行环境要求重新确认时，插件会在扫描或同步时请求授权。直接目录同步操作的是思源前端所在电脑；浏览器连接远程思源时，目录选择器对应浏览器所在电脑。

### Bridge 备用方式

目录选择器不可用时，可以沿用原 Bridge。Bridge 是一个本机运行的 Node.js 程序，只监听回环地址；此时需配置 Windows/macOS 路径和访问令牌并启动 Bridge。

插件前端不直接依赖 `fs`、`child_process` 或 Electron 私有 API。

## 6. 用户操作流程

### 6.1 初次配置

设置页面包含：

- 发布笔记本；
- 当前电脑的博客项目根目录（Windows 和 macOS 分别选择一次）；
- 博客内容目录，默认 `src/content/blog`；
- 博客资源目录，默认 `public/images/blog`；
- 是否保留文档标题作为正文一级标题；
- 默认分类；
- 分类清单与默认分类；
- 可选的 Bridge 备用地址、访问令牌和 Windows/macOS 路径。

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
| `published` | 已经成功写入博客项目目录 |
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
| `blog.pubDate` 或首次同步日 | `pubDate` |
| 后续内容变化后的同步日期 | `updatedDate`（首次同步时省略） |
| `blog.category` | `category` |
| `blog.tags` 或思源导出元数据 `tags` | `tags` |
| `blog.status` | `draft` |
| 思源文档 ID | `siyuanId` |
| 转换后内容 hash | `sourceHash` |

### 7.3 正文标题

思源 Markdown 导出可能自带 YAML frontmatter；同步器会提取其中的标签和分类，并从正文移除整段源 frontmatter，避免它作为普通文本显示。默认也会移除与文档标题相同的首个一级标题，因为 Astro 页面通常已经单独渲染标题。

插件设置中可以提供：

```text
[ ] 将文档标题写入正文一级标题
```

默认关闭。

### 7.4 分类

插件设置使用逐项编辑的分类清单，可添加或删除分类；发布中心为每篇文章提供单选分类，并支持对勾选文章批量应用。选择立即写回思源文档的 `custom-blog-category` 属性，确保后续扫描仍使用相同分类。分类清单应与目标博客保持一致；“未分类”作为系统回退项，不要求加入清单。

### 7.5 图片和附件

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

### 8.4 本地文件冲突校验

本地同步清单记录上次同步的目标路径和内容 hash。再次同步前，目录适配器或备用 Bridge 会检查目标文件是否仍与上次同步版本一致；如果用户在博客项目中手动修改了文件，插件会报告冲突并停止写入。当前版本不检查 Git 分支或远端状态。

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
      "pubDate": "2026-09-22",
      "sourceHash": "sha256:...",
      "lastSyncAt": "2026-09-22T10:00:00.000Z"
    }
  }
}
```

同步清单只由插件维护，用户手动修改时需要提示风险。

## 10. SyncPlan 数据结构

转换器不直接写磁盘，而是输出统一的同步计划：

```ts
interface SyncPlan {
  sourceId: string;
  sourcePath: string;
  title: string;
  pubDate: string;
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

## 11. 本地同步与代码提交的边界

同步计划通过当前电脑已授权的目录句柄写入博客项目目录：

```text
插件读取当前系统对应的本机目录句柄
  ↓
检查同步清单、目标文件和资源的 hash
  ↓
写入 Markdown、资源及 .siyuan-sync.json
  ↓
用户在博客项目代码目录中按既有流程提交和推送
```

直接目录适配器不使用 Bridge HTTP 服务，也不执行 Git 命令。Bridge 备用方式仍提供 `/auth`、`/status`、`/preview` 和 `/sync` 接口，不接收 GitHub 地址或令牌。

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

### 当前版本：跨平台本地同步

- Windows 与 macOS 分别通过目录选择器授权本机博客项目根目录；
- 目录句柄保存在本机 IndexedDB，不跨设备同步；
- 目录选择器不可用时可以使用本机 Bridge 备用方式；
- 不在插件中调用 Git 或 GitHub；
- 由用户在博客项目的代码目录中自行提交和推送。

## 14. 同步验收标准

以下标准用于检查当前同步流程：

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
