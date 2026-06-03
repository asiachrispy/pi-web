// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "PiWorkbench",
  platforms: [.macOS(.v13)],
  targets: [
    .executableTarget(
      name: "PiWorkbench",
      path: "Sources/PiWorkbench"
    ),
  ]
)
