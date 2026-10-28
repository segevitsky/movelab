import ExpoModulesCore
import ReplayKit
import AVFoundation

final class RecorderException: GenericException<String>, @unchecked Sendable {
  override var reason: String { "ScreenRecorder: \(param)" }
}

public final class ScreenRecorderModule: Module {
  private var startedAt: Date?

  public func definition() -> ModuleDefinition {
    Name("ScreenRecorder")

    Function("isAvailable") { () -> Bool in RPScreenRecorder.shared().isAvailable }
    Function("isRecording") { () -> Bool in RPScreenRecorder.shared().isRecording }

    /// Starts an in-app recording (ReplayKit asks the user for consent the first time).
    /// Resolves once recording actually runs.
    AsyncFunction("start") { (promise: Promise) in
      let rec = RPScreenRecorder.shared()
      rec.isMicrophoneEnabled = false
      rec.isCameraEnabled = false
      let begin: () -> Void = { [weak self] in
        guard rec.isAvailable else {
          promise.reject(RecorderException("ReplayKit unavailable right now (another recording / screen mirroring / low power?). Wait a second and retry."))
          return
        }
        rec.startRecording { [weak self] error in
          if let error {
            // one retry after a short pause: ReplayKit often fails the first call right after a stop
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
              rec.startRecording { [weak self] error2 in
                if let error2 { promise.reject(RecorderException("\(error2.localizedDescription) (code \((error2 as NSError).code), first: \(error.localizedDescription))")); return }
                self?.startedAt = Date()
                promise.resolve(["alreadyRecording": false, "retried": true, "startedAt": Date().timeIntervalSince1970])
              }
            }
            return
          }
          self?.startedAt = Date()
          promise.resolve(["alreadyRecording": false, "retried": false, "startedAt": Date().timeIntervalSince1970])
        }
      }
      if rec.isRecording {
        // a previous recording is still open (stop failed or screen left mid-recording): drop it first
        rec.stopRecording { _, _ in rec.discardRecording { begin() } }
      } else {
        begin()
      }
    }.runOnQueue(.main)

    /// Stops and writes the .mp4 into the caches directory. Returns { uri, width, height, duration, seconds }.
    AsyncFunction("stop") { (promise: Promise) in
      let rec = RPScreenRecorder.shared()
      guard rec.isRecording else { promise.reject(RecorderException("not recording")); return }
      let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("recordings", isDirectory: true)
      try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
      let url = dir.appendingPathComponent("rec-\(Int(Date().timeIntervalSince1970)).mp4")
      let wall = self.startedAt.map { Date().timeIntervalSince($0) } ?? 0
      rec.stopRecording(withOutput: url) { error in
        if let error {
          // leave ReplayKit in a clean state so the next start() works
          rec.discardRecording {}
          promise.reject(RecorderException("stop failed: \(error.localizedDescription) (code \((error as NSError).code))"))
          return
        }
        let asset = AVURLAsset(url: url)
        var w = 0, h = 0
        if let t = asset.tracks(withMediaType: .video).first {
          let s = t.naturalSize.applying(t.preferredTransform)
          w = Int(abs(s.width)); h = Int(abs(s.height))
        }
        let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int64) ?? 0
        promise.resolve(["uri": url.absoluteString, "width": w, "height": h,
                         "duration": CMTimeGetSeconds(asset.duration), "wallSeconds": wall, "bytes": size])
      }
    }.runOnQueue(.main)

    AsyncFunction("discard") { (promise: Promise) in
      let rec = RPScreenRecorder.shared()
      guard rec.isRecording else { promise.resolve(nil); return }
      rec.stopRecording { _, _ in rec.discardRecording { promise.resolve(nil) } }
    }.runOnQueue(.main)

    /// Screen size in points + scale, so JS can turn view coordinates into normalized crop rects.
    Function("screenInfo") { () -> [String: Any] in
      let b = UIScreen.main.bounds
      return ["width": b.width, "height": b.height, "scale": UIScreen.main.scale]
    }
  }
}
