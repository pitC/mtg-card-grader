# MTG Card Grader

A static browser app for speed-grading Magic: The Gathering cards from a
Scryfall set. Assign each card a grade of **A**–**E** and browse the results
across three views. Grades stay in the current browser by default, or sync
through Cloud Firestore so several people can grade the same set together.

There is no build step, no server, and no authentication: the whole app is plain
HTML, CSS, and JavaScript loaded from `index.html`. Card data comes from the
public [Scryfall API](https://scryfall.com/docs/api).

## How it works

When the app opens it asks for a shared collection key (or you can **Skip
(local only)** and keep grades in the browser). It then pulls the latest
released set from Scryfall, or a specific set if you add `?set=<code>` to the
URL, and loads that set's cards.

### Views

- **Grade** — one card at a time with an A–E grade button row. Shows a grade
  seal on the card and progress toward grading the whole set.
- **Grid** — the full card list as thumbnails, each stamped with its grade.
- **Analysis** — cards bucketed into grade lanes (A–E plus Ungraded), with
  filters for grade, colour, rarity, and a free-text search.

### Controls

- Grade with the **A B C D E** keys or buttons; grade again to change a grade.
- **←** and **→** keys (or the nav buttons) move between cards.
- **Clear grade** removes the grade for the current card.
- Hovering cards in Grid or Analysis shows a large preview.
- **All / Ungraded** pills filter which cards the Grade and Grid views show.

## Storage

Grades are stored per set and written to `localStorage` automatically. If a
collection key is configured they also sync to Cloud Firestore.

### Firestore sync

The webpage owner creates a long, unguessable Firestore collection ID and
shares it only with people who should read and update the grades. Users enter
that collection ID when the app opens. Selecting **Skip (local only)** avoids
loading Firebase and stores grades only in the browser.

Each set has one document:

```text
/{collection-key}/{three-letter-set-code}
```

The document body is a map keyed by Scryfall card ID:

```json
{
  "00000000-0000-0000-0000-000000000000": {
    "cardName": "Summon: Bahamut",
    "grade": "A",
    "gradedAt": "2026-08-10T07:30:00.000Z"
  }
}
```

Create the Firestore database in the `mtg-card-grader` Firebase project before
using cloud sync. The app uses the public Firebase web configuration embedded
in `index.html`.

### Firestore rules

The collection key is an obscurity-based capability, not authentication.
Anyone who learns a key can read and overwrite that collection's set
documents. Use collection IDs with at least 32 random characters and distribute
them as secrets. These rules deny collection listing, but Firestore rules
cannot turn a collection path into real authentication.

The following rules support the app's direct document reads and writes. They
also limit document IDs to lowercase three-letter set codes. Review and publish
them from **Firebase Console → Firestore Database → Rules**:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{collectionKey}/{setCode} {
      allow get: if collectionKey.size() >= 32
                 && setCode.matches('^[a-z0-9]{3}$');
      allow create, update: if collectionKey.size() >= 32
                            && setCode.matches('^[a-z0-9]{3}$');
      allow list, delete: if false;
    }
  }
}
```

If existing collection IDs are shorter than 32 characters, replace that
minimum with the project's chosen key policy before publishing the rules.

For stronger access control, put Firestore behind an authenticated backend or
use Firebase Authentication and rules tied to user identities.

### Local storage

Local grades are stored per set under
`scryfallCardGraderGrades:<set-code>`. On first opening a set, matching entries
from the previous flat `scryfallCardGraderGrades` cache are copied into that
set's cache.

## Running locally

Open `index.html` in a browser — no server or install needed. To serve it over
HTTP instead, run any static file server in this directory:

```sh
python3 -m http.server 8000
```

## Development

```sh
npm install    # install dev dependencies
npm test       # run the Vitest test suite
npm run lint   # run ESLint
```

### Project structure

```text
index.html        App shell and markup
css/              base.css (layout/theme), views.css (per-view styles)
js/
  app.js          Bootstrap, state, and event wiring
  constants.js    Grades and analysis filter values
  scryfall.js     Scryfall API calls and helpers
  render.js       Grade, Grid, and Analysis view rendering
  storage.js      localStorage cache and sync preferences
  firebase.js     Lazy Firebase web SDK loading
  firestore.js    Firestore read/write and setup prompts
test/             Vitest unit tests (jsdom)
```