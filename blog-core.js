"use strict";

/**
 * The format/conversion part of the publisher. This file intentionally does
 * not depend on SiYuan or Node APIs so it can also be reused by the GitHub
 * adapter in the next version.
 */

const DEFAULT_CONFIG = Object.freeze({
    notebookId: "",
    localRoot: "",
    contentDir: "src/content/blog",
    assetDir: "public/images/blog",
    bridgeUrl: "http://127.0.0.1:18765",
    includeTitle: false,
    defaultCategory: "",
});

const VALID_STATUSES = new Set(["draft", "pending", "published", "archived"]);

function normalizeConfig(input) {
    const value = input || {};
    return {
        ...DEFAULT_CONFIG,
        ...value,
        contentDir: normalizeRelativeDir(value.contentDir || DEFAULT_CONFIG.contentDir),
        assetDir: normalizeRelativeDir(value.assetDir || DEFAULT_CONFIG.assetDir),
        bridgeUrl: String(value.bridgeUrl || DEFAULT_CONFIG.bridgeUrl).replace(/\/$/, ""),
        localRoot: String(value.localRoot || "").trim(),
        notebookId: String(value.notebookId || "").trim(),
        includeTitle: Boolean(value.includeTitle),
        defaultCategory: String(value.defaultCategory || "").trim(),
    };
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
    const candidates = [name, `custom-${name}`, name.replace(/^blog\./, "blog-")];
    for (const key of candidates) {
        if (Object.prototype.hasOwnProperty.call(attrs, key) && attrs[key] !== null && attrs[key] !== undefined) {
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
            // Fall back to the delimiter parser for malformed custom attrs.
        }
    }
    return raw
        .split(/[\n,，、;；\s]+/)
        .map((item) => item.trim().replace(/^#/, ""))
        .filter(Boolean)
        .filter((item, index, items) => items.indexOf(item) === index);
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
        `updatedDate: ${updatedDate}`,
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

function createBlogDocument({ sourceId, sourcePath, title, markdown, attrs, config, now, createdDate, updatedDate }) {
    const normalizedConfig = normalizeConfig(config);
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
    const contentBody = normalizedConfig.includeTitle && !/^#\s/.test(body) ? `# ${title}\n\n${body}` : body;
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
            slug,
        }) + rewrittenBody,
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
    // sourceHash is calculated against a canonical document with an empty
    // sourceHash field. This avoids a circular hash while remaining stable.
    const sourceHash = await sha256Text(document.render(""));
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
        action: "create",
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
