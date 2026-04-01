#!/bin/bash
source ./env.sh

DEST="/mnt/results/${BUCKET_PATH}"
DEBUG_LOG="/tmp/sync_debug.log"
mkdir -p "$DEST"

log() { echo "[sync.sh $(date -u +%H:%M:%S)] $*" >> "$DEBUG_LOG"; }

# Helper to ensure atomic writes to GCS FUSE
sync_to_gcs() {
    local src="$1"
    local dest="$DEST/$2"
    if [ -e "$src" ]; then
        if ! cp -r "$src" "$dest.tmp" || ! mv "$dest.tmp" "$dest"; then
            log "ERROR: Failed to sync $src to $dest"
        fi
    fi
}

log "=== sync.sh started ==="

# Sync ledger and git history
sync_to_gcs results.tsv results.tsv

tar -czf /tmp/git_history.tar.gz .git/ || log "ERROR: Failed to create git history tarball"
sync_to_gcs /tmp/git_history.tar.gz git_history.tar.gz
sync_to_gcs run.log run.log

# Token usage tracking
# Try to find the latest session file in either standard location
LATEST_SESSION=$(find "$HOME/.gemini" "/app/.gemini" -name 'session-*.json' -type f -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -f2- -d" ")

# Extract cumulative token usage from Gemini CLI session JSON.
# Handles two session formats: newer (.stats.models[]) and older (.messages[]).
# Field names also differ across versions (input/prompt, output/candidates).
if [ -n "$LATEST_SESSION" ]; then
    jq -c '. as $root |
        (if has("stats") and has("models") then .stats.models[] else .messages[] end) |
        .tokens as $t |
        {
            input: ($t.input // $t.prompt // 0),
            cached: ($t.cached // 0),
            output: ($t.output // $t.candidates // 0)
        } |
        [.] |
        reduce .[] as $item ({input:0, cached:0, output:0};
            .input += $item.input |
            .cached += $item.cached |
            .output += $item.output
        ) |
        . + {session: ($root | input_filename | split("/") | last)}' "$LATEST_SESSION" | \
        jq -c -s 'reduce .[] as $item ({input:0, cached:0, output:0, session:.[0].session};
            .input += $item.input |
            .cached += $item.cached |
            .output += $item.output)' > /tmp/tokens_latest.jsonl 2>> "$DEBUG_LOG"
else
    log "WARNING: No session files found anywhere!"
    : > /tmp/tokens_latest.jsonl
fi

if [ -s /tmp/tokens_latest.jsonl ]; then
    # On first sync in a new container, seed from GCS to preserve history
    [ ! -f /tmp/tokens_all.jsonl ] && cp "$DEST/tokens.jsonl" /tmp/tokens_all.jsonl 2>/dev/null || true
    cat /tmp/tokens_latest.jsonl >> /tmp/tokens_all.jsonl
    sync_to_gcs /tmp/tokens_all.jsonl tokens.jsonl
fi

# Copy Gemini CLI chat logs only if DEBUG is enabled
if [ "${DEBUG:-false}" = "true" ]; then
    mkdir -p "$DEST/logs"
    find "$HOME/.gemini" -name 'session-*.json' -type f -exec cp {} "$DEST/logs/" \; 2>/dev/null
fi

log "=== sync.sh finished ==="
sync_to_gcs "$DEBUG_LOG" sync_debug.log
