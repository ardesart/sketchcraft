# SketchCraftAI LoRA v5: the v4 recipe (Qwen2.5-Coder-1.5B-Instruct, prompt/completion SFT, loss on the answer only) on
# the v3+v4 mix (re-checked against every eval set by mix.mjs) + the verified v5 pairs: the rest of the Model tab (arcs, Follow Me,
# text, guides, axes, resize, soften, divide, weld, bevel, reverse, explode, ungroup, intersect, solids, slice, flip, subdivide),
# materials and tile size, and deeper UV / texture-painting chains.
# A deadline callback stops training at 07:00 local on Nov 27 if it is still running (a safety net, days after the run should end).
import json, sys, time, torch, datetime
from datasets import Dataset
from peft import LoraConfig
from trl import SFTTrainer, SFTConfig
from transformers import AutoTokenizer, AutoModelForCausalLM, TrainerCallback

BASE = "Qwen/Qwen2.5-Coder-1.5B-Instruct"
DEADLINE = datetime.datetime(2026, 11, 27, 7, 0).timestamp()
def load(p):
    rows = []
    for line in open(p, encoding="utf-8"):
        m = json.loads(line)["messages"]
        rows.append({"prompt": m[:-1], "completion": m[-1:]})
    return Dataset.from_list(rows)

class Deadline(TrainerCallback):
    def on_step_end(self, args, state, control, **kw):
        if time.time() > DEADLINE:
            print("DEADLINE reached, stopping at step", state.global_step, flush=True)
            control.should_training_stop = True

train, dev = load("data/v5/train.chat.jsonl"), load("data/v5/dev.chat.jsonl")
dev = dev.shuffle(seed=1).select(range(min(500, len(dev))))  # a fixed 500-row dev slice: the full 1,627 rows cost about 4 h of evals
tok = AutoTokenizer.from_pretrained(BASE)
model = AutoModelForCausalLM.from_pretrained(BASE, dtype=torch.bfloat16, attn_implementation="sdpa")
cfg = SFTConfig(
    output_dir="out5/run", num_train_epochs=3, per_device_train_batch_size=2, gradient_accumulation_steps=8,
    learning_rate=2e-4, lr_scheduler_type="cosine", warmup_steps=30, bf16=True, logging_steps=20,
    eval_strategy="steps", eval_steps=600, save_steps=600, save_total_limit=3,
    load_best_model_at_end=True, metric_for_best_model="eval_loss", max_length=2048,
    completion_only_loss=True, gradient_checkpointing=True, report_to="none", seed=1,
)
lora = LoraConfig(r=32, lora_alpha=64, lora_dropout=0.05, task_type="CAUSAL_LM",
                  target_modules=["q_proj","k_proj","v_proj","o_proj","gate_proj","up_proj","down_proj"])
tr = SFTTrainer(model=model, args=cfg, train_dataset=train, eval_dataset=dev, processing_class=tok, peft_config=lora, callbacks=[Deadline()])
import glob
tr.train(resume_from_checkpoint=bool(glob.glob("out5/run/checkpoint-*")))
tr.save_model("out5/best-adapter")
merged = tr.model.merge_and_unload()
merged.save_pretrained("out5/merged", safe_serialization=True)
tok.save_pretrained("out5/merged")
print("DONE", tr.state.best_metric, flush=True)
