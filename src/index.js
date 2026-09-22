"use strict";

const { Plugin, Dialog, Setting, showMessage } = require("siyuan");
const {
    DEFAULT_CONFIG,
    normalizeConfig,
    shouldPublish,
    displayStatus,
} = require("../blog-core");
const { SiyuanApi } = require("../siyuan-api");
const { LocalAdapter } = require("../local-adapter");

const DATA_KEY = "config";

class BlogPublisherPlugin extends Plugin {
    constructor(...args) {
        super(...args);
        this.config = normalizeConfig(DEFAULT_CONFIG);
        this.api = new SiyuanApi();
        this.notebooks = [];
        this.setting = null;
    }

    async onload() {
        this.data = this.data || {};
        try {
            await this.loadData(DATA_KEY);
        } catch (error) {
            console.warn(`[${this.name}] 加载配置失败`, error);
        }
        this.config = normalizeConfig(this.data?.[DATA_KEY] || {});
        this.data[DATA_KEY] = this.config;
    }

    onLayoutReady() {
        this.addTopBar({
            icon: "iconUpload",
            title: "博客发布中心",
            position: "right",
            contextMenu: (menu) => {
                menu.addItem({
                    id: "siyuan-blog-publisher-settings",
                    icon: "iconSettings",
                    label: "插件设置",
                    click: () => this.openSetting(),
                });
            },
            callback: () => this.openPublisher(),
        });
        this.addCommand({
            langKey: "openPublisher",
            hotkey: "⌥⌘P",
            callback: () => this.openPublisher(),
        });
    }

    async saveConfig() {
        this.config = normalizeConfig(this.config);
        this.data[DATA_KEY] = this.config;
        await this.saveData(DATA_KEY, this.config);
    }

    async openSetting() {
        if (this.setting) {
            this.setting.open(this.displayName || "思源博客发布器");
            return;
        }
        try {
            this.notebooks = await this.api.listNotebooks();
        } catch (error) {
            console.warn("加载笔记本列表失败", error);
            this.notebooks = [];
        }

        const notebook = document.createElement("select");
        notebook.className = "b3-select fn__flex-1";
        this.renderNotebookOptions(notebook);
        const root = textField(this.config.localRoot, "例如：E:\\projects\\my-blog");
        const contentDir = textField(this.config.contentDir, "src/content/blog");
        const assetDir = textField(this.config.assetDir, "public/images/blog");
        const bridgeUrl = textField(this.config.bridgeUrl, "http://127.0.0.1:18765");
        const category = textField(this.config.defaultCategory, "例如：工程实践");
        const includeTitle = document.createElement("input");
        includeTitle.type = "checkbox";
        includeTitle.className = "b3-switch";
        includeTitle.checked = this.config.includeTitle;

        const checkButton = document.createElement("button");
        checkButton.className = "b3-button b3-button--outline";
        checkButton.textContent = "检查 Bridge";
        checkButton.addEventListener("click", async () => {
            checkButton.disabled = true;
            try {
                const result = await new LocalAdapter(bridgeUrl.value.trim()).health();
                showMessage(`Bridge 已连接（v${result.version || 1}）。`);
            } catch (error) {
                showMessage(`Bridge 连接失败：${error.message}`, 7000, "error");
            } finally {
                checkButton.disabled = false;
            }
        });

        this.setting = new Setting({
            confirmCallback: async () => {
                this.config = normalizeConfig({
                    ...this.config,
                    notebookId: notebook.value,
                    localRoot: root.value,
                    contentDir: contentDir.value,
                    assetDir: assetDir.value,
                    bridgeUrl: bridgeUrl.value,
                    defaultCategory: category.value,
                    includeTitle: includeTitle.checked,
                });
                try {
                    await this.saveConfig();
                    showMessage("博客发布设置已保存。");
                } catch (error) {
                    showMessage(`保存设置失败：${error.message}`, 7000, "error");
                }
            },
        });
        this.setting.addItem({
            title: "发布笔记本",
            description: "只扫描此笔记本下的文档；建议用 blog.status=published 或 pending 标记文章。",
            direction: "row",
            actionElement: notebook,
        });
        this.setting.addItem({
            title: "本地博客仓库路径",
            description: "填写本地 GitHub 仓库根目录，例如 my-blog 的本地路径。",
            direction: "row",
            actionElement: root,
        });
        this.setting.addItem({
            title: "博客内容目录",
            description: "相对于仓库根目录，默认写入 Astro 的 src/content/blog。",
            direction: "row",
            actionElement: contentDir,
        });
        this.setting.addItem({
            title: "博客资源目录",
            description: "相对于仓库根目录，默认写入 public/images/blog。",
            direction: "row",
            actionElement: assetDir,
        });
        this.setting.addItem({
            title: "本地 Bridge 地址",
            description: "先运行项目内的 local-bridge.js，再从这里检查连接。",
            direction: "row",
            actionElement: bridgeAction(bridgeUrl, checkButton),
        });
        this.setting.addItem({
            title: "默认分类",
            description: "文档没有 blog.category 属性时使用。",
            direction: "row",
            actionElement: category,
        });
        this.setting.addItem({
            title: "正文中保留一级标题",
            description: "默认关闭；Astro 页面通常会单独渲染文章标题。",
            direction: "row",
            actionElement: includeTitle,
        });
        this.setting.open(this.displayName || "思源博客发布器");
    }

