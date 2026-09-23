"use strict";

class LocalAdapter {
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
                    ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
                },
                body: payload === undefined ? undefined : JSON.stringify(payload),
                signal,
            });
        } catch (error) {
            const detail = error?.message ? `（${error.message}）` : "";
            throw new Error(
                `无法连接本地 Bridge：${this.baseUrl}。请在运行思源的这台电脑上启动 Bridge（在插件目录运行 node local-bridge.js），并确认端口与此地址一致。${detail}`,
            );
        }
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

    async health(signal) {
        return this.request("/health", "GET", undefined, signal);
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
            plans,
        }, signal);
    }

}

module.exports = { LocalAdapter };
