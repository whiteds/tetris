#!/usr/bin/env bash
if [ -f .env ]; then
  export $(grep GITHUB_TOKEN= .env | xargs)
fi

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "GITHUB_TOKEN이 .env 파일에 설정되어 있지 않습니다."
  exit 1
fi

GITHUB_TOKEN="$GITHUB_TOKEN" npm run deploy:manual