# Work for OurCampus

Hugo Villalba's home base for everything made for David DaCosta and OurCampus.
Live: https://hugoboss23-5.github.io/ourcampus-work/ (public, no login).

The page is drawn from one file: `projects.json`. Edit that file, push, and the page updates.

## Add a piece to a project

1. Put the thing somewhere public. Either a folder or file in this repo (it is served at
   `https://hugoboss23-5.github.io/ourcampus-work/<path>`), or an outside public link.
2. Take its two thumbnails headless (never on Hugo's screen), with the `shot` command:
   `shot <url> --both --wait 6000 --out /tmp/caps/<id>`
   Save them as `home/thumbs/<id>-d.webp` (desktop, 1200x750, from the 1440x900 capture) and
   `home/thumbs/<id>-p.webp` (phone, 520x650, top of the 390x844 capture). For a PDF, render
   pages 1 and 2 with `pdftoppm` instead.
3. Add an item to the project's `items` list in `projects.json`:

```json
{ "name": "Short name", "line": "One plain line saying what it is.", "date": "Nov 5",
  "status": "In progress", "url": "folder/or/https://link", "thumb": "<id>" }
```

`status` is one of `In progress`, `Finished`, `Study`. Add `"lead": true` to the one item that
should get the big card. The order in the file is the order on the page.

## Add a project

Add an object to `projects` (newest first):

```json
{ "id": "short-id", "name": "Project name", "line": "One line about the project.",
  "dates": "Nov 3 to 5, 2026", "status": "In progress", "items": [ ... ] }
```

Optional: `"files": [{ "name": "...", "kind": "GLB, 2 MB", "url": "..." }]` for downloads,
`"note": "..."` for one quiet line under the cards, and `"versions"` for a strip of versions
(see the Bendac project).

## Rules

- Few words. No em or en dashes anywhere in visible text (Hugo bans them). Use "to" for ranges.
- Every link must open logged out (status 200). No Tailscale, no private Drive links.
- Keep files under 100 MB each and the repo under 1 GB.
- Do not change the existing sub-sites' content; add new folders instead.
- After pushing, wait for the Pages build, then check the live page on phone and desktop.

## What is where

- `index.html`, `home/` (styles, code, fonts, thumbnails, three.js copy): the home page.
- `projects.json`: the content.
- `bendac/`: every Bendac version (built by `~/projects/bendac-all-versions-20261105/build.py` on
  Hugo's Mac; paths are relative so it works here and on the box).
- Investor decks and color studies are NOT in this repo: they hold deal numbers (price, appraisal, rent roll). They live in hugo@ourcampus.live Drive, shared with the ourcampus.live domain only, and the cards link there. Anything confidential (financials, contracts, people) follows the same rule: card here, file in Drive, domain-only. Never commit it to this public repo.
- The other folders are the original project sites; their links are shared, keep them where they are.
