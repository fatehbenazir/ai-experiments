#!/bin/bash
# env.sh: Centralized environment variable preparation for the Autoresearch Agent

# Default RESUME to true if not set
export RESUME=${RESUME:-"true"}

# Default BUCKET_RESULTS_DIR to autoresearch-results if not set
export BUCKET_RESULTS_DIR=${BUCKET_RESULTS_DIR:-"autoresearch-results"}

# Derive BUCKET_PATH from STUDY_NAME to allow organizing results
if [ -z "$BUCKET_PATH" ]; then
    if [ -z "$STUDY_NAME" ]; then
        export BUCKET_PATH="${BUCKET_RESULTS_DIR}/default"
    else
        # Slugify STUDY_NAME: lowercase, replace non-alnum with hyphens, trim prefix
        PROMPT_CLEAN=$(echo "$STUDY_NAME" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-//; s/-$//')
        PROMPT_PREFIX=$(echo "$PROMPT_CLEAN" | cut -c1-30)
        export BUCKET_PATH="${BUCKET_RESULTS_DIR}/${PROMPT_PREFIX}"
    fi
fi

# Validate BUCKET_PATH against path traversal
if echo "$BUCKET_PATH" | grep -qE '(^/|\.\./)'; then
    echo "ERROR: BUCKET_PATH contains invalid path components: $BUCKET_PATH"
    exit 1
fi

echo "Environment setup complete: BUCKET_PATH=$BUCKET_PATH, RESUME=$RESUME"
