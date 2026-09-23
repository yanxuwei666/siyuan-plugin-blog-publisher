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
      localRootWindows: "",
      localRootMac: "",
      legacyLocalRoot: "",
      contentDir: "src/content/blog",
      assetDir: "public/images/blog",
      bridgeUrl: "http://127.0.0.1:18765",
      bridgeToken: "",
      includeTitle: false,
      defaultCategory: "",
      categories: ["\u5DE5\u7A0B\u5B9E\u8DF5", "\u540E\u7AEF\u6846\u67B6", "\u6570\u636E\u5E93\u6280\u672F", "\u5DE5\u7A0B\u57FA\u7840\u8BBE\u65BD", "\u524D\u7AEF\u5E94\u7528", "\u4E2D\u95F4\u4EF6", "\u968F\u7B14"]
    });
    var VALID_STATUSES = /* @__PURE__ */ new Set(["draft", "pending", "published", "archived"]);
    function normalizeConfig2(input) {
      const value = input || {};
      const normalized = {
        ...DEFAULT_CONFIG2,
        ...value,
        contentDir: normalizeRelativeDir(value.contentDir || DEFAULT_CONFIG2.contentDir),
        assetDir: normalizeRelativeDir(value.assetDir || DEFAULT_CONFIG2.assetDir),
        bridgeUrl: String(value.bridgeUrl || DEFAULT_CONFIG2.bridgeUrl).replace(/\/$/, ""),
        bridgeToken: String(value.bridgeToken || "").trim(),
        localRootWindows: String(value.localRootWindows || "").trim(),
        localRootMac: String(value.localRootMac || "").trim(),
        legacyLocalRoot: String(value.legacyLocalRoot || value.localRoot || "").trim(),
        notebookId: String(value.notebookId || "").trim(),
        includeTitle: Boolean(value.includeTitle),
        defaultCategory: String(value.defaultCategory || "").trim(),
        categories: normalizeCategories(value.categories ?? DEFAULT_CONFIG2.categories)
      };
      delete normalized.localRoot;
      delete normalized.githubUrl;
      return normalized;
    }
    function normalizeCategories(value) {
      const items = Array.isArray(value) ? value : String(value || "").split(/[\n\r]+/);
      return items.map((item) => String(item || "").trim()).filter(Boolean).filter((item, index, values) => values.indexOf(item) === index);
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
      const siYuanCustomName = `custom-${name.replace(/\./g, "-").toLowerCase()}`;
      const candidates = [name, siYuanCustomName, name.replace(/^blog\./, "blog-")];
      for (const key of candidates) {
        if (Object.prototype.hasOwnProperty.call(attrs, key) && attrs[key] !== null && attrs[key] !== void 0) {
          return String(attrs[key]).trim();
        }
      }
      return "";
    }
    function parseTags(value) {
      if (Array.isArray(value)) {
        return value.map((item) => String(item).trim()).filter(Boolean).filter((item, index, items) => items.indexOf(item) === index);
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
      return raw.split(/[\n,，、;；]+/).map((item) => item.trim().replace(/^#/, "")).filter(Boolean).filter((item, index, items) => items.indexOf(item) === index);
    }
    function parseYamlScalar(value) {
      const raw = String(value || "").trim();
      if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
        try {
          return JSON.parse(raw);
        } catch (error) {
          return raw.slice(1, -1);
        }
      }
      if (raw.length >= 2 && raw.startsWith("'") && raw.endsWith("'")) {
        return raw.slice(1, -1).replace(/''/g, "'");
      }
      return raw;
    }
    function splitYamlArray(value) {
      const raw = String(value || "").trim();
      if (!raw.startsWith("[") || !raw.endsWith("]")) {
        return [];
      }
      const items = [];
      let token = "";
      let quote = "";
      let escaped = false;
      for (const character of raw.slice(1, -1)) {
        if (escaped) {
          token += character;
          escaped = false;
        } else if (character === "\\" && quote === '"') {
          token += character;
          escaped = true;
        } else if ((character === "'" || character === '"') && (!quote || quote === character)) {
          token += character;
          quote = quote ? "" : character;
        } else if (character === "," && !quote) {
          if (token.trim()) items.push(parseYamlScalar(token));
          token = "";
        } else {
          token += character;
        }
      }
      if (token.trim()) items.push(parseYamlScalar(token));
      return items;
    }
    function parseExportedMetadata(value) {
      const lines = String(value || "").split(/\r?\n/);
      const metadata = { category: "", description: "", tags: [] };
      for (let index = 0; index < lines.length; index += 1) {
        const match = lines[index].match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
        if (!match) continue;
        const key = match[1].toLowerCase();
        const inlineValue = match[2].trim();
        if (key === "category" || key === "description") {
          metadata[key] = parseYamlScalar(inlineValue);
        } else if (key === "tags") {
          if (inlineValue.startsWith("[")) {
            metadata.tags = splitYamlArray(inlineValue);
          } else if (inlineValue) {
            metadata.tags = parseTags(parseYamlScalar(inlineValue));
          } else {
            for (let next = index + 1; next < lines.length; next += 1) {
              const listItem = lines[next].match(/^\s+-\s*(.*?)\s*$/);
              if (listItem) {
                metadata.tags.push(parseYamlScalar(listItem[1]));
              } else if (lines[next].trim() && !/^\s/.test(lines[next])) {
                break;
              }
            }
          }
        }
      }
      metadata.tags = parseTags(metadata.tags);
      return metadata;
    }
    function stripExportedFrontmatter(markdown) {
      const source = String(markdown || "").replace(/^\uFEFF/, "");
      const lines = source.split(/\r?\n/);
      if (lines[0]?.trim() !== "---") {
        return { body: source, category: "", description: "", tags: [] };
      }
      const closingIndex = lines.findIndex((line, index) => index > 0 && /^(?:---|\.\.\.)\s*$/.test(line.trim()));
      if (closingIndex < 0) {
        return { body: source, category: "", description: "", tags: [] };
      }
      return {
        ...parseExportedMetadata(lines.slice(1, closingIndex).join("\n")),
        body: lines.slice(closingIndex + 1).join("\n").replace(/^(?:\r?\n)+/, "")
      };
    }
    function sameTitle(left, right) {
      const normalize = (value) => stripMarkdown(value).normalize("NFC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
      return normalize(left) === normalize(right);
    }
    function applyTitleToBody(markdown, title, includeTitle) {
      const lines = String(markdown || "").split("\n");
      let firstContentLine = 0;
      while (firstContentLine < lines.length && !lines[firstContentLine].trim()) firstContentLine += 1;
      const heading = lines[firstContentLine]?.trim().match(/^#\s+(.+?)\s*#*\s*$/);
      const alreadyHasTitle = Boolean(heading && sameTitle(heading[1], title));
      if (alreadyHasTitle && !includeTitle) {
        lines.splice(firstContentLine, 1);
        while (firstContentLine < lines.length && !lines[firstContentLine].trim()) {
          lines.splice(firstContentLine, 1);
        }
        return lines.join("\n");
      }
      if (includeTitle && !alreadyHasTitle) {
        return `# ${title}

${String(markdown || "").trimStart()}`;
      }
      return String(markdown || "");
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
        ...updatedDate ? [`updatedDate: ${updatedDate}`] : [],
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
    function createBlogDocument({ sourceId, sourcePath, title, markdown, attrs, config, now, createdDate, updatedDate, existingSlug, existingPubDate, existingUpdatedDate }) {
      const normalizedConfig = normalizeConfig2(config);
      const exported = stripExportedFrontmatter(markdown);
      const sourceMarkdown = exported.body;
      const explicitPubDate = readAttribute(attrs, "blog.pubDate");
      const publishDate = normalizeDate(
        explicitPubDate,
        normalizeDate(existingPubDate || now || createdDate, today())
      );
      const pinPubDateOnSync = !explicitPubDate && !existingPubDate;
      const firstPush = !existingPubDate;
      const sourceUpdatedDate = normalizeDate(updatedDate || now, today());
      const effectiveUpdatedDate = existingPubDate ? String(existingUpdatedDate || "") : "";
      const status = normalizeStatus(readAttribute(attrs, "blog.status"));
      const explicitSlug = readAttribute(attrs, "blog.slug");
      const stableSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(existingSlug || "")) ? String(existingSlug) : "";
      const slug = explicitSlug ? slugify(explicitSlug, sourceId) : stableSlug || slugify(title, sourceId);
      const category = readAttribute(attrs, "blog.category") || exported.category || normalizedConfig.defaultCategory;
      const description = readAttribute(attrs, "blog.description") || exported.description || deriveDescription(sourceMarkdown);
      const configuredTags = readAttribute(attrs, "blog.tags");
      const tags = configuredTags ? parseTags(configuredTags) : exported.tags;
      const assetRefs = extractAssetRefs(sourceMarkdown);
      const body = normalizeEol(sourceMarkdown).trim();
      const contentBody = applyTitleToBody(body, title, normalizedConfig.includeTitle);
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
      const warnings = findWarnings(sourceMarkdown, assetRefs);
      const render = (sourceHash, updatedDateOverride = effectiveUpdatedDate) => normalizeEol(
        buildFrontmatter({
          title,
          description,
          pubDate: publishDate,
          updatedDate: updatedDateOverride,
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
        pubDate: publishDate,
        updatedDate: effectiveUpdatedDate,
        pinPubDateOnSync,
        firstPush,
        status,
        category,
        slug,
        targetPath,
        assetDir,
        assetRefs,
        assets,
        warnings,
        sourceUpdatedDate,
        render
      };
    }
    function getCrypto() {
      if (typeof globalThis.crypto === "undefined" || !globalThis.crypto.subtle) {
        throw new Error("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301 Web Crypto\uFF0C\u65E0\u6CD5\u8BA1\u7B97\u540C\u6B65 hash\u3002");
      }
      return globalThis.crypto;
    }
    async function sha256Text2(value) {
      const bytes = new TextEncoder().encode(String(value));
      const digest = await getCrypto().subtle.digest("SHA-256", bytes);
      return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    }
    async function createSyncPlan(input) {
      const document2 = createBlogDocument(input);
      const sourceHash = await sha256Text2(document2.render("", document2.sourceUpdatedDate));
      const content = document2.render(sourceHash);
      const contentHash = await sha256Text2(content);
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
        category: document2.category,
        action: "create",
        pubDate: document2.pubDate,
        updatedDate: document2.updatedDate,
        pinPubDateOnSync: document2.pinPubDateOnSync,
        firstPush: document2.firstPush
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
      sha256Text: sha256Text2,
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
      async post(path, payload, signal) {
        const response = await this.fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload || {}),
          credentials: "same-origin",
          signal
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
      async listDocuments(notebookId, signal) {
        if (!/^[0-9]{14}-[a-z0-9]{7}$/i.test(String(notebookId || ""))) {
          throw new Error("\u53D1\u5E03\u7B14\u8BB0\u672C ID \u65E0\u6548\uFF0C\u8BF7\u4ECE\u4E0B\u62C9\u5217\u8868\u9009\u62E9\u7B14\u8BB0\u672C\u3002");
        }
        const stmt = [
          "SELECT id, content, hpath, updated, created",
          `FROM blocks WHERE box = '${notebookId}' AND type = 'd'`,
          "ORDER BY hpath, id LIMIT 10000"
        ].join(" ");
        const data = await this.post("/api/query/sql", { stmt }, signal);
        return Array.isArray(data) ? data : [];
      }
      async getDocumentMarkdown(id, signal) {
        const data = await this.post("/api/export/exportMdContent", { id }, signal);
        return {
          hPath: data?.hPath || "",
          content: data?.content || ""
        };
      }
      async getBlockAttrs(id, signal) {
        const data = await this.post("/api/attr/getBlockAttrs", { id }, signal);
        return data || {};
      }
      async setBlockAttrs(id, attrs) {
        await this.post("/api/attr/setBlockAttrs", { id, attrs });
      }
      async buildPlan(doc, config, manifestEntry, signal) {
        const [exported, attrs] = await Promise.all([
          this.getDocumentMarkdown(doc.id, signal),
          this.getBlockAttrs(doc.id, signal)
        ]);
        return createSyncPlan({
          sourceId: doc.id,
          sourcePath: exported.hPath || doc.hpath || doc.content || doc.id,
          title: doc.content || doc.id,
          markdown: exported.content,
          attrs,
          config,
          existingSlug: manifestEntry?.slug,
          existingPubDate: manifestEntry?.pubDate,
          existingUpdatedDate: manifestEntry?.updatedDate,
          now: (/* @__PURE__ */ new Date()).toISOString(),
          createdDate: doc.created,
          updatedDate: doc.updated
        });
      }
      async readAssetAsBase64(sourcePath, signal) {
        let decodedPath;
        try {
          decodedPath = decodeURIComponent(String(sourcePath || "").split(/[?#]/)[0]).replace(/\\/g, "/");
        } catch (error) {
          throw new Error(`\u56FE\u7247\u8D44\u6E90\u8DEF\u5F84\u7F16\u7801\u65E0\u6548\uFF1A${sourcePath}`);
        }
        const segments = decodedPath.split("/").filter(Boolean);
        if (segments[0]?.toLowerCase() !== "assets" || segments.some((part) => part === "." || part === ".." || /[\u0000-\u001f]/.test(part))) {
          throw new Error(`\u62D2\u7EDD\u8BFB\u53D6\u535A\u5BA2\u8D44\u6E90\u76EE\u5F55\u4E4B\u5916\u7684\u6587\u4EF6\uFF1A${sourcePath}`);
        }
        const path = `/data/${segments.join("/")}`;
        const response = await this.fetch("/api/file/getFile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path }),
          credentials: "same-origin",
          signal
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
      constructor(baseUrl, token = "") {
        this.baseUrl = String(baseUrl || "http://127.0.0.1:18765").replace(/\/$/, "");
        this.token = String(token || "").trim();
      }
      async request(path, method, payload, signal) {
        let response;
        try {
          response = await fetch(`${this.baseUrl}${path}`, {
            method,
            headers: {
              "Content-Type": "application/json",
              ...this.token ? { Authorization: `Bearer ${this.token}` } : {}
            },
            body: payload === void 0 ? void 0 : JSON.stringify(payload),
            signal
          });
        } catch (error) {
          const detail = error?.message ? `\uFF08${error.message}\uFF09` : "";
          throw new Error(
            `\u65E0\u6CD5\u8FDE\u63A5\u672C\u5730 Bridge\uFF1A${this.baseUrl}\u3002\u8BF7\u5728\u8FD0\u884C\u601D\u6E90\u7684\u8FD9\u53F0\u7535\u8111\u4E0A\u542F\u52A8 Bridge\uFF08\u5728\u63D2\u4EF6\u76EE\u5F55\u8FD0\u884C node local-bridge.js\uFF09\uFF0C\u5E76\u786E\u8BA4\u7AEF\u53E3\u4E0E\u6B64\u5730\u5740\u4E00\u81F4\u3002${detail}`
          );
        }
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
      async health(signal) {
        return this.request("/health", "GET", void 0, signal);
      }
      async authenticate(signal) {
        return this.request("/auth", "POST", {}, signal);
      }
      async status(rootPath, signal) {
        return this.request("/status", "POST", { rootPath }, signal);
      }
      async preview(rootPath, plans, signal) {
        return this.request("/preview", "POST", { rootPath, plans }, signal);
      }
      async apply(rootPath, contentDir, assetDir, plans, signal) {
        return this.request("/sync", "POST", {
          rootPath,
          contentDir,
          assetDir,
          plans
        }, signal);
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
  displayStatus,
  sha256Text
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
    this.activeControllers = /* @__PURE__ */ new Set();
    this.activeDialogs = /* @__PURE__ */ new Set();
    this.unloaded = false;
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
      title: this.t("publisherTitle"),
      position: "right",
      contextMenu: (menu) => {
        menu.addItem({
          id: "siyuan-blog-publisher-settings",
          icon: "iconSettings",
          label: this.t("settings"),
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
        console.warn(`[${this.name}] \u5173\u95ED\u53D1\u5E03\u7A97\u53E3\u5931\u8D25`, error);
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
      console.warn("\u52A0\u8F7D\u7B14\u8BB0\u672C\u5217\u8868\u5931\u8D25", error);
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
          platform: platformLabel(result.platform, (key) => this.t(key))
        }));
      } catch (error) {
        showMessage(this.t("bridgeFailed", { error: error.message }), 7e3, "error");
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
          includeTitle: includeTitle.checked
        });
        try {
          await this.saveConfig();
          showMessage(this.t("settingsSaved"));
        } catch (error) {
          showMessage(this.t("settingsSaveFailed", { error: error.message }), 7e3, "error");
        }
      }
    });
    this.setting.addItem({
      title: this.t("settingNotebookTitle"),
      description: this.t("settingNotebookDescription"),
      direction: "row",
      actionElement: notebook
    });
    this.setting.addItem({
      title: this.t("settingWindowsPathTitle"),
      description: this.t("settingWindowsPathDescription"),
      direction: "row",
      actionElement: windowsRoot
    });
    this.setting.addItem({
      title: this.t("settingMacPathTitle"),
      description: this.t("settingMacPathDescription"),
      direction: "row",
      actionElement: macRoot
    });
    this.setting.addItem({
      title: this.t("settingContentDirTitle"),
      description: this.t("settingContentDirDescription"),
      direction: "row",
      actionElement: contentDir
    });
    this.setting.addItem({
      title: this.t("settingAssetDirTitle"),
      description: this.t("settingAssetDirDescription"),
      direction: "row",
      actionElement: assetDir
    });
    this.setting.addItem({
      title: this.t("settingBridgeUrlTitle"),
      description: this.t("settingBridgeUrlDescription"),
      direction: "row",
      actionElement: bridgeAction(bridgeUrl, checkButton)
    });
    this.setting.addItem({
      title: this.t("settingBridgeTokenTitle"),
      description: this.t("settingBridgeTokenDescription"),
      direction: "row",
      actionElement: bridgeToken
    });
    this.setting.addItem({
      title: this.t("settingDefaultCategoryTitle"),
      description: this.t("settingDefaultCategoryDescription"),
      direction: "row",
      actionElement: category
    });
    this.setting.addItem({
      title: this.t("settingCategoriesTitle"),
      description: this.t("settingCategoriesDescription"),
      direction: "row",
      actionElement: categories
    });
    this.setting.addItem({
      title: this.t("settingIncludeTitleTitle"),
      description: this.t("settingIncludeTitleDescription"),
      direction: "row",
      actionElement: includeTitle
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
      content: publisherTemplate((key) => this.t(key))
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
      selected: /* @__PURE__ */ new Set(),
      manifest: {},
      bridgeError: "",
      bridgePlatform: "",
      activeLocalRoot: "",
      scanning: false
    };
    const setMessage = (text, isError = false, details = "") => {
      message.textContent = text;
      message.title = isError ? details || text : "";
      message.classList.toggle("siyuan-blog-publisher__message--error", isError);
    };
    const updateTarget = () => {
      const key = localPathConfigKey(state.bridgePlatform);
      const configuredPath = key ? this.config[key] || this.config.legacyLocalRoot : "";
      const localTarget = state.bridgePlatform ? `${platformLabel(state.bridgePlatform, (name) => this.t(name))}: ${configuredPath || this.t("platformPathNotConfigured")} \xB7 ${this.config.contentDir}` : this.t("detectingBridgePlatform");
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
          platform: platformLabel(health.platform, (key) => this.t(key))
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
    const categoryOptions = (current = "") => getCategoryChoices(current).map((item) => `<option value="${escapeHtml(item)}" ${item === current ? "selected" : ""}>${escapeHtml(item)}</option>`).join("");
    bulkCategory.innerHTML = `<option value="">${escapeHtml(this.t("bulkCategoryPlaceholder"))}</option>${categoryOptions()}`;
    const render = () => {
      if (!state.docs.length) {
        list.innerHTML = `<div class="siyuan-blog-publisher__empty">${escapeHtml(this.t("emptyScan"))}</div>`;
        return;
      }
      list.innerHTML = state.docs.map((item) => {
        const warning = item.plan.warnings?.length ? `<span class="siyuan-blog-publisher__warning" title="${escapeHtml(item.plan.warnings.join("\n"))}">\u26A0</span>` : "";
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
          state.manifest.documents?.[item.plan.sourceId]
        );
        item.displayStatus = displayStatus(
          item.plan.status,
          state.manifest.documents?.[item.plan.sourceId],
          item.plan.sourceHash
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
            state.manifest.documents?.[item.plan.sourceId]
          );
          item.displayStatus = displayStatus(
            item.plan.status,
            state.manifest.documents?.[item.plan.sourceId],
            item.plan.sourceHash
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
            const document2 = documents[index];
            const entry = state.manifest.documents?.[document2.id];
            const plan = await this.api.buildPlan(document2, this.config, entry, controller.signal);
            if (controller.signal.aborted) return;
            scanned[index] = {
              plan,
              sourceDocument: document2,
              displayStatus: displayStatus(plan.status, entry, plan.sourceHash)
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
        const bridgeHint = state.bridgeError ? this.t("bridgeUnavailableHint") : "";
        setMessage(
          this.t("scanCompleted", { documents: state.docs.length, publishable, bridgeHint }),
          Boolean(state.bridgeError),
          state.bridgeError
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
      const warnings = item.plan.warnings?.length ? `<div class="siyuan-blog-publisher__preview-warnings">${item.plan.warnings.map(escapeHtml).join("<br>")}</div>` : "";
      new Dialog({
        title: this.t("previewTitle", { title: item.plan.title }),
        width: "900px",
        height: "680px",
        content: `<div class="siyuan-blog-publisher__preview">${warnings}<pre>${escapeHtml(item.plan.content)}</pre></div>`
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
        const pushDate = formatLocalDate(/* @__PURE__ */ new Date());
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
          controller.signal
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
};
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
    contentHash: await sha256Text(content)
  };
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
