[English](README.md)

# 思源博客发布器

将思源笔记中选定笔记本的文档转换为 Astro 博客 Markdown，并同步到本地博客项目目录。插件不创建 Git 提交，也不推送远端；文件同步完成后，请在博客项目自己的代码目录中按原有 Git 流程提交和推送。

## 功能

- 选择笔记本并扫描其中的文档。
- 读取思源自定义属性中的发布状态、分类、标签、slug、发布日期和描述。
- 维护分类清单，支持逐篇或批量设置分类。
- 生成 Astro Content Collection frontmatter 和稳定 slug。
- 将 `/assets/...` 资源复制到配置的公开资源目录，并重写 Markdown 链接。
- 预览 Markdown、显示转换警告、批量选择并同步到本地。
- 维护 `.siyuan-sync.json`；内容未变化时跳过，检测到目标文件被手动修改时提示冲突。
- 首次同步日期作为 `pubDate`；文档之后有内容改动时写入 `updatedDate`。
- 思源文档改名后仍更新原有目标文件。
- 思源文档删除后不会自动删除博客文件。

## 本地设置

在存放博客项目的电脑上启动 Bridge：

```sh
node local-bridge.js
```

首次启动会生成并显示访问令牌。将它填入插件设置中的“Bridge 访问令牌”。令牌保存在 `~/.siyuan-blog-publisher/bridge-token`（Windows：`%USERPROFILE%\.siyuan-blog-publisher\bridge-token`）；Bridge 只监听 `http://127.0.0.1:18765`。

插件设置中分别填写 **Windows 博客项目路径**和 **macOS 博客项目路径**。扫描或同步时，插件会读取 Bridge 所在电脑的系统类型并自动选用对应路径。例如 Windows 填 `D:\Code\personal\my-blog`，macOS 填 `~/Code/personal/my-blog`。思源、Bridge 和当前使用的博客项目目录必须在同一台电脑上可访问。

在发布中心扫描文档、检查 Markdown 后点击“同步到本地仓库”。之后请在博客项目自己的代码目录中，使用原有 Git 客户端或终端进行提交和推送。

更新到 0.2.1 后，请停止旧 Bridge 进程，再运行 `node local-bridge.js` 启动新版本。设置页的“检查 Bridge”会同时验证版本、系统类型和访问令牌。

## 文档属性

```text
blog.status      = pending | published | draft | archived
custom-blog-category = 工程实践
blog.tags        = AI, Debian, Linux
blog.slug        = redis-cache-penetration
blog.pubDate     = 2026-09-22
blog.description = 从现象、定位到修复缓存击穿问题。
```

没有设置分类时，插件会使用导出 Markdown 中已有的分类，再回退到设置页的默认分类。`draft` 和 `archived` 不会被选中同步。

## 开发与构建

源码在 `src/index.js`，思源实际加载根目录下的 `index.js`。运行 `npm run build` 会重新生成入口文件和思源插件发布包 `package.zip`：

```sh
npm install
npm run build
npm run check
```

## 注意事项

- Bridge 只绑定本机回环地址并要求随机令牌；不要把端口暴露到局域网或公网，也不要分享令牌。
- Windows 与 macOS 路径必须分别填写各自电脑上的博客项目根目录，而不是 `src/content/blog` 子目录。
- 目前自动选路支持 Windows 和 macOS；如果 Bridge 在 Linux 上运行，插件会提示暂不支持。
- 目标文件如果不是插件上次写入的版本，会提示冲突，不会静默覆盖。
- Bridge 连接失败时，先确认它运行在当前电脑、地址端口为 `http://127.0.0.1:18765`，并且插件中填写了正确令牌。

## 参考

- [思源笔记 API](https://github.com/siyuan-note/siyuan/blob/master/docs/API.zh-CN.md)
- [思源插件开发规范](https://github.com/siyuan-note/plugin-sample)
