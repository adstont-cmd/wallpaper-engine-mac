import AppKit
import os

/// What the pointer forwarder needs to know about fingers on the trackpad.
@MainActor
protocol TrackpadContactSource: AnyObject {
    /// The fingers touching any trackpad now, normalized with the origin at the
    /// pad's bottom-left corner. Empty while nothing touches, or while stopped.
    var touchingFingers: [CGPoint] { get }
    /// Called when the first finger lands on a trackpad nothing was touching.
    var onTouchBegan: (@MainActor () -> Void)? { get set }
    func setActive(_ active: Bool)
}

/// Reads the fingers on the Mac's trackpads through the MultitouchSupport
/// framework, the one macOS itself uses for trackpad gestures.
///
/// AppKit only reports touches to a view under the pointer in the key window,
/// and the desktop is never that, so there is no public way to see a finger
/// land while the pointer rests on the wallpaper. MultitouchSupport is private:
/// it is loaded at run time, and when it or one of its symbols is missing the
/// monitor simply reports no fingers, so touch and edge triggers do nothing and
/// plain clicks keep working. Reading contacts needs no permission, and nothing
/// is consumed: the system keeps handling every gesture.
///
/// The framework calls back on its own thread for every contact frame (about
/// 90 a second while a finger rests); the callback only copies positions under
/// a lock and hops to the main actor when the first finger lands.
@MainActor
final class TrackpadContactMonitor: TrackpadContactSource {
    static let shared = TrackpadContactMonitor()

    var onTouchBegan: (@MainActor () -> Void)?

    private var devices: CFArray?
    private var wakeObserver: NSObjectProtocol?

    var touchingFingers: [CGPoint] {
        Self.contacts.withLock { $0.values.flatMap { $0 } }
    }

    func setActive(_ active: Bool) {
        if active {
            guard devices == nil else { return }
            start()
            // Contact callbacks stop after the Mac sleeps; registering again brings them back.
            wakeObserver = NSWorkspace.shared.notificationCenter.addObserver(
                forName: NSWorkspace.didWakeNotification, object: nil, queue: .main
            ) { [weak self] _ in
                MainActor.assumeIsolated {
                    guard let self, self.devices != nil else { return }
                    self.stop()
                    self.start()
                }
            }
        } else {
            if let wakeObserver { NSWorkspace.shared.notificationCenter.removeObserver(wakeObserver) }
            wakeObserver = nil
            stop()
        }
    }

    private func start() {
        guard let symbols = Self.symbols, let list = symbols.createList()?.takeRetainedValue() else {
            if !Self.unavailableLogged {
                Self.unavailableLogged = true
                AppLog.warn("trackpad contacts unavailable: MultitouchSupport could not be loaded")
            }
            return
        }
        for index in 0..<CFArrayGetCount(list) {
            guard let device = CFArrayGetValueAtIndex(list, index) else { continue }
            let pointer = UnsafeMutableRawPointer(mutating: device)
            symbols.register(pointer, Self.callback)
            symbols.start(pointer, 0)
        }
        devices = list
        AppLog.info("trackpad contacts: watching \(CFArrayGetCount(list)) multitouch device(s)")
    }

    private func stop() {
        guard let list = devices, let symbols = Self.symbols else { return }
        for index in 0..<CFArrayGetCount(list) {
            guard let device = CFArrayGetValueAtIndex(list, index) else { continue }
            let pointer = UnsafeMutableRawPointer(mutating: device)
            symbols.unregister(pointer, Self.callback)
            symbols.stop(pointer)
        }
        devices = nil
        Self.contacts.withLock { $0.removeAll() }
    }

    // MARK: - Framework

    private static var unavailableLogged = false

    /// Touching fingers per device, written by the framework's thread.
    nonisolated private static let contacts = OSAllocatedUnfairLock(initialState: [Int: [CGPoint]]())

    private typealias ContactCallback = @convention(c) (
        UnsafeMutableRawPointer?, UnsafeMutableRawPointer?, Int32, Double, Int32
    ) -> Int32

    private struct Symbols {
        let createList: @convention(c) () -> Unmanaged<CFArray>?
        let register: @convention(c) (UnsafeMutableRawPointer, ContactCallback) -> Void
        let unregister: @convention(c) (UnsafeMutableRawPointer, ContactCallback) -> Void
        let start: @convention(c) (UnsafeMutableRawPointer, Int32) -> Void
        let stop: @convention(c) (UnsafeMutableRawPointer) -> Void
    }

    private static let symbols: Symbols? = {
        let path = "/System/Library/PrivateFrameworks/MultitouchSupport.framework/MultitouchSupport"
        guard let handle = dlopen(path, RTLD_NOW) else { return nil }
        func load<T>(_ name: String, as _: T.Type) -> T? {
            dlsym(handle, name).map { unsafeBitCast($0, to: T.self) }
        }
        guard
            let createList = load("MTDeviceCreateList", as: (@convention(c) () -> Unmanaged<CFArray>?).self),
            let register = load(
                "MTRegisterContactFrameCallback",
                as: (@convention(c) (UnsafeMutableRawPointer, ContactCallback) -> Void).self),
            let unregister = load(
                "MTUnregisterContactFrameCallback",
                as: (@convention(c) (UnsafeMutableRawPointer, ContactCallback) -> Void).self),
            let start = load("MTDeviceStart", as: (@convention(c) (UnsafeMutableRawPointer, Int32) -> Void).self),
            let stop = load("MTDeviceStop", as: (@convention(c) (UnsafeMutableRawPointer) -> Void).self)
        else { return nil }
        return Symbols(createList: createList, register: register, unregister: unregister, start: start, stop: stop)
    }()

    /// One contact record of MultitouchSupport is 96 bytes; the fields read here
    /// are the touch state and the normalized position.
    nonisolated static let contactStride = 96
    nonisolated static let stateOffset = 20
    nonisolated static let positionOffset = 32
    /// Contact states 3 ("making touch") and 4 ("touching") are a finger on the
    /// surface; the others are hovering, lifting or out of range.
    nonisolated static let touchingStates: ClosedRange<Int32> = 3...4

    /// The touching fingers in one contact frame.
    nonisolated static func touching(in frame: UnsafeRawPointer, count: Int) -> [CGPoint] {
        (0..<max(count, 0)).compactMap { index in
            let contact = frame + index * contactStride
            guard touchingStates.contains(contact.loadUnaligned(fromByteOffset: stateOffset, as: Int32.self))
            else { return nil }
            let x = contact.loadUnaligned(fromByteOffset: positionOffset, as: Float.self)
            let y = contact.loadUnaligned(fromByteOffset: positionOffset + 4, as: Float.self)
            return CGPoint(x: CGFloat(x), y: CGFloat(y))
        }
    }

    private static let callback: ContactCallback = { device, frame, count, _, _ in
        let fingers = frame.map { TrackpadContactMonitor.touching(in: $0, count: Int(count)) } ?? []
        let key = Int(bitPattern: device)
        let began = TrackpadContactMonitor.contacts.withLock { contacts -> Bool in
            let wasTouching = contacts.values.contains { !$0.isEmpty }
            contacts[key] = fingers.isEmpty ? nil : fingers
            return !wasTouching && !fingers.isEmpty
        }
        if began {
            Task { @MainActor in TrackpadContactMonitor.shared.onTouchBegan?() }
        }
        return 0
    }
}
