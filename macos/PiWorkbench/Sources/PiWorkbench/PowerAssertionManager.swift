import Foundation
import IOKit.pwr_mgt

/// Holds an IOPMAssertion so the macOS host does not idle-sleep while a Pi
/// agent task is running. Released automatically on process exit.

final class PowerAssertionManager {
  static let shared = PowerAssertionManager()

  enum Mode {
    case none           // not held
    case autoTask       // held because JS reported a task is active
    case alwaysOn       // held because the user enabled "keep awake always"
  }

  private(set) var mode: Mode = .none
  private var assertionID: IOPMAssertionID = 0

  /// True when a power assertion is currently held.
  var isHeld: Bool { mode != .none }

  /// Acquire an idle-sleep-preventing assertion if not already held.
  /// `newMode` is the reason; passing `.none` is a no-op.
  func acquire(mode newMode: Mode) {
    guard newMode != .none else { return }
    if isHeld {
      // Already held; just bump the mode so release logic uses the strongest
      // (alwaysOn wins over autoTask).
      if newMode == .alwaysOn { mode = .alwaysOn }
      return
    }
    var id: IOPMAssertionID = 0
    let result = IOPMAssertionCreateWithName(
      kIOPMAssertionTypePreventUserIdleSystemSleep as CFString,
      IOPMAssertionLevel(kIOPMAssertionLevelOn),
      "Pi: agent task running" as CFString,
      &id
    )
    guard result == kIOReturnSuccess else {
      NSLog("[PowerAssertion] failed to create assertion: \(result)")
      return
    }
    assertionID = id
    mode = newMode
    NSLog("[PowerAssertion] acquired (id=\(id), mode=\(newMode))")
  }

  /// Release the held assertion, but only if `currentMode` is no longer the
  /// strongest reason. Idempotent.
  func release(currentMode: Mode) {
    guard isHeld else { return }
    // If the user has keepAwakeAlways enabled, never auto-release.
    if mode == .alwaysOn { return }
    // The auto-task path is releasing; the strongest current request was
    // `currentMode`. If currentMode is .none, the JS side is done — release.
    if currentMode != .none { return }
    IOPMAssertionRelease(assertionID)
    NSLog("[PowerAssertion] released (id=\(assertionID))")
    assertionID = 0
    mode = .none
  }

  /// Force-release regardless of mode (used on app quit / alwaysOn toggle off).
  func forceRelease() {
    guard isHeld else { return }
    IOPMAssertionRelease(assertionID)
    NSLog("[PowerAssertion] force-released (id=\(assertionID))")
    assertionID = 0
    mode = .none
  }

  deinit { forceRelease() }
}
