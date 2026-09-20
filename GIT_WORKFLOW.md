# Git Workflow — push after every change (REQUIRED)

> **Rule: every change must be pushed to GitHub before you stop work.**
> Repo: https://github.com/ruthvik-01/web-scrapper.git (`main` branch)

## 1. One-time setup (run once per machine)

```powershell
cd 'D:\Internship\MAIN\UK SCRAPPER'
git init
git branch -M main
git remote add origin https://github.com/ruthvik-01/web-scrapper.git
# login once so push works non-interactively:
gh auth login
# or: git credential-manager / git config credential.helper
git add -A
git commit -m "chore: initial Fieldwork push"
git push -u origin main
```

## 2. Rule — after EVERY change (no exceptions)

Run this after every edit, however small:

```powershell
cd 'D:\Internship\MAIN\UK SCRAPPER'
.\push.ps1 -Message "describe what changed"
```

What `push.ps1` does: `git add -A` → `git commit` (skips if nothing changed) → `git pull --rebase origin main` → `git push origin main`.

If you prefer manual commands:

```powershell
cd 'D:\Internship\MAIN\UK SCRAPPER'
git status --short
git add -A
git commit -m "type: short description"
git pull --rebase origin main
git push origin main
```

Commit-message types: `feat`, `fix`, `ui`, `scraper`, `docs`, `chore`.

## 3. What is tracked / ignored

Tracked (Fieldwork project): `ui/`, `server/`, `src/`, `scripts/`, `tests/`,
`scraper.ts`, `batch.ts`, `package.json`, `tsconfig.json`, `*.md`, `*.json` configs.

Ignored via `.gitignore` (never force-add): `node_modules/`, `output/`,
`.env*`, `*.log`, `.playwright-mcp/`, `.freebuff/`, `Sessions/`.

> `output/` holds generated runs/CSVs and stays local. To share a delivery,
> attach the `final.zip` to a GitHub Release instead of committing it.

## 4. If push fails

| Error | Fix |
|---|---|
| `not logged in / 403 / password prompt` | run `gh auth login`, then retry |
| `rejected: fetch first / behind` | run `git pull --rebase origin main`, resolve, then push |
| `nothing to commit` | working tree already clean — nothing to do |
| wrong remote | `git remote -v` must show `ruthvik-01/web-scrapper` |

## 5. Checklist before closing the terminal

- [ ] `git status --short` is empty (or intentional untracked files only)
- [ ] `git log --oneline -3` shows your commit
- [ ] `git status -sb` shows `... origin/main` with no `ahead`
