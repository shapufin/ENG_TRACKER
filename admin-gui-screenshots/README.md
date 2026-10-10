# Admin GUI capture

Captured from the local e2e database at 1440×900, light theme, logged in as the superuser `e2e_super`.

## What is here

| Path | What it is | Upload? |
|---|---|---|
| `INDEX.md` | One table: every page, its screenshot, its text file, popup and tab counts | Yes, always first |
| `pages/NN-*.md` | Per-page text: headings, table columns, button labels, tab contents, popup contents (truncated) | Yes, text is cheap |
| `screenshots/NN-*.jpg` | Full page screenshot | Yes, in batches |
| `screenshots/NN-*--tab-*.jpg` | Screenshot of each tab on that page | Yes, in batches |
| `screenshots/NN-*--popup-*.jpg` | Dialog or menu opened by a view/details button | Yes, in batches |
| `manifest.json` | Same data as the md files, for scripts | No |

## Uploading to another AI without hitting the limit

1. Upload `INDEX.md` first. It is small and maps every page to its files.
2. Upload `pages/*.md` in groups of about 10 files. This gives the text of every page without images.
3. Upload screenshots in groups of about 10 images, starting with the pages you care about.
   Each screenshot costs roughly as many tokens as a 1440×900 image, so about 59 images is a lot in one message.

## What was and was not clicked

- Only read-only controls were clicked: buttons whose label matches view, details, history, info, show, preview, expand, audit, summary, timeline, open, or inspect, plus each tab.
- Buttons that change data (add, edit, delete, save, import, export, approve, run, lock, send, and similar) were never clicked.
- At most 8 tabs and 10 view-type buttons were checked per page, so a table with 60 "View" rows only shows the first 10.
- Pages that need a specific record id (for example a resource access group) were not opened unless a link to them was on another captured page.

Re-run with `node` against the running servers (script in the session scratchpad; not kept in the repo).
