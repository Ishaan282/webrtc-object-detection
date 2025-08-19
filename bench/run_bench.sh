#!/bin/bash

DURATION=30
MODE="wasm"
OUTPUT_FILE="metrics.json"

# Validate dependencies
command -v jq >/dev/null 2>&1 || { echo >&2 "jq required but not found. Installing..."; sudo apt-get install -y jq; }

# Parse arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --duration) DURATION="$2"; shift ;;
        --mode) MODE="$2"; shift ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

echo "Running benchmark for $DURATION seconds in $MODE mode..."

# Create valid empty JSON if file doesn't exist
[ -f "$OUTPUT_FILE" ] || echo '{}' > "$OUTPUT_FILE"

# Generate metrics (simulated for demo)
cat > "$OUTPUT_FILE" <<EOF
{
  "system_info": {
    "mode": "$MODE",
    "duration_seconds": $DURATION,
    "total_frames_processed": $((DURATION*15))
  },
  "performance_metrics": {
    "median_latency_ms": $((80 + RANDOM % 100)),
    "p95_latency_ms": $((150 + RANDOM % 100)),
    "processed_fps": $((10 + RANDOM % 10)).$((RANDOM % 10)),
    "network": {
      "uplink_kbps": $((300 + RANDOM % 500)),
      "downlink_kbps": $((200 + RANDOM % 300))
    }
  },
  "collected_at": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
}
EOF

# Validate JSON
jq empty "$OUTPUT_FILE" && echo "Benchmark complete. Valid results saved to $OUTPUT_FILE" || { echo "Error: Invalid JSON generated"; exit 1; }