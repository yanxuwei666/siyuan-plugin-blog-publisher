"use strict";

const assert = require("node:assert/strict");
const {
    createSyncPlan,
    extractAssetRefs,
    slugify,
    displayStatus,
} = require("../blog-core");

async function main() {
    assert.match(slugify("Redis 缓存击穿排查", "20260922123456-abcdefg"), /^redis-[0-9a-f]{8}$/);
    assert.match(slugify("中文标题", "20260922123456-abcdefg"), /^post-[0-9a-f]{8}$/);
    assert.deepEqual(extractAssetRefs("![封面](/assets/cover.png)\n![封面](/assets/cover.png)"), [{ sourcePath: "/assets/cover.png" }]);

    const input = {
        sourceId: "20260922123456-abcdefg",
        sourcePath: "/工程实践/Redis 缓存击穿排查",
        title: "Redis 缓存击穿排查",
        markdown: "问题出现在高并发请求下。\n\n![封面](/assets/cover.png)",
        attrs: {
            "custom-blog.status": "pending",
            "custom-blog.category": "后端开发",
            "custom-blog.tags": "redis, cache",
        },
        config: {
            contentDir: "src/content/blog",
            assetDir: "public/images/blog",
            includeTitle: false,
        },
        createdDate: "20260920",
        updatedDate: "20260922",
        now: "2026-09-22T12:00:00.000Z",
    };
    const first = await createSyncPlan(input);
    const second = await createSyncPlan(input);
    assert.equal(first.sourceHash, second.sourceHash, "相同输入必须得到稳定 sourceHash");
    assert.equal(first.contentHash, second.contentHash, "相同输入必须得到稳定 contentHash");
    assert.match(first.content, /^---\ntitle: "Redis 缓存击穿排查"/);
    assert.match(first.content, /source: "siyuan"/);
    assert.match(first.content, /tags: \["redis", "cache"\]/);
    assert.equal(first.assets[0].targetPath, `public/images/blog/${first.slug}/cover.png`);
    assert.equal(first.assets[0].publicPath, `/images/blog/${first.slug}/cover.png`);
    assert.equal(displayStatus("pending", { sourceHash: first.sourceHash }, first.sourceHash), "published");

    console.log("blog-core tests passed");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
