#!/usr/bin/env bash
set -euo pipefail

# External Agent images own their native state. The platform only passes the
# deployment-time model contract into the standard /opt/agent/config.sh entry.
CONFIG_SCRIPT="${AGENT_CONFIG_SCRIPT:-/opt/agent/config.sh}"

log() {
  printf '[agent-hub bootstrap] %s\n' "$*" >&2
}

run_config_optional() {
  if [[ ! -x "$CONFIG_SCRIPT" ]]; then
    return 1
  fi

  local output
  if output="$($CONFIG_SCRIPT "$@")"; then
    [[ -z "$output" ]] || log "$output"
    return 0
  fi

  log "config command failed: $*"
  return 1
}

provider_profile() {
  local raw
  raw="$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')"
  case "$raw" in
    custom:aiproxy-responses|aiproxy-responses)
      printf 'aiproxy-responses\tcodex_responses\tAIPROXY_API_KEY\n'
      ;;
    custom:aiproxy-anthropic|aiproxy-anthropic)
      printf 'aiproxy-anthropic\tanthropic_messages\tAIPROXY_API_KEY\n'
      ;;
    custom:aiproxy-chat|aiproxy-chat)
      printf 'aiproxy-chat\tchat_completions\tAIPROXY_API_KEY\n'
      ;;
    *)
      printf '%s\t\tOPENAI_API_KEY\n' "${1:-}"
      ;;
  esac
}

adapter_api_mode() {
  case "${1:-}" in
    codex_responses)
      printf 'openai-responses\n'
      ;;
    chat_completions)
      printf 'openai-completions\n'
      ;;
    anthropic_messages)
      printf 'anthropic-messages\n'
      ;;
    *)
      printf '%s\n' "${1:-}"
      ;;
  esac
}

yaml_quote() {
  local value="${1:-}"
  value="${value//\'/\'\'}"
  printf "'%s'" "$value"
}

dotenv_set_file() {
  local path="$1"
  local key="$2"
  local value="${3:-}"
  local temp_file
  temp_file="$(mktemp)"

  if [[ -f "$path" ]]; then
    awk -v key="$key" -v value="$value" '
      BEGIN { found = 0 }
      index($0, key "=") == 1 { print key "=" value; found = 1; next }
      { print }
      END { if (!found) print key "=" value }
    ' "$path" >"$temp_file"
  else
    printf '%s=%s\n' "$key" "$value" >"$temp_file"
  fi

  mv "$temp_file" "$path"
}

apply_hermes_direct_model_config() {
  if [[ "${AGENT_TEMPLATE_ID:-}" != "hermes-agent" && "${AGENT_NAME:-}" != "hermes-agent" && ! -d /opt/hermes ]]; then
    return 1
  fi

  local model provider_raw base_url api_key profile provider api_mode key_env hermes_home config_file dotenv_file
  model="${AGENT_MODEL:-}"
  provider_raw="${AGENT_MODEL_PROVIDER:-}"
  base_url="${AGENT_MODEL_BASEURL:-}"
  api_key="${AGENT_MODEL_APIKEY:-}"
  profile="$(provider_profile "$provider_raw")"
  provider="${profile%%$'\t'*}"
  profile="${profile#*$'\t'}"
  api_mode="${profile%%$'\t'*}"
  key_env="${profile#*$'\t'}"
  [[ -n "$provider" ]] || provider="$provider_raw"

  hermes_home="${HERMES_HOME:-/home/agent/.hermes}"
  config_file="${HERMES_CONFIG_FILE:-${hermes_home}/config.yaml}"
  dotenv_file="${HERMES_DOTENV_FILE:-${hermes_home}/.env}"

  mkdir -p "$hermes_home"
  chmod 700 "$hermes_home" || true

  if [[ "$key_env" == "AIPROXY_API_KEY" ]]; then
    cat >"$config_file" <<CFG
model:
  default: $(yaml_quote "$model")
  provider: $(yaml_quote "$provider")
display:
  skin: default
terminal:
  backend: local
providers:
  $(yaml_quote "$provider"):
    name: $(yaml_quote "$provider")
    base_url: $(yaml_quote "$base_url")
    default_model: $(yaml_quote "$model")
    api_mode: $(yaml_quote "$api_mode")
    key_env: AIPROXY_API_KEY
CFG
    [[ -z "$api_key" ]] || dotenv_set_file "$dotenv_file" AIPROXY_API_KEY "$api_key"
    dotenv_set_file "$dotenv_file" OPENAI_BASE_URL ""
    dotenv_set_file "$dotenv_file" OPENAI_API_KEY ""
  else
    cat >"$config_file" <<CFG
model:
  default: $(yaml_quote "$model")
  provider: $(yaml_quote "$provider")
  base_url: $(yaml_quote "$base_url")
display:
  skin: default
terminal:
  backend: local
CFG
    [[ -z "$api_key" ]] || dotenv_set_file "$dotenv_file" OPENAI_API_KEY "$api_key"
    [[ -z "$base_url" ]] || dotenv_set_file "$dotenv_file" OPENAI_BASE_URL "$base_url"
    dotenv_set_file "$dotenv_file" AIPROXY_API_KEY ""
  fi

  chmod 600 "$dotenv_file" "$config_file" || true
  if [[ "$(id -u)" -eq 0 ]] && id agent >/dev/null 2>&1; then
    chown -R agent:agent "$hermes_home"
  fi

  log "applied Hermes model config directly because template config command was unavailable or failed"
  return 0
}

