"use strict";

/**
 * The format/conversion part of the publisher. This file intentionally does
 * not depend on SiYuan or Node APIs so it can be reused by the local Bridge
 * and any future output adapter.
 */

const DEFAULT_CONFIG = Object.freeze({
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
    categories: ["工程实践", "后端框架", "数据库技术", "工程基础设施", "前端应用", "中间件", "随笔"],
});

const VALID_STATUSES = new Set(["draft", "pending", "published", "archived"]);

function normalizeConfig(input) {
    const value = input || {};
    const normalized = {
        ...DEFAULT_CONFIG,
        ...value,
        contentDir: normalizeRelativeDir(value.contentDir || DEFAULT_CONFIG.contentDir),
        assetDir: normalizeRelativeDir(value.assetDir || DEFAULT_CONFIG.assetDir),
        bridgeUrl: String(value.bridgeUrl || DEFAULT_CONFIG.bridgeUrl).replace(/\/$/, ""),
        bridgeToken: String(value.bridgeToken || "").trim(),
        localRootWindows: String(value.localRootWindows || "").trim(),
        localRootMac: String(value.localRootMac || "").trim(),
        legacyLocalRoot: String(value.legacyLocalRoot || value.localRoot || "").trim(),
        notebookId: String(value.notebookId || "").trim(),
        includeTitle: Boolean(value.includeTitle),
        defaultCategory: String(value.defaultCategory || "").trim(),
        categories: normalizeCategories(value.categories ?? DEFAULT_CONFIG.categories),
    };
    delete normalized.localRoot;
    delete normalized.githubUrl;
    return normalized;
}

function normalizeCategories(value) {
    const items = Array.isArray(value) ? value : String(value || "").split(/[\n\r]+/);
    return items
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .filter((item, index, values) => values.indexOf(item) === index);
}

function normalizeRelativeDir(value) {
    return String(value || "")
        .replace(/\\/g, "/")
        .replace(/^\/+|\/+$/g, "")
        .split("/")
        .filter((part) => part && part !== "." && part !== "..")
        .join("/");
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
    const normalized = String(title || "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    const ascii = normalized
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80)
        .replace(/-+$/g, "");

    if (ascii) {
        // A mixed-language title may collapse to the same ASCII part as
        // another title (for example "Redis" and "Redis 缓存"). Keep the
        // readable part but add a deterministic suffix when non-ASCII text
        // was removed.
        return /[^\x00-\x7F]/.test(String(title || ""))
            ? `${ascii}-${fnv1a(`${title}:${sourceId}`)}`
            : ascii;
    }

    // Keep the filename portable for a Chinese-only title while making it
    // stable across repeated scans. The source ID prevents equal titles from
    // generating the same slug.
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
    return new Date().toISOString().slice(0, 10);
}

function readAttribute(attrs, name) {
    if (!attrs || typeof attrs !== "object") {
        return "";
    }
    const siYuanCustomName = `custom-${name.replace(/\./g, "-").toLowerCase()}`;
    const candidates = [name, siYuanCustomName, name.replace(/^blog\./, "blog-")];
    for (const key of candidates) {
        if (Object.prototype.hasOwnProperty.call(attrs, key) && attrs[key] !== null && attrs[key] !== undefined) {
            return String(attrs[key]).trim();
        }
    }
    return "";
}

function parseTags(value) {
    if (Array.isArray(value)) {
        return value.map((item) => String(item).trim()).filter(Boolean)
            .filter((item, index, items) => items.indexOf(item) === index);
    }
    const raw = String(value || "").trim();
    if (raw.startsWith("[")) {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parseTags(parsed);
            }
        } catch (error) {
            // Fall back to the delimiter parser for malformed custom attrs.
        }
    }
    return raw
        .split(/[\n,，、;；]+/)
        .map((item) => item.trim().replace(/^#/, ""))
        .filter(Boolean)
        .filter((item, index, items) => items.indexOf(item) === index);
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
        body: lines.slice(closingIndex + 1).join("\n").replace(/^(?:\r?\n)+/, ""),
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
        return `# ${title}\n\n${String(markdown || "").trimStart()}`;
    }
    return String(markdown || "");
}

function normalizeStatus(value) {
    const status = String(value || "pending").toLowerCase();
    return VALID_STATUSES.has(status) ? status : "pending";
}