    renderNotebookOptions(select) {
        select.innerHTML = "";
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = this.notebooks.length ? "请选择发布笔记本" : "暂时无法读取笔记本";
        select.appendChild(placeholder);
        for (const item of this.notebooks) {
            const option = document.createElement("option");
            option.value = item.id;
            option.textContent = `${item.name}${item.closed ? "（已关闭）" : ""}`;
            option.selected = item.id === this.config.notebookId;
            select.appendChild(option);
        }
    }

    openPublisher() {
        const dialog = new Dialog({
            title: "博客发布中心",
            width: "980px",
            height: "720px",
            content: publisherTemplate(),
        });
        const root = dialog.element.querySelector(".siyuan-blog-publisher");
        const list = root.querySelector("[data-role='list']");
        const message = root.querySelector("[data-role='message']");
        const target = root.querySelector("[data-role='target']");
        const localRootInput = root.querySelector("[data-role='local-root']");
        const scanButton = root.querySelector("[data-action='scan']");
        const selectAllButton = root.querySelector("[data-action='select-all']");
        const previewButton = root.querySelector("[data-action='preview']");
        const syncButton = root.querySelector("[data-action='sync']");
        const closeButton = root.querySelector("[data-action='close']");
        const state = { docs: [], selected: new Set(), manifest: {}, scanning: false };

        const setMessage = (text, isError = false) => {
            message.textContent = text;
            message.classList.toggle("siyuan-blog-publisher__message--error", isError);
        };

        localRootInput.value = this.config.localRoot || "";
        const updateTarget = () => {
            target.textContent = this.config.localRoot
                ? `目标：${this.config.localRoot} · ${this.config.contentDir}`
                : "尚未配置本地博客仓库路径";
        };
        updateTarget();
        localRootInput.addEventListener("change", async () => {
            this.config.localRoot = localRootInput.value.trim();
            updateTarget();
            try {
                await this.saveConfig();
                setMessage("上传路径已保存。");
            } catch (error) {
                setMessage(`保存上传路径失败：${error.message}`, true);
            }
        });

        const render = () => {
            if (!state.docs.length) {
                list.innerHTML = `<div class="siyuan-blog-publisher__empty">还没有扫描结果。请先选择发布笔记本并点击“扫描”。</div>`;
                return;
            }
            list.innerHTML = state.docs.map((item) => {
                const warning = item.plan.warnings?.length ? `<span class="siyuan-blog-publisher__warning" title="${escapeHtml(item.plan.warnings.join("\n"))}">⚠</span>` : "";
                return `<label class="siyuan-blog-publisher__row">
                    <span><input type="checkbox" data-doc-id="${escapeHtml(item.plan.sourceId)}" ${state.selected.has(item.plan.sourceId) ? "checked" : ""} ${shouldPublish(item.plan.status) ? "" : "disabled"}></span>
                    <span class="siyuan-blog-publisher__title">${escapeHtml(item.plan.title)} ${warning}</span>
                    <span class="siyuan-blog-publisher__path">${escapeHtml(item.plan.sourcePath)}</span>
                    <span><em class="siyuan-blog-publisher__status siyuan-blog-publisher__status--${statusClass(item.displayStatus)}">${escapeHtml(item.displayStatus)}</em></span>
                    <span class="siyuan-blog-publisher__path">${escapeHtml(item.plan.targetPath)}</span>
                </label>`;
            }).join("");
            list.querySelectorAll("input[data-doc-id]").forEach((input) => {
                input.addEventListener("change", () => {
                    if (input.checked) {
                        state.selected.add(input.dataset.docId);
                    } else {
                        state.selected.delete(input.dataset.docId);
                    }
                    updateButtons();
                });
            });
        };

        const updateButtons = () => {
            const hasSelection = state.selected.size > 0;
            previewButton.disabled = !hasSelection;
            syncButton.disabled = !hasSelection || state.scanning;
            selectAllButton.disabled = !state.docs.some((item) => shouldPublish(item.plan.status));
        };

        const readManifest = async () => {
            state.manifest = {};
            if (!this.config.localRoot) {
                return;
            }
            try {
                const result = await new LocalAdapter(this.config.bridgeUrl).status(this.config.localRoot);
                state.manifest = result.manifest || {};
            } catch (error) {
                setMessage(`Bridge 未连接，仍可预览；同步前请启动 Bridge。`, true);
            }
        };

        const scan = async () => {
            if (state.scanning) {
                return;
            }
            if (!this.config.notebookId) {
                setMessage("请先在插件设置中选择发布笔记本。", true);
                return;
            }
            state.scanning = true;
            state.selected.clear();
            updateButtons();
            scanButton.disabled = true;
            setMessage("正在扫描文档并生成转换预览……");
            try {
                await readManifest();
                const documents = await this.api.listDocuments(this.config.notebookId);
                state.docs = [];
                for (let index = 0; index < documents.length; index += 1) {
                    setMessage(`正在转换 ${index + 1}/${documents.length}……`);
                    const plan = await this.api.buildPlan(documents[index], this.config);
                    const entry = state.manifest.documents?.[plan.sourceId];
                    state.docs.push({
                        plan,
                        displayStatus: displayStatus(plan.status, entry, plan.sourceHash),
                    });
                }
                render();
                const publishable = state.docs.filter((item) => shouldPublish(item.plan.status)).length;
                setMessage(`扫描完成：${state.docs.length} 篇文档，其中 ${publishable} 篇可发布。`);
            } catch (error) {
                state.docs = [];
                render();
                setMessage(`扫描失败：${error.message}`, true);
            } finally {
                state.scanning = false;
                scanButton.disabled = false;
                updateButtons();
            }
        };

        const preview = () => {
            const item = state.docs.find((doc) => state.selected.has(doc.plan.sourceId));
            if (!item) {
                return;
            }
            const warnings = item.plan.warnings?.length
                ? `<div class="siyuan-blog-publisher__preview-warnings">${item.plan.warnings.map(escapeHtml).join("<br>")}</div>`
                : "";
            new Dialog({
                title: `预览：${item.plan.title}`,
                width: "900px",
                height: "680px",
                content: `<div class="siyuan-blog-publisher__preview">${warnings}<pre>${escapeHtml(item.plan.content)}</pre></div>`,
            });
        };

        const sync = async () => {
            if (!this.config.localRoot) {
                setMessage("请先在插件设置中填写本地博客仓库路径。", true);
                return;
            }
            const selected = state.docs.filter((item) => state.selected.has(item.plan.sourceId));
            if (!selected.length) {
                return;
            }
            state.scanning = true;
            updateButtons();
            setMessage(`正在读取资源并同步 ${selected.length} 篇文章……`);
            try {
                const plans = [];
                for (const item of selected) {
                    const plan = { ...item.plan, assets: [] };
                    for (const asset of item.plan.assets || []) {
                        const contentBase64 = await this.api.readAssetAsBase64(asset.sourcePath);
                        plan.assets.push({ ...asset, contentBase64 });
                    }
                    plans.push(plan);
                }
                const result = await new LocalAdapter(this.config.bridgeUrl).apply(
                    this.config.localRoot,
                    this.config.contentDir,
                    this.config.assetDir,
                    plans,
                );
                const summary = summarizeResults(result.results || []);
                showMessage(`同步完成：${summary}`);
                state.scanning = false;
                await scan();
            } catch (error) {
                setMessage(`同步失败：${error.message}`, true);
            } finally {
                state.scanning = false;
                updateButtons();
            }
        };

        scanButton.addEventListener("click", scan);
        selectAllButton.addEventListener("click", () => {
            state.docs.filter((item) => shouldPublish(item.plan.status)).forEach((item) => state.selected.add(item.plan.sourceId));
            render();
            updateButtons();
        });
        previewButton.addEventListener("click", preview);
        syncButton.addEventListener("click", sync);
        closeButton.addEventListener("click", () => dialog.destroy());
        render();
        updateButtons();
        scan();
    }
}

