#!/bin/sh
# One model at a time (small disk, small RAM): pull, run constrained / free / constrained+3-shot, remove.
# Usage: tools/minimodel/run_all.sh qwen2.5-coder:1.5b [more models...]
# Needs: a built `sketchcraft` (SKETCHCRAFT_BIN), Ollama running, node 20+.
set -e
cd "$(dirname "$0")"
for m in "$@"; do
  ollama pull "$m"
  node run_eval.mjs --model "$m" --mode constrained
  node run_eval.mjs --model "$m" --mode free
  node run_eval.mjs --model "$m" --mode constrained --shots 3
  ollama rm "$m"
done
