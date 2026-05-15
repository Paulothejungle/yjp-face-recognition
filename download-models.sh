#!/bin/bash
# ============================================================
# Script download model face-api.js
# Jalankan sekali: bash download-models.sh
# ============================================================

MODELS_DIR="./public/models"
BASE_URL="https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights"

mkdir -p "$MODELS_DIR"

echo "📦 Mendownload model face-api.js..."

FILES=(
  "tiny_face_detector_model-weights_manifest.json"
  "tiny_face_detector_model-shard1"
  "face_landmark_68_tiny_model-weights_manifest.json"
  "face_landmark_68_tiny_model-shard1"
  "face_recognition_model-weights_manifest.json"
  "face_recognition_model-shard1"
  "face_recognition_model-shard2"
)

for FILE in "${FILES[@]}"; do
  echo "  ⬇️  $FILE"
  curl -L -o "$MODELS_DIR/$FILE" "$BASE_URL/$FILE"
done

echo ""
echo "✅ Semua model berhasil didownload ke $MODELS_DIR"
