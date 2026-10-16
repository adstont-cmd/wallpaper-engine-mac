import CoreGraphics
import Foundation

/// Where on a trackpad a primary click has to land for web wallpapers to receive it.
///
/// The edges are measured on the trackpad surface, not on the screen: a click
/// with a finger resting in the left fifth of the pad is a left-edge click,
/// wherever the pointer is. A click from a mouse carries no finger, so it
/// counts under every choice but `never`.
enum WebWallpaperClickArea: String, Codable, CaseIterable, Sendable {
    case anywhere
    case anyEdge
    case leftEdge
    case rightEdge
    case topEdge
    case bottomEdge
    case never

    var isEdge: Bool {
        switch self {
        case .anyEdge, .leftEdge, .rightEdge, .topEdge, .bottomEdge: true
        case .anywhere, .never: false
        }
    }
}

/// Which trackpad actions web wallpapers see as a click at the pointer.
///
/// A web page only knows mouse events, so every trigger reaches it the same
/// way: a primary press and release where the pointer is. That keeps the
/// mechanism general: a page that draws something on `mousedown` (ripples,
/// sparks, a sound) follows whichever actions the user picked here, without
/// the page knowing about trackpads. The defaults are the plain desktop click
/// and nothing else, which is how web wallpapers behaved before this choice.
struct WebWallpaperClickTriggers: Equatable, Sendable {
    /// Where a primary click must land on the trackpad to reach the page.
    var clickArea: WebWallpaperClickArea = .anywhere
    /// A finger landing on the trackpad clicks, before or without a press.
    var touch = false
    /// A secondary click (two-finger click or right click) also clicks with the primary button,
    /// on top of the secondary click the page already receives.
    var secondaryClick = false

    /// How far in from each side of the trackpad, as a fraction of its width or
    /// height, a finger counts as being on that edge.
    static let edgeFraction: CGFloat = 0.2

    /// Whether the trackpad's fingers have to be watched at all.
    var needsTrackpadContacts: Bool { touch || clickArea.isEdge }

    /// Whether a primary press reaches the page.
    ///
    /// - Parameter fingers: the fingers touching a trackpad at the press, as
    ///   normalized positions with the origin at the pad's bottom-left corner
    ///   (the side nearest the user). Empty for a mouse.
    func countsPrimaryClick(fingers: [CGPoint]) -> Bool {
        switch clickArea {
        case .anywhere: return true
        case .never: return false
        case .anyEdge, .leftEdge, .rightEdge, .topEdge, .bottomEdge:
            guard !fingers.isEmpty else { return true }
            return fingers.contains { Self.isOnEdge($0, clickArea) }
        }
    }

    private static func isOnEdge(_ finger: CGPoint, _ area: WebWallpaperClickArea) -> Bool {
        let left = finger.x <= edgeFraction
        let right = finger.x >= 1 - edgeFraction
        let bottom = finger.y <= edgeFraction
        let top = finger.y >= 1 - edgeFraction
        switch area {
        case .anyEdge: return left || right || bottom || top
        case .leftEdge: return left
        case .rightEdge: return right
        case .topEdge: return top
        case .bottomEdge: return bottom
        case .anywhere, .never: return false
        }
    }
}

/// The saved `WebWallpaperClickTriggers`. The choice is this Mac's: it is not
/// part of a backup, like the other pointer settings.
enum WebWallpaperClickTriggerPreferences {
    static let clickAreaKey = "WallpaperMachine.webClickArea"
    static let touchKey = "WallpaperMachine.webClickOnTrackpadTouch"
    static let secondaryClickKey = "WallpaperMachine.webClickOnSecondaryClick"
    /// Posted after any of the three is written.
    static let didChange = Notification.Name("WallpaperMachine.WebWallpaperClickTriggers.didChange")

    static func load(defaults: UserDefaults = ClientPreferences.defaults) -> WebWallpaperClickTriggers {
        var triggers = WebWallpaperClickTriggers()
        if let raw = defaults.string(forKey: clickAreaKey), let area = WebWallpaperClickArea(rawValue: raw) {
            triggers.clickArea = area
        }
        triggers.touch = defaults.bool(forKey: touchKey)
        triggers.secondaryClick = defaults.bool(forKey: secondaryClickKey)
        return triggers
    }

    static func save(
        _ triggers: WebWallpaperClickTriggers, defaults: UserDefaults = ClientPreferences.defaults,
        center: NotificationCenter = .default
    ) {
        let previous = load(defaults: defaults)
        defaults.set(triggers.clickArea.rawValue, forKey: clickAreaKey)
        defaults.set(triggers.touch, forKey: touchKey)
        defaults.set(triggers.secondaryClick, forKey: secondaryClickKey)
        if previous != triggers {
            AppLog.info(
                "web wallpaper clicks: area \(triggers.clickArea.rawValue), touch \(triggers.touch), secondary click \(triggers.secondaryClick)"
            )
        }
        center.post(name: didChange, object: nil)
    }

    static func update(
        defaults: UserDefaults = ClientPreferences.defaults, center: NotificationCenter = .default,
        _ change: (inout WebWallpaperClickTriggers) -> Void
    ) {
        var triggers = load(defaults: defaults)
        change(&triggers)
        save(triggers, defaults: defaults, center: center)
    }
}