function textField(value, placeholder) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "b3-text-field fn__block";
    input.value = value || "";
    input.placeholder = placeholder || "";
    return input;
}

function bridgeAction(input, button) {
    const wrapper = document.createElement("div");
    wrapper.className = "siyuan-blog-publisher__setting-action";
    wrapper.append(input, button);
    return wrapper;
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function statusClass(status) {
    return String(status || "pending").replace(/[^a-z0-9\u4e00-\u9fff-]/gi, "-");
}

function summarizeResults(results) {
    const counts = results.reduce((all, item) => {
        const key = item.action === "skip" ? "跳过" : item.action === "create" ? "新增" : item.action === "update" ? "更新" : "冲突";
        all[key] = (all[key] || 0) + 1;
        return all;
    }, {});
    return Object.entries(counts).map(([key, value]) => `${key} ${value}`).join("，") || "没有文件变化";
}

function publisherTemplate() {
    return `<div class="siyuan-blog-publisher fn__flex fn__flex-column">
        <div class="siyuan-blog-publisher__toolbar">
            <button class="b3-button b3-button--outline" data-action="scan">扫描</button>
            <button class="b3-button b3-button--outline" data-action="select-all">全选待发布</button>
            <button class="b3-button b3-button--outline" data-action="preview">预览 Markdown</button>
            <span class="fn__flex-1"></span>
            <button class="b3-button b3-button--primary" data-action="sync">同步到本地仓库</button>
        </div>
        <div class="siyuan-blog-publisher__target">
            <label>上传路径</label>
            <input class="b3-text-field" data-role="local-root" placeholder="例如：E:\\projects\\my-blog">
            <span data-role="target"></span>
        </div>
        <div class="siyuan-blog-publisher__header">
            <span></span><span>文档标题</span><span>思源路径</span><span>状态</span><span>目标文件</span>
        </div>
        <div class="siyuan-blog-publisher__list fn__flex-1" data-role="list"></div>
        <div class="siyuan-blog-publisher__footer">
            <span class="siyuan-blog-publisher__message" data-role="message">准备扫描。</span>
            <button class="b3-button" data-action="close">关闭</button>
        </div>
    </div>`;
}

module.exports = BlogPublisherPlugin;

