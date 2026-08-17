# Firestore Security Rules

The app uses Firestore for Battle Journal sync, user profiles, My Decks,
the Wishlist/Tradelist, and Testing Groups (collaborative meta editor).

> **Single source of truth:** [`firestore.rules`](firestore.rules) at the
> repo root. The snippet below is a verbatim copy for reading
> convenience — if you change one, update the other (or just regenerate
> this section from the `.rules` file). 2026-06-12 reconciliation note:
> before that day the `.rules` file was the 65-LOC 2026-03 legacy
> version and Live had drifted ~100 LOC ahead via Console hand-edits;
> see `AUDIT_GITHUB.md` F-24.

To deploy: copy the rules below into Firebase Console →
**Firestore Database → Rules**. There is no `firebase deploy`
automation in CI today.

---

## Full rules

```firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ─────────────────────────────────────────────────────────
    // Users' own data (Battle Journal, Decks, Collection, etc.)
    // ─────────────────────────────────────────────────────────
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }

    // ─────────────────────────────────────────────────────────
    // Shared decks — the ?sharedDeck=<id> short links. Had no rule at all
    // until 2026-08-17, so both the write and the read hit the default deny.
    // read is open because the link IS the capability; create is bounded so
    // an open endpoint can't be used as free storage; update/delete denied.
    // ─────────────────────────────────────────────────────────
    match /shared_decks/{shareId} {
      allow read: if true;
      allow create: if shareId.size() <= 24
        && request.resource.data.keys().hasOnly(['deck', 'order', 'archetype', 'source', 'timestamp'])
        && request.resource.data.deck is map
        && request.resource.data.deck.size() <= 120;
      allow update, delete: if false;
    }

    // ─────────────────────────────────────────────────────────
    // Public profile index — used by Testing Groups to add members
    // by email. Each user writes their own entry; anyone signed in
    // can read it (to resolve email → uid).
    // ─────────────────────────────────────────────────────────
    match /publicProfiles/{uid} {
      allow read:  if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == uid;
    }

    // ─────────────────────────────────────────────────────────
    // Testing Group Invites — one invite doc per group, world-readable
    // by authenticated users so a non-member clicking a shared link
    // can validate the token before attempting to join.
    // Only the group owner can create/update/delete.
    // ─────────────────────────────────────────────────────────
    match /testingGroupInvites/{groupId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
        && get(/databases/$(database)/documents/testingGroups/$(groupId))
             .data.ownerUid == request.auth.uid;
    }

    // ─────────────────────────────────────────────────────────
    // Testing Groups — collaborative matchup tables
    // ─────────────────────────────────────────────────────────
    match /testingGroups/{groupId} {

      // Helpers
      function isMember() {
        return request.auth != null
          && resource.data.memberUids.hasAny([request.auth.uid]);
      }
      function isOwner() {
        return request.auth != null
          && resource.data.ownerUid == request.auth.uid;
      }
      function roleIs(role) {
        return request.auth != null
          && resource.data.members[request.auth.uid].role == role;
      }

      // Members can read the group.
      allow read: if isMember();

      // Any signed-in user can create a group IF the new doc lists
      // them as the sole owner + member.
      allow create: if request.auth != null
        && request.resource.data.ownerUid == request.auth.uid
        && request.resource.data.memberUids == [request.auth.uid]
        && request.resource.data.members[request.auth.uid].role == 'owner';

      // Owner: full update / delete.
      // Editor: can only modify the 'data' field + 'updatedAt'.
      // Viewer: cannot write.
      // Non-members must go through the /joinRequests subcollection
      // now — owners approve/deny there and then update the group.
      allow update: if
        (isOwner()) ||
        (
          roleIs('editor') &&
          request.resource.data.diff(resource.data)
            .affectedKeys().hasOnly(['data', 'updatedAt'])
        );

      allow delete: if isOwner();

      // Activity log — any member can append, nobody can modify.
      match /activity/{activityId} {
        allow read:   if request.auth != null
          && get(/databases/$(database)/documents/testingGroups/$(groupId))
               .data.memberUids.hasAny([request.auth.uid]);
        allow create: if request.auth != null
          && get(/databases/$(database)/documents/testingGroups/$(groupId))
               .data.memberUids.hasAny([request.auth.uid])
          && request.resource.data.uid == request.auth.uid;
        allow update, delete: if false;
      }

      // Join requests — created by non-members via invite link, read/
      // deleted by the group owner (approve = delete + group update,
      // deny = delete). Doc id = requesting user's uid so we get
      // unique-per-user for free.
      match /joinRequests/{uid} {
        // Requester can create their own request IF a valid invite
        // exists for this group.
        allow create: if request.auth != null
          && request.auth.uid == uid
          && request.resource.data.uid == uid
          && exists(/databases/$(database)/documents/testingGroupInvites/$(groupId));
        // Requester can read + delete (cancel) their own request.
        // Owner of the group can read + delete any request.
        allow read, delete: if request.auth != null && (
          request.auth.uid == uid ||
          get(/databases/$(database)/documents/testingGroups/$(groupId))
               .data.ownerUid == request.auth.uid
        );
        allow update: if false;
      }
    }
  }
}
```

## How to deploy

1. Open <https://console.firebase.google.com> → your project
2. Build → **Firestore Database** → **Rules** tab
3. Paste the rules above, replacing the existing ones (or merge if you
   already have other rules you want to keep)
4. Click **Publish**

Changes propagate within a minute.

## What each rule does

| Collection | Read | Write |
|---|---|---|
| `users/{uid}/**` | Owner only | Owner only |
| `publicProfiles/{uid}` | Any signed-in user | Owner only |
| `shared_decks/{shareId}` | Anyone with the link | Create only, bounded; no update/delete |
| `testingGroups/{id}` | Members only | Owner (full) / Editor (data only) / Viewer (none) |
| `testingGroups/{id}/activity/{id}` | Members only | Append-only by any member |

## One caveat

The "editor can only modify data" rule uses `affectedKeys().hasOnly(['data', 'updatedAt'])`.
This means editors can't touch members, ownerUid, name, etc. — only the
matchup matrix / quantity / decks. If you need editors to be able to
rename the group or add members, loosen this rule, but then the owner's
exclusive control is gone.

## Firestore index

The query `where('memberUids', 'array-contains', uid)` works without a
composite index. `where('email', '==', x)` on `publicProfiles` also
works as-is (single-field index is auto-created on first query).

No index configuration needed.
