---
name: "git-release"
description: "Full release: stage, commit, push, create git tag, and push tag to trigger GitHub Release workflow. Invoke when user says '发布', 'release', or provides a version tag like '26.1.6'."
---

# Git Release

Complete release flow: commit, push, tag, and push tag.

## Steps

1. Run `git status --porcelain` to check what files changed
2. If there are changes:
   - Run `git add -A` to stage everything
   - Generate a concise conventional commit message
   - Run `git commit -m "<message>"`
   - Run `git push origin main`
3. If the tag already exists locally, delete it first: `git tag -d <tag>`
4. If the tag already exists remotely, delete it: `git push origin :refs/tags/<tag>`
5. Run `git tag <tag>`
6. Run `git push origin <tag>`

## Notes

- The tag version is provided by the user (e.g. "发布 26.1.6" → tag `26.1.6`)
- Pushing a tag triggers the GitHub Actions Release workflow (`.github/workflows/release.yml`)
- Always handle existing tags gracefully by deleting and recreating
- If no changes and tag already exists, just push the tag
