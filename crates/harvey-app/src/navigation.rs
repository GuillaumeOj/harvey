//! Navigation lock-down (§6.10): the webview only ever shows the app's own origin. External links go through the
//! Rust-side opener (#48), never through webview navigation or `window.open`.

use tauri::Url;

/// Origins the bundled app is served from (`tauri://localhost` on macOS, `http(s)://tauri.localhost` elsewhere).
const APP_ORIGINS: &[(&str, &str)] = &[
    ("tauri", "localhost"),
    ("http", "tauri.localhost"),
    ("https", "tauri.localhost"),
];

/// True if `url` belongs to the app: the bundled origin (any path), or the exact origin of `dev_url` (scheme, host
/// and port) when given. `dev_url` is `Some` only in debug builds.
pub fn is_app_url(url: &Url, dev_url: Option<&Url>) -> bool {
    if !url.username().is_empty() || url.password().is_some() {
        return false;
    }
    let Some(host) = url.host_str() else {
        return false;
    };
    let bundled = url.port().is_none()
        && APP_ORIGINS
            .iter()
            .any(|&(scheme, h)| url.scheme() == scheme && host == h);
    bundled || dev_url.is_some_and(|dev| url.origin() == dev.origin())
}

/// The dev server URL the navigation handler allows: the config `devUrl` in debug builds, `None` in release.
pub fn allowed_dev_url(dev_url: Option<&Url>) -> Option<Url> {
    if cfg!(debug_assertions) {
        dev_url.cloned()
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::{Url, allowed_dev_url, is_app_url};

    fn url(s: &str) -> Url {
        Url::parse(s).unwrap_or_else(|e| panic!("{s}: {e}"))
    }

    const DEV: &str = "http://localhost:1420";

    #[test]
    fn allows_the_app_origin() {
        for s in [
            "tauri://localhost",
            "tauri://localhost/",
            "tauri://localhost/index.html?x=1#y",
            "http://tauri.localhost/",
            "https://tauri.localhost/settings",
        ] {
            assert!(is_app_url(&url(s), None), "{s}");
            assert!(is_app_url(&url(s), Some(&url(DEV))), "{s}");
        }
    }

    #[test]
    fn allows_the_dev_origin_only_when_given() {
        for s in [
            "http://localhost:1420",
            "http://localhost:1420/",
            "http://localhost:1420/src/main.tsx?t=1",
        ] {
            assert!(is_app_url(&url(s), Some(&url(DEV))), "{s}");
            assert!(!is_app_url(&url(s), None), "{s}");
        }
    }

    #[test]
    fn denies_everything_else() {
        for s in [
            "https://example.com/",
            "http://localhost:1421/",
            "https://localhost:1420/",
            "ws://localhost:1420/",
            "http://127.0.0.1:1420/",
            "http://localhost/",
            "http://tauri.localhost:8080/",
            "tauri://localhost:1/",
            "tauri://localhost.evil.com/",
            "tauri://evil.com/",
            "http://tauri.localhost.evil.com/",
            "http://tauri.localhost@evil.com/",
            "http://evil.com@tauri.localhost/",
            "http://user:pass@tauri.localhost/",
            "http://user@localhost:1420/",
            "file:///etc/passwd",
            "data:text/html,<script>alert(1)</script>",
            "javascript:alert(1)",
            "about:blank",
            "blob:tauri://localhost/1234",
            "blob:http://localhost:1420/1234",
            "harvey://open",
            "ipc://localhost/app_info",
        ] {
            assert!(!is_app_url(&url(s), Some(&url(DEV))), "{s}");
        }
    }

    #[test]
    fn dev_url_follows_the_profile() {
        let dev = url(DEV);
        assert_eq!(
            allowed_dev_url(Some(&dev)),
            cfg!(debug_assertions).then(|| dev.clone())
        );
        assert_eq!(allowed_dev_url(None), None);
    }
}
