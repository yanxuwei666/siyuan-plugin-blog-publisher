"use strict";

const { createSyncPlan } = require("./blog-core");

class SiyuanApi {
    constructor(fetchImpl) {
        this.fetch = fetchImpl || globalThis.fetch.bind(globalThis);
    }

    async post(path, payload, signal) {
        const response = await this.fetch(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload || {}),
            credentials: "same-origin",
            signal,
        });
        const text = await response.text();
        let body;
        try {
            body = text ? JSON.parse(text) : {};
        } catch (error) {
            throw new Error(`${path} 返回了无法解析的响应（HTTP ${response.status}）。`);
        }
        if (!response.ok || (body.code !== undefined && body.code !== 0)) {
            throw new Error(`${path} 失败：${body.msg || `HTTP ${response.status}`}`);
        }
        return body.data;
    }

    async listNotebooks() {
        const data = await this.post("/api/notebook/lsNotebooks", {});
        return Array.isArray(data?.notebooks) ? data.notebooks : [];
    }

    async listDocuments(notebookId, signal) {
        if (!/^[0-9]{14}-[a-z0-9]{7}$/i.test(String(notebookId || ""))) {
            throw new Error("发布笔记本 ID 无效，请从下拉列表选择笔记本。");
        }
        const stmt = [
            "SELECT id, content, hpath, updated, created",
            `FROM blocks WHERE box = '${notebookId}' AND type = 'd'`,
            "ORDER BY hpath, id LIMIT 10000",
        ].join(" ");
        const data = await this.post("/api/query/sql", { stmt }, signal);
        return Array.isArray(data) ? data : [];
    }

    async getDocumentMarkdown(id, signal) {
        const data = await this.post("/api/export/exportMdContent", { id }, signal);
        return {
            hPath: data?.hPath || "",
            content: data?.content || "",
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
            this.getBlockAttrs(doc.id, signal),
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
            now: new Date().toISOString(),
            createdDate: doc.created,
            updatedDate: doc.updated,
        });
    }

    async readAssetAsBase64(sourcePath, signal) {
        let decodedPath;
        try {
            decodedPath = decodeURIComponent(String(sourcePath || "").split(/[?#]/)[0]).replace(/\\/g, "/");
        } catch (error) {
            throw new Error(`图片资源路径编码无效：${sourcePath}`);
        }
        const segments = decodedPath.split("/").filter(Boolean);
        if (segments[0]?.toLowerCase() !== "assets" || segments.some((part) => part === "." || part === ".." || /[\u0000-\u001f]/.test(part))) {
            throw new Error(`拒绝读取博客资源目录之外的文件：${sourcePath}`);
        }
        const path = `/data/${segments.join("/")}`;
        const response = await this.fetch("/api/file/getFile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path }),
            credentials: "same-origin",
            signal,
        });
        if (!response.ok) {
            throw new Error(`读取资源失败：${sourcePath}（HTTP ${response.status}）。`);
        }
        const buffer = await response.arrayBuffer();
        return bytesToBase64(new Uint8Array(buffer));
    }
}

function bytesToBase64(bytes) {
    let result = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
        result += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return btoa(result);
}

module.exports = { SiyuanApi, bytesToBase64 };
