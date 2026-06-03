import AppKit
import UserNotifications

final class AppDelegate: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate {
  func applicationDidFinishLaunching(_ notification: Notification) {
    WorkspaceBookmarkStore.shared.restoreAccessOnLaunch()
    UNUserNotificationCenter.current().delegate = self
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    Task { await ServerManager.shared.start() }
  }

  func applicationWillTerminate(_ notification: Notification) {
    Task { @MainActor in
      WorkspaceBookmarkStore.shared.releaseAccess()
      ServerManager.shared.stop()
    }
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    if let sessionId = response.notification.request.content.userInfo["sessionId"] as? String {
      Task { @MainActor in
        ServerManager.shared.navigateToSession(sessionId)
      }
    }
    completionHandler()
  }
}
