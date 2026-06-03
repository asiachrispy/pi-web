import Foundation

/// Persists a security-scoped bookmark for the user-selected workspace directory.
/// Required when the packaged `.app` runs with App Sandbox; harmless for the dev SwiftPM binary.
final class WorkspaceBookmarkStore {
  static let shared = WorkspaceBookmarkStore()

  private let bookmarkDefaultsKey = "pi.workbench.workspaceBookmark"
  private var accessedURL: URL?

  private init() {}

  func restoreAccessOnLaunch() {
    guard let data = UserDefaults.standard.data(forKey: bookmarkDefaultsKey) else { return }
    var isStale = false
    do {
      let url = try URL(
        resolvingBookmarkData: data,
        options: .withSecurityScope,
        relativeTo: nil,
        bookmarkDataIsStale: &isStale
      )
      if isStale {
        try refreshBookmark(for: url)
      }
      beginAccess(to: url)
    } catch {
      UserDefaults.standard.removeObject(forKey: bookmarkDefaultsKey)
    }
  }

  @discardableResult
  func saveBookmark(for url: URL) throws -> String {
    try refreshBookmark(for: url)
    beginAccess(to: url)
    return url.path
  }

  func releaseAccess() {
    accessedURL?.stopAccessingSecurityScopedResource()
    accessedURL = nil
  }

  private func refreshBookmark(for url: URL) throws {
    let data = try url.bookmarkData(
      options: .withSecurityScope,
      includingResourceValuesForKeys: nil,
      relativeTo: nil
    )
    UserDefaults.standard.set(data, forKey: bookmarkDefaultsKey)
  }

  private func beginAccess(to url: URL) {
    accessedURL?.stopAccessingSecurityScopedResource()
    if url.startAccessingSecurityScopedResource() {
      accessedURL = url
    }
  }
}
