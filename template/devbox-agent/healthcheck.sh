#!/usr/bin/env bash
set -euo pipefail

# Keep the first external-template integration conservative: readiness means the Devbox
# container is alive and exec-ready. Agent-specific health checks can move into config.sh later.
exit 0
