# mattankama.github.io

The home page at https://mattankama.github.io/, with links to my apps. Each app is its
own repository, and GitHub Pages publishes it at a path named after that repository:

| App | Address | Repository |
|---|---|---|
| Rattlesnake | [/rattlesnake/](https://mattankama.github.io/rattlesnake/) | [mattankama/rattlesnake](https://github.com/mattankama/rattlesnake) |
| Intonation | [/intonation/](https://mattankama.github.io/intonation/) | [mattankama/intonation](https://github.com/mattankama/intonation) |
| SAT Regression Trainer | [/DesmosRegressionTrainerExpanded/](https://mattankama.github.io/DesmosRegressionTrainerExpanded/) | [mattankama/DesmosRegressionTrainerExpanded](https://github.com/mattankama/DesmosRegressionTrainerExpanded) |
| Kiosk | Runs on its own server | [mattankama/kiosk](https://github.com/mattankama/kiosk) |

## Editing

It's plain HTML with no build step. Edit `index.html`, commit, and push to `main`; GitHub
Pages publishes it in a minute or two. To add an app, copy one of the `<li class="app">`
blocks.

## Files that protect Rattlesnake users' workouts: don't remove them

Until October 2026 Rattlesnake was served from this address, not from `/rattlesnake/`.
Its workouts are stored on each phone for the whole site, so they survived the move. But
phones that installed it before the move still point here in two ways, and these files
keep them working:

- **`sw.js`** replaces the offline service worker the old Rattlesnake installed at
  `/sw.js`. Phones still check this URL for updates. It removes the old offline copy of
  Rattlesnake (never the workouts, which are in IndexedDB) and keeps this page available
  offline. Without it, those phones would keep running the old copy of the app.
- **The first `<script>` in `index.html`** sends anyone who opens this page from an old
  Home Screen icon straight to `/rattlesnake/`. On iPhone, a Home Screen app keeps its own
  storage, so that icon is the only way back to those workouts.
- **`404.html`** sends Rattlesnake's old page addresses (`/progress`, `/routine/`,
  `/session/`) to the same pages under `/rattlesnake/`.

Anyone with Rattlesnake on an iPhone Home Screen from before the move should keep that
icon. Deleting it deletes its workouts, and adding Rattlesnake again starts empty.

The decision is written up in Rattlesnake's
[docs/adr/0006-served-from-rattlesnake-path.md](https://github.com/mattankama/rattlesnake/blob/main/docs/adr/0006-served-from-rattlesnake-path.md).

## Font

Archivo, by Omnibus-Type, under the SIL Open Font License 1.1: the same file Rattlesnake
uses.
