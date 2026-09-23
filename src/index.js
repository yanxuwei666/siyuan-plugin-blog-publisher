"use strict";

const { Plugin, Dialog, Setting, showMessage } = require("siyuan");
const {
    DEFAULT_CONFIG,
    normalizeConfig,
    shouldPublish,
    displayStatus,
    sha256Text,
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
        this.activeControllers = new Set();
        this.activeDialogs = new Set();
        this.unloaded = false;
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
            title: this.t("publisherTitle"),
            position: "right",
            contextMenu: (menu) => {
                menu.addItem({
                    id: "siyuan-blog-publisher-settings",
                    icon: "iconSettings",
                    label: this.t("settings"),
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

    onunload() {
        this.unloaded = true;
        for (const controller of this.activeControllers) {
            controller.abort();
        }
        this.activeControllers.clear();
        for (const dialog of this.activeDialogs) {
            try {
                dialog.destroy();
            } catch (error) {
                console.warn(`[${this.name}] 关闭发布窗口失败`, error);
            }
        }
        this.activeDialogs.clear();
    }

    t(key, values = {}) {
        let message = this.i18n?.[key] || key;
        for (const [name, value] of Object.entries(values)) {
            message = message.split(`{${name}}`).join(String(value));
        }
        return message;
    }

    async saveConfig() {
        this.config = normalizeConfig(this.config);
        this.data[DATA_KEY] = this.config;
        await this.saveData(DATA_KEY, this.config);
    }

    async openSetting() {
        if (this.setting) {
            this.setting.open(this.displayName || this.t("pluginName"));
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
        const windowsRoot = textField(this.config.localRootWindows, "D:\\Code\\personal\\my-blog");
        const macRoot = textField(this.config.localRootMac, "~/Code/personal/my-blog");
        const contentDir = textField(this.config.contentDir, "src/content/blog");
        const assetDir = textField(this.config.assetDir, "public/images/blog");
        const bridgeUrl = textField(this.config.bridgeUrl, "http://127.0.0.1:18765");
        const bridgeToken = textField(this.config.bridgeToken, this.t("bridgeTokenPlaceholder"));
        bridgeToken.type = "password";
        bridgeToken.autocomplete = "new-password";
        const category = textField(this.config.defaultCategory, this.t("defaultCategoryPlaceholder"));
        const categories = document.createElement("div");
        categories.className = "siyuan-blog-publisher__category-editor";
        const categoryRows = document.createElement("div");
        categoryRows.className = "siyuan-blog-publisher__category-rows";
        const categoryActions = document.createElement("div");
        categoryActions.className = "siyuan-blog-publisher__category-actions";
        const addCategoryButton = document.createElement("button");
        addCategoryButton.type = "button";
        addCategoryButton.className = "b3-button b3-button--outline";
        addCategoryButton.textContent = this.t("addCategory");
        categoryActions.appendChild(addCategoryButton);
        categories.append(categoryRows, categoryActions);
        const addCategoryRow = (value = "") => {
            const row = document.createElement("div");
            row.className = "siyuan-blog-publisher__category-row";
            const input = textField(value, this.t("categoryNamePlaceholder"));
            const removeButton = document.createElement("button");
            removeButton.type = "button";
            removeButton.className = "b3-button b3-button--outline";
            removeButton.textContent = this.t("delete");
            removeButton.title = this.t("deleteCategory");
            removeButton.addEventListener("click", () => row.remove());
            row.append(input, removeButton);
            categoryRows.appendChild(row);
            if (!value) input.focus();
        };
        this.config.categories.forEach((item) => addCategoryRow(item));
        addCategoryButton.addEventListener("click", () => addCategoryRow());
        const includeTitle = document.createElement("input");
        includeTitle.type = "checkbox";
        includeTitle.className = "b3-switch";
        includeTitle.checked = this.config.includeTitle;

        const checkButton = document.createElement("button");
        checkButton.className = "b3-button b3-button--outline";
        checkButton.textContent = this.t("checkBridge");
        checkButton.addEventListener("click", async () => {
            checkButton.disabled = true;
            try {
                const adapter = new LocalAdapter(bridgeUrl.value.trim(), bridgeToken.value.trim());
                const result = await adapter.health();
                if (!Number.isFinite(Number(result.version)) || Number(result.version) < 3 || !result.platform) {
                    throw new Error(this.t("bridgeNeedsRestart"));
                }
                await adapter.authenticate();
                showMessage(this.t("bridgeConnected", {
                    version: result.version,
                    platform: platformLabel(result.platform, (key) => this.t(key)),
                }));
            } catch (error) {
                showMessage(this.t("bridgeFailed", { error: error.message }), 7000, "error");
            } finally {
                checkButton.disabled = false;
            }
        });

        this.setting = new Setting({
            confirmCallback: async () => {
                this.config = normalizeConfig({
                    ...this.config,
                    notebookId: notebook.value,
                    localRootWindows: windowsRoot.value,
                    localRootMac: macRoot.value,
                    contentDir: contentDir.value,
                    assetDir: assetDir.value,
                    bridgeUrl: bridgeUrl.value,
                    bridgeToken: bridgeToken.value,
                    defaultCategory: category.value,
                    categories: Array.from(categoryRows.querySelectorAll("input"), (input) => input.value),
                    includeTitle: includeTitle.checked,
                });
                try {
                    await this.saveConfig();
                    showMessage(this.t("settingsSaved"));
                } catch (error) {
                    showMessage(this.t("settingsSaveFailed", { error: error.message }), 7000, "error");
                }
            },
        });
        this.setting.addItem({
            title: this.t("settingNotebookTitle"),
            description: this.t("settingNotebookDescription"),
            direction: "row",
            actionElement: notebook,
        });
        this.setting.addItem({
            title: this.t("settingWindowsPathTitle"),
            description: this.t("settingWindowsPathDescription"),
            direction: "row",
            actionElement: windowsRoot,
        });
        this.setting.addItem({
            title: this.t("settingMacPathTitle"),
            description: this.t("settingMacPathDescription"),
            direction: "row",
            actionElement: macRoot,
        });
        this.setting.addItem({
            title: this.t("settingContentDirTitle"),
            description: this.t("settingContentDirDescription"),
            direction: "row",
            actionElement: contentDir,
        });
        this.setting.addItem({
            title: this.t("settingAssetDirTitle"),
            description: this.t("settingAssetDirDescription"),
            direction: "row",
            actionElement: assetDir,
        });
        this.setting.addItem({
            title: this.t("settingBridgeUrlTitle"),
            description: this.t("settingBridgeUrlDescription"),
            direction: "row",
            actionElement: bridgeAction(bridgeUrl, checkButton),
        });
        this.setting.addItem({
            title: this.t("settingBridgeTokenTitle"),
            description: this.t("settingBridgeTokenDescription"),
            direction: "row",
            actionElement: bridgeToken,
        });
        this.setting.addItem({
            title: this.t("settingDefaultCategoryTitle"),
            description: this.t("settingDefaultCategoryDescription"),
            direction: "row",
            actionElement: category,
        });
        this.setting.addItem({
            title: this.t("settingCategoriesTitle"),
            description: this.t("settingCategoriesDescription"),
            direction: "row",
            actionElement: categories,
        });
        this.setting.addItem({
            title: this.t("settingIncludeTitleTitle"),
            description: this.t("settingIncludeTitleDescription"),
            direction: "row",
            actionElement: includeTitle,
        });
        this.setting.open(this.displayName || this.t("pluginName"));
    }

    renderNotebookOptions(select) {
        select.innerHTML = "";
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = this.notebooks.length ? this.t("selectNotebook") : this.t("notebookUnavailable");
        select.appendChild(placeholder);
        for (const item of this.notebooks) {
            const option = document.createElement("option");
            option.value = item.id;
            option.textContent = `${item.name}${item.closed ? this.t("notebookClosed") : ""}`;
            option.selected = item.id === this.config.notebookId;
            select.appendChild(option);
        }
    }

    openPublisher() {
        const dialog = new Dialog({
            title: this.t("publisherTitle"),
            width: "980px",
            height: "720px",
            content: publisherTemplate((key) => this.t(key)),
        });
        this.activeDialogs.add(dialog);
        const controller = new AbortController();
        this.activeControllers.add(controller);
        const root = dialog.element.querySelector(".siyuan-blog-publisher");
        const list = root.querySelector("[data-role='list']");
        const message = root.querySelector("[data-role='message']");
        const target = root.querySelector("[data-role='target']");
        const scanButton = root.querySelector("[data-action='scan']");
        const selectAllButton = root.querySelector("[data-action='select-all']");
        const previewButton = root.querySelector("[data-action='preview']");
        const syncButton = root.querySelector("[data-action='sync']");
        const closeButton = root.querySelector("[data-action='close']");
        const bulkCategory = root.querySelector("[data-role='bulk-category']");
        const applyBulkCategoryButton = root.querySelector("[data-action='apply-category']");
        const state = {
            docs: [],
            selected: new Set(),
            manifest: {},
            bridgeError: "",
            bridgePlatform: "",
            activeLocalRoot: "",
            scanning: false,
        };

        const setMessage = (text, isError = false, details = "") => {
            message.textContent = text;
            message.title = isError ? details || text : "";
            message.classList.toggle("siyuan-blog-publisher__message--error", isError);
        };

        const updateTarget = () => {
            const key = localPathConfigKey(state.bridgePlatform);
            const configuredPath = key ? this.config[key] || this.config.legacyLocalRoot : "";
            const localTarget = state.bridgePlatform
                ? `${platformLabel(state.bridgePlatform, (name) => this.t(name))}: ${configuredPath || this.t("platformPathNotConfigured")} · ${this.config.contentDir}`
                : this.t("detectingBridgePlatform");
            target.textContent = this.t("targetSummaryLocal", { local: localTarget });
        };
        updateTarget();
        const resolveActiveLocalRoot = async (adapter) => {
            const health = await adapter.health(controller.signal);
            if (!Number.isFinite(Number(health.version)) || Number(health.version) < 3 || !health.platform) {
                throw new Error(this.t("bridgeNeedsRestart"));
            }
            await adapter.authenticate(controller.signal);
            const configKey = localPathConfigKey(health.platform);
            state.bridgePlatform = health.platform;
            if (!configKey) {
                updateTarget();
                throw new Error(this.t("unsupportedBridgePlatform", { platform: health.platform }));
            }
            if (!this.config[configKey] && this.config.legacyLocalRoot) {
                this.config[configKey] = this.config.legacyLocalRoot;
                this.config.legacyLocalRoot = "";
                await this.saveConfig();
            }
            state.activeLocalRoot = this.config[configKey] || "";
            updateTarget();
            if (!state.activeLocalRoot) {
                throw new Error(this.t("configurePlatformPath", {
                    platform: platformLabel(health.platform, (key) => this.t(key)),
                }));
            }
            return { platform: health.platform, localRoot: state.activeLocalRoot };
        };
        const getCategoryChoices = (current = "") => {
            const choices = [this.t("uncategorized"), ...this.config.categories];
            if (this.config.defaultCategory && !choices.includes(this.config.defaultCategory)) {
                choices.push(this.config.defaultCategory);
            }
            if (current && !choices.includes(current)) {
                choices.push(current);
            }
            return choices.filter((item, index) => choices.indexOf(item) === index);
        };
        const categoryOptions = (current = "") => getCategoryChoices(current)
            .map((item) => `<option value="${escapeHtml(item)}" ${item === current ? "selected" : ""}>${escapeHtml(item)}</option>`)
            .join("");
        bulkCategory.innerHTML = `<option value="">${escapeHtml(this.t("bulkCategoryPlaceholder"))}</option>${categoryOptions()}`;

        const render = () => {
            if (!state.docs.length) {
                list.innerHTML = `<div class="siyuan-blog-publisher__empty">${escapeHtml(this.t("emptyScan"))}</div>`;
                return;
            }
            list.innerHTML = state.docs.map((item) => {
                const warning = item.plan.warnings?.length ? `<span class="siyuan-blog-publisher__warning" title="${escapeHtml(item.plan.warnings.join("\n"))}">⚠</span>` : "";
                const currentCategory = item.plan.category || this.config.defaultCategory || this.t("uncategorized");
                return `<div class="siyuan-blog-publisher__row">
                    <span><input type="checkbox" data-doc-id="${escapeHtml(item.plan.sourceId)}" ${state.selected.has(item.plan.sourceId) ? "checked" : ""} ${shouldPublish(item.plan.status) ? "" : "disabled"}></span>
                    <span class="siyuan-blog-publisher__title">${escapeHtml(item.plan.title)} ${warning}</span>
                    <span class="siyuan-blog-publisher__path">${escapeHtml(item.plan.sourcePath)}</span>
                    <span><em class="siyuan-blog-publisher__status siyuan-blog-publisher__status--${statusClass(item.displayStatus)}">${escapeHtml(item.displayStatus)}</em></span>
                    <span><select class="b3-select siyuan-blog-publisher__category" data-category-id="${escapeHtml(item.plan.sourceId)}" title="${escapeHtml(this.t("categorySelectTitle"))}" ${state.scanning ? "disabled" : ""}>${categoryOptions(currentCategory)}</select></span>
                    <span class="siyuan-blog-publisher__path">${escapeHtml(item.plan.targetPath)}</span>
                </div>`;
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
            list.querySelectorAll("select[data-category-id]").forEach((select) => {
                select.addEventListener("change", () => {
                    const item = state.docs.find((doc) => doc.plan.sourceId === select.dataset.categoryId);
                    if (item) updateDocumentCategory(item, select.value);
                });
            });
        };

        const updateButtons = () => {
            const hasSelection = state.selected.size > 0;
            previewButton.disabled = !hasSelection;
            const hasLocalPath = Boolean(this.config.localRootWindows || this.config.localRootMac || this.config.legacyLocalRoot);
            syncButton.disabled = !hasSelection || !hasLocalPath || state.scanning;
            selectAllButton.disabled = !state.docs.some((item) => shouldPublish(item.plan.status));
            bulkCategory.disabled = !hasSelection || state.scanning;
            applyBulkCategoryButton.disabled = !hasSelection || !bulkCategory.value || state.scanning;
        };

        const updateDocumentCategory = async (item, category) => {
            if (state.scanning) return;
            state.scanning = true;
            updateButtons();
            setMessage(this.t("savingDocumentCategory", { title: item.plan.title }));
            try {
                await this.api.setBlockAttrs(item.plan.sourceId, { "custom-blog-category": category });
                item.plan = await this.api.buildPlan(
                    item.sourceDocument,
                    this.config,
                    state.manifest.documents?.[item.plan.sourceId],
                );
                item.displayStatus = displayStatus(
                    item.plan.status,
                    state.manifest.documents?.[item.plan.sourceId],
                    item.plan.sourceHash,
                );
                setMessage(this.t("documentCategorySaved", { title: item.plan.title, category }));
            } catch (error) {
                setMessage(this.t("documentCategorySaveFailed", { error: error.message }), true);
            } finally {
                state.scanning = false;
                render();
                updateButtons();
            }
        };

        const updateSelectedCategories = async () => {
            const category = bulkCategory.value;
            const selected = state.docs.filter((item) => state.selected.has(item.plan.sourceId));
            if (!category || !selected.length || state.scanning) return;
            state.scanning = true;
            updateButtons();
            let saved = 0;
            setMessage(this.t("savingBulkCategory", { count: selected.length }));
            try {
                for (const item of selected) {
                    await this.api.setBlockAttrs(item.plan.sourceId, { "custom-blog-category": category });
                    saved += 1;
                    item.plan = await this.api.buildPlan(
                        item.sourceDocument,
                        this.config,
                        state.manifest.documents?.[item.plan.sourceId],
                    );
                    item.displayStatus = displayStatus(
                        item.plan.status,
                        state.manifest.documents?.[item.plan.sourceId],
                        item.plan.sourceHash,
                    );
                }
                setMessage(this.t("bulkCategorySaved", { count: saved, category }));
            } catch (error) {
                setMessage(this.t("bulkCategorySaveFailed", { saved, total: selected.length, error: error.message }), true);
            } finally {
                state.scanning = false;
                render();
                updateButtons();
            }
        };

        const readManifest = async () => {
            state.manifest = {};
            state.bridgePlatform = "";
            state.activeLocalRoot = "";
            updateTarget();
            try {
                const adapter = new LocalAdapter(this.config.bridgeUrl, this.config.bridgeToken);
                const targetInfo = await resolveActiveLocalRoot(adapter);
                const result = await adapter.status(targetInfo.localRoot, controller.signal);
                state.manifest = result.manifest || {};
                state.bridgeError = "";
            } catch (error) {
                state.bridgeError = error.message;
            }
        };

        const scan = async () => {
            if (state.scanning) {
                return;
            }
            if (!this.config.notebookId) {
                setMessage(this.t("selectNotebookFirst"), true);
                return;
            }
            state.scanning = true;
            state.selected.clear();
            updateButtons();
            scanButton.disabled = true;
            setMessage(this.t("scanningDocuments"));
            try {
                await readManifest();
                const documents = await this.api.listDocuments(this.config.notebookId, controller.signal);
                const scanned = new Array(documents.length);
                let nextIndex = 0;
                let completed = 0;
                const scanWorker = async () => {
                    while (!controller.signal.aborted) {
                        const index = nextIndex;
                        nextIndex += 1;
                        if (index >= documents.length) return;
                        const document = documents[index];
                        const entry = state.manifest.documents?.[document.id];
                        const plan = await this.api.buildPlan(document, this.config, entry, controller.signal);
                        if (controller.signal.aborted) return;
                        scanned[index] = {
                            plan,
                            sourceDocument: document,
                            displayStatus: displayStatus(plan.status, entry, plan.sourceHash),
                        };
                        completed += 1;
                        if (completed % 10 === 0 || completed === documents.length) {
                            setMessage(this.t("convertingProgress", { completed, total: documents.length }));
                        }
                    }
                };
                await Promise.all(Array.from({ length: Math.min(4, documents.length) }, scanWorker));
                if (controller.signal.aborted || this.unloaded) return;
                state.docs = scanned.filter(Boolean);
                render();
                const publishable = state.docs.filter((item) => shouldPublish(item.plan.status)).length;
                const bridgeHint = state.bridgeError
                    ? this.t("bridgeUnavailableHint")
                    : "";
                setMessage(
                    this.t("scanCompleted", { documents: state.docs.length, publishable, bridgeHint }),
                    Boolean(state.bridgeError),
                    state.bridgeError,
                );
            } catch (error) {
                if (controller.signal.aborted || error?.name === "AbortError") return;
                state.docs = [];
                render();
                setMessage(this.t("scanFailed", { error: error.message }), true);
            } finally {
                state.scanning = false;
                if (!controller.signal.aborted && !this.unloaded) {
                    scanButton.disabled = false;
                    render();
                    updateButtons();
                }
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
                title: this.t("previewTitle", { title: item.plan.title }),
                width: "900px",
                height: "680px",
                content: `<div class="siyuan-blog-publisher__preview">${warnings}<pre>${escapeHtml(item.plan.content)}</pre></div>`,
            });
        };

        const sync = async () => {
            if (!this.config.localRootWindows && !this.config.localRootMac && !this.config.legacyLocalRoot) {
                setMessage(this.t("configurePlatformPathsFirst"), true);
                return;
            }
            const selected = state.docs.filter((item) => state.selected.has(item.plan.sourceId));
            if (!selected.length) {
                return;
            }
            state.scanning = true;
            updateButtons();
            setMessage(this.t("syncingDocuments", { count: selected.length }));
            try {
                const adapter = new LocalAdapter(this.config.bridgeUrl, this.config.bridgeToken);
                const targetInfo = await resolveActiveLocalRoot(adapter);
                const status = await adapter.status(targetInfo.localRoot, controller.signal);
                state.manifest = status.manifest || {};
                const plans = [];
                const pushDate = formatLocalDate(new Date());
                for (const item of selected) {
                    const plan = await stampSyncDates(item.plan, pushDate, (key, values) => this.t(key, values));
                    plan.assets = [];
                    for (const asset of item.plan.assets || []) {
                        const contentBase64 = await this.api.readAssetAsBase64(asset.sourcePath, controller.signal);
                        plan.assets.push({ ...asset, contentBase64 });
                    }
                    plans.push(plan);
                }
                const result = await adapter.apply(
                    targetInfo.localRoot,
                    this.config.contentDir,
                    this.config.assetDir,
                    plans,
                    controller.signal,
                );
                if (controller.signal.aborted || this.unloaded) return;
                const summary = summarizeResults(result.results || [], (key) => this.t(key));
                showMessage(this.t("syncCompleted", { summary }));
                state.scanning = false;
                await scan();
            } catch (error) {
                if (!controller.signal.aborted && !this.unloaded) {
                    setMessage(this.t("syncFailed", { error: error.message }), true);
                }
            } finally {
                state.scanning = false;
                if (!controller.signal.aborted && !this.unloaded) updateButtons();
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
        bulkCategory.addEventListener("change", updateButtons);
        applyBulkCategoryButton.addEventListener("click", updateSelectedCategories);
        closeButton.addEventListener("click", () => {
            controller.abort();
            this.activeControllers.delete(controller);
            this.activeDialogs.delete(dialog);
            dialog.destroy();
        });
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

function formatLocalDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function localPathConfigKey(platform) {
    if (platform === "win32") return "localRootWindows";
    if (platform === "darwin") return "localRootMac";
    return "";
}

function platformLabel(platform, t = (key) => key) {
    if (platform === "win32") return t("platformWindows");
    if (platform === "darwin") return t("platformMac");
    return platform || t("platformUnknown");
}

async function stampSyncDates(plan, date, t = (key) => key) {
    let content = String(plan.content || "");
    if (!/^pubDate: .*$/m.test(content)) {
        throw new Error(t("missingPublicationDate", { title: plan.title }));
    }
    const pubDate = plan.pinPubDateOnSync ? date : plan.pubDate;
    const lines = content.split("\n");
    const pubDateIndex = lines.findIndex((line) => line.startsWith("pubDate: "));
    const updatedDateIndex = lines.findIndex((line) => line.startsWith("updatedDate: "));
    lines[pubDateIndex] = `pubDate: ${pubDate}`;
    let updatedDate = "";
    if (plan.firstPush) {
        if (updatedDateIndex >= 0) lines.splice(updatedDateIndex, 1);
    } else {
        updatedDate = date;
        if (updatedDateIndex >= 0) {
            lines[updatedDateIndex] = `updatedDate: ${updatedDate}`;
        } else {
            lines.splice(pubDateIndex + 1, 0, `updatedDate: ${updatedDate}`);
        }
    }
    content = lines.join("\n");
    return {
        ...plan,
        pubDate,
        updatedDate,
        content,
        contentHash: await sha256Text(content),
    };
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

function summarizeResults(results, t = (key) => key) {
    const counts = results.reduce((all, item) => {
        const key = item.action === "skip" ? "skipped" : item.action === "create" ? "created" : item.action === "update" ? "updated" : "conflicts";
        all[key] = (all[key] || 0) + 1;
        return all;
    }, {});
    return Object.entries(counts).map(([key, value]) => t("syncCount", { action: t(key), count: value })).join(t("listSeparator")) || t("noFileChanges");
}

function publisherTemplate(t) {
    return `<div class="siyuan-blog-publisher fn__flex fn__flex-column">
        <div class="siyuan-blog-publisher__toolbar">
            <button class="b3-button b3-button--outline" data-action="scan">${escapeHtml(t("scan"))}</button>
            <button class="b3-button b3-button--outline" data-action="select-all">${escapeHtml(t("selectAllPublishable"))}</button>
            <button class="b3-button b3-button--outline" data-action="preview">${escapeHtml(t("previewMarkdown"))}</button>
            <select class="b3-select siyuan-blog-publisher__bulk-category" data-role="bulk-category" title="${escapeHtml(t("bulkCategoryTitle"))}"></select>
            <button class="b3-button b3-button--outline" data-action="apply-category" title="${escapeHtml(t("applyCategoryTitle"))}">${escapeHtml(t("applyCategory"))}</button>
            <span class="fn__flex-1"></span>
            <button class="b3-button b3-button--outline" data-action="sync">${escapeHtml(t("syncToLocal"))}</button>
        </div>
        <div class="siyuan-blog-publisher__target">
            <span data-role="target"></span>
        </div>
        <div class="siyuan-blog-publisher__bridge-note" role="note">
            <span>${escapeHtml(t("bridgeCommandReminderBefore"))}</span>
            <code>node local-bridge.js</code>
            <span>${escapeHtml(t("bridgeCommandReminderAfter"))}</span>
        </div>
        <div class="siyuan-blog-publisher__header">
            <span></span><span>${escapeHtml(t("documentTitle"))}</span><span>${escapeHtml(t("sourcePath"))}</span><span>${escapeHtml(t("status"))}</span><span>${escapeHtml(t("category"))}</span><span>${escapeHtml(t("targetFile"))}</span>
        </div>
        <div class="siyuan-blog-publisher__list fn__flex-1" data-role="list"></div>
        <div class="siyuan-blog-publisher__footer">
            <span class="siyuan-blog-publisher__message" data-role="message">${escapeHtml(t("readyToScan"))}</span>
            <button class="b3-button" data-action="close">${escapeHtml(t("close"))}</button>
        </div>
    </div>`;
}

module.exports = BlogPublisherPlugin;
