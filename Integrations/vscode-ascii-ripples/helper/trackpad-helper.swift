// Reports the fingers on the Mac's trackpads to the ASCII Ripples extension.
//
// A web page (and so VS Code's window) only sees clicks; a finger resting on the
// trackpad, or where on the pad it rests, never reaches it. Like the app's
// TrackpadContactMonitor, this reads contacts through the private
// MultitouchSupport framework, loaded at run time; reading needs no permission
// and consumes nothing. Output is one line per change on stdout:
//   d x,y;x,y   the first finger landed (positions normalized, origin bottom-left)
//   f x,y;...   fingers moved or changed while touching (at most 30 a second)
//   u           every finger lifted
// The helper exits when stdin closes, so it never outlives the extension.
import AppKit
import Foundation

typealias ContactCallback = @convention(c) (
    UnsafeMutableRawPointer?, UnsafeMutableRawPointer?, Int32, Double, Int32
) -> Int32

struct Symbols {
    let createList: @convention(c) () -> Unmanaged<CFArray>?
    let register: @convention(c) (UnsafeMutableRawPointer, ContactCallback) -> Void
    let unregister: @convention(c) (UnsafeMutableRawPointer, ContactCallback) -> Void
    let start: @convention(c) (UnsafeMutableRawPointer, Int32) -> Void
    let stop: @convention(c) (UnsafeMutableRawPointer) -> Void
}

let symbols: Symbols? = {
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

// Same record layout the app reads: 96-byte contacts, state at 20, position at 32.
let contactStride = 96, stateOffset = 20, positionOffset = 32

final class State {
    let lock = NSLock()
    var fingers: [Int: [(Float, Float)]] = [:]
    var lastSent = 0.0
}
let state = State()

func emit(_ line: String) {
    FileHandle.standardOutput.write((line + "\n").data(using: .utf8)!)
}

func encode(_ fingers: [(Float, Float)]) -> String {
    fingers.map { String(format: "%.3f,%.3f", $0.0, $0.1) }.joined(separator: ";")
}

let callback: ContactCallback = { device, frame, count, _, _ in
    var fingers: [(Float, Float)] = []
    if let frame {
        for index in 0..<max(Int(count), 0) {
            let contact = UnsafeRawPointer(frame) + index * contactStride
            let touchState = contact.loadUnaligned(fromByteOffset: stateOffset, as: Int32.self)
            guard (3...4).contains(touchState) else { continue }
            fingers.append((contact.loadUnaligned(fromByteOffset: positionOffset, as: Float.self),
                            contact.loadUnaligned(fromByteOffset: positionOffset + 4, as: Float.self)))
        }
    }
    let key = Int(bitPattern: device)
    state.lock.lock()
    let wasTouching = state.fingers.values.contains { !$0.isEmpty }
    state.fingers[key] = fingers.isEmpty ? nil : fingers
    let all = state.fingers.values.flatMap { $0 }
    let now = ProcessInfo.processInfo.systemUptime
    var line: String?
    if !wasTouching && !all.isEmpty {
        line = "d " + encode(all)
    } else if wasTouching && all.isEmpty {
        line = "u"
    } else if !all.isEmpty && now - state.lastSent >= 1.0 / 30 {
        line = "f " + encode(all)
    }
    if line != nil { state.lastSent = now }
    state.lock.unlock()
    if let line { emit(line) }
    return 0
}

var devices: CFArray?

func startDevices() {
    guard let symbols, let list = symbols.createList()?.takeRetainedValue() else {
        FileHandle.standardError.write("MultitouchSupport unavailable\n".data(using: .utf8)!)
        return
    }
    for index in 0..<CFArrayGetCount(list) {
        guard let device = CFArrayGetValueAtIndex(list, index) else { continue }
        let pointer = UnsafeMutableRawPointer(mutating: device)
        symbols.register(pointer, callback)
        symbols.start(pointer, 0)
    }
    devices = list
}

func stopDevices() {
    guard let list = devices, let symbols else { return }
    for index in 0..<CFArrayGetCount(list) {
        guard let device = CFArrayGetValueAtIndex(list, index) else { continue }
        let pointer = UnsafeMutableRawPointer(mutating: device)
        symbols.unregister(pointer, callback)
        symbols.stop(pointer)
    }
    devices = nil
    state.lock.lock(); state.fingers.removeAll(); state.lock.unlock()
}

// Contact callbacks stop after the Mac sleeps; registering again brings them back.
NSWorkspace.shared.notificationCenter.addObserver(
    forName: NSWorkspace.didWakeNotification, object: nil, queue: .main
) { _ in
    stopDevices()
    startDevices()
}

Thread.detachNewThread {
    while let line = readLine(strippingNewline: true) { _ = line }
    exit(0)
}

startDevices()
RunLoop.main.run()
