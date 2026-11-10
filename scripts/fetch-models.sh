#!/bin/sh
# Fetch the RTMW whole-body ONNX model (Phase 17) into assets/models and modules/pose/ios/Models.
# 129 MB, Apache-2.0 (OpenMMLab mmpose). GitHub refuses files > 100 MB, so it is git-ignored.
set -e
cd "$(dirname "$0")/.."
NAME=rtmw-dw-l-m_simcc-cocktail14_270e-256x192_20231122
URL="https://download.openmmlab.com/mmpose/v1/projects/rtmw/onnx_sdk/$NAME.zip"
if [ ! -f "assets/models/$NAME.onnx" ]; then
  tmp=$(mktemp -d)
  echo "downloading $URL"
  curl -L -o "$tmp/m.zip" "$URL"
  unzip -o -q "$tmp/m.zip" -d "$tmp"
  f=$(find "$tmp" -name '*.onnx' | head -1)
  mkdir -p assets/models && cp "$f" "assets/models/$NAME.onnx"
  rm -rf "$tmp"
fi
mkdir -p modules/pose/ios/Models && cp "assets/models/$NAME.onnx" "modules/pose/ios/Models/$NAME.onnx"
ls -la "modules/pose/ios/Models/$NAME.onnx"
