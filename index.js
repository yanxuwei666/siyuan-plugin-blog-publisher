"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// blog-core.js
var require_blog_core = __commonJS({
  "blog-core.js"(exports2, module2) {
    "use strict";
    var DEFAULT_CONFIG2 = Object.freeze({
      notebookId: "",
      localRoot: "",
      contentDir: "src/content/blog",
      assetDir: "public/images/blog",
      bridgeUrl: "http://127.0.0.1:18765",
      includeTitle: false,
      defaultCategory: ""
    });
    var VALID_STATUSES = /* @__PURE__ */ new Set(["draft", "pending", "published", "archived"]);
    function normalizeConfig2(input) {
      const value = input || {};
      return {
        ...DEFAULT_CONFIG2,
        ...value,
        contentDir: normalizeRelativeDir(value.contentDir || DEFAULT_CONFIG2.contentDir),
        assetDir: normalizeRelativeDir(value.assetDir || DEFAULT_CONFIG2.assetDir),
        bridgeUrl: String(value.bridgeUrl || DEFAULT_CONFIG2.bridgeUrl).replace(/\/$/, ""),
        localRoot: String(value.localRoot || "").trim(),
        notebookId: String(value.notebookId || "").trim(),
        includeTitle: Boolean(value.includeTitle),
        defaultCategory: String(value.defaultCategory || "").trim()
      };
    }
    function normalizeRelativeDir(value) {
      return String(value || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").split("/").filter((part) => part && part !== "." && part !== "..").join("/");
    }
    function normalizeEol(value) {
      return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trimEnd() + "\n";
    }
    function fnv1a(value) {
      let hash = 2166136261;
      for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      return (hash >>> 0).toString(16).padStart(8, "0");
    }
    function slugify(title, sourceId) {
      const normalized = String(title || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const ascii = normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/g, "");
      if (ascii) {
        return /[^\x00-\x7F]/.test(String(title || "")) ? `${ascii}-${fnv1a(`${title}:${sourceId}`)}` : ascii;
      }
      return `post-${fnv1a(`${title}:${sourceId}`)}`;
    }
    function normalizeDate(value, fallback) {
      const raw = String(value || "").trim();
      const match = raw.match(/^(\d{4})[-\/]?(\d{2})[-\/]?(\d{2})/);
      if (match) {
        return `${match[1]}-${match[2]}-${match[3]}`;
      }
      return fallback;
    }
    function today() {
      return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    }
    function readAttribute(attrs, name) {
      if (!attrs || typeof attrs !== "object") {
        return "";
      }
      const candidates = [name, `custom-${name}`, name.replace(/^blog\./, "blog-")];
      for (const key of candidates) {
        if (Object.prototype.hasOwnProperty.call(attrs, key) && attrs[key] !== null && attrs[key] !== void 0) {
          return String(attrs[key]).trim();
        }
      }
      return "";
    }
    function parseTags(value) {
      if (Array.isArray(value)) {
        return value.map((item) => String(item).trim()).filter(Boolean);
      }
      const raw = String(value || "").trim();
      if (raw.startsWith("[")) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            return parseTags(parsed);
          }
        } catch (error) {
        }
      }
      return raw.split(/[\n,，、;；\s]+/).map((item) => item.trim().replace(/^#/, "")).filter(Boolean).filter((item, index, items) => items.indexOf(item) === index);
    }
    function normalizeStatus(value) {
      const status = String(value || "pending").toLowerCase();
      return VALID_STATUSES.has(status) ? status : "pending";
    }
    function stripMarkdown(value) {
      return String(value || "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[`*_>#~]/g, "").replace(/\s+/g, " ").trim();
    }
    function deriveDescription(markdown) {
      const lines = String(markdown || "").split(/\r?\n/);
      for (const line of lines) {
        const candidate = line.trim();
        if (!candidate || candidate.startsWith("#") || candidate.startsWith("<!--")) {
          continue;
        }
        const description = stripMarkdown(candidate);
        if (description) {
          return description.slice(0, 160);
        }
      }
      return "";
    }
    function extractAssetRefs(markdown) {
      const references = [];
      const pattern = /!\[[^\]]*\]\(<?([^\s)>]+)>?\)|\[[^\]]*\]\(<?([^\s)>]+)>?\)/g;
      let match;
      while ((match = pattern.exec(String(markdown || ""))) !== null) {
        const reference = decodeURIComponent(match[1] || match[2] || "");
        if (!/^\/?assets\//i.test(reference) || references.some((item) => item.sourcePath === reference)) {
          continue;
        }
        references.push({ sourcePath: reference.startsWith("/") ? reference : `/${reference}` });
      }
      return references;
    }
    function assetFileName(sourcePath) {
      const clean = String(sourcePath || "").split(/[?#]/)[0];
      const name = clean.split("/").filter(Boolean).pop() || "asset";
      return name.replace(/[^\w.\-\u4e00-\u9fff]/g, "-");
    }
    function buildFrontmatter({ title, description, pubDate, updatedDate, category, tags, draft, sourceId, sourceHash, slug }) {
      const quote = (value) => JSON.stringify(String(value || ""));
      const tagValue = tags.length ? `[${tags.map(quote).join(", ")}]` : "[]";
      return [
        "---",
        `title: ${quote(title)}`,
        `description: ${quote(description)}`,
        `pubDate: ${pubDate}`,
        `updatedDate: ${updatedDate}`,
        `category: ${quote(category)}`,
        `tags: ${tagValue}`,
        `draft: ${draft ? "true" : "false"}`,
        `source: "siyuan"`,
        `siyuanId: ${quote(sourceId)}`,
        `slug: ${quote(slug)}`,
        `sourceHash: ${quote(sourceHash)}`,
        "---",
        ""
      ].join("\n");
    }
    function findWarnings(markdown, assetRefs) {
      const warnings = [];
      const source = String(markdown || "");
      if (/<iframe\b|<script\b|javascript:/i.test(source)) {
        warnings.push("\u6B63\u6587\u5305\u542B\u5916\u90E8 HTML \u6216\u811A\u672C\uFF0C\u8BF7\u5728\u535A\u5BA2\u4E2D\u786E\u8BA4\u5B89\u5168\u6027\u3002");
      }
      if (/!\[[^\]]*\]\(\s*https?:\/\//i.test(source)) {
        warnings.push("\u6B63\u6587\u5305\u542B\u5916\u90E8\u56FE\u7247\u94FE\u63A5\uFF0C\u63D2\u4EF6\u4E0D\u4F1A\u628A\u5B83\u590D\u5236\u5230\u535A\u5BA2\u4ED3\u5E93\u3002");
      }
      if (/数据库|属性视图|集市模板|查询块|\{\{\{/.test(source)) {
        warnings.push("\u6B63\u6587\u53EF\u80FD\u5305\u542B\u601D\u6E90\u7279\u6709\u5757\uFF0C\u5DF2\u6309\u5BFC\u51FA\u7684 Markdown \u4FDD\u7559\uFF0C\u8BF7\u5728\u535A\u5BA2\u4E2D\u590D\u6838\u3002");
      }
      if (assetRefs.some((item) => !/^\/?assets\//i.test(item.sourcePath))) {
        warnings.push("\u5B58\u5728\u65E0\u6CD5\u8BC6\u522B\u7684\u8D44\u6E90\u5F15\u7528\u3002");
      }
      return warnings;
    }
    function createBlogDocument({ sourceId, sourcePath, title, markdown, attrs, config, now, createdDate, updatedDate }) {
      const normalizedConfig = normalizeConfig2(config);
      const publishDate = normalizeDate(readAttribute(attrs, "blog.pubDate"), normalizeDate(createdDate || now, today()));
      const effectiveUpdatedDate = normalizeDate(updatedDate || now, today());
      const status = normalizeStatus(readAttribute(attrs, "blog.status"));
      const explicitSlug = readAttribute(attrs, "blog.slug");
      const slug = explicitSlug ? slugify(explicitSlug, sourceId) : slugify(title, sourceId);
      const category = readAttribute(attrs, "blog.category") || normalizedConfig.defaultCategory;
      const description = readAttribute(attrs, "blog.description") || deriveDescription(markdown);
      const tags = parseTags(readAttribute(attrs, "blog.tags"));
      const assetRefs = extractAssetRefs(markdown);
      const body = normalizeEol(markdown || "").trim();
      const contentBody = normalizedConfig.includeTitle && !/^#\s/.test(body) ? `# ${title}

${body}` : body;
      const draft = status === "draft" || status === "archived";
      const targetPath = `${normalizedConfig.contentDir}/${slug}.md`;
      const assetDir = `${normalizedConfig.assetDir}/${slug}`;
      const publicAssetRoot = `/${normalizedConfig.assetDir.replace(/^public\//, "")}`;
      const assets = assetRefs.map((item) => ({
        sourcePath: item.sourcePath,
        targetPath: `${assetDir}/${assetFileName(item.sourcePath)}`,
        publicPath: `${publicAssetRoot}/${slug}/${assetFileName(item.sourcePath)}`
      }));
      let rewrittenBody = contentBody;
      for (const asset of assets) {
        rewrittenBody = rewrittenBody.split(asset.sourcePath).join(asset.publicPath);
        rewrittenBody = rewrittenBody.split(asset.sourcePath.slice(1)).join(asset.publicPath);
      }
      const warnings = findWarnings(markdown, assetRefs);
      const render = (sourceHash) => normalizeEol(
        buildFrontmatter({
          title,
          description,
          pubDate: publishDate,
          updatedDate: effectiveUpdatedDate,
          category,
          tags,
          draft,
          sourceId,
          sourceHash,
          slug
        }) + rewrittenBody
      );
      return {
        sourceId,
        sourcePath,
        title,
        status,
        slug,
        targetPath,
        assetDir,
        assetRefs,
        assets,
        warnings,
        render
      };
    }
    function getCrypto() {
      if (typeof globalThis.crypto === "undefined" || !globalThis.crypto.subtle) {
        throw new Error("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 Web Crypto\uFF0C\u65E0\u6CD5\u8BA1\u7B97\u540C\u6B65 hash\u3002");
      }
      return globalThis.crypto;
    }
    async function sha256Text(value) {
      const bytes = new TextEncoder().encode(String(value));
      const digest = await getCrypto().subtle.digest("SHA-256", bytes);
      return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    }
    async function createSyncPlan(input) {
      const document2 = createBlogDocument(input);
      const sourceHash = await sha256Text(document2.render(""));
      const content = document2.render(sourceHash);
      const contentHash = await sha256Text(content);
      return {
        sourceId: document2.sourceId,
        sourcePath: document2.sourcePath,
        title: document2.title,
        slug: document2.slug,
        targetPath: document2.targetPath,
        content,
        sourceHash,
        contentHash,
        assets: document2.assets,
        warnings: document2.warnings,
        status: document2.status,
        action: "create"
      };
    }
    function shouldPublish2(status) {
      return status !== "draft" && status !== "archived";
    }
    function displayStatus2(status, manifestEntry, sourceHash) {
      if (!manifestEntry) {
        return status === "published" ? "\u6709\u66F4\u65B0" : status;
      }
      if (manifestEntry.sourceHash === sourceHash) {
        return "published";
      }
      return "\u6709\u66F4\u65B0";
    }
    module2.exports = {
      DEFAULT_CONFIG: DEFAULT_CONFIG2,
      normalizeConfig: normalizeConfig2,
      normalizeRelativeDir,
      normalizeEol,
      slugify,
      normalizeDate,
      readAttribute,
      parseTags,
      normalizeStatus,
      deriveDescription,
      extractAssetRefs,
      createBlogDocument,
      sha256Text,
      createSyncPlan,
      shouldPublish: shouldPublish2,
      displayStatus: displayStatus2
    };
  }
});

// siyuan-api.js
var require_siyuan_api = __commonJS({
  "siyuan-api.js"(exports2, module2) {
    "use strict";
    var { createSyncPlan } = require_blog_core();
    var SiyuanApi2 = class {
      constructor(fetchImpl) {
        this.fetch = fetchImpl || globalThis.fetch.bind(globalThis);
      }
      async post(path, payload) {
        const response = await this.fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload || {}),
          credentials: "same-origin"
        });
        const text = await response.text();
        let body;
        try {
          body = text ? JSON.parse(text) : {};
        } catch (error) {
          throw new Error(`${path} \u8FD4\u56DE\u4E86\u65E0\u6CD5\u89E3\u6790\u7684\u54CD\u5E94\uFF08HTTP ${response.status}\uFF09\u3002`);
        }
        if (!response.ok || body.code !== void 0 && body.code !== 0) {
          throw new Error(`${path} \u5931\u8D25\uFF1A${body.msg || `HTTP ${response.status}`}`);
        }
        return body.data;
      }
      async listNotebooks() {
        const data = await this.post("/api/notebook/lsNotebooks", {});
        return Array.isArray(data?.notebooks) ? data.notebooks : [];
      }
      async listDocuments(notebookId) {
        if (!/^[0-9]{14}-[a-z0-9]{7}$/i.test(String(notebookId || ""))) {
          throw new Error("\u53D1\u5E03\u7B14\u8BB0\u672C ID \u65E0\u6548\uFF0C\u8BF7\u4ECE\u4E0B\u62C9\u5217\u8868\u9009\u62E9\u7B14\u8BB0\u672C\u3002");
        }
        const stmt = [
          "SELECT id, content, hpath, updated, created",
          `FROM blocks WHERE box = '${notebookId}' AND type = 'd'`,
          "ORDER BY hpath, id LIMIT 10000"
        ].join(" ");
        const data = await this.post("/api/query/sql", { stmt });
        return Array.isArray(data) ? data : [];
      }
      async getDocumentMarkdown(id) {
        const data = await this.post("/api/export/exportMdContent", { id });
        return {
          hPath: data?.hPath || "",
          content: data?.content || ""
        };
      }
      async getBlockAttrs(id) {
        const data = await this.post("/api/attr/getBlockAttrs", { id });
        return data || {};
      }
      async buildPlan(doc, config) {
        const [exported, attrs] = await Promise.all([
          this.getDocumentMarkdown(doc.id),
          this.getBlockAttrs(doc.id)
        ]);
        return createSyncPlan({
          sourceId: doc.id,
          sourcePath: exported.hPath || doc.hpath || doc.content || doc.id,
          title: doc.content || doc.id,
          markdown: exported.content,
          attrs,
          config,
          now: (/* @__PURE__ */ new Date()).toISOString(),
          createdDate: doc.created,
          updatedDate: doc.updated
        });
      }
      async readAssetAsBase64(sourcePath) {
        const normalized = String(sourcePath || "").split(/[?#]/)[0].replace(/^\/?/, "/");
        const path = normalized.startsWith("/data/") ? normalized : `/data${normalized}`;
        const response = await this.fetch("/api/file/getFile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path }),
          credentials: "same-origin"
        });
        if (!response.ok) {
          throw new Error(`\u8BFB\u53D6\u8D44\u6E90\u5931\u8D25\uFF1A${sourcePath}\uFF08HTTP ${response.status}\uFF09\u3002`);
        }
        const buffer = await response.arrayBuffer();
        return bytesToBase64(new Uint8Array(buffer));
      }
    };
    function bytesToBase64(bytes) {
      let result = "";
      const chunkSize = 32768;
      for (let index = 0; index < bytes.length; index += chunkSize) {
        result += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
      }
      return btoa(result);
    }
    module2.exports = { SiyuanApi: SiyuanApi2, bytesToBase64 };
  }
});

// local-adapter.js
var require_local_adapter = __commonJS({
  "local-adapter.js"(exports2, module2) {
    "use strict";
    var LocalAdapter2 = class {
      constructor(baseUrl) {
        this.baseUrl = String(baseUrl || "http://127.0.0.1:18765").replace(/\/$/, "");
      }
      async request(path, method, payload) {
        const response = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: { "Content-Type": "application/json" },
          body: payload === void 0 ? void 0 : JSON.stringify(payload)
        });
        const text = await response.text();
        let data;
        try {
          data = text ? JSON.parse(text) : {};
        } catch (error) {
          throw new Error(`\u672C\u5730 Bridge \u8FD4\u56DE\u4E86\u65E0\u6CD5\u89E3\u6790\u7684\u54CD\u5E94\uFF08HTTP ${response.status}\uFF09\u3002`);
        }
        if (!response.ok || data.ok === false) {
          throw new Error(data.error || `\u672C\u5730 Bridge \u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${response.status}\uFF09\u3002`);
        }
        return data;
      }
      async health() {
        return this.request("/health", "GET");
      }
      async status(rootPath) {
        return this.request("/status", "POST", { rootPath });
      }
      async preview(rootPath, plans) {
        return this.request("/preview", "POST", { rootPath, plans });
      }
      async apply(rootPath, contentDir, assetDir, plans) {
        return this.request("/sync", "POST", {
          rootPath,
          contentDir,
          assetDir,
          plans
        });
      }
    };
    module2.exports = { LocalAdapter: LocalAdapter2 };
  }
});

// src/index.js
var { Plugin, Dialog, Setting, showMessage } = require("siyuan");
var {
  DEFAULT_CONFIG,
  normalizeConfig,
  shouldPublish,
  displayStatus
} = require_blog_core();
var { SiyuanApi } = require_siyuan_api();
var { LocalAdapter } = require_local_adapter();
var DATA_KEY = "config";
var BlogPublisherPlugin = class extends Plugin {
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
      console.warn(`[${this.name}] \u52A0\u8F7D\u914D\u7F6E\u5931\u8D25`, error);
    }
    this.config = normalizeConfig(this.data?.[DATA_KEY] || {});
    this.data[DATA_KEY] = this.config;
  }
  onLayoutReady() {
    this.addTopBar({
      icon: "iconUpload",
      title: "\u535A\u5BA2\u53D1\u5E03\u4E2D\u5FC3",
      position: "right",
      contextMenu: (menu) => {
        menu.addItem({
          id: "siyuan-blog-publisher-settings",
          icon: "iconSettings",
          label: "\u63D2\u4EF6\u8BBE\u7F6E",
          click: () => this.openSetting()
        });
      },
      callback: () => this.openPublisher()
    });
    this.addCommand({
      langKey: "openPublisher",
      hotkey: "\u2325\u2318P",
      callback: () => this.openPublisher()
    });
  }
  async saveConfig() {
    this.config = normalizeConfig(this.config);
    this.data[DATA_KEY] = this.config;
    await this.saveData(DATA_KEY, this.config);
  }
  async openSetting() {
    if (this.setting) {
      this.setting.open(this.displayName || "\u601D\u6E90\u535A\u5BA2\u53D1\u5E03\u5668");
      return;
    }
    try {
      this.notebooks = await this.api.listNotebooks();
    } catch (error) {
      console.warn("\u52A0\u8F7D\u7B14\u8BB0\u672C\u5217\u8868\u5931\u8D25", error);
      this.notebooks = [];
    }
    const notebook = document.createElement("select");
    notebook.className = "b3-select fn__flex-1";
    this.renderNotebookOptions(notebook);
    const root = textField(this.config.localRoot, "\u4F8B\u5982\uFF1AE:\\projects\\my-blog");
    const contentDir = textField(this.config.contentDir, "src/content/blog");
    const assetDir = textField(this.config.assetDir, "public/images/blog");
    const bridgeUrl = textField(this.config.bridgeUrl, "http://127.0.0.1:18765");
    const category = textField(this.config.defaultCategory, "\u4F8B\u5982\uFF1A\u5DE5\u7A0B\u5B9E\u8DF5");
    const includeTitle = document.createElement("input");
    includeTitle.type = "checkbox";
    includeTitle.className = "b3-switch";
    includeTitle.checked = this.config.includeTitle;
    const checkButton = document.createElement("button");
    checkButton.className = "b3-button b3-button--outline";
    checkButton.textContent = "\u68C0\u67E5 Bridge";
    checkButton.addEventListener("click", async () => {
      checkButton.disabled = true;
      try {
        const result = await new LocalAdapter(bridgeUrl.value.trim()).health();
        showMessage(`Bridge \u5DF2\u8FDE\u63A5\uFF08v${result.version || 1}\uFF09\u3002`);
      } catch (error) {
        showMessage(`Bridge \u8FDE\u63A5\u5931\u8D25\uFF1A${error.message}`, 7e3, "error");
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
          includeTitle: includeTitle.checked
        });
        try {
          await this.saveConfig();
          showMessage("\u535A\u5BA2\u53D1\u5E03\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\u3002");
        } catch (error) {
          showMessage(`\u4FDD\u5B58\u8BBE\u7F6E\u5931\u8D25\uFF1A${error.message}`, 7e3, "error");
        }
      }
    });
    this.setting.addItem({
      title: "\u53D1\u5E03\u7B14\u8BB0\u672C",
      description: "\u53EA\u626B\u63CF\u6B64\u7B14\u8BB0\u672C\u4E0B\u7684\u6587\u6863\uFF1B\u5EFA\u8BAE\u7528 blog.status=published \u6216 pending \u6807\u8BB0\u6587\u7AE0\u3002",
      direction: "row",
      actionElement: notebook
    });
    this.setting.addItem({
      title: "\u672C\u5730\u535A\u5BA2\u4ED3\u5E93\u8DEF\u5F84",
      description: "\u586B\u5199\u672C\u5730 GitHub \u4ED3\u5E93\u6839\u76EE\u5F55\uFF0C\u4F8B\u5982 my-blog \u7684\u672C\u5730\u8DEF\u5F84\u3002",
      direction: "row",
      actionElement: root
    });
    this.setting.addItem({
      title: "\u535A\u5BA2\u5185\u5BB9\u76EE\u5F55",
      description: "\u76F8\u5BF9\u4E8E\u4ED3\u5E93\u6839\u76EE\u5F55\uFF0C\u9ED8\u8BA4\u5199\u5165 Astro \u7684 src/content/blog\u3002",
      direction: "row",
      actionElement: contentDir
    });
    this.setting.addItem({
      title: "\u535A\u5BA2\u8D44\u6E90\u76EE\u5F55",
      description: "\u76F8\u5BF9\u4E8E\u4ED3\u5E93\u6839\u76EE\u5F55\uFF0C\u9ED8\u8BA4\u5199\u5165 public/images/blog\u3002",
      direction: "row",
      actionElement: assetDir
    });
    this.setting.addItem({
      title: "\u672C\u5730 Bridge \u5730\u5740",
      description: "\u5148\u8FD0\u884C\u9879\u76EE\u5185\u7684 local-bridge.js\uFF0C\u518D\u4ECE\u8FD9\u91CC\u68C0\u67E5\u8FDE\u63A5\u3002",
      direction: "row",
      actionElement: bridgeAction(bridgeUrl, checkButton)
    });
    this.setting.addItem({
      title: "\u9ED8\u8BA4\u5206\u7C7B",
      description: "\u6587\u6863\u6CA1\u6709 blog.category \u5C5E\u6027\u65F6\u4F7F\u7528\u3002",
      direction: "row",
      actionElement: category
    });
    this.setting.addItem({
      title: "\u6B63\u6587\u4E2D\u4FDD\u7559\u4E00\u7EA7\u6807\u9898",
      description: "\u9ED8\u8BA4\u5173\u95ED\uFF1BAstro \u9875\u9762\u901A\u5E38\u4F1A\u5355\u72EC\u6E32\u67D3\u6587\u7AE0\u6807\u9898\u3002",
      direction: "row",
      actionElement: includeTitle
    });
    this.setting.open(this.displayName || "\u601D\u6E90\u535A\u5BA2\u53D1\u5E03\u5668");
  }
  renderNotebookOptions(select) {
    select.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = this.notebooks.length ? "\u8BF7\u9009\u62E9\u53D1\u5E03\u7B14\u8BB0\u672C" : "\u6682\u65F6\u65E0\u6CD5\u8BFB\u53D6\u7B14\u8BB0\u672C";
    select.appendChild(placeholder);
    for (const item of this.notebooks) {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = `${item.name}${item.closed ? "\uFF08\u5DF2\u5173\u95ED\uFF09" : ""}`;
      option.selected = item.id === this.config.notebookId;
      select.appendChild(option);
    }
  }
  openPublisher() {
    const dialog = new Dialog({
      title: "\u535A\u5BA2\u53D1\u5E03\u4E2D\u5FC3",
      width: "980px",
      height: "720px",
      content: publisherTemplate()
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
    const state = { docs: [], selected: /* @__PURE__ */ new Set(), manifest: {}, scanning: false };
    const setMessage = (text, isError = false) => {
      message.textContent = text;
      message.classList.toggle("siyuan-blog-publisher__message--error", isError);
    };
    localRootInput.value = this.config.localRoot || "";
    const updateTarget = () => {
      target.textContent = this.config.localRoot ? `\u76EE\u6807\uFF1A${this.config.localRoot} \xB7 ${this.config.contentDir}` : "\u5C1A\u672A\u914D\u7F6E\u672C\u5730\u535A\u5BA2\u4ED3\u5E93\u8DEF\u5F84";
    };
    updateTarget();
    localRootInput.addEventListener("change", async () => {
      this.config.localRoot = localRootInput.value.trim();
      updateTarget();
      try {
        await this.saveConfig();
        setMessage("\u4E0A\u4F20\u8DEF\u5F84\u5DF2\u4FDD\u5B58\u3002");
      } catch (error) {
        setMessage(`\u4FDD\u5B58\u4E0A\u4F20\u8DEF\u5F84\u5931\u8D25\uFF1A${error.message}`, true);
      }
    });
    const render = () => {
      if (!state.docs.length) {
        list.innerHTML = `<div class="siyuan-blog-publisher__empty">\u8FD8\u6CA1\u6709\u626B\u63CF\u7ED3\u679C\u3002\u8BF7\u5148\u9009\u62E9\u53D1\u5E03\u7B14\u8BB0\u672C\u5E76\u70B9\u51FB\u201C\u626B\u63CF\u201D\u3002</div>`;
        return;
      }
      list.innerHTML = state.docs.map((item) => {
        const warning = item.plan.warnings?.length ? `<span class="siyuan-blog-publisher__warning" title="${escapeHtml(item.plan.warnings.join("\n"))}">\u26A0</span>` : "";
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
        setMessage(`Bridge \u672A\u8FDE\u63A5\uFF0C\u4ECD\u53EF\u9884\u89C8\uFF1B\u540C\u6B65\u524D\u8BF7\u542F\u52A8 Bridge\u3002`, true);
      }
    };
    const scan = async () => {
      if (state.scanning) {
        return;
      }
      if (!this.config.notebookId) {
        setMessage("\u8BF7\u5148\u5728\u63D2\u4EF6\u8BBE\u7F6E\u4E2D\u9009\u62E9\u53D1\u5E03\u7B14\u8BB0\u672C\u3002", true);
        return;
      }
      state.scanning = true;
      state.selected.clear();
      updateButtons();
      scanButton.disabled = true;
      setMessage("\u6B63\u5728\u626B\u63CF\u6587\u6863\u5E76\u751F\u6210\u8F6C\u6362\u9884\u89C8\u2026\u2026");
      try {
        await readManifest();
        const documents = await this.api.listDocuments(this.config.notebookId);
        state.docs = [];
        for (let index = 0; index < documents.length; index += 1) {
          setMessage(`\u6B63\u5728\u8F6C\u6362 ${index + 1}/${documents.length}\u2026\u2026`);
          const plan = await this.api.buildPlan(documents[index], this.config);
          const entry = state.manifest.documents?.[plan.sourceId];
          state.docs.push({
            plan,
            displayStatus: displayStatus(plan.status, entry, plan.sourceHash)
          });
        }
        render();
        const publishable = state.docs.filter((item) => shouldPublish(item.plan.status)).length;
        setMessage(`\u626B\u63CF\u5B8C\u6210\uFF1A${state.docs.length} \u7BC7\u6587\u6863\uFF0C\u5176\u4E2D ${publishable} \u7BC7\u53EF\u53D1\u5E03\u3002`);
      } catch (error) {
        state.docs = [];
        render();
        setMessage(`\u626B\u63CF\u5931\u8D25\uFF1A${error.message}`, true);
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
      const warnings = item.plan.warnings?.length ? `<div class="siyuan-blog-publisher__preview-warnings">${item.plan.warnings.map(escapeHtml).join("<br>")}</div>` : "";
      new Dialog({
        title: `\u9884\u89C8\uFF1A${item.plan.title}`,
        width: "900px",
        height: "680px",
        content: `<div class="siyuan-blog-publisher__preview">${warnings}<pre>${escapeHtml(item.plan.content)}</pre></div>`
      });
    };
    const sync = async () => {
      if (!this.config.localRoot) {
        setMessage("\u8BF7\u5148\u5728\u63D2\u4EF6\u8BBE\u7F6E\u4E2D\u586B\u5199\u672C\u5730\u535A\u5BA2\u4ED3\u5E93\u8DEF\u5F84\u3002", true);
        return;
      }
      const selected = state.docs.filter((item) => state.selected.has(item.plan.sourceId));
      if (!selected.length) {
        return;
      }
      state.scanning = true;
      updateButtons();
      setMessage(`\u6B63\u5728\u8BFB\u53D6\u8D44\u6E90\u5E76\u540C\u6B65 ${selected.length} \u7BC7\u6587\u7AE0\u2026\u2026`);
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
          plans
        );
        const summary = summarizeResults(result.results || []);
        showMessage(`\u540C\u6B65\u5B8C\u6210\uFF1A${summary}`);
        state.scanning = false;
        await scan();
      } catch (error) {
        setMessage(`\u540C\u6B65\u5931\u8D25\uFF1A${error.message}`, true);
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
};
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
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function statusClass(status) {
  return String(status || "pending").replace(/[^a-z0-9\u4e00-\u9fff-]/gi, "-");
}
function summarizeResults(results) {
  const counts = results.reduce((all, item) => {
    const key = item.action === "skip" ? "\u8DF3\u8FC7" : item.action === "create" ? "\u65B0\u589E" : item.action === "update" ? "\u66F4\u65B0" : "\u51B2\u7A81";
    all[key] = (all[key] || 0) + 1;
    return all;
  }, {});
  return Object.entries(counts).map(([key, value]) => `${key} ${value}`).join("\uFF0C") || "\u6CA1\u6709\u6587\u4EF6\u53D8\u5316";
}
function publisherTemplate() {
  return `<div class="siyuan-blog-publisher fn__flex fn__flex-column">
        <div class="siyuan-blog-publisher__toolbar">
            <button class="b3-button b3-button--outline" data-action="scan">\u626B\u63CF</button>
            <button class="b3-button b3-button--outline" data-action="select-all">\u5168\u9009\u5F85\u53D1\u5E03</button>
            <button class="b3-button b3-button--outline" data-action="preview">\u9884\u89C8 Markdown</button>
            <span class="fn__flex-1"></span>
            <button class="b3-button b3-button--primary" data-action="sync">\u540C\u6B65\u5230\u672C\u5730\u4ED3\u5E93</button>
        </div>
        <div class="siyuan-blog-publisher__target">
            <label>\u4E0A\u4F20\u8DEF\u5F84</label>
            <input class="b3-text-field" data-role="local-root" placeholder="\u4F8B\u5982\uFF1AE:\\projects\\my-blog">
            <span data-role="target"></span>
        </div>
        <div class="siyuan-blog-publisher__header">
            <span></span><span>\u6587\u6863\u6807\u9898</span><span>\u601D\u6E90\u8DEF\u5F84</span><span>\u72B6\u6001</span><span>\u76EE\u6807\u6587\u4EF6</span>
        </div>
        <div class="siyuan-blog-publisher__list fn__flex-1" data-role="list"></div>
        <div class="siyuan-blog-publisher__footer">
            <span class="siyuan-blog-publisher__message" data-role="message">\u51C6\u5907\u626B\u63CF\u3002</span>
            <button class="b3-button" data-action="close">\u5173\u95ED</button>
        </div>
    </div>`;
}
module.exports = BlogPublisherPlugin;
