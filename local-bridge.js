"use strict";

/**
 * A tiny localhost-only bridge for the first version of the plugin.
 *
 * Usage:
 *   node local-bridge.js --port 18765
 *
 * The bridge is deliberately outside SiYuan. The browser can send a sync
 * plan to it, while this process is the only component allowed to write to a
 * user-selected Git repository.
 */

const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");

const PORT = readArg("--port", 18765);
const HOST = "127.0.0.1";
const MAX_BODY_BYTES = 64 * 1024 * 1024;

function readArg(name, fallback) {
    const index = process.argv.indexOf(name);
    if (index < 0 || !process.argv[index + 1]) {
        return fallback;
    }
    const value = Number(process.argv[index + 1]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

function jsonResponse(response, statusCode, body) {
    response.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
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
        throw new Error("未提供博客仓库路径。请在插件设置中填写本地 Git 仓库路径。");
    }
    return path.resolve(rootPath.trim());
}

function safePath(root, relativePath) {
    if (typeof relativePath !== "string" || !relativePath.trim()) {
        throw new Error("同步计划包含空文件路径。");
    }
    const normalized = relativePath.replace(/\\/g, "/");
    if (path.isAbsolute(normalized) || /^[a-zA-Z]:\//.test(normalized) || normalized.startsWith("//") || normalized.split("/").includes("..")) {
        throw new Error(`拒绝写入仓库目录之外的路径：${relativePath}`);
    }
    const absoluteRoot = path.resolve(root);
    const absolutePath = path.resolve(absoluteRoot, normalized);
    if (absolutePath !== absoluteRoot && !absolutePath.startsWith(`${absoluteRoot}${path.sep}`)) {
        throw new Error(`拒绝写入仓库目录之外的路径：${relativePath}`);
    }
    return absolutePath;
}

async function readManifest(root) {
    const manifestPath = path.join(root, ".siyuan-sync.json");
    try {
        const value = JSON.parse(await fs.readFile(manifestPath, "utf8"));
        if (!value || typeof value !== "object" || typeof value.documents !== "object") {
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
    if (!plan || typeof plan !== "object" || !plan.sourceId) {
        throw new Error("同步计划缺少 sourceId。");
    }
    const target = safePath(root, plan.targetPath);
    const entry = manifest.documents[plan.sourceId];
    const targetHash = await existingHash(target);
    let action = "create";
    let reason = "目标文件不存在";

    if (entry && entry.path !== plan.targetPath) {
        action = "conflict";
        reason = `slug 或目标路径发生变化；旧文件 ${entry.path} 不会被自动删除。`;
    } else if (targetHash && entry && targetHash === plan.contentHash) {
        action = "skip";
        reason = "内容未变化";
    } else if (targetHash && entry && targetHash === entry.contentHash) {
        action = "update";
        reason = "思源内容有更新";
    } else if (targetHash) {
        action = "conflict";
        reason = "目标文件存在且不是本插件上次写入的版本。";
    } else if (entry) {
        action = "update";
        reason = "同步清单存在，但目标文件已不存在。";
    }

    const assets = [];
    for (const asset of Array.isArray(plan.assets) ? plan.assets : []) {
        const assetTarget = safePath(root, asset.targetPath);
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
        if (targetPaths.has(plan.targetPath)) {
            inspected.push({ plan, action: "conflict", reason: `目标路径重复：${plan.targetPath}`, assets: [] });
            continue;
        }
        targetPaths.add(plan.targetPath);
        inspected.push(await inspectPlan(root, manifest, plan));
    }
    return inspected;
}

async function atomicWrite(filePath, content) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.siyuan-tmp-${process.pid}-${Date.now()}`;
    try {
        await fs.writeFile(tempPath, content);
        await fs.rename(tempPath, filePath);
    } finally {
        await fs.rm(tempPath, { force: true }).catch(() => undefined);
    }
}

async function applyPlans(root, manifest, inspected) {
    for (const item of inspected) {
        if (item.action === "conflict") {
            continue;
        }
        if (item.action !== "skip") {
            await atomicWrite(item.absolutePath, item.plan.content || "");
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
                await atomicWrite(asset.absolutePath, Buffer.from(asset.contentBase64, "base64"));
            }
            savedAssets.push({ targetPath: asset.targetPath, hash: asset.hash, sourcePath: asset.sourcePath });
        }
        manifest.documents[item.plan.sourceId] = {
            path: item.plan.targetPath,
            assetDir: item.plan.assetDir,
            slug: item.plan.slug,
            sourceHash: item.plan.sourceHash,
            contentHash: item.plan.contentHash,
            lastSyncAt: new Date().toISOString(),
            lastCommit: null,
            assets: savedAssets,
        };
    }
    manifest.updatedAt = new Date().toISOString();
    await atomicWrite(path.join(root, ".siyuan-sync.json"), `${JSON.stringify(manifest, null, 2)}\n`);
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
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        });
        response.end();
        return;
    }
    if (request.method === "GET" && request.url === "/health") {
        jsonResponse(response, 200, { ok: true, service: "siyuan-blog-publisher-bridge", version: 1 });
        return;
    }
    if (!(["/status", "/preview", "/sync"].includes(request.url) && request.method === "POST")) {
        jsonResponse(response, 404, { ok: false, error: "Not Found" });
        return;
    }

    const payload = await parseJson(request);
    const root = resolveRoot(payload.rootPath);
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

server.listen(PORT, HOST, () => {
    console.log(`SiYuan Blog Publisher Bridge listening on http://${HOST}:${PORT}`);
    console.log("Only requests from this computer are accepted. Stop with Ctrl+C.");
});
