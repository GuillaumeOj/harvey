// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "valid",
    dependencies: [
        .package(url: "https://github.com/swiftlang/swift-format.git", exact: "602.0.0"),
        .package(url: "https://github.com/apple/swift-argument-parser", exact: "1.5.0-beta.1"),
        .package(path: "../local"),
        // .package(url: "https://example.com/commented-out.git", from: "1.0.0"),
    ]
)
