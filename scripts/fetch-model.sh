#!/usr/bin/env bash
set -euo pipefail

repo='Xenova/LaMini-Flan-T5-248M'
target='public/models/Xenova/LaMini-Flan-T5-248M'
base="https://huggingface.co/${repo}/resolve/main"

command -v curl >/dev/null || { echo 'curl is required to vendor the model.' >&2; exit 1; }

# These are the published q8/"quantized" ONNX sessions selected by
# @xenova/transformers v2. Do not download the fp32/fp16/q4 alternatives.
files=(
  config.json
  generation_config.json
  quantize_config.json
  special_tokens_map.json
  spiece.model
  tokenizer.json
  tokenizer_config.json
  onnx/encoder_model_quantized.onnx
  onnx/decoder_model_merged_quantized.onnx
)

for file in "${files[@]}"; do
  destination="${target}/${file}"
  mkdir -p "$(dirname "${destination}")"
  echo "Downloading ${file}"
  curl --continue-at - --fail --location --retry 3 --output "${destination}" "${base}/${file}?download=true"
done

echo "Model vendored at ${target}"
