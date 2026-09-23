"use strict";

const SYNC_DATE_VERSION = 1;
const DB_NAME = "siyuan-blog-publisher";
const DB_VERSION = 1;
const DB_STORE = "directory-handles";

function getHostPlatform() {
    const platform = String(globalThis.navigator?.userAgentData?.platform || globalThis.navigator?.platform || "").toLowerCase();
    if (platform.includes("win")) return "windows";
    if (platform.includes("mac") || platform.includes("darwin")) return "macos";
    return "other";
}

function isDirectoryAccessSupported() {
    return typeof globalThis.window?.showDirectoryPicker === "function"
        && typeof globalThis.indexedDB !== "undefined";
}

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(DB_STORE)) {
                database.createObjectStore(DB_STORE);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("无法打开本机目录授权存储。"));
        request.onblocked = () => reject(new Error("目录授权存储正在升级，请关闭其他思源窗口后重试。"));
    });
}

async function readStoredHandle(key) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(DB_STORE, "readonly");
        const request = transaction.objectStore(DB_STORE).get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error("读取本机目录授权失败。"));
        transaction.oncomplete = () => database.close();
        transaction.onerror = () => {
            database.close();
            reject(transaction.error || new Error("读取本机目录授权失败。"));
        };
        transaction.onabort = () => {
            database.close();
            reject(transaction.error || new Error("读取本机目录授权失败。"));
        };
    });
}

async function writeStoredHandle(key, handle) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(DB_STORE, "readwrite");
        transaction.objectStore(DB_STORE).put(handle, key);
        transaction.oncomplete = () => {
            database.close();
            resolve();
        };
        transaction.onerror = () => {
            database.close();
            reject(transaction.error || new Error("保存本机目录授权失败。"));
        };
        transaction.onabort = () => {
            database.close();
            reject(transaction.error || new Error("保存本机目录授权失败。"));
        };
    });
}

class DirectoryStore {
    constructor(platform = getHostPlatform()) {
        this.platform = platform;
        this.key = `root:${platform}`;
    }

    static isSupported() {
        return isDirectoryAccessSupported();
    }

    async getHandle() {
        if (!isDirectoryAccessSupported()) return null;
        return readStoredHandle(this.key);
    }

    async chooseAndSave() {
        if (!isDirectoryAccessSupported()) {
            throw new Error("当前思源运行环境不支持目录授权，请使用 Chromium 桌面版或配置备用 Bridge。");
        }
        // Call the picker before awaiting anything so the browser can associate
        // it with this button click.
        const handle = await globalThis.window.showDirectoryPicker({
            id: "siyuan-blog-publisher",
            mode: "readwrite",
        });
        const permission = await this.ensurePermission(handle, true);
        if (!permission) {
            throw new Error("没有获得博客目录的读写授权。");
        }
        await writeStoredHandle(this.key, handle);
        return handle;
    }

    async ensurePermission(handle, request = false) {
        if (!handle || typeof handle.queryPermission !== "function") return false;
        let permission = await handle.queryPermission({ mode: "readwrite" });
        if (permission !== "granted" && request && typeof handle.requestPermission === "function") {
            permission = await handle.requestPermission({ mode: "readwrite" });
        }
        return permission === "granted";
    }
}

function safeRelativePath(value) {
    if (typeof value !== "string" || !value.trim()) {
        throw new Error("同步计划包含空文件路径。");
    }
    const normalized = value.replace(/\\/g, "/");
    const parts = normalized.split("/");
    if (
        normalized.startsWith("/")
        || /^[a-zA-Z]:\//.test(normalized)
        || normalized.startsWith("//")
        || parts.some((part) => part === ".." || /[\u0000-\u001f]/.test(part))
        || parts.every((part) => !part || part === ".")
    ) {
        throw new Error(`拒绝访问博客目录之外的路径：${value}`);
    }
    const cleanParts = parts.filter((part) => part && part !== ".");
    if (!cleanParts.length) throw new Error(`同步计划包含无效文件路径：${value}`);
    return cleanParts;
}

async function resolveParent(root, relativePath, create = false) {
    const parts = safeRelativePath(relativePath);
    const fileName = parts.pop();
    let directory = root;
    for (const part of parts) {
        try {
            directory = await directory.getDirectoryHandle(part, { create });
        } catch (error) {
            if (!create && error?.name === "NotFoundError") return null;
            throw error;
        }
    }
    return { directory, fileName };
}

async function readFile(root, relativePath) {
    const parent = await resolveParent(root, relativePath);
    if (!parent) return null;
    try {
        const handle = await parent.directory.getFileHandle(parent.fileName);
        return new Uint8Array(await (await handle.getFile()).arrayBuffer());
    } catch (error) {
        if (error?.name === "NotFoundError") return null;
        throw error;
    }
}

