// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "bad",
    dependencies: [
        .package(url: "https://example.com/from.git", from: "1.0.0"),
        .package(url: "https://example.com/major.git", .upToNextMajor(from: "1.0.0")),
        .package(url: "https://example.com/minor.git", .upToNextMinor(from: "1.0.0")),
        .package(url: "https://example.com/range.git", "1.0.0"..<"2.0.0"),
        .package(url: "https://example.com/closed.git", "1.0.0"..."2.0.0"),
        .package(url: "https://example.com/branch.git", branch: "main"),
        .package(url: "https://example.com/revision.git", revision: "abc123"),
        .package(url: "https://example.com/partial.git", exact: "1.0"),
        .package(url: "https://example.com/none.git"),
        .package(url: "https://example.com/multi.git",
                 from: "1.0.0"),
        .package(url: "https://example.com/ok.git", exact: "1.0.0"),
    ]
)
