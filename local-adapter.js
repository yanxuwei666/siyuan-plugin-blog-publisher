"use strict";

class LocalAdapter {
    constructor(baseUrl) {
        this.baseUrl = String(baseUrl || "http://127.0.0.1:18765").replace(/\/$/, "");
    }

    async request(path, method, payload) {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method,
            headers: { "Content-Type": "application/json" },
            body: payload === undefined ? undefined : JSON.stringify(payload),
        });
        const text = await response.text();
        let data;
        try {
            data = text ? JSON.parse(text) : {};
        } catch (error) {
            throw new Error(`本地 Bridge 返回了无法解析的响应（HTTP ${response.status}）。`);
        }
        if (!response.ok || data.ok === false) {
            throw new Error(data.error || `本地 Bridge 请求失败（HTTP ${response.status}）。`);
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
            plans,
        });
    }
}

module.exports = { LocalAdapter };
