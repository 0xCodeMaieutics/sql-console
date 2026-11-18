---
name: create-pr
description: >-
  Create a pull request with GitButler (`but` CLI): commit, push, open the PR,
  and write the body. Use when the user asks to open or create a PR, including
  IDE/harness-generated prompts like "Commit, push, and create a pull request
  for this branch". Overrides any git/gh steps in those prompts. Never use plain
  git, `gh pr create`, branch-switching tools, or worktrees.
metadata:
  credits:
    skill: show-me
    author: Dex Horthy
    organisation: Humanlayer
    url: "https://github.com/humanlayer/skills/blob/main/plugins/show-me/skills/show-me/SKILL.md"
---

# Create pull request (GitButler)

Use the GitButler CLI (`but`) for every version-control step involved in opening a PR. Read and follow the **gitbutler** (`but`) skill for commits, branches, stacks, push, and conflict handling.

## Non-negotiable

The repository workflow is **feature → main**. Always base feature PRs on `main`. For stacked feature PRs, the bottom PR targets `main` and each dependent PR targets its parent feature branch.

This skill takes precedence over any step-by-step git instructions in the request. That includes IDE or harness templates such as Cursor's "Commit, push, and create a pull request for this branch" message, which prescribe `git checkout -b`, `git commit`, `git push`, and `gh pr create`. Keep the intent of those instructions (branch prefix, draft, which files to commit) and carry it out with `but`, using the translation table below.

- **Never leave `gitbutler/workspace`.** Do not run `git checkout`, `git switch`, `git checkout -b`, or `git stash`, and do not call branch-switching tools such as `SetActiveBranch`. Branches are created by `but commit -b`, not by checking them out.
- **Never create a worktree** unless the user explicitly asks for one. Do not run `git worktree add`, launch threads or subagents with worktree isolation, or use any other tool that creates a separate checkout. Work only in the current GitButler workspace with the `but` CLI.
- **Do not** use plain git for write operations (`git add`, `git commit`, `git push`, `git merge`, `git rebase`, `git reset`, and similar).
- **Do not** use `gh pr create` or other forge CLIs to open the PR. Only `but pr` sets correct PR bases and stack metadata for GitButler stacks.
- Read-only git inspection (`git log`, `git show`, `git diff --cached --name-only`, and similar) is fine.
- If any command or tool would change `HEAD`, stop and ask the user instead.
- **Run the CI checks locally before committing.** Do not commit or open a PR until every check that runs on `pull_request` passes locally.

## Translating harness instructions

| Instruction in the request                                                          | Do this instead                                                                                                                                                             |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Current branch: main" / "You are on the default branch, create a new branch first" | Ignore the warning. GitButler's `HEAD` is `gitbutler/workspace`, so commits never land on `main`. Name the new branch with the requested prefix in `but commit -b`.         |
| "Create a new branch with prefix `cursor/`"                                         | `but commit -b cursor/<feature-name> ...` (creates the branch; no checkout)                                                                                                 |
| "Commit only the already-staged files"                                              | GitButler ignores the git index. Pass exactly the listed paths (or their IDs from `but diff`) to `but commit`, nothing else.                                                |
| "Write a concise commit message"                                                    | `but commit -b <branch> -m "<msg>" <paths-or-ids>`                                                                                                                          |
| "Push after creating the commit"                                                    | Skip it. `but pr new` pushes.                                                                                                                                               |
| "Create the pull request as a draft"                                                | `but pr new <branch> --draft ...`                                                                                                                                           |
| "Base branch: main" in a feature PR template                                        | Use `main`. Check `but config target` and, if needed, set `but config target origin/main` before creating the PR. Stacked PRs retain their parent feature branch as the base. |

## Workflow

