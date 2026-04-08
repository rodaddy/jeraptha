#!/usr/bin/env bash
# OpenClaw parallel secret resolver
# Called by varlock via @setValuesBulk(exec(), format=env)
# Fetches all secrets in parallel, outputs KEY=VALUE format

(
  # PostgreSQL
  secret get "PostgreSQL - n8n" --raw | xargs -I{} echo "POSTGRES_N8N_PASSWORD={}" &
  secret get "PostgreSQL - Clawdbot" --raw | xargs -I{} echo "POSTGRES_CLAWDBOT_PASSWORD={}" &

  # n8n
  secret get "n8n - Basic Auth" --raw | xargs -I{} echo "N8N_BASIC_AUTH_PASSWORD={}" &
  secret get "n8n - Login" --raw | xargs -I{} echo "N8N_ENCRYPTION_KEY={}" &

  # LiteLLM
  secret get "LiteLLM API Key" --raw | xargs -I{} echo "LITELLM_API_KEY={}" &

  # SiYuan
  secret get "SiYuan - Token" --raw | xargs -I{} echo "SIYUAN_TOKEN={}" &

  # Clawdbot / Discord
  secret get "Clawdbot - Auth Token" --raw | xargs -I{} echo "CLAWDBOT_AUTH_TOKEN={}" &
  secret get "Discord Bot Token" --raw | xargs -I{} echo "DISCORD_BOT_TOKEN={}" &

  # Monitoring
  secret get "Grafana - Admin" --raw | xargs -I{} echo "GRAFANA_ADMIN_PASSWORD={}" &
  secret get "Grafana - API Key" --raw | xargs -I{} echo "GRAFANA_API_KEY={}" &

  # Messaging
  secret get "Telegram - Skippy Bot" --raw | xargs -I{} echo "TELEGRAM_BOT_TOKEN={}" &

  # Media
  secret get "Radarr API Key" --raw | xargs -I{} echo "RADARR_API_KEY={}" &
  secret get "Sonarr API Key" --raw | xargs -I{} echo "SONARR_API_KEY={}" &

  wait
)
