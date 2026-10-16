import AppKit
import XCTest

@testable import WallpaperMachine

/// Which trackpad actions web wallpapers see as a click: the click-area policy over finger
/// positions, the saved choice, and the reading of a MultitouchSupport contact frame.
final class WebWallpaperClickTriggersTests: XCTestCase {
  private let center = CGPoint(x: 0.5, y: 0.5)
  private let left = CGPoint(x: 0.05, y: 0.5)
  private let right = CGPoint(x: 0.95, y: 0.5)
  private let top = CGPoint(x: 0.5, y: 0.95)
  private let bottom = CGPoint(x: 0.5, y: 0.05)

  private func triggers(_ area: WebWallpaperClickArea) -> WebWallpaperClickTriggers {
    WebWallpaperClickTriggers(clickArea: area)
  }

  func testTheDefaultsKeepEveryPlainClickAndAddNothing() {
    let defaults = WebWallpaperClickTriggers()
    XCTAssertEqual(defaults.clickArea, .anywhere)
    XCTAssertFalse(defaults.touch)
    XCTAssertFalse(defaults.secondaryClick)
    XCTAssertFalse(defaults.needsTrackpadContacts, "Nobody's trackpad is watched until they ask for it")
    for fingers in [[], [center], [left], [top, bottom]] {
      XCTAssertTrue(defaults.countsPrimaryClick(fingers: fingers))
    }
  }

  func testEdgeAreasCountOnlyClicksWithAFingerOnThatEdge() {
    XCTAssertTrue(triggers(.leftEdge).countsPrimaryClick(fingers: [left]))
    XCTAssertFalse(triggers(.leftEdge).countsPrimaryClick(fingers: [center]))
    XCTAssertFalse(triggers(.leftEdge).countsPrimaryClick(fingers: [right]))
    XCTAssertTrue(triggers(.rightEdge).countsPrimaryClick(fingers: [right]))
    XCTAssertTrue(triggers(.topEdge).countsPrimaryClick(fingers: [top]))
    XCTAssertFalse(triggers(.topEdge).countsPrimaryClick(fingers: [bottom]), "The bottom is the side nearest the user")
    XCTAssertTrue(triggers(.bottomEdge).countsPrimaryClick(fingers: [bottom]))
    for finger in [left, right, top, bottom] {
      XCTAssertTrue(triggers(.anyEdge).countsPrimaryClick(fingers: [finger]))
    }
    XCTAssertFalse(triggers(.anyEdge).countsPrimaryClick(fingers: [center]))
    XCTAssertTrue(
      triggers(.leftEdge).countsPrimaryClick(fingers: [center, left]),
      "A thumb clicking at the edge counts while another finger rests in the middle")
    XCTAssertTrue(triggers(.leftEdge).needsTrackpadContacts)
  }

  func testAMouseClickCountsUnlessClicksAreOff() {
    for area in WebWallpaperClickArea.allCases where area != .never {
      XCTAssertTrue(triggers(area).countsPrimaryClick(fingers: []), "\(area) ignores where a mouse is")
    }
    XCTAssertFalse(triggers(.never).countsPrimaryClick(fingers: []))
    XCTAssertFalse(triggers(.never).countsPrimaryClick(fingers: [left]))
  }

  func testTheChoiceIsSavedAnnouncedAndReadBack() throws {
    let defaults = try TemporaryDefaults.make(for: self).defaults
    let center = NotificationCenter()
    let announced = expectation(forNotification: WebWallpaperClickTriggerPreferences.didChange, object: nil, notificationCenter: center)
    XCTAssertEqual(WebWallpaperClickTriggerPreferences.load(defaults: defaults), WebWallpaperClickTriggers())

    WebWallpaperClickTriggerPreferences.update(defaults: defaults, center: center) {
      $0.clickArea = .rightEdge
      $0.touch = true
    }
    wait(for: [announced], timeout: 1)
    let saved = WebWallpaperClickTriggerPreferences.load(defaults: defaults)
    XCTAssertEqual(saved.clickArea, .rightEdge)
    XCTAssertTrue(saved.touch)
    XCTAssertFalse(saved.secondaryClick, "An update changes only what it names")

    defaults.set("sideways", forKey: WebWallpaperClickTriggerPreferences.clickAreaKey)
    XCTAssertEqual(
      WebWallpaperClickTriggerPreferences.load(defaults: defaults).clickArea, .anywhere,
      "An unknown stored area falls back to plain clicks")
  }

  func testAContactFrameYieldsOnlyTheFingersOnTheSurface() {
    let stride = TrackpadContactMonitor.contactStride
    var frame = [UInt8](repeating: 0, count: stride * 3)
    func write(_ index: Int, state: Int32, x: Float, y: Float) {
      frame.withUnsafeMutableBytes { bytes in
        let base = index * stride
        bytes.storeBytes(of: state, toByteOffset: base + TrackpadContactMonitor.stateOffset, as: Int32.self)
        bytes.storeBytes(of: x, toByteOffset: base + TrackpadContactMonitor.positionOffset, as: Float.self)
        bytes.storeBytes(of: y, toByteOffset: base + TrackpadContactMonitor.positionOffset + 4, as: Float.self)
      }
    }
    write(0, state: 4, x: 0.1, y: 0.2)  // touching
    write(1, state: 2, x: 0.5, y: 0.5)  // hovering above the pad
    write(2, state: 3, x: 0.9, y: 0.8)  // just landed
    let fingers = frame.withUnsafeBytes { TrackpadContactMonitor.touching(in: $0.baseAddress!, count: 3) }
    XCTAssertEqual(fingers.count, 2)
    XCTAssertEqual(fingers[0].x, 0.1, accuracy: 0.0001)
    XCTAssertEqual(fingers[0].y, 0.2, accuracy: 0.0001)
    XCTAssertEqual(fingers[1].x, 0.9, accuracy: 0.0001)
    XCTAssertEqual(frame.withUnsafeBytes { TrackpadContactMonitor.touching(in: $0.baseAddress!, count: 0) }, [])
  }

  func testATouchOnlyClicksAWallpaperTheDesktopShows() {
    let layers = [10: Int(CGWindowLevelForKey(.desktopIconWindow)), 50: 0]
    XCTAssertEqual(WebWallpaperMouseRouting.desktopTarget(wallpaperWindow: 100, frontWindow: 10) { layers[$0] }, 100)
    XCTAssertEqual(WebWallpaperMouseRouting.desktopTarget(wallpaperWindow: 100, frontWindow: 100) { _ in nil }, 100)
    XCTAssertNil(WebWallpaperMouseRouting.desktopTarget(wallpaperWindow: 100, frontWindow: 50) { layers[$0] })
    XCTAssertNil(WebWallpaperMouseRouting.desktopTarget(wallpaperWindow: nil, frontWindow: 10) { layers[$0] })
  }
}
