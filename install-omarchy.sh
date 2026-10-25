#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
binary="$repo_dir/src-tauri/target/release/ytstudy"
if [[ ! -x "$binary" ]]; then
  echo "Release binary not found. Build it first with: cd src-tauri && cargo build --release" >&2
  exit 1
fi

install -Dm755 "$binary" "$HOME/.local/bin/ytstudy"
install -Dm644 "$repo_dir/src-tauri/icons/32x32.png" "$HOME/.local/share/icons/hicolor/32x32/apps/ytstudy.png"
install -Dm644 "$repo_dir/src-tauri/icons/64x64.png" "$HOME/.local/share/icons/hicolor/64x64/apps/ytstudy.png"
install -Dm644 "$repo_dir/src-tauri/icons/128x128.png" "$HOME/.local/share/icons/hicolor/128x128/apps/ytstudy.png"
install -Dm644 "$repo_dir/src-tauri/icons/128x128@2x.png" "$HOME/.local/share/icons/hicolor/256x256/apps/ytstudy.png"
install -Dm644 "$repo_dir/src-tauri/icons/icon.png" "$HOME/.local/share/icons/hicolor/512x512/apps/ytstudy.png"
install -Dm644 "$repo_dir/ytstudy.desktop" "$HOME/.local/share/applications/ytstudy.desktop"

# Hide the old system launcher without editing its package-owned file.
mkdir -p "$HOME/.local/share/applications"
cat > "$HOME/.local/share/applications/foxstudy.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=FoxStudy
Hidden=true
EOF

echo "YTStudy installed for this user. Launch it from the Omarchy app launcher or run: ytstudy"
