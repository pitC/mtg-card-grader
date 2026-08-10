# MTG Card Grader

A static browser app for grading cards from a Scryfall set. Grades can stay in
the current browser or sync through Cloud Firestore.

## Firestore sync

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

## Firestore rules

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

## Local storage

Local grades are stored per set under
`scryfallCardGraderGrades:<set-code>`. On first opening a set, matching entries
from the previous flat `scryfallCardGraderGrades` cache are copied into that
set's cache.
