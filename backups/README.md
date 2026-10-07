# ReactionAtlas backups

ReactionAtlas writes automatic backups to this directory while the backend is running.

Each `reaction-atlas-YYYYMMDDTHHMMSSZ.zip` archive contains:

- a consistent SQLite snapshot at `data/reaction_atlas.db`
- uploaded images under `data/media/`
- the canonical bootstrap dataset at `data/reactions.json`
- `manifest.json` with creation time, interval, file sizes, and SHA-256 checksums

The scheduler creates a backup every 12 hours. On backend startup it also creates one immediately when no successful backup exists from the previous 12 hours. Archives are not deleted automatically.
