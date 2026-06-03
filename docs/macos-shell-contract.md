# macOS 壳启动契约（M1-A）

Pi macOS App 通过内嵌 Node 运行 `bin/pi-web.js`，WKWebView 加载本地 pi-web 服务。

## 启动参数

| 变量 / 参数 | 说明 |
|-------------|------|
| `PORT` | 默认 `30141` |
| `HOST` | 固定 `127.0.0.1`（M1 不监听 `0.0.0.0`） |
| `PI_CODING_AGENT_DIR` | 可选；覆盖 agent 目录（默认 `~/.pi/agent`） |

子进程示例（`.app` 内嵌路径，由 `ServerManager` 自动解析）：

```bash
HOST=127.0.0.1 PORT=30141 \
  /Applications/Pi.app/Contents/Resources/node/bin/node \
  /Applications/Pi.app/Contents/Resources/pi-web/bin/pi-web.js
```

开发壳仍可用环境变量覆盖：`PI_WEB_ROOT`、`NODE`。

## 健康检查

壳与 Web 共用 `GET /api/health`：

```json
{ "ok": true, "version": "0.6.12" }
```

- 仅允许 loopback 访问
- 不创建 `AgentSession`
- 壳启动时每 500ms 探测，最长 60s；失败显示「重试 / 重启服务」

## Web → 壳 IPC

检测：`window.piNative?.version`

| 方法 | 用途 |
|------|------|
| `pickWorkspaceDirectory()` | 设置页选择工作区；壳持久化 security-scoped bookmark（见 [macos/README.md](../macos/README.md) PL-06） |
| `showNotification({ title, body, sessionId })` | 任务完成系统通知 |
| `openPath(path)` | 打开数据目录 / 导出文件 |
| `restartServer()` | 重启内嵌 pi-web 子进程 |

凭据不进 IPC：OAuth 结果写入 `~/.pi/agent/auth.json`，与 CLI 共用。

## 菜单（M1）

- 退出
- 重启服务
- 打开数据文件夹（`~/.pi/agent`，附白话说明）

## 深链

通知点击打开：

- `pi://open?session=<uuid>` 或
- `http://127.0.0.1:30141/?session=<uuid>`

壳统一解析为 WebView 导航。

## 开发壳（本仓库）

`macos/PiWorkbench`（SwiftPM）实现 PL-01～PL-04 联调路径；需本机已安装 Node。见 [macos/README.md](./README.md)。
