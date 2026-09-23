"use strict";

/**
 * A localhost-only bridge for writing plugin-managed blog files.
 *
 * Usage:
 *   node local-bridge.js --port 18765
 *
 * The bridge is deliberately outside SiYuan. The browser can send a sync
 * plan to it, while this process is the only component allowed to write to a
 * user-selected blog project directory.
 */

const http = require("node:http");
const path = require("node:path");
const fsNative = require("node:fs");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const os = require("node:os");

const PORT = readArg("--port", 18765);
const HOST = "127.0.0.1";
const MAX_BODY_BYTES = 64 * 1024 * 1024;
const SYNC_DATE_VERSION = 1;
let BRIDGE_TOKEN = "";

function readArg(name, fallback) {
    const index = process.argv.indexOf(name);
    if (index < 0 || !process.argv[index + 1]) {
        return fallback;
    }
    const value = Number(process.argv[index + 1]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readStringArg(name) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? String(process.argv[index + 1] || "") : "";
}

async function loadBridgeToken() {
    const supplied = String(process.env.SIYUAN_BLOG_BRIDGE_TOKEN || readStringArg("--token") || "").trim();
    if (supplied) {
        if (supplied.length < 32) {
            throw new Error("Bridge token 至少需要 32 个字符。");
        }
        return supplied;
    }

    const directory = path.join(os.homedir(), ".siyuan-blog-publisher");
    const tokenPath = path.join(directory, "bridge-token");
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await fs.chmod(directory, 0o700).catch(() => undefined);
    try {
        const existing = (await fs.readFile(tokenPath, "utf8")).trim();
        if (existing.length < 32) {
            throw new Error(`Bridge token 文件无效：${tokenPath}`);
        }
        await fs.chmod(tokenPath, 0o600).catch(() => undefined);
        return existing;
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
    }

    const generated = crypto.randomBytes(32).toString("hex");
    try {
        await fs.writeFile(tokenPath, `${generated}\n`, { flag: "wx", mode: 0o600 });
        return generated;
    } catch (error) {
        if (error.code !== "EEXIST") throw error;
        return (await fs.readFile(tokenPath, "utf8")).trim();
    }
}

function isAuthorized(request) {
    const match = String(request.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
    if (!match) return false;
    const presented = Buffer.from(match[1]);
    const expected = Buffer.from(BRIDGE_TOKEN);
    return presented.length === expected.length && crypto.timingSafeEqual(presented, expected);
}

function jsonResponse(response, statusCode, body) {
    response.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Cache-Control": "no-store",
    });
    response.end(JSON.stringify(body));
}

function parseJson(request) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        request.on("data", (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                reject(new Error("请求体过大，单次同步最多支持 64 MB。"));
                request.destroy();
                return;
            }
            chunks.push(chunk);
        });
        request.on("end", () => {
            try {
                resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
            } catch (error) {
                reject(new Error("请求体不是合法 JSON。"));
            }
        });
        request.on("error", reject);
    });
}

function resolveRoot(rootPath) {
    if (typeof rootPath !== "string" || !rootPath.trim()) {
        throw new Error("未提供博客仓库路径。请在插件设置中填写博客项目根目录。");
    }
    let configuredPath = rootPath.trim();
    if (configuredPath === "~" || configuredPath.startsWith("~/") || configuredPath.startsWith("~\\")) {
        configuredPath = path.join(os.homedir(), configuredPath.slice(2).replace(/[\\/]+/g, path.sep));
    }
    if (process.platform !== "win32" && /^[a-zA-Z]:[\\/]/.test(configuredPath)) {
        const platformName = process.platform === "darwin" ? "macOS" : "Linux";
        throw new Error(
            `仓库路径“${rootPath.trim()}”是 Windows 路径，但 Bridge 正运行在 ${platformName}。请在同步窗口填入本机路径，例如 ~/Code/my-blog。Bridge 必须运行在能访问该仓库的同一台电脑上。`,
        );
    }
    if (!path.isAbsolute(configuredPath)) {
        throw new Error("仓库路径必须是绝对路径；Mac/Linux 可填写 ~/Code/my-blog，Windows 可填写 D:\\Code\\my-blog。");
    }
    return path.resolve(configuredPath);
}

