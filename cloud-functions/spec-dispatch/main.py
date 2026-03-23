"""
Google Cloud Function: ADO Service Hook → GitHub Workflow Dispatch
All config via FUNC_* environment variables (set as GitHub secrets/vars).
"""
import json
import logging
import os
import uuid
from datetime import datetime

import functions_framework
import requests

logging.basicConfig(level=os.getenv("FUNC_LOG_LEVEL", "INFO"),
                    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)


# ── Config ────────────────────────────────────────────────────────────────────
# All env vars use FUNC_ prefix — set them as GitHub secrets/variables.
#
# Required (function will return 500 if missing):
#   FUNC_GITHUB_OWNER              GitHub org or user (e.g. "my-org")
#   FUNC_GITHUB_REPO               Repository name (e.g. "my-repo")
#   FUNC_GH_WORKFLOW_DISPATCH_PAT  GitHub PAT with actions:write scope
#
# Optional ADO (needed for ChangedBy lookup; function still works without):
#   FUNC_ADO_ORG_URL               https://dev.azure.com/myorg
#   FUNC_ADO_PROJECT               ADO project name
#   FUNC_ADO_WORK_ITEM_PAT         ADO PAT with Work Items: Read scope
#
# Optional tuning (sane defaults provided):
#   FUNC_GITHUB_WORKFLOW_FILENAME  (default: ai-teammate-ado.yml)
#   FUNC_GITHUB_WORKFLOW_REF       (default: main)
#   FUNC_GITHUB_WORKFLOW_CONFIG_FILE (default: agents/ado_story_description.json)
#   FUNC_AI_USER_MATCH             (default: AI Teammate)
#   FUNC_SPEC_COLUMN_NAME          (default: Specification)
#   FUNC_ALLOWED_WORK_ITEM_TYPES   (default: Feature,User Story)
#   FUNC_LOG_LEVEL                 (default: INFO)

def get_config():
    return {
        "github_owner":    os.getenv("FUNC_GITHUB_OWNER", ""),
        "github_repo":     os.getenv("FUNC_GITHUB_REPO", ""),
        "github_workflow": os.getenv("FUNC_GITHUB_WORKFLOW_FILENAME", "ai-teammate-ado.yml"),
        "github_ref":      os.getenv("FUNC_GITHUB_WORKFLOW_REF", "main"),
        "config_file":     os.getenv("FUNC_GITHUB_WORKFLOW_CONFIG_FILE", "agents/ado_story_description.json"),
        "gh_pat":          os.getenv("FUNC_GH_WORKFLOW_DISPATCH_PAT", ""),
        "ado_org_url":     os.getenv("FUNC_ADO_ORG_URL", ""),
        "ado_project":     os.getenv("FUNC_ADO_PROJECT", ""),
        "ado_pat":         os.getenv("FUNC_ADO_WORK_ITEM_PAT", ""),
        "spec_column":     os.getenv("FUNC_SPEC_COLUMN_NAME", "Specification"),
        "ai_user_match":   os.getenv("FUNC_AI_USER_MATCH", "AI Teammate"),
        "allowed_types":   [t.strip() for t in os.getenv("FUNC_ALLOWED_WORK_ITEM_TYPES", "Feature,User Story").split(",")],
    }


# ── Validation ────────────────────────────────────────────────────────────────

_NOISE_FIELDS = {"System.Rev","System.AuthorizedDate","System.RevisedDate",
                 "System.ChangedDate","System.Watermark","System.CommentCount","System.History"}

def validate_event(event: dict) -> tuple[bool, str]:
    if event.get("eventType") != "workitem.updated":
        return False, f"Invalid event type: {event.get('eventType')}"

    resource = event.get("resource", {})
    changed_fields = resource.get("fields", {})
    if changed_fields and not (set(changed_fields.keys()) - _NOISE_FIELDS):
        return False, "Only comment/timestamp fields changed — skipping feedback loop"

    cfg = get_config()
    fields = resource.get("revision", {}).get("fields", {})

    work_item_type = fields.get("System.WorkItemType", "")
    if work_item_type not in cfg["allowed_types"]:
        return False, f"Invalid work item type: {work_item_type} (allowed: {cfg['allowed_types']})"

    assignee_raw = fields.get("System.AssignedTo", "")
    assignee_name = (assignee_raw.get("displayName", "") if isinstance(assignee_raw, dict)
                     else assignee_raw.split("<")[0].strip())
    if assignee_name.lower() != cfg["ai_user_match"].lower():
        return False, f"Assignee mismatch: '{assignee_name}' != '{cfg['ai_user_match']}'"

    spec_base = cfg["spec_column"].split(" – ")[0].strip()
    board_column = fields.get("System.BoardColumn", "")
    if board_column != spec_base:
        return False, f"Column mismatch: '{board_column}' != '{spec_base}'"
    if fields.get("System.BoardColumnDone", False):
        return False, "Column is in Done state (expected Doing)"

    return True, "ok"


# ── ADO Client ────────────────────────────────────────────────────────────────

def _ado_auth_headers():
    import base64
    pat = os.getenv("FUNC_ADO_WORK_ITEM_PAT", "")
    token = base64.b64encode(f":{pat}".encode()).decode()
    return {"Authorization": f"Basic {token}", "Content-Type": "application/json"}

