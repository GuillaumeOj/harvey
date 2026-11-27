// swift-tools-version:6.4
// Pins swift-format for scripts/swift-format.sh. Bump `exact:` with the Swift toolchain's major.minor
// (swift-format 604.x ⇔ Swift 6.4), then run `swift package --package-path tools/swift-format-pin resolve`.
import PackageDescription

let package = Package(
    name: "swift-format-pin",
    dependencies: [
        .package(url: "https://github.com/swiftlang/swift-format.git", exact: "604.0.0")
    ]
)