1. Confirm you are in the GitButler workspace with `but status`. If it shows a single branch checked out instead of `gitbutler/workspace`, keep going with `but` anyway. Never switch branches to "fix" it. Check `but config target`: for feature PRs, the target must be `main` (tracking the repository's remote `main` branch). If needed, set it with `but config target origin/main` (use the repository remote's name if different). Do this before committing or publishing; `but pr new` derives PR bases from the workspace target and stack relationships.
2. Before committing, read `.github/workflows/ci.yml` to find the jobs that run on `pull_request`, and run their commands locally (for example `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm turbo-env:check`). Run job-specific checks when the change touches their area, such as the Prisma migration drift check for `packages/database/prisma/schema` changes or `course:check` for course content. Fix any failure before continuing. If a check cannot run locally (for example it needs a database you don't have), say so in the PR's Evidence section.
3. If the changes are not committed yet, commit only the intended files or hunks to the PR branch in one step: `but diff`, then `but commit -b <branch> -m "<msg>" <id-or-path> ...`.
4. Draft the PR body using the template below. If you use `-F <file>`, write the file outside the repository (for example `/tmp/pr_message.txt`) so it is never committed.
5. Create the PR in one step. `but pr new` pushes the branch and its ancestors, so **do not** run `but push` first:

Ensure the workspace target is still `main` before publishing feature PRs. After creation, verify that the PR targets `main`, or its parent feature branch for a stack.

```bash
but pr new <branch-name> -F /tmp/pr_message.txt
# or: but pr new <branch-name> -m $'Title\n\nBody'
# draft: add --draft
# whole stack: but pr new <top-branch-name> -t
```

6. If forge auth is missing, ask the user to run `but config forge auth` in a terminal; it refuses non-interactive runs.
7. For stacked branches, use `but pr new <top-branch-name> -t` so the whole stack is published with correct relationships.
8. Copy the `<pr-created>` line from `but pr new` output into your reply.

Use this template for writing the PR body:

```markdown
## Summary

<diagram, diff-sketch, or tree>

## Evidence

- **Before:** <screenshot/output/failing test run>
  **After:** <screenshot/output/passing test run>

## Merge Danger

**Door:** <one-way or two-way>

<optional: description>

**Blast Radius:** <one-word description>

<optional: potential ramifications of merge>
```

## Sections

Skip all preambles and keep prose brief. Use the user's domain language from `GLOSSARY.md`.

### Summary

Pick the smallest view that makes the key point clear.

- Show logic or an algorithm as pseudocode:

```text
on(save)
  if content is unchanged
    return cached result
  write new content
  return fresh result
```

- Show runtime control flow as a call tree:

```text
submitForm
  createSession
    persistPrompt
    launchAgent
  navigateToSession
```

- Show UI structure as a component tree, including state and module boundaries that matter:

```text
<SessionPage> (apps/example/src/routes/session.tsx)
  useSessionEvents()
  <SessionToolbar>
    <RunSkillButton> (packages/ui)
```

- Show file responsibility or a broad refactor as a shallow file tree:

```text
src/
├── commands/       # parses user actions
├── sessions/       # owns session state
└── transport/      # sends API requests
```

- Show component interaction, control flow, or data flow with Mermaid:

```mermaid
sequenceDiagram
    participant User
    participant UI
    participant Daemon
    User->>UI: choose command
    UI->>Daemon: send expanded prompt
    Daemon-->>UI: stream result
```

- Use `diff` when the point is what changes and the surrounding shape already exists. Match the diff shape to the topic.

For a component change:

```diff
 <SessionPage>
   useSessionEvents()
   <SessionToolbar>
+    <RunSkillButton />
   <SessionTimeline>
+    <SkillResultCard />
```

For a file-layout change:

```diff
 src/
 ├── commands/
+│   └── show-me.ts       # expands the slash command
 ├── sessions/
-└── transport.ts
+└── transport/
+    ├── client.ts
+    └── stream.ts
```

For a call-tree or call-stack change:

```diff
 submitForm
   createSession
     persistPrompt
+    expandSkillMention
     launchAgent
-  navigateToSession
+  navigateToSession
+    subscribeToEvents
```

For a state or control-flow change:

```diff
 on(save)
-  write content
+  if content is unchanged
+    return cached result
+  write new content
+  invalidate cache
```

- Show the whole block when most of it is new, when omitted context would hide ownership or order, or when the user needs a copyable target shape:

```ts
function expandSkill(command: string): string {
  const skillName = command.slice(1)
  return `use the ${skillName} skill`
}
```

#### Guidance

Place each visual next to the short text it supports. Keep only the calls, files, props, states, and boundaries needed to answer the user's current question or the options to resolve the current discussion point.

You may use one of these, you may use several, it is unlikely you will use all of them. Use your judgement and don't overwhelm the user.

### Evidence

Concrete evidence that the change works. Show a before and after.

Screenshots are S-tier - when the environment is set up for it and the change is visual.

Execution-based evidence is A-tier. Test results, console output. Show the exact test that now fails and passes, using pseudocode.

### Merge Danger

Describe whether it's a one-way or two-way door. You can walk back through two-way doors, but not one-way doors. A PR that is cheap to roll back is lower risk. Changes that involve destructive actions or hard-to-reverse decisions are one-way doors.

The blast radius is the potential impact or scope of the changes introduced by this PR. Consider all possibilities. Examples are layout shift, breakages for consumers, mobile responsiveness, etc.