def get_work_item_latest_revision(work_item_id: int) -> dict | None:
    cfg = get_config()
    if not all([cfg["ado_org_url"], cfg["ado_project"], cfg["ado_pat"]]):
        logger.debug("ADO config not set — skipping ChangedBy lookup")
        return None
    try:
        base = f"{cfg['ado_org_url']}/{cfg['ado_project']}/_apis/wit/workitems"
        r = requests.get(f"{base}/{work_item_id}?api-version=7.0",
                         headers=_ado_auth_headers(), timeout=15)
        if r.status_code != 200:
            return None
        rev = r.json().get("rev")
        r2 = requests.get(f"{base}/{work_item_id}/revisions/{rev}?api-version=7.0",
                          headers=_ado_auth_headers(), timeout=15)
        return r2.json() if r2.status_code == 200 else None
    except Exception as e:
        logger.warning(f"ADO revision fetch failed (non-fatal): {e}")
        return None


# ── GitHub Dispatch ───────────────────────────────────────────────────────────

def dispatch_workflow(work_item_id: int, changed_by_user_id: str | None = None) -> tuple[bool, str]:
    import time
    cfg = get_config()
    if not all([cfg["github_owner"], cfg["github_repo"], cfg["gh_pat"]]):
        missing = [k for k in ("github_owner", "github_repo", "gh_pat") if not cfg[k]]
        return False, f"Missing required config: {missing}"

    payload = {
        "ref": cfg["github_ref"],
        "inputs": {
            "config_file": cfg["config_file"],
            "encoded_config": json.dumps({
                "params": {
                    "inputJql": f"SELECT [System.Id] FROM WorkItems WHERE [System.Id] = {work_item_id}",
                    **({"initiator": changed_by_user_id} if changed_by_user_id else {})
                }
            })
        }
    }
    url = (f"https://api.github.com/repos/{cfg['github_owner']}/{cfg['github_repo']}"
           f"/actions/workflows/{cfg['github_workflow']}/dispatches")
    headers = {
        "Authorization": f"Bearer {cfg['gh_pat']}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    for attempt, delay in enumerate([0, 2, 6]):
        if delay:
            time.sleep(delay)
        try:
            r = requests.post(url, json=payload, headers=headers, timeout=15)
            if r.status_code == 204:
                return True, "dispatched"
            if r.status_code in [401, 403, 404, 422]:
                return False, f"HTTP {r.status_code}: {r.text[:200]}"
            if attempt == 2:
                return False, f"HTTP {r.status_code}: {r.text[:200]}"
        except requests.exceptions.RequestException as e:
            if attempt == 2:
                return False, str(e)

    return False, "Max retries exceeded"


# ── Entry Point ───────────────────────────────────────────────────────────────

@functions_framework.http
def spec_dispatch(request):
    """HTTP Cloud Function: ADO Service Hook → GitHub Workflow Dispatch."""
    correlation_id = str(uuid.uuid4())
    start_time = datetime.utcnow()
    logger.info(f"[{correlation_id}] {request.method} received")

    try:
        body = request.get_json(silent=True)
        if body is None:
            return (json.dumps({"error": "Invalid JSON payload"}), 400,
                    {"Content-Type": "application/json"})

        work_item_id = body.get("resource", {}).get("workItemId")
        if not work_item_id:
            return (json.dumps({"error": "Missing resource.workItemId"}), 400,
                    {"Content-Type": "application/json"})

        logger.info(f"[{correlation_id}] Work item: {work_item_id}")

        cfg = get_config()
        missing = [k for k in ("github_owner", "github_repo", "gh_pat") if not cfg[k]]
        if missing:
            return (json.dumps({"error": f"Missing required FUNC_* env vars: {missing}"}), 500,
                    {"Content-Type": "application/json"})

        is_valid, reason = validate_event(body)
        if not is_valid:
            logger.info(f"[{correlation_id}] Filtered: {reason}")
            return ("", 204)  # 204 = filtered, not an error

        # Resolve initiator
        changed_by_user_id = None
        revised_by = body.get("resource", {}).get("revisedBy", {})
        if isinstance(revised_by, dict):
            changed_by_user_id = revised_by.get("uniqueName")
        try:
            rev = get_work_item_latest_revision(work_item_id)
            if rev:
                cb = rev.get("fields", {}).get("System.ChangedBy", {})
                if isinstance(cb, dict) and cb.get("uniqueName"):
                    changed_by_user_id = cb["uniqueName"]
        except Exception as e:
            logger.warning(f"[{correlation_id}] ChangedBy lookup failed (non-fatal): {e}")

        success, message = dispatch_workflow(work_item_id, changed_by_user_id)
        latency = int((datetime.utcnow() - start_time).total_seconds() * 1000)

        if success:
            logger.info(f"[{correlation_id}] Dispatched work_item={work_item_id} latency={latency}ms")
            return ("", 204)
        else:
            logger.error(f"[{correlation_id}] Dispatch failed: {message}")
            return (json.dumps({"error": message}), 500, {"Content-Type": "application/json"})

    except Exception as e:
        logger.exception(f"[{correlation_id}] Unexpected error: {e}")
        return (json.dumps({"error": "Internal server error", "correlation_id": correlation_id}),
                500, {"Content-Type": "application/json"})
