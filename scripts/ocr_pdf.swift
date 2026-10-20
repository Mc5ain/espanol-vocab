import AppKit
import Foundation
import Vision

guard CommandLine.arguments.count == 3 else {
    fputs("usage: ocr_pdf.swift <image-dir> <output-json>\n", stderr)
    exit(2)
}

let imageDirectory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])
let files = try FileManager.default.contentsOfDirectory(
    at: imageDirectory,
    includingPropertiesForKeys: nil
).filter { $0.pathExtension.lowercased() == "png" }.sorted { $0.lastPathComponent < $1.lastPathComponent }

var output: [[String: Any]] = []

for file in files {
    autoreleasepool {
        guard
            let image = NSImage(contentsOf: file),
            let data = image.tiffRepresentation,
            let bitmap = NSBitmapImageRep(data: data),
            let cgImage = bitmap.cgImage
        else {
            return
        }

        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.recognitionLanguages = ["zh-Hans", "es-ES", "en-US"]
        request.usesLanguageCorrection = true

        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        do {
            try handler.perform([request])
            let observations = (request.results ?? []).compactMap { observation -> [String: Any]? in
                guard let candidate = observation.topCandidates(1).first else { return nil }
                let box = observation.boundingBox
                return [
                    "text": candidate.string,
                    "confidence": candidate.confidence,
                    "x": box.origin.x,
                    "y": box.origin.y,
                    "width": box.size.width,
                    "height": box.size.height
                ]
            }.sorted {
                let ay = $0["y"] as? Double ?? 0
                let by = $1["y"] as? Double ?? 0
                if abs(ay - by) > 0.01 { return ay > by }
                return ($0["x"] as? Double ?? 0) < ($1["x"] as? Double ?? 0)
            }
            output.append(["file": file.lastPathComponent, "lines": observations])
        } catch {
            output.append(["file": file.lastPathComponent, "error": error.localizedDescription, "lines": []])
        }
    }
    fputs(".", stderr)
}

let json = try JSONSerialization.data(withJSONObject: output, options: [.prettyPrinted, .sortedKeys])
try json.write(to: outputURL)
fputs("\n", stderr)
