# Base image with PyTorch, CUDA, and compiler toolchain for torch.compile
FROM pytorch/pytorch:2.11.0-cuda12.8-cudnn9-devel

SHELL ["/bin/bash", "-o", "pipefail", "-c"]
RUN apt-get update && apt-get install -y --no-install-recommends curl git jq procps && \
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Create a non-root user for the autonomous agent
RUN useradd -m -s /bin/bash researcher

# Install uv using the official multi-stage copy pattern
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Install Gemini CLI
RUN npm install -g @google/gemini-cli && npm cache clean --force

# Switch to non-root user
RUN mkdir -p /app && chown researcher:researcher /app
USER researcher
ENV HOME=/home/researcher
WORKDIR /app

# Configure git
RUN git config --global user.email "agent@autoresearch.local" \
    && git config --global user.name "Autoresearch Agent" \
    && git config --global init.defaultBranch master

# Install Python dependencies
COPY --chown=researcher:researcher pyproject.toml uv.lock ./
RUN uv sync

# Pre-download Flash Attention kernels to avoid runtime rate limits and build stalls
# We try to download the common variants; failures here are tolerated but warned
RUN for kernel in "kernels-community/flash-attn3" "varunneal/flash-attention-3"; do \
        uv run python -c "from kernels import get_kernel; get_kernel('$kernel')" || echo "Kernel download for '$kernel' skipped or failed" >&2; \
    done

# Copy prepare.py and run it to take advantage of Docker caching
COPY --chown=researcher:researcher prepare.py ./
RUN uv run prepare.py

# Copy the rest of the source
COPY --chown=researcher:researcher . /app
RUN chmod +x sync.sh init.sh env.sh

# Inline patches
# Pre-tune batch size for L4 GPUs
RUN sed -i 's/DEVICE_BATCH_SIZE = 128/DEVICE_BATCH_SIZE = 16/g' train.py

# Remove the interactive confirmation step
RUN sed -i 's/Once you get confirmation, kick off the experimentation./Do NOT ask for confirmation. Immediately kick off the experimentation LOOP FOREVER./g' program.md

# Patch program.md to unbuffer training output and run sync script after every experiment
RUN sed -i 's|uv run train.py > run.log 2>&1|PYTHONUNBUFFERED=1 &; ./sync.sh|g' program.md

# Instruct the agent to run training synchronously to avoid unproductive polling loops
RUN echo "" >> program.md && echo "CRITICAL: Always run training commands synchronously in the foreground. Do NOT use is_background, nohup, or &. Wait for the command to complete, then read run.log for results." >> program.md

# Instruct the agent to select the correct Flash Attention kernel or fallback
RUN echo -e "\nCRITICAL: Before running experiments, you must configure the correct attention mechanism based on the GPU architecture.\n1.  **Check GPU Capability**: Run \`python3 -c \"import torch; print(torch.cuda.get_device_capability())\"\`.\n2.  **Update \`train.py\`**:\n    *   **Blackwell GPUs** (capability major version 10+): You MUST use \`torch.nn.functional.scaled_dot_product_attention\` (SDPA), as Flash Attention is not compatible.\n    *   **Hopper GPUs** (capability \`(9, 0)\`): Use the \`varunneal/flash-attention-3\` package.\n    *   **Other GPUs** (e.g., Ampere with major version 8): Use the \`kernels-community/flash-attn3\` package.\nDo not wait for a CUDA error to make these changes." >> program.md

# Start the agent
CMD ./init.sh && gemini \
    --prompt "Hi have a look at program.md and let's kick off a new experiment!" \
    --yolo \
    --model gemini-3-flash-preview
