#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf 'Usage: %s --name my-plugin [--template simple|view|editor-extension] [--vault-path PATH] [--output-dir PATH] [--skip-install]\n' "$0"
}

NAME=""
TEMPLATE="simple"
VAULT_PATH=""
OUTPUT_DIR=""
SKIP_INSTALL="false"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --name)
      NAME="${2:-}"
      shift 2
      ;;
    --template)
      TEMPLATE="${2:-}"
      shift 2
      ;;
    --vault-path)
      VAULT_PATH="${2:-}"
      shift 2
      ;;
    --output-dir)
      OUTPUT_DIR="${2:-}"
      shift 2
      ;;
    --skip-install)
      SKIP_INSTALL="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ ! "$NAME" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  printf 'Plugin name must match ^[a-z0-9][a-z0-9-]*$: %s\n' "$NAME" >&2
  exit 1
fi

case "$TEMPLATE" in
  simple|view|editor-extension) ;;
  *)
    printf 'Template must be simple, view, or editor-extension: %s\n' "$TEMPLATE" >&2
    exit 1
    ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE_DIR="$SKILL_ROOT/assets/template-$TEMPLATE"

if [ -z "$OUTPUT_DIR" ]; then
  OUTPUT_DIR="$(pwd)/$NAME"
fi

if [ -e "$OUTPUT_DIR" ]; then
  printf 'Directory already exists: %s\n' "$OUTPUT_DIR" >&2
  exit 1
fi

CLASS_NAME=""
IFS='-' read -ra PARTS <<< "$NAME"
for part in "${PARTS[@]}"; do
  first="$(printf '%s' "${part:0:1}" | tr '[:lower:]' '[:upper:]')"
  rest="${part:1}"
  CLASS_NAME+="$first$rest"
done
CLASS_NAME+="Plugin"

DISPLAY_NAME=""
for part in "${PARTS[@]}"; do
  first="$(printf '%s' "${part:0:1}" | tr '[:lower:]' '[:upper:]')"
  rest="${part:1}"
  word="$first$rest"
  if [ -z "$DISPLAY_NAME" ]; then
    DISPLAY_NAME="$word"
  else
    DISPLAY_NAME+=" $word"
  fi
done

printf '=== Obsidian Plugin Initializer ===\n'
printf 'Plugin ID:    %s\n' "$NAME"
printf 'Plugin Name:  %s\n' "$DISPLAY_NAME"
printf 'Class Name:   %s\n' "$CLASS_NAME"
printf 'Template:     %s\n' "$TEMPLATE"
printf 'Output:       %s\n\n' "$OUTPUT_DIR"

mkdir -p "$OUTPUT_DIR"
printf '[1/4] Created project directory\n'

while IFS= read -r -d '' src; do
  rel="${src#$TEMPLATE_DIR/}"
  dest="$OUTPUT_DIR/$rel"
  mkdir -p "$(dirname "$dest")"
  sed \
    -e "s/{{PLUGIN_ID}}/$NAME/g" \
    -e "s/{{PLUGIN_NAME}}/$DISPLAY_NAME/g" \
    -e "s/{{PLUGIN_CLASS}}/$CLASS_NAME/g" \
    "$src" > "$dest"
done < <(find "$TEMPLATE_DIR" -type f -print0)
printf '[2/4] Copied and processed template files\n'

mkdir -p "$OUTPUT_DIR/.github/workflows"
if [ -f "$SKILL_ROOT/assets/github-release.yml" ]; then
  cp "$SKILL_ROOT/assets/github-release.yml" "$OUTPUT_DIR/.github/workflows/release.yml"
  printf '[3/4] Added GitHub Actions workflow\n'
else
  printf '[3/4] Skipped GitHub Actions (template not found)\n'
fi

if [ "$SKIP_INSTALL" = "true" ]; then
  printf '[4/4] Skipped npm install\n'
else
  printf '[4/4] Installing npm dependencies...\n'
  if (cd "$OUTPUT_DIR" && npm install >/dev/null 2>&1); then
    printf 'Dependencies installed successfully.\n'
  else
    printf 'npm install failed. Run npm install manually in %s\n' "$OUTPUT_DIR" >&2
  fi
fi

if [ -n "$VAULT_PATH" ]; then
  PLUGIN_DIR="$VAULT_PATH/.obsidian/plugins/$NAME"
  if [ -e "$PLUGIN_DIR" ]; then
    printf 'Plugin directory already exists in Vault: %s\n' "$PLUGIN_DIR" >&2
  else
    mkdir -p "$(dirname "$PLUGIN_DIR")"
    ln -s "$OUTPUT_DIR" "$PLUGIN_DIR"
    printf 'Linked to Vault: %s -> %s\n' "$PLUGIN_DIR" "$OUTPUT_DIR"
  fi
fi

printf '\n=== Done! ===\n'
printf 'Next steps:\n'
printf '  cd %s\n' "$OUTPUT_DIR"
printf '  npm run dev          # Start development build\n'
printf '  # Copy output to .obsidian/plugins/%s/ in your Vault\n\n' "$NAME"
