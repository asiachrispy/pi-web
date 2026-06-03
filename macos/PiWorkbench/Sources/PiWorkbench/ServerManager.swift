import AppKit
import Foundation

enum ServerState: Equatable {
  case idle
  case starting
  case ready
  case failed(String)
}

@MainActor
final class ServerManager: ObservableObject {
  static let shared = ServerManager()

  @Published private(set) var state: ServerState = .idle
  @Published private(set) var webURL = URL(string: "http://127.0.0.1:30141/")!

  private var process: Process?
  private var deepLinkSessionId: String?
  private weak var webViewRef: PiWebView?

  private let port: Int
  private let host = "127.0.0.1"
  private let piWebRoot: URL
  private let nodeURL: URL?

  private init() {
    port = Int(ProcessInfo.processInfo.environment["PORT"] ?? "30141") ?? 30141
    piWebRoot = Self.resolvePiWebRoot()
    nodeURL = Self.resolveNode()
    webURL = URL(string: "http://\(host):\(port)/")!
  }

  func attachWebView(_ webView: PiWebView) {
    webViewRef = webView
    if let sessionId = deepLinkSessionId {
      deepLinkSessionId = nil
      loadSession(sessionId, in: webView)
    }
  }

  func navigateToSession(_ sessionId: String) {
    if let webView = webViewRef {
      loadSession(sessionId, in: webView)
    } else {
      deepLinkSessionId = sessionId
    }
  }

  private func loadSession(_ sessionId: String, in webView: PiWebView) {
    var components = URLComponents(url: webURL, resolvingAgainstBaseURL: false)!
    components.queryItems = [URLQueryItem(name: "session", value: sessionId)]
    if let url = components.url {
      webView.load(url)
    }
  }

  func start() async {
    state = .starting
    stop()
    guard spawn() else {
      state = .failed("无法启动 pi-web（未找到 node 或 bin/pi-web.js）")
      return
    }
    let ok = await waitForHealth(timeoutSeconds: 60)
    if ok {
      state = .ready
    } else {
      stop()
      state = .failed("pi-web 在 60 秒内未就绪，请检查 Node 与端口 \(port)")
    }
  }

  func restart() async {
    await start()
    if case .ready = state, let webView = webViewRef {
      webView.load(webURL)
    }
  }

  func stop() {
    if let process, process.isRunning {
      process.terminate()
      process.waitUntilExit()
    }
    process = nil
  }

  func openAgentDirectory() {
    let agentDir = FileManager.default.homeDirectoryForCurrentUser
      .appendingPathComponent(".pi/agent", isDirectory: true)
    try? FileManager.default.createDirectory(at: agentDir, withIntermediateDirectories: true)
    NSWorkspace.shared.open(agentDir)
  }

  private func spawn() -> Bool {
    let script = piWebRoot.appendingPathComponent("bin/pi-web.js")
    guard FileManager.default.fileExists(atPath: script.path) else { return false }
    guard let nodeURL, FileManager.default.isExecutableFile(atPath: nodeURL.path) else { return false }

    let proc = Process()
    proc.executableURL = nodeURL
    proc.arguments = [script.path]
    var env = ProcessInfo.processInfo.environment
    env["HOST"] = host
    env["PORT"] = String(port)
    proc.environment = env
    proc.currentDirectoryURL = piWebRoot
    do {
      try proc.run()
      process = proc
      return true
    } catch {
      return false
    }
  }

  private func waitForHealth(timeoutSeconds: Int) async -> Bool {
    let deadline = Date().addingTimeInterval(TimeInterval(timeoutSeconds))
    let healthURL = URL(string: "http://\(host):\(port)/api/health")!
    while Date() < deadline {
      if await probeHealth(url: healthURL) { return true }
      try? await Task.sleep(nanoseconds: 500_000_000)
    }
    return false
  }

  private func probeHealth(url: URL) async -> Bool {
    var request = URLRequest(url: url)
    request.timeoutInterval = 2
    do {
      let (data, response) = try await URLSession.shared.data(for: request)
      guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return false }
      guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { return false }
      return json["ok"] as? Bool == true
    } catch {
      return false
    }
  }

  private static func bundledPiWebRoot() -> URL? {
    guard let resources = Bundle.main.resourceURL else { return nil }
    let root = resources.appendingPathComponent("pi-web", isDirectory: true)
    let script = root.appendingPathComponent("bin/pi-web.js")
    if FileManager.default.fileExists(atPath: script.path) {
      return root.standardizedFileURL
    }
    return nil
  }

  private static func bundledNodeURL() -> URL? {
    guard let resources = Bundle.main.resourceURL else { return nil }
    let node = resources
      .appendingPathComponent("node", isDirectory: true)
      .appendingPathComponent("bin/node")
    if FileManager.default.isExecutableFile(atPath: node.path) {
      return node
    }
    return nil
  }

  private static func resolvePiWebRoot() -> URL {
    if let raw = ProcessInfo.processInfo.environment["PI_WEB_ROOT"], !raw.isEmpty {
      return URL(fileURLWithPath: raw, isDirectory: true)
    }
    if let bundled = bundledPiWebRoot() {
      return bundled
    }
    let cwd = URL(fileURLWithPath: FileManager.default.currentDirectoryPath, isDirectory: true)
    let candidates = [
      cwd.appendingPathComponent("../..", isDirectory: true),
      cwd.appendingPathComponent("..", isDirectory: true),
      cwd,
    ]
    for url in candidates {
      let script = url.appendingPathComponent("bin/pi-web.js")
      if FileManager.default.fileExists(atPath: script.path) {
        return url.standardizedFileURL
      }
    }
    return cwd
  }

  private static func resolveNode() -> URL? {
    if let raw = ProcessInfo.processInfo.environment["NODE"], !raw.isEmpty {
      let url = URL(fileURLWithPath: raw)
      if FileManager.default.isExecutableFile(atPath: url.path) { return url }
    }
    if let bundled = bundledNodeURL() {
      return bundled
    }
    let candidates = [
      "/opt/homebrew/bin/node",
      "/usr/local/bin/node",
      "/usr/bin/node",
    ]
    for path in candidates {
      if FileManager.default.isExecutableFile(atPath: path) {
        return URL(fileURLWithPath: path)
      }
    }
    for dir in ProcessInfo.processInfo.environment["PATH"]?.split(separator: ":") ?? [] {
      let url = URL(fileURLWithPath: String(dir)).appendingPathComponent("node")
      if FileManager.default.isExecutableFile(atPath: url.path) { return url }
    }
    return nil
  }
}
