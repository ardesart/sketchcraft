# SketchCraftAI LoRA v4: the v3 recipe (Qwen2.5-Coder-1.5B-Instruct, prompt/completion SFT, loss on the answer only) on
# v3 data + the verified v4 pairs for the 0.3.9 features (Room mode, picture materials, projection, vertex paint, UV, texture painting).
# A deadline callback stops training at 07:00 local on Nov 24 if it is still running, so the merge always happens before the hard stop.
import json, sys, time, torch, datetime
from datasets import Dataset
from peft import LoraConfig
from trl import SFTTrainer, SFTConfig
from transformers import AutoTokenizer, AutoModelForCausalLM, TrainerCallback

BASE = "Qwen/Qwen2.5-Coder-1.5B-Instruct"
DEADLINE = datetime.datetime(2026, 11, 24, 7, 0).timestamp()
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

train, dev = load("data/v4/train.chat.jsonl"), load("data/v4/dev.chat.jsonl")
tok = AutoTokenizer.from_pretrained(BASE)
model = AutoModelForCausalLM.from_pretrained(BASE, dtype=torch.bfloat16, attn_implementation="sdpa")
cfg = SFTConfig(
    output_dir="out4/run", num_train_epochs=3, per_device_train_batch_size=2, gradient_accumulation_steps=8,
    learning_rate=2e-4, lr_scheduler_type="cosine", warmup_steps=30, bf16=True, logging_steps=20,
    eval_strategy="steps", eval_steps=300, save_steps=300, save_total_limit=3,
    load_best_model_at_end=True, metric_for_best_model="eval_loss", max_length=2048,
    completion_only_loss=True, gradient_checkpointing=True, report_to="none", seed=1,
)
lora = LoraConfig(r=32, lora_alpha=64, lora_dropout=0.05, task_type="CAUSAL_LM",
                  target_modules=["q_proj","k_proj","v_proj","o_proj","gate_proj","up_proj","down_proj"])
tr = SFTTrainer(model=model, args=cfg, train_dataset=train, eval_dataset=dev, processing_class=tok, peft_config=lora, callbacks=[Deadline()])
import glob
tr.train(resume_from_checkpoint=bool(glob.glob("out4/run/checkpoint-*")))
tr.save_model("out4/best-adapter")
merged = tr.model.merge_and_unload()
merged.save_pretrained("out4/merged", safe_serialization=True)
tok.save_pretrained("out4/merged")
print("DONE", tr.state.best_metric, flush=True)