function safePath(root, relativePath) {
    if (typeof relativePath !== "string" || !relativePath.trim()) {
        throw new Error("同步计划包含空文件路径。");
    }
    const normalized = relativePath.replace(/\\/g, "/");
    const parts = normalized.split("/");
    if (
        path.isAbsolute(normalized)
        || /^[a-zA-Z]:\//.test(normalized)
        || normalized.startsWith("//")
        || parts.includes("..")
        || parts.every((part) => !part || part === ".")
    ) {
        throw new Error(`拒绝写入仓库目录之外的路径：${relativePath}`);
    }
    const absoluteRoot = path.resolve(root);
    const absolutePath = path.resolve(absoluteRoot, normalized);
    if (absolutePath !== absoluteRoot && !absolutePath.startsWith(`${absoluteRoot}${path.sep}`)) {
        throw new Error(`拒绝写入仓库目录之外的路径：${relativePath}`);
    }
    return absolutePath;
}

async function checkedPath(root, relativePath) {
    const lexicalPath = safePath(root, relativePath);
    const relative = path.relative(path.resolve(root), lexicalPath);
    const realRoot = await fs.realpath(root);
    let current = realRoot;
    for (const part of relative.split(path.sep).filter(Boolean)) {
        current = path.join(current, part);
        try {
            const stats = await fs.lstat(current);
            if (stats.isSymbolicLink()) {
                throw new Error(`拒绝通过符号链接访问仓库路径：${relativePath}`);
            }
        } catch (error) {
            if (error.code === "ENOENT") break;
            throw error;
        }
    }
    return path.resolve(realRoot, relative);
}

async function readManifest(root) {
    const manifestPath = await checkedPath(root, ".siyuan-sync.json");
    try {
        const value = JSON.parse(await fs.readFile(manifestPath, "utf8"));
        if (!value || typeof value !== "object" || !value.documents || typeof value.documents !== "object" || Array.isArray(value.documents)) {
            throw new Error("同步清单格式不正确。");
        }
        return value;
    } catch (error) {
        if (error.code === "ENOENT") {
            return { version: 1, project: path.basename(root), documents: {} };
        }
        throw error;
    }
}

async function sha256Buffer(buffer) {
    return `sha256:${crypto.createHash("sha256").update(buffer).digest("hex")}`;
}

async function existingHash(filePath) {
    try {
        return await sha256Buffer(await fs.readFile(filePath));
    } catch (error) {
        if (error.code === "ENOENT") {
            return null;
        }
        throw error;
    }
}

async function inspectPlan(root, manifest, plan) {
    if (!plan || typeof plan !== "object" || !/^[0-9]{14}-[a-z0-9]{7}$/i.test(String(plan.sourceId || ""))) {
        throw new Error("同步计划缺少有效的思源文档 ID。");
    }
    const target = await checkedPath(root, plan.targetPath);
    const entry = manifest.documents[plan.sourceId];
    const targetHash = await existingHash(target);
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
        reason = "目标文件存在且不是本插件上次写入的版本。";
    } else if (entry) {
        action = "update";
        reason = "同步清单存在，但目标文件已不存在。";
    }

    const assets = [];
    for (const asset of Array.isArray(plan.assets) ? plan.assets : []) {
        const assetTarget = await checkedPath(root, asset.targetPath);
        const assetEntry = (entry?.assets || []).find((item) => item.targetPath === asset.targetPath);
        const supplied = asset.contentBase64 ? Buffer.from(asset.contentBase64, "base64") : null;
        const assetHash = supplied ? await sha256Buffer(supplied) : asset.hash || "";
        const currentHash = await existingHash(assetTarget);
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
            assetReason = "资源存在且不是本插件上次写入的版本。";
        }
        assets.push({ ...asset, action: assetAction, reason: assetReason, hash: assetHash, absolutePath: assetTarget });
        if (assetAction === "conflict" && action !== "conflict") {
            action = "conflict";
            reason = `资源 ${asset.targetPath} 存在冲突。`;
        }
    }

    return { plan, action, reason, assets, absolutePath: target };
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

