# Pi Workbench — macOS 壳（M1-A）

薄 macOS 应用：内嵌子进程运行 `bin/pi-web.js`，`WKWebView` 加载 `http://127.0.0.1:30141`，注入 `window.piNative`。

契约：[../docs/macos-shell-contract.md](../docs/macos-shell-contract.md)

## 开发运行（本机已安装 Node）

```bash
# 终端 1：可先手动起 pi-web（可选；壳也会自动 spawn）
cd /path/to/pi-web && npm run dev

# 终端 2：构建并运行壳
cd /path/to/pi-web/macos/PiWorkbench
export PI_WEB_ROOT="$(cd ../.. && pwd)"   # pi-web 仓库根
swift build -c release
.build/release/PiWorkbench
```

环境变量：

| 变量 | 说明 |
|------|------|
| `PI_WEB_ROOT` | pi-web 包根目录（含 `bin/pi-web.js`）；`.app` 内默认 `Contents/Resources/pi-web` |
| `PORT` | 默认 `30141` |
| `NODE` | `node` 可执行路径；`.app` 内优先 `Contents/Resources/node/bin/node`，再 `PATH` |

## PL-06 — 工作区目录与文件访问

`piNative.pickWorkspaceDirectory()` 使用 `NSOpenPanel` 选目录，并通过 `WorkspaceBookmarkStore` 写入 **security-scoped bookmark**（`UserDefaults`：`pi.workbench.workspaceBookmark`）。启动时恢复 bookmark 并调用 `startAccessingSecurityScopedResource()`。

| 模式 | 行为 |
|------|------|
| **SwiftPM 开发壳** | 未启用 App Sandbox；bookmark 为打包后做准备，文件访问与普通 macOS 进程相同 |
| **`.app` + Sandbox（待办）** | 需 bookmark + 沙盒 entitlements；内嵌 Node 子进程继承沙盒，工作区读写仍待完整验证 |

已知限制（`.app` 交付前需解决）：

- 内嵌 `node` 子进程在沙盒下是否能继承 security-scoped 访问，需联调 agent 工具读文件路径
- 打包脚本尚未嵌入 Node；见下文

## 打包（本机安装测试）

```bash
cd /path/to/pi-web
npm run package:macos
# 输出：dist/macos/Pi.app
```

脚本会：

1. `npm run build`（生产 `.next`）
2. `swift build -c release`（PiWorkbench）
3. 复制 `bin/`、`.next/`、`public/`、`package.json`、`package-lock.json`、`next.config.ts` 与 `node_modules` 到 `Contents/Resources/pi-web/`
4. 下载并嵌入 Node（默认 v22.16.0，`NODE_VERSION` 可覆盖）到 `Contents/Resources/node/bin/node`
5. 本地 ad-hoc `codesign`（非公证）

安装与首次打开：

```bash
cp -R dist/macos/Pi.app /Applications/
xattr -cr /Applications/Pi.app   # 未公证包若被拦截，执行后再双击
open /Applications/Pi.app
```

`SKIP_NODE_EMBED=1 ./scripts/package-macos-app.sh` 可跳过内嵌 Node（仅用本机 PATH 里的 node，不适合 M1「免 Node」验收）。

## M1 交付物（待办）

- [ ] Apple 开发者签名 / 公证（当前仅 ad-hoc，本机测试用）
- [ ] App Sandbox entitlements 与工作区 bookmark 联调

当前仓库内为 **可开发的 SwiftPM 可执行文件**，用于联调 `piNative`、通知深链与健康检查。
