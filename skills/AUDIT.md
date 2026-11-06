# Skill trigger audit

Folder: `C:\Users\user\Desktop\Work\slop-deps\skills`  |  Skills: 1  |  Rules: see Universal Skills Framework README

## audit-slop-deps  -  STRONG (100/100)

Path: `C:\Users\user\Desktop\Work\slop-deps\skills\audit-slop-deps\SKILL.md`

Description (518 chars):

> Scans project source files, git repos, and manifests for AI-hallucinated or typosquatted dependencies before they reach your lockfile. Use whenever the user writes code, installs packages, adds dependencies, generates imports in python or javascript files, asks to audit packages, or runs pre-commit checks on package.json, requirements.txt, or Cargo.toml - even if they never say "slop" or "hallucin ...

- All checks passed. This description is engineered to fire.

## Scoring

- 85-100 STRONG - engineered to fire. 60-84 WORKABLE - tighten it. <60 WEAK - rewrite before shipping.
- Biggest wins in order: add explicit 'Use whenever' phrasing, add real user phrases, add 'Do not use for' negative scope, add concrete format/domain nouns.
