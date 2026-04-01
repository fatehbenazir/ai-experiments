"""
Autoresearch training script for Gemma 3.
Usage: uv run train_gemma3.py
"""

import os
os.environ["PYTORCH_ALLOC_CONF"] = "expandable_segments:True"
os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"

import gc
import math
import time
from dataclasses import dataclass, asdict

import torch
import torch.nn as nn
import torch.nn.functional as F

from transformers import AutoModelForCausalLM, AutoTokenizer
from prepare import MAX_SEQ_LEN, TIME_BUDGET, make_dataloader, EVAL_TOKENS

# ---------------------------------------------------------------------------
# Tokenizer Wrapper for HF
# ---------------------------------------------------------------------------
class HFTokenizerWrapper:
    def __init__(self, tokenizer):
        self.tokenizer = tokenizer
        self.bos_token_id = tokenizer.bos_token_id if tokenizer.bos_token_id is not None else 0
        
    def get_bos_token_id(self):
        return self.bos_token_id
        
    def encode(self, text, prepend=None, num_threads=8):
        if isinstance(text, str):
            ids = self.tokenizer.encode(text, add_special_tokens=False)
            if prepend is not None:
                ids.insert(0, prepend)
        elif isinstance(text, list):
            ids = [self.tokenizer.encode(t, add_special_tokens=False) for t in text]
            if prepend is not None:
                for row in ids:
                    row.insert(0, prepend)
        else:
            raise ValueError(f"Invalid input type: {type(text)}")
        return ids

# ---------------------------------------------------------------------------
# Setup: model, tokenizer, dataloader
# ---------------------------------------------------------------------------

DEVICE_BATCH_SIZE = 1  # Keep it small for 1B model on 16GB L4!
TOTAL_BATCH_SIZE = 2**14 # Smaller total batch size for testing
LR = 2e-5

t_start = time.time()
torch.manual_seed(42)
torch.cuda.manual_seed(42)
torch.set_float32_matmul_precision("high")
device = torch.device("cuda")
autocast_ctx = torch.amp.autocast(device_type="cuda", dtype=torch.bfloat16)

print("Loading Gemma 3 model and tokenizer...")
model_id = "google/gemma-3-1b-it"
# Load model in bfloat16
model = AutoModelForCausalLM.from_pretrained(model_id, torch_dtype=torch.bfloat16).to(device)
hf_tokenizer = AutoTokenizer.from_pretrained(model_id)

tokenizer = HFTokenizerWrapper(hf_tokenizer)

# Calculate token_bytes for Gemma 3 tokenizer (needed for BPB evaluation)
print("Building token_bytes lookup for Gemma 3...")
token_bytes_list = []
for token_id in range(hf_tokenizer.vocab_size):
    try:
        token_str = hf_tokenizer.decode([token_id])
        token_bytes_list.append(len(token_str.encode("utf-8")))
    except:
        token_bytes_list.append(0)
token_bytes = torch.tensor(token_bytes_list, dtype=torch.int32, device="cuda")

tokens_per_fwdbwd = DEVICE_BATCH_SIZE * MAX_SEQ_LEN
grad_accum_steps = max(1, TOTAL_BATCH_SIZE // tokens_per_fwdbwd)

optimizer = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=0.01)

train_loader = make_dataloader(tokenizer, DEVICE_BATCH_SIZE, MAX_SEQ_LEN, "train")
x, y, epoch = next(train_loader)  # prefetch first batch

print(f"Time budget: {TIME_BUDGET}s")
print(f"Gradient accumulation steps: {grad_accum_steps}")

# ---------------------------------------------------------------------------
# Training loop
# ---------------------------------------------------------------------------

t_start_training = time.time()
smooth_train_loss = 0
total_training_time = 0
step = 0

model.train()

while True:
    torch.cuda.synchronize()
    t0 = time.time()
    optimizer.zero_grad()
    
    for micro_step in range(grad_accum_steps):
        with autocast_ctx:
            outputs = model(x, labels=y)
            loss = outputs.loss
        train_loss = loss.detach()
        loss = loss / grad_accum_steps
        loss.backward()
        x, y, epoch = next(train_loader)

    optimizer.step()

    train_loss_f = train_loss.item()

    # Fast fail: abort if loss is exploding or NaN
    if math.isnan(train_loss_f) or train_loss_f > 100:
        print("FAIL")
        exit(1)

    torch.cuda.synchronize()
    t1 = time.time()
    dt = t1 - t0

    if step > 2:  # Skip first few steps for compilation/startup time
        total_training_time += dt

    # Logging
    ema_beta = 0.9
    smooth_train_loss = ema_beta * smooth_train_loss + (1 - ema_beta) * train_loss_f
    debiased_smooth_loss = smooth_train_loss / (1 - ema_beta**(step + 1))
    
    print(f"\rstep {step:05d} | loss: {debiased_smooth_loss:.6f} | dt: {dt*1000:.0f}ms | epoch: {epoch} | remaining: {max(0, TIME_BUDGET - total_training_time):.0f}s", end="", flush=True)

    step += 1

    # Time's up
    if step > 2 and total_training_time >= TIME_BUDGET:
        break

print()  # newline after \r training log

# ---------------------------------------------------------------------------
# Evaluation (BPB)
# ---------------------------------------------------------------------------
print("Evaluating BPB...")
model.eval()

val_loader = make_dataloader(tokenizer, DEVICE_BATCH_SIZE, MAX_SEQ_LEN, "val")
steps = EVAL_TOKENS // (DEVICE_BATCH_SIZE * MAX_SEQ_LEN)
total_nats = 0.0
total_bytes = 0

with torch.no_grad():
    for _ in range(steps):
        x, y, _ = next(val_loader)
        with autocast_ctx:
            outputs = model(x)
            logits = outputs.logits
            # Calculate per-token loss with reduction='none'
            loss_flat = F.cross_entropy(logits.view(-1, logits.size(-1)), y.view(-1), reduction='none').view(-1)
        
        y_flat = y.view(-1)
        nbytes = token_bytes[y_flat]
        mask = nbytes > 0
        total_nats += (loss_flat * mask).sum().item()
        total_bytes += nbytes.sum().item()

val_bpb = total_nats / (math.log(2) * total_bytes) if total_bytes > 0 else 0

# Final summary
t_end = time.time()
peak_vram_mb = torch.cuda.max_memory_allocated() / 1024 / 1024

print("---")
print(f"val_bpb:          {val_bpb:.6f}")
print(f"training_seconds: {total_training_time:.1f}")
print(f"total_seconds:    {t_end - t_start:.1f}")
print(f"peak_vram_mb:     {peak_vram_mb:.1f}")
print(f"num_steps:        {step}")
