# Obsidian Plugin Dev Skill

**[English](README.md)** | [中文](README_zh-CN.md)

Skill for Obsidian plugin development in Claude Code or Codex. Provides complete API references, project templates, and best practices to help you build Obsidian plugins from scratch.

![Demo - Hello World Plugin](assets/images/demo-hello-world.png)

> The screenshot above shows a plugin created by this Skill in one prompt: an interactive button that displays "Hello World!" on click.

## What is this?

This is a development Skill — a knowledge pack that your coding agent loads on demand. Once installed, when you ask Claude Code or Codex anything about Obsidian plugin development, it automatically activates this Skill and gains:

- Complete Obsidian TypeScript API reference (66 classes, 92 interfaces, 56 functions)
- 3 ready-to-use project templates (simple / view / editor-extension)
- 9 UI component code patterns (commands, modals, settings, views, menus, etc.)
- CodeMirror 6 editor extension development guide
- React / Svelte / Vue framework integration recipes
- Publishing checklist and GitHub Actions release workflow
- Troubleshooting guide for common issues

## Installation

Copy the entire directory into your agent skills folder:

```bash
# Clone the repo
git clone https://github.com/Szturin/obsidian-plugin-dev-skill.git

# Copy to Codex skills directory
# Windows PowerShell
xcopy /E /I obsidian-plugin-dev-skill "%USERPROFILE%\.codex\skills\obsidian-plugin-dev"

# macOS / Linux
cp -r obsidian-plugin-dev-skill ~/.codex/skills/obsidian-plugin-dev

# Copy to Claude Code skills directory, if needed
# Windows PowerShell
xcopy /E /I obsidian-plugin-dev-skill "%USERPROFILE%\.claude\skills\obsidian-plugin-dev"

# macOS / Linux
cp -r obsidian-plugin-dev-skill ~/.claude/skills/obsidian-plugin-dev
```

Or manually download and place the files at:

```
~/.codex/skills/obsidian-plugin-dev/
# or
~/.claude/skills/obsidian-plugin-dev/
```

Restart your agent app. The Skill will be automatically detected.

## Usage

Once installed, just talk to Claude Code naturally:

```
> Create an Obsidian plugin that adds a word count to the status bar
> Build a plugin with a sidebar view that lists all TODO items
> Add a command that wraps selected text in a callout block
> Create an editor extension that highlights inline code
```

Your coding agent will automatically select the right template, apply best practices, and generate production-ready code.

### Project Templates

| Template | Use Case | Files |
|----------|----------|-------|
| `template-simple` | Commands, ribbon icons, settings, text processing | main.ts + config |
| `template-view` | Sidebar panels, data display, list management | main.ts + view.ts + settings.ts + config |
| `template-editor-extension` | CM6 decorations, syntax highlighting, live preview mods | main.ts + extension.ts + widget.ts + config |

### Quick Init (PowerShell)

```powershell
& "$env:USERPROFILE\.codex\skills\obsidian-plugin-dev\scripts\init-obsidian-plugin.ps1" `
  -Name "my-plugin" -Template "simple" -VaultPath "D:\MyVault"
```

### Quick Init (macOS / Linux)

```bash
~/.codex/skills/obsidian-plugin-dev/scripts/init-obsidian-plugin.sh \
  --name my-plugin --template simple --vault-path "$HOME/Documents/MyVault"
```

## File Structure

```
obsidian-plugin-dev/
├── SKILL.md                              # Main skill document (entry point)
├── references/
│   ├── api-quick-reference.md            # Core API cheat sheet
│   ├── ui-patterns.md                    # 9 UI component patterns with full code
│   ├── editor-extensions.md              # CM6 extension guide (StateField/ViewPlugin/Decoration)
│   ├── framework-integration.md          # React / Svelte / Vue integration
│   ├── publishing-checklist.md           # Publishing & review compliance checklist
│   └── troubleshooting.md               # Debugging tips & common issues
├── scripts/
│   ├── init-obsidian-plugin.ps1          # Windows project initializer
│   └── init-obsidian-plugin.sh           # macOS / Linux project initializer
└── assets/
    ├── template-simple/                  # Simple plugin (command + settings)
    ├── template-view/                    # View plugin (sidebar panel + settings)
    ├── template-editor-extension/        # Editor extension (CM6 decorations)
    ├── github-release.yml                # GitHub Actions release workflow
    └── images/                           # Demo screenshots
```

## Knowledge Sources

This Skill was built by distilling 253 Markdown documents from the [Obsidian Plugin Docs Chinese Translation](https://github.com/luhaifeng666/obsidian-plugin-docs-zh) project, originally written by [@marcusolsson](https://github.com/marcusolsson) and the Obsidian community.

The official documentation has since moved to [docs.obsidian.md](https://docs.obsidian.md/Home).

## Requirements

- Claude Code or Codex
- Node.js 16+ (for building plugins)
- npm or yarn

## License

MIT
