# Changing the site yourself with Antigravity (Windows)

Plain steps for making a change with Antigravity, so the next agent can see
exactly what changed without re-reading everything.

## One-time setup

1. Install **GitHub Desktop** from https://desktop.github.com and sign in with
   the GitHub account that owns `28CN/PriceTracker`.
2. In GitHub Desktop choose **File → Clone repository**, pick
   `28CN/PriceTracker`, choose a folder (for example `C:\Code\PriceTracker`)
   and click **Clone**.
3. Install **Node.js 22 LTS** from https://nodejs.org (needed only if you
   want to run the site on your computer).
4. Open **Antigravity**, choose **File → Open Folder**, and select the folder
   from step 2.

## Every time you make a change

1. **Get the latest version.** In GitHub Desktop click **Fetch origin**, then
   **Pull origin** if it appears. Do this before you start, every time.
2. **Ask Antigravity.** In its chat, start with this, then describe the change:

   > Read AGENTS.md first and follow its rules. Then: <describe what you want>.
   > When you are done, run `npx tsc --noEmit`, `npm run lint` and `npm test`,
   > and add one line at the top of docs/CHANGELOG.md like
   > `- <today's date> · agy · <what changed>`.

3. **Check the result.** Read what Antigravity says it changed. If you want to
   see it running: open a terminal in Antigravity and run `npm install` (first
   time only), then `npm run dev`, and open http://localhost:3000.
   (This needs the `.env.local` file with the keys. Never commit that file.)
4. **Commit.** In GitHub Desktop you will see the changed files on the left.
   - Make sure `docs/CHANGELOG.md` is in the list (one new line).
   - In **Summary** (bottom left) write one clear line, for example
     `Make deal cards show the shop logo`.
   - Click **Commit to main**.
5. **Push.** Click **Push origin** at the top. The site redeploys by itself
   in a couple of minutes.
6. **Tell the agent.** Next time you ask an agent for something, say
   "I made changes, run git pull first". That's enough: it reads the
   CHANGELOG and the commits since its last visit.

## If something goes wrong

- **GitHub Desktop says your branch is behind, or Push is refused:** click
  **Pull origin**, then **Push origin** again.
- **It mentions a conflict:** don't guess. Ask Antigravity
  "resolve the merge conflict and keep both changes", then commit and push.
- **The site looks broken after a push:** in GitHub Desktop open **History**,
  right-click your commit and choose **Revert changes in commit**, then push.
  Nothing is lost; the bad change is just undone.
- **Never** commit passwords, keys or the `.env.local` file.

## Safer option for bigger changes

In GitHub Desktop choose **Current branch → New branch** (for example
`owner/new-colours`) before step 2. Commit and push there. GitHub then
offers **Create pull request**, and you get a preview link before anything
reaches the live site.
