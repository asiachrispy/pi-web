import SwiftUI

struct ContentView: View {
  @EnvironmentObject private var server: ServerManager

  var body: some View {
    ZStack {
      WebViewRepresentable()
        .opacity(server.state == .ready ? 1 : 0)

      if server.state != .ready {
        statusOverlay
      }
    }
  }

  @ViewBuilder
  private var statusOverlay: some View {
    VStack(spacing: 16) {
      switch server.state {
      case .idle, .starting:
        ProgressView()
        Text("正在启动 Pi…")
          .font(.headline)
      case .failed(let message):
        Text("无法启动")
          .font(.headline)
        Text(message)
          .font(.subheadline)
          .foregroundStyle(.secondary)
          .multilineTextAlignment(.center)
          .frame(maxWidth: 360)
        Button("重试") {
          Task { await server.start() }
        }
        .keyboardShortcut(.defaultAction)
      case .ready:
        EmptyView()
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Color(nsColor: .windowBackgroundColor))
  }
}
