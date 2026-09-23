"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const archive = path.join(root, "package.zip");
const files = [
    "plugin.json",
    "index.js",
    "index.css",
    "icon.png",
    "preview.png",
    "README.md",
    "README.zh-CN.md",
    "local-bridge.js",
    "i18n",
    "docs",
];

for (const item of files) {
    if (!fs.existsSync(path.join(root, item))) {
        throw new Error(`Cannot package plugin; required file is missing: ${item}`);
    }
}

fs.rmSync(archive, { force: true });
if (process.platform === "win32") {
    const command = `$files = @(${files.map((item) => `'${item}'`).join(",")}); Compress-Archive -Path $files -DestinationPath 'package.zip' -Force`;
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { cwd: root, stdio: "inherit" });
} else {
    execFileSync("zip", ["-q", "-r", archive, ...files], { cwd: root, stdio: "inherit" });
}

console.log(`Created ${archive}`);
