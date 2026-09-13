---
name: "git-push"
description: "Stage all changes, commit with a conventional message, and push to origin main. Invoke when user says '提交推送到云端', 'commit and push', or similar."
---

# Git Push

Stage all changes, commit, and push to remote.

## Steps

1. Run `git status --porcelain` to check what files changed
2. Run `git add -A` to stage everything (respects .gitignore)
3. Generate a concise conventional commit message based on the changes:
   - `feat:` new feature
   - `fix:` bug fix
   - `refactor:` code restructuring without feature/fix
   - `docs:` documentation changes
   - `chore:` build/config/tooling
4. Run `git commit -m "<message>"`
5. Run `git push origin main`

## Notes

- If working tree is clean (no changes), inform the user and stop
- Keep commit messages short and descriptive
- Do NOT create tags — use git-release skill for that
