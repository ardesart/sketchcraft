"""SketchCraftAI model server: runs a fine-tuned checkpoint straight from its Hugging Face folder.

Clean-room, no Ollama and no llama.cpp: PyTorch + Transformers only. It answers the small part of
the /api/chat shape that run_eval.mjs uses, so the harness scores it unchanged:

    POST /api/chat  {model, messages, options: {num_predict}, format?}
    -> {message: {role, content}, done, prompt_eval_count, eval_count, eval_duration, prompt_eval_duration, load_duration}
    GET  /api/version

Decoding is greedy (temperature 0), so results are repeatable. `format` (a JSON schema) is not
enforced: every run is effectively --mode free, and the harness parses the JSON itself.

    python serve.py <model-folder> [--port 11436] [--log serve.log]
"""
import argparse, json, sys, time, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

ap = argparse.ArgumentParser()
ap.add_argument("model")
ap.add_argument("--port", type=int, default=11436)
ap.add_argument("--log", default=None)
args = ap.parse_args()
if args.log:
    sys.stdout = sys.stderr = open(args.log, "a", buffering=1, encoding="utf-8")

t0 = time.time()
tok = AutoTokenizer.from_pretrained(args.model)
dev = "cuda" if torch.cuda.is_available() else "cpu"
model = AutoModelForCausalLM.from_pretrained(args.model, torch_dtype=torch.bfloat16 if dev == "cuda" else torch.float32).to(dev).eval()
print(f"loaded {args.model} on {dev} in {time.time() - t0:.1f}s", flush=True)
lock = threading.Lock()  # one generation at a time on the GPU


def chat(body):
    opts = body.get("options") or {}
    ids = tok.apply_chat_template(body["messages"], add_generation_prompt=True, return_tensors="pt", return_dict=True)["input_ids"].to(dev)
    with lock, torch.no_grad():
        t = time.time()
        out = model.generate(ids, max_new_tokens=int(opts.get("num_predict") or 900), do_sample=False, pad_token_id=tok.eos_token_id)
        dt = time.time() - t
    gen = out[0][ids.shape[1]:]
    return {
        "model": body.get("model"), "done": True,
        "message": {"role": "assistant", "content": tok.decode(gen, skip_special_tokens=True)},
        "prompt_eval_count": ids.shape[1], "eval_count": len(gen),
        "eval_duration": int(dt * 1e9), "prompt_eval_duration": 0, "load_duration": 0,
    }


class H(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        self._send(200, {"version": "sketchcraftai-serve 1"} if self.path == "/api/version" else {"error": "not found"})

    def do_POST(self):
        if self.path != "/api/chat":
            return self._send(404, {"error": "not found"})
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("content-length", 0))))
            self._send(200, chat(body))
        except Exception as e:  # report to the harness instead of dropping the connection
            self._send(200, {"error": f"{type(e).__name__}: {e}"})

    def log_message(self, *a):
        pass


ThreadingHTTPServer(("127.0.0.1", args.port), H).serve_forever()