async function removeFile(root, relativePath) {
    const parent = await resolveParent(root, relativePath);
    if (!parent) return;
    try {
        await parent.directory.removeEntry(parent.fileName);
    } catch (error) {
        if (error?.name !== "NotFoundError") throw error;
    }
}

async function writeFile(root, relativePath, content) {
    const parent = await resolveParent(root, relativePath, true);
    const handle = await parent.directory.getFileHandle(parent.fileName, { create: true });
    const writer = await handle.createWritable();
    try {
        await writer.write(content);
        await writer.close();
    } catch (error) {
        await writer.abort().catch(() => undefined);
        throw error;
    }
}

async function sha256(bytes) {
    if (!globalThis.crypto?.subtle) {
        throw new Error("当前环境不支持 Web Crypto，无法检查同步文件。");
    }
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
    return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function decodeBase64(value) {
    const binary = globalThis.atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}

function throwIfAborted(signal) {
    if (signal?.aborted) {
        const error = new Error("同步已取消。");
        error.name = "AbortError";
        throw error;
    }
}

async function readManifest(root) {
    const bytes = await readFile(root, ".siyuan-sync.json");
    if (!bytes) {
        return { version: 1, project: root.name || "blog", documents: {} };
    }
    let value;
    try {
        value = JSON.parse(new TextDecoder().decode(bytes));
    } catch (error) {
        throw new Error("同步清单 .siyuan-sync.json 不是合法 JSON。");
    }
    if (!value || typeof value !== "object" || !value.documents || typeof value.documents !== "object" || Array.isArray(value.documents)) {
        throw new Error("同步清单格式不正确。");
    }
    return value;
}

async function inspectPlan(root, manifest, plan) {
    if (!plan || typeof plan !== "object" || !/^[0-9]{14}-[a-z0-9]{7}$/i.test(String(plan.sourceId || ""))) {
        throw new Error("同步计划缺少有效的思源文档 ID。");
    }
    const entry = manifest.documents[plan.sourceId];
    const existing = await readFile(root, plan.targetPath);
    const targetHash = existing ? await sha256(existing) : null;
    let action = "create";
    let reason = "目标文件不存在";

    if (entry && entry.path !== plan.targetPath) {
        action = "conflict";
        reason = `slug 或目标路径发生变化；旧文件 ${entry.path} 不会被自动删除。`;
    } else if (
        targetHash
        && entry
        && targetHash === entry.contentHash
        && entry.sourceHash === plan.sourceHash
        && (entry.syncDateVersion >= SYNC_DATE_VERSION || entry.pushDateVersion >= SYNC_DATE_VERSION)
    ) {
        action = "skip";
        reason = "思源内容未变化";
    } else if (targetHash && entry && targetHash === plan.contentHash) {
        action = "skip";
        reason = "内容未变化";
    } else if (targetHash && entry && targetHash === entry.contentHash) {
        action = "update";
        reason = entry.sourceHash === plan.sourceHash ? "更新文章同步日期" : "思源内容有更新";
    } else if (targetHash) {
        action = "conflict";
        reason = entry ? "目标文件已被手动修改，拒绝覆盖。" : "目标文件已存在且未登记在同步清单中，拒绝覆盖。";
    } else if (entry) {
        action = "update";
        reason = "同步清单存在，但目标文件已不存在。";
    }

    const assets = [];
    for (const asset of Array.isArray(plan.assets) ? plan.assets : []) {
        await resolveParent(root, asset.targetPath);
        const assetEntry = (entry?.assets || []).find((item) => item.targetPath === asset.targetPath);
        const supplied = typeof asset.contentBase64 === "string" ? decodeBase64(asset.contentBase64) : null;
        const assetHash = supplied ? await sha256(supplied) : asset.hash || "";
        const current = await readFile(root, asset.targetPath);
        const currentHash = current ? await sha256(current) : null;
        let assetAction = "create";
        let assetReason = "资源不存在";
        if (currentHash && assetEntry && currentHash === assetHash) {
            assetAction = "skip";
            assetReason = "资源未变化";
        } else if (currentHash && assetEntry && currentHash === assetEntry.hash) {
            assetAction = "update";
            assetReason = "资源有更新";
        } else if (currentHash) {
            assetAction = "conflict";
            assetReason = "资源已被手动修改或未登记，拒绝覆盖。";
        }
        assets.push({ ...asset, action: assetAction, reason: assetReason, hash: assetHash });
        if (assetAction === "conflict" && action !== "conflict") {
            action = "conflict";
            reason = `资源 ${asset.targetPath} 存在冲突。`;
        }
    }

    return { plan, action, reason, assets };
}

async function inspectPlans(root, plans, manifest) {
    const targetPaths = new Set();
    const inspected = [];
    for (const plan of plans) {
        const paths = [plan?.targetPath, ...(Array.isArray(plan?.assets) ? plan.assets.map((asset) => asset?.targetPath) : [])]
            .filter((item) => typeof item === "string" && item);
        const duplicate = paths.find((item) => targetPaths.has(item));
        paths.forEach((item) => targetPaths.add(item));
        if (duplicate) {
            inspected.push({ plan, action: "conflict", reason: `文章或资源目标路径重复：${duplicate}`, assets: [] });
            continue;
        }
        inspected.push(await inspectPlan(root, manifest, plan));
    }
    return inspected;
}

function publicResult(item) {
    return {
        sourceId: item.plan.sourceId,
        title: item.plan.title,
        targetPath: item.plan.targetPath,
        action: item.action,
        reason: item.reason,
        warnings: item.plan.warnings || [],
        assets: item.assets.map((asset) => ({
            sourcePath: asset.sourcePath,
            targetPath: asset.targetPath,
            action: asset.action,
            reason: asset.reason,
        })),
    };
}

async function applyOperations(root, operations, signal) {
    const originals = [];
    for (const operation of operations) {
        throwIfAborted(signal);
        originals.push({ path: operation.path, content: await readFile(root, operation.path) });
    }

    const applied = [];
    try {
        for (let index = 0; index < operations.length; index += 1) {
            throwIfAborted(signal);
            applied.push(index);
            await writeFile(root, operations[index].path, operations[index].content);
        }
    } catch (error) {
        const rollbackErrors = [];
        for (const index of applied.reverse()) {
            const original = originals[index];
            try {
                if (original.content) {
                    await writeFile(root, original.path, original.content);
                } else {
                    await removeFile(root, original.path);
                }
            } catch (rollbackError) {
                rollbackErrors.push(rollbackError.message || String(rollbackError));
            }
        }
        if (rollbackErrors.length) {
            throw new Error(`${error.message || error}；回滚部分文件时也失败：${rollbackErrors.join("；")}`);
        }
        throw error;
    }
}

class DirectorySyncAdapter {
    constructor(root, signal) {
        this.root = root;
        this.signal = signal;
    }

    async status() {
        throwIfAborted(this.signal);
        return { manifest: await readManifest(this.root) };
    }

    async preview(plans) {
        throwIfAborted(this.signal);
        const manifest = await readManifest(this.root);
        const inspected = await inspectPlans(this.root, plans, manifest);
        return { results: inspected.map(publicResult) };
    }

    async apply(plans) {
        throwIfAborted(this.signal);
        const manifest = await readManifest(this.root);
        const inspected = await inspectPlans(this.root, plans, manifest);
        const results = inspected.map(publicResult);
        if (inspected.some((item) => item.action === "conflict")) {
            const error = new Error("同步存在冲突，未写入任何文件。");
            error.results = results;
            throw error;
        }

        const operations = [];
        let changed = false;
        for (const item of inspected) {
            if (item.action === "conflict") continue;
            if (item.action !== "skip") {
                operations.push({ path: item.plan.targetPath, content: new TextEncoder().encode(item.plan.content || "") });
                changed = true;
            }
            const savedAssets = [];
            for (const asset of item.assets) {
                if (asset.action === "conflict") continue;
                if (asset.action !== "skip") {
                    if (typeof asset.contentBase64 !== "string") {
                        throw new Error(`资源 ${asset.sourcePath} 没有传入内容。`);
                    }
                    operations.push({ path: asset.targetPath, content: decodeBase64(asset.contentBase64) });
                    changed = true;
                }
                savedAssets.push({ targetPath: asset.targetPath, hash: asset.hash, sourcePath: asset.sourcePath });
            }
            if (item.action !== "skip" || item.assets.some((asset) => asset.action !== "skip")) {
                manifest.documents[item.plan.sourceId] = {
                    path: item.plan.targetPath,
                    assetDir: item.plan.assetDir,
                    slug: item.plan.slug,
                    pubDate: item.plan.pubDate,
                    updatedDate: item.plan.updatedDate || "",
                    sourceHash: item.plan.sourceHash,
                    contentHash: item.plan.contentHash,
                    syncDateVersion: SYNC_DATE_VERSION,
                    lastSyncAt: new Date().toISOString(),
                    assets: savedAssets,
                };
                changed = true;
            }
        }

        if (changed) {
            manifest.updatedAt = new Date().toISOString();
            operations.push({
                path: ".siyuan-sync.json",
                content: new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`),
            });
            await applyOperations(this.root, operations, this.signal);
        }
        return { results, manifest };
    }
}

module.exports = {
    DirectoryStore,
    DirectorySyncAdapter,
    getHostPlatform,
    isDirectoryAccessSupported,
};
