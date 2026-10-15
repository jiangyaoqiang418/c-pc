"""Compare the captured wallet PNGs without rescaling, masking or alignment edits.

Run with the existing bundled Python/Pillow. Files resolve beside this script.
Only the current reference-wallet-1440.png is used: the older reference repeat
has not been verified as the same state and is deliberately excluded.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parent
MAIN_CROP = (32, 148, 1393, 858)  # PIL bounds: right/bottom are exclusive.
AMOUNT_BUTTONS_CROP = (48, 300, 500, 515)
CAPTURE_PIXELS = (1425, 900)
FILES = {
    "reference": "reference-wallet-1440.png",
    "implementation": "implementation-wallet-after-1440.png",
    "implementationRepeat": "implementation-wallet-repeat-1440.png",
}


def load_capture(name: str) -> Image.Image:
    path = ROOT / FILES[name]
    with Image.open(path) as image:
        image.load()
        if image.size != CAPTURE_PIXELS:
            raise ValueError(f"{path.name}: expected {CAPTURE_PIXELS}, got {image.size}")
        if image.mode not in ("RGB", "RGBA"):
            raise ValueError(f"{path.name}: unsupported mode {image.mode}; no conversion is applied")
        return image.copy()


def bounds(points: list[dict], key: str) -> list[int] | None:
    if not points:
        return None
    xs = [point[key][0] for point in points]
    ys = [point[key][1] for point in points]
    return [min(xs), min(ys), max(xs) + 1, max(ys) + 1]


def pixels(image: Image.Image):
    # Pillow renamed getdata in newer bundles; retain compatibility with older installs.
    return getattr(image, "get_flattened_data", image.getdata)()


def analyze(left: Image.Image, right: Image.Image, crop: tuple[int, ...]) -> tuple[Image.Image, dict]:
    if left.mode != right.mode or left.size != right.size:
        raise ValueError("Captures must have identical mode and dimensions; no normalization is applied")
    first, second = left.crop(crop), right.crop(crop)
    difference = ImageChops.difference(first, second)
    channels = list(first.getbands())
    width = first.width
    changed = []
    for index, (delta, a, b) in enumerate(zip(pixels(difference), pixels(first), pixels(second))):
        if any(delta):
            x, y = index % width, index // width
            changed.append({
                "cropCoordinate": [x, y],
                "captureCoordinate": [x + crop[0], y + crop[1]],
                "left": list(a),
                "right": list(b),
                "absoluteChannelDifference": dict(zip(channels, delta)),
            })
    return difference, {
        "crop": list(crop),
        "cropPixels": list(first.size),
        "channels": channels,
        "maximumAbsoluteDifferencePerChannel": dict(zip(channels, [high for low, high in difference.getextrema()])),
        "changedPixelCount": len(changed),
        "changedChannelValueCount": sum(sum(value != 0 for value in point["absoluteChannelDifference"].values()) for point in changed),
        "differenceBoundsInCrop": bounds(changed, "cropCoordinate"),
        "differenceBoundsInCapture": bounds(changed, "captureCoordinate"),
        "changedPixels": changed,
    }


def side_by_side(left: Image.Image, right: Image.Image, crop: tuple[int, ...], filename: str) -> None:
    first, second = left.crop(crop), right.crop(crop)
    result = Image.new(first.mode, (first.width + second.width, first.height))
    result.paste(first, (0, 0))
    result.paste(second, (first.width, 0))
    result.save(ROOT / filename)


def main() -> None:
    captures = {key: load_capture(key) for key in FILES}
    reference, implementation, repeat = (captures[key] for key in FILES)
    diff, comparison = analyze(reference, implementation, MAIN_CROP)
    repeat_diff, repeat_comparison = analyze(implementation, repeat, MAIN_CROP)
    _, amount_comparison = analyze(reference, implementation, AMOUNT_BUTTONS_CROP)
    diff.save(ROOT / "diff-wallet-main-native-1440.png")
    repeat_diff.save(ROOT / "diff-wallet-implementation-repeat-native-1440.png")
    side_by_side(reference, implementation, MAIN_CROP, "compare-wallet-main-native-1440.png")
    side_by_side(implementation, repeat, MAIN_CROP, "compare-wallet-repeat-native-1440.png")
    side_by_side(reference, implementation, AMOUNT_BUTTONS_CROP, "compare-wallet-amount-buttons-native-1440.png")

    report = {
        "scope": "MEME wallet deterministic visible main; no inference about other routes, states or production asset supplements.",
        "cssViewport": [1440, 900],
        "dpr": 1,
        "capturePixels": list(CAPTURE_PIXELS),
        "captureNote": "Native capture excludes the 15px vertical scrollbar; dimensions are recorded, never rescaled.",
        "processing": {"rescale": False, "mask": None, "alignmentShift": None, "colorConversion": None},
        "inputs": {key: {"filename": filename, "mode": captures[key].mode,
                         "sha256": hashlib.sha256((ROOT / filename).read_bytes()).hexdigest()} for key, filename in FILES.items()},
        "referenceVersusImplementation": comparison,
        "implementationRepeat": repeat_comparison,
        "amountAndButtons": amount_comparison,
        "referenceRepeat": {"verified": False, "used": False,
                            "reason": "A matching-state repeated reference capture was not successfully collected; the older reference-wallet-repeat-1440.png is excluded."},
        "computedEvidence": {"desktopNodes": 10, "desktopDifferences": 0, "mobileCssWidth": 375, "mobileDifferences": 0,
                             "source": "Root Chrome computed-style comparison; separate from these raster calculations."},
        "interpretation": "Counts, channel magnitudes and coordinates describe this sample only. No restoration percentage or full-page/site acceptance is claimed.",
        "outputs": ["compare-wallet-main-native-1440.png", "diff-wallet-main-native-1440.png",
                    "compare-wallet-repeat-native-1440.png", "diff-wallet-implementation-repeat-native-1440.png",
                    "compare-wallet-amount-buttons-native-1440.png"],
    }
    output = ROOT / "wallet-capture-analysis.json"
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "report": output.name,
        "changedPixelCount": comparison["changedPixelCount"],
        "maximumAbsoluteDifferencePerChannel": comparison["maximumAbsoluteDifferencePerChannel"],
        "implementationRepeatChangedPixelCount": repeat_comparison["changedPixelCount"],
        "amountButtonsChangedPixelCount": amount_comparison["changedPixelCount"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