async function applyFileOperations(root, operations) {
    const staged = [];
    const applied = [];
    const operationId = crypto.randomBytes(12).toString("hex");
    try {
        for (let index = 0; index < operations.length; index += 1) {
            const operation = operations[index];
            const filePath = await checkedPath(root, path.relative(root, operation.filePath));
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            const suffix = `${process.pid}-${operationId}-${index}`;
            const tempPath = `${filePath}.siyuan-tmp-${suffix}`;
            const backupPath = `${filePath}.siyuan-backup-${suffix}`;
            let existed = false;
            try {
                await fs.lstat(filePath);
                existed = true;
            } catch (error) {
                if (error.code !== "ENOENT") throw error;
            }
            const item = { filePath, tempPath, backupPath, existed };
            staged.push(item);
            if (existed) {
                await fs.copyFile(filePath, backupPath, fsNative.constants.COPYFILE_EXCL);
            }
            await fs.writeFile(tempPath, operation.content, { flag: "wx" });
        }

        for (const item of staged) {
            await fs.rename(item.tempPath, item.filePath);
            applied.push(item);
        }
    } catch (error) {
        const rollbackErrors = [];
        for (const item of applied.reverse()) {
            try {
                if (item.existed) {
                    await fs.rename(item.backupPath, item.filePath);
                } else {
                    await fs.rm(item.filePath, { force: true });
                }
            } catch (rollbackError) {
                rollbackErrors.push(rollbackError.message || String(rollbackError));
            }
        }
        await Promise.all(staged.flatMap((item) => [
            fs.rm(item.tempPath, { force: true }).catch(() => undefined),
            fs.rm(item.backupPath, { force: true }).catch(() => undefined),
        ]));
        if (rollbackErrors.length) {
            throw new Error(`${error.message || error}；回滚部分文件时也失败：${rollbackErrors.join("；")}`);
        }
        throw error;
    }

    await Promise.all(staged.map((item) => fs.rm(item.backupPath, { force: true }).catch(() => undefined)));
}

async function applyPlans(root, manifest, inspected) {
    const operations = [];
    let changed = false;
    for (const item of inspected) {
        if (item.action === "conflict") {
            continue;
        }
        if (item.action !== "skip") {
            operations.push({ filePath: item.absolutePath, content: item.plan.content || "" });
            changed = true;
        }
        const savedAssets = [];
        for (const asset of item.assets) {
            if (asset.action === "conflict") {
                continue;
            }
            if (asset.action !== "skip") {
                if (!asset.contentBase64) {
                    throw new Error(`资源 ${asset.sourcePath} 没有传入内容。`);
                }
                operations.push({ filePath: asset.absolutePath, content: Buffer.from(asset.contentBase64, "base64") });
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
            filePath: await checkedPath(root, ".siyuan-sync.json"),
            content: `${JSON.stringify(manifest, null, 2)}\n`,
        });
        await applyFileOperations(root, operations);
    }
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

async function handle(request, response) {
    if (request.method === "OPTIONS") {
        response.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        });
        response.end();
        return;
    }
    if (request.method === "GET" && request.url === "/health") {
        jsonResponse(response, 200, { ok: true, service: "siyuan-blog-publisher-bridge", version: 3, platform: process.platform });
        return;
    }
    if (!(["/auth", "/status", "/preview", "/sync"].includes(request.url) && request.method === "POST")) {
        jsonResponse(response, 404, { ok: false, error: "Not Found" });
        return;
    }

    if (!isAuthorized(request)) {
        jsonResponse(response, 401, { ok: false, error: "Bridge token 无效或未配置。请将 Bridge 启动时显示的 token 填入插件设置。" });
        return;
    }
    if (request.url === "/auth") {
        jsonResponse(response, 200, { ok: true, service: "siyuan-blog-publisher-bridge", version: 3, platform: process.platform });
        return;
    }

    const payload = await parseJson(request);
    const root = await fs.realpath(resolveRoot(payload.rootPath));
    const manifest = await readManifest(root);
    if (request.url === "/status") {
        jsonResponse(response, 200, { ok: true, manifest });
        return;
    }

    const plans = Array.isArray(payload.plans) ? payload.plans : [];
    const inspected = await inspectPlans(root, plans, manifest);
    const results = inspected.map(publicResult);
    if (request.url === "/preview") {
        jsonResponse(response, 200, { ok: true, results });
        return;
    }
    if (inspected.some((item) => item.action === "conflict")) {
        jsonResponse(response, 409, { ok: false, error: "同步存在冲突，未写入任何文件。", results });
        return;
    }
    await applyPlans(root, manifest, inspected);
    jsonResponse(response, 200, { ok: true, results, manifest });
}

const server = http.createServer((request, response) => {
    handle(request, response).catch((error) => {
        jsonResponse(response, 500, { ok: false, error: error.message || String(error) });
    });
});

loadBridgeToken().then((token) => {
    BRIDGE_TOKEN = token;
    server.listen(PORT, HOST, () => {
        console.log(`SiYuan Blog Publisher Bridge listening on http://${HOST}:${PORT}`);
        console.log("Only requests from this computer are accepted. Stop with Ctrl+C.");
        console.log(`Bridge token (paste into plugin settings): ${token}`);
    });
}).catch((error) => {
    console.error(`无法初始化 Bridge token：${error.message || error}`);
    process.exitCode = 1;
});
