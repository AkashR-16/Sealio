#!/usr/bin/env bash
# Push the sealio-tasks.yml playbook to the LaunchForge engine.
#
# Prerequisites:
#   .env.local must contain:
#     LF_BASE_URL=https://launch-forge-production.up.railway.app
#     LF_ACCOUNT_ID=<your-account-id>
#     LF_ADMIN_KEY=<your-admin-key>
#
# Run:
#   bash scripts/lf-push-playbook.sh
#
# On first run, this creates the project and uploads the playbook.
# On subsequent runs, it re-uploads the playbook (idempotent within a project).

set -euo pipefail

# Load .env.local
if [ ! -f .env.local ]; then
  echo "ERROR: .env.local not found. Run from the repo root." >&2
  exit 1
fi

# Export only LF_ vars (safe subset, avoids exporting secrets like JWT keys)
while IFS= read -r line; do
  [[ "$line" =~ ^LF_ ]] || continue
  [[ "$line" =~ ^# ]]   && continue
  export "${line?}"
done < .env.local

: "${LF_BASE_URL:?LF_BASE_URL is not set in .env.local}"
: "${LF_ACCOUNT_ID:?LF_ACCOUNT_ID is not set in .env.local}"
: "${LF_ADMIN_KEY:?LF_ADMIN_KEY is not set in .env.local}"

PLAYBOOK_FILE="docs/sealio-tasks.yml"
if [ ! -f "$PLAYBOOK_FILE" ]; then
  echo "ERROR: $PLAYBOOK_FILE not found. Run from the repo root." >&2
  exit 1
fi

# ── Step 1: resolve or create the project ─────────────────────────────────────

if [ -z "${LF_PROJECT_ID:-}" ]; then
  echo "LF_PROJECT_ID not set — creating project 'sealio-build'..."
  CREATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "$LF_BASE_URL/api/accounts/$LF_ACCOUNT_ID/projects" \
    -H "Authorization: Bearer $LF_ADMIN_KEY" \
    -H "Content-Type: application/json" \
    -d '{"name":"sealio-build"}')

  HTTP_CODE=$(echo "$CREATE_RESPONSE" | tail -n1)
  BODY=$(echo "$CREATE_RESPONSE" | sed '$d')

  if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "201" ]; then
    echo "ERROR: project creation failed (HTTP $HTTP_CODE):" >&2
    echo "$BODY" >&2
    exit 1
  fi

  LF_PROJECT_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
  echo "Project created: $LF_PROJECT_ID"

  # Persist to .env.local so subsequent runs skip this step
  echo "" >> .env.local
  echo "# LaunchForge project ID (set by lf-push-playbook.sh)" >> .env.local
  echo "LF_PROJECT_ID=$LF_PROJECT_ID" >> .env.local
  echo "LF_PROJECT_ID written to .env.local"
else
  echo "Using existing project: $LF_PROJECT_ID"
fi

# ── Step 2: upload the playbook ───────────────────────────────────────────────

echo "Uploading $PLAYBOOK_FILE..."
YAML_CONTENT=$(cat "$PLAYBOOK_FILE")

UPLOAD_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$LF_BASE_URL/api/projects/$LF_PROJECT_ID/playbook" \
  -H "Authorization: Bearer $LF_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d "$(python3 -c "import json,sys; print(json.dumps({'yaml': sys.stdin.read()}))" <<< "$YAML_CONTENT")")

HTTP_CODE=$(echo "$UPLOAD_RESPONSE" | tail -n1)
BODY=$(echo "$UPLOAD_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "201" ]; then
  echo "ERROR: playbook upload failed (HTTP $HTTP_CODE):" >&2
  echo "$BODY" >&2
  exit 1
fi

echo "Playbook uploaded successfully (HTTP $HTTP_CODE)."
echo ""
echo "View at: https://verisop-production.up.railway.app"