apply_builtin_model_fallback() {
  apply_hermes_direct_model_config
}

apply_model_contract() {
  local model provider_raw base_url api_key provider api_mode adapter_mode key_env profile failed
  model="${AGENT_MODEL:-}"
  provider_raw="${AGENT_MODEL_PROVIDER:-}"
  base_url="${AGENT_MODEL_BASEURL:-}"
  api_key="${AGENT_MODEL_APIKEY:-}"
  failed=0

  if [[ -z "$model" && -z "$provider_raw" && -z "$base_url" && -z "$api_key" ]]; then
    return 0
  fi

  profile="$(provider_profile "$provider_raw")"
  provider="${profile%%$'\t'*}"
  profile="${profile#*$'\t'}"
  api_mode="${profile%%$'\t'*}"
  key_env="${profile#*$'\t'}"
  adapter_mode="$(adapter_api_mode "$api_mode")"
  [[ -n "$provider" ]] || provider="$provider_raw"

  if [[ ! -x "$CONFIG_SCRIPT" ]]; then
    log "model config script is not executable: $CONFIG_SCRIPT"
    apply_builtin_model_fallback || return 1
    return 0
  fi

  if [[ -n "$api_key" ]]; then
    run_config_optional env set "$key_env" "$api_key" || failed=1
    [[ "$key_env" == "AIPROXY_API_KEY" ]] || run_config_optional env set AIPROXY_API_KEY "$api_key" || true
    run_config_optional provider set-api-key "$provider" "$api_key" || true
  fi

  if [[ -n "$provider" && ( -n "$base_url" || -n "$api_mode" ) ]]; then
    if ! run_config_optional provider set "$provider" "$base_url" "$adapter_mode" && \
      ! run_config_optional provider set-main "$provider" "$base_url" "$api_mode" "$key_env"; then
      failed=1
    fi
  fi

  if [[ -n "$model" ]]; then
    if ! run_config_optional model set-main "$model" && \
      ! run_config_optional model set-main "$provider" "$model"; then
      failed=1
    fi
  fi

  if [[ "$failed" -ne 0 ]]; then
    apply_builtin_model_fallback || return 1
  fi
}

apply_gateway_contract() {
  local key port failed
  key="${API_SERVER_KEY:-}"
  port="${API_SERVER_PORT:-}"
  failed=0

  if [[ ! -x "$CONFIG_SCRIPT" ]]; then
    log "skip gateway config: $CONFIG_SCRIPT is not executable"
    return 0
  fi

  [[ -z "$key" ]] || run_config_optional env set API_SERVER_KEY "$key" || failed=1
  [[ -z "$key" ]] || run_config_optional gateway set-token "$key" || true
  [[ -z "$port" ]] || run_config_optional gateway set-local lan "$port" || true

  if [[ "$failed" -ne 0 ]]; then
    log "gateway env config did not complete; continuing because model config is the deployment-critical contract"
  fi
}

apply_model_contract
apply_gateway_contract