function stripMarkdown(value) {
    return String(value || "")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/[`*_>#~]/g, "")
        .replace(/\s+/g, " ")
        .trim();
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
        ...(updatedDate ? [`updatedDate: ${updatedDate}`] : []),
        `category: ${quote(category)}`,
        `tags: ${tagValue}`,
        `draft: ${draft ? "true" : "false"}`,
        `source: "siyuan"`,
        `siyuanId: ${quote(sourceId)}`,
        `slug: ${quote(slug)}`,
        `sourceHash: ${quote(sourceHash)}`,
        "---",
        "",
    ].join("\n");
}

function findWarnings(markdown, assetRefs) {
    const warnings = [];
    const source = String(markdown || "");
    if (/<iframe\b|<script\b|javascript:/i.test(source)) {
        warnings.push("正文包含外部 HTML 或脚本，请在博客中确认安全性。");
    }
    if (/!\[[^\]]*\]\(\s*https?:\/\//i.test(source)) {
        warnings.push("正文包含外部图片链接，插件不会把它复制到博客仓库。");
    }
    if (/数据库|属性视图|集市模板|查询块|\{\{\{/.test(source)) {
        warnings.push("正文可能包含思源特有块，已按导出的 Markdown 保留，请在博客中复核。");
    }
    if (assetRefs.some((item) => !/^\/?assets\//i.test(item.sourcePath))) {
        warnings.push("存在无法识别的资源引用。");
    }
    return warnings;
}

function createBlogDocument({ sourceId, sourcePath, title, markdown, attrs, config, now, createdDate, updatedDate, existingSlug, existingPubDate, existingUpdatedDate }) {
    const normalizedConfig = normalizeConfig(config);
    const exported = stripExportedFrontmatter(markdown);
    const sourceMarkdown = exported.body;
    const explicitPubDate = readAttribute(attrs, "blog.pubDate");
    const publishDate = normalizeDate(
        explicitPubDate,
        normalizeDate(existingPubDate || now || createdDate, today()),
    );
    const pinPubDateOnSync = !explicitPubDate && !existingPubDate;
    const firstPush = !existingPubDate;
    const sourceUpdatedDate = normalizeDate(updatedDate || now, today());
    // Keep updatedDate absent on first push. For an existing article, preserve
    // its previous value in previews; the publisher stamps the next sync date.
    const effectiveUpdatedDate = existingPubDate ? String(existingUpdatedDate || "") : "";
    const status = normalizeStatus(readAttribute(attrs, "blog.status"));
    const explicitSlug = readAttribute(attrs, "blog.slug");
    const stableSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(existingSlug || ""))
        ? String(existingSlug)
        : "";
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
        publicPath: `${publicAssetRoot}/${slug}/${assetFileName(item.sourcePath)}`,
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
            slug,
        }) + rewrittenBody,
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
        render,
    };
}

function getCrypto() {
    if (typeof globalThis.crypto === "undefined" || !globalThis.crypto.subtle) {
        throw new Error("当前环境不支持 Web Crypto，无法计算同步 hash。");
    }
    return globalThis.crypto;
}

async function sha256Text(value) {
    const bytes = new TextEncoder().encode(String(value));
    const digest = await getCrypto().subtle.digest("SHA-256", bytes);
    return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function createSyncPlan(input) {
    const document = createBlogDocument(input);
    // Keep push time out of sourceHash, so an unchanged article remains
    // unchanged when scanned on a later day. Use the source document's edit
    // date here to preserve compatibility with existing sync manifests. The
    // sync date is still included in contentHash after rendering.
    const sourceHash = await sha256Text(document.render("", document.sourceUpdatedDate));
    const content = document.render(sourceHash);
    const contentHash = await sha256Text(content);
    return {
        sourceId: document.sourceId,
        sourcePath: document.sourcePath,
        title: document.title,
        slug: document.slug,
        targetPath: document.targetPath,
        content,
        sourceHash,
        contentHash,
        assets: document.assets,
        warnings: document.warnings,
        status: document.status,
        category: document.category,
        action: "create",
        pubDate: document.pubDate,
        updatedDate: document.updatedDate,
        pinPubDateOnSync: document.pinPubDateOnSync,
        firstPush: document.firstPush,
    };
}

function shouldPublish(status) {
    return status !== "draft" && status !== "archived";
}

function displayStatus(status, manifestEntry, sourceHash) {
    if (!manifestEntry) {
        return status === "published" ? "有更新" : status;
    }
    if (manifestEntry.sourceHash === sourceHash) {
        return "published";
    }
    return "有更新";
}

module.exports = {
    DEFAULT_CONFIG,
    normalizeConfig,
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
    shouldPublish,
    displayStatus,
};
