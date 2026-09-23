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

在插件设置或发布中心点击“选择博客项目目录”，从系统目录选择器中选中博客项目根目录。直接同步会把 Markdown 写入 `src/content/blog`，图片写入 `public/images/blog`，并更新仓库根目录下的 `.siyuan-sync.json`。

Windows 和 macOS 各自在自己的思源客户端中选择一次目录。目录授权保存在当前电脑的本机浏览器存储里，不会随思源配置同步；如果系统之后再次询问，请允许读写。插件不需要读取或保存绝对路径，也不需要启动 Bridge。

在发布中心扫描文档、检查 Markdown 后点击“同步到本地仓库”。之后请在博客项目自己的代码目录中，使用原有 Git 客户端或终端进行提交和推送。

当前运行环境不支持目录选择器时，可使用设置中的 Bridge 备用方式。Bridge 只需在存放博客仓库的电脑运行；按原方式配置 Windows 与 macOS 路径及访问令牌。

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

- 每台电脑都要单独选择该电脑上的博客项目根目录；如果两台机器的仓库目录不同，各自选择即可。
- 直接目录同步仅适用于思源前端所在电脑的本机目录。若在浏览器中连接远程思源，目录选择器写入的是浏览器所在电脑。
- Bridge 仅作为不支持目录授权时的备用方式；使用时仍只监听本机回环地址，不要把端口暴露到局域网或公网。
- 目标文件如果不是插件上次写入的版本，会提示冲突，不会静默覆盖。

## 参考

- [思源笔记 API](https://github.com/siyuan-note/siyuan/blob/master/docs/API.zh-CN.md)
- [思源插件开发规范](https://github.com/siyuan-note/plugin-sample)
