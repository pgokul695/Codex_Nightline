#!/usr/bin/env bash
set -euo pipefail

repo='Xenova/LaMini-Flan-T5-248M'
target='public/models/Xenova/LaMini-Flan-T5-248M'
ort_target='public/ort'
ort_source='node_modules/@xenova/transformers/dist'
base="https://huggingface.co/${repo}/resolve/main"

command -v curl >/dev/null || { echo 'curl is required to vendor the model.' >&2; exit 1; }
command -v python3 >/dev/null || { echo 'python3 is required to verify JSON assets.' >&2; exit 1; }

# Never resume onto a stale partial, redirect, or Git LFS pointer file.
rm -rf "${target}"
rm -rf "${ort_target}"

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

declare -A expected_sizes=(
  [config.json]=1541
  [generation_config.json]=147
  [quantize_config.json]=3448
  [special_tokens_map.json]=2201
  [spiece.model]=791656
  [tokenizer.json]=2422262
  [tokenizer_config.json]=2457
  [onnx/encoder_model_quantized.onnx]=110502358
  [onnx/decoder_model_merged_quantized.onnx]=164739632
)

for file in "${files[@]}"; do
  destination="${target}/${file}"
  mkdir -p "$(dirname "${destination}")"
  echo "Downloading ${file}"
  curl --fail --show-error --location --retry 3 --output "${destination}" "${base}/${file}?download=true"
done

mkdir -p "${ort_target}"
wasm_files=(
  ort-wasm.wasm
  ort-wasm-simd.wasm
  ort-wasm-threaded.wasm
  ort-wasm-simd-threaded.wasm
)
for wasm_file in "${wasm_files[@]}"; do
  source_file="${ort_source}/${wasm_file}"
  [[ -f "${source_file}" ]] || { echo "Missing ONNX Runtime asset: ${source_file}" >&2; exit 1; }
  cp "${source_file}" "${ort_target}/${wasm_file}"
  [[ -s "${ort_target}/${wasm_file}" ]] || { echo "Failed to copy ${wasm_file}" >&2; exit 1; }
done

for file in "${files[@]}"; do
  actual_size=$(stat --format='%s' "${target}/${file}")
  if [[ "${actual_size}" != "${expected_sizes[${file}]}" ]]; then
    echo "Verification failed: ${file} is ${actual_size} bytes; expected ${expected_sizes[${file}]} bytes." >&2
    exit 1
  fi
done

while IFS= read -r -d '' json_file; do
  python3 -m json.tool "${json_file}" >/dev/null || {
    echo "Verification failed: invalid JSON in ${json_file}." >&2
    exit 1
  }
done < <(find "${target}" -name '*.json' -print0)

for binary in spiece.model onnx/encoder_model_quantized.onnx onnx/decoder_model_merged_quantized.onnx; do
  if head -c 64 "${target}/${binary}" | grep -q 'version https://git-lfs.github.com'; then
    echo "Verification failed: ${binary} is a Git LFS pointer, not model data." >&2
    exit 1
  fi
  if ! file "${target}/${binary}" | grep -q ': data'; then
    echo "Verification failed: ${binary} is not binary model data." >&2
    exit 1
  fi
done

echo "Model vendored at ${target}"
echo "ONNX Runtime WASM assets vendored at ${ort_target}"
