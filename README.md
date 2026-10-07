# ReactionAtlas

ReactionAtlas is a small, local-only reaction index and study tool for organic and medicinal chemistry exam preparation. Human-readable identifiers such as `Rxn4` and `Rxn*4` stay central: search an index, reaction name, alias, reagent, reactant, product, note, or component role; inspect the reaction card; then organize reactions in a block-based study document.

All data stays on your computer in SQLite. There is no login, cloud service, or telemetry.

## Project structure

```text
backend/app/       FastAPI application, SQLAlchemy models, API routers, and seed loader
frontend/src/      React/TypeScript interface
data/reactions.json  Canonical bootstrap/reference reaction dataset tracked by Git
data/reaction_atlas.db  Local runtime SQLite database, ignored by Git
drug-images/       Per-drug source image folders used by the bulk importer
structure-images/  Per-structure source image folders used by the bulk importer
docs/              Project documentation
```

## Setup and startup

Python 3.10+ and a current Node.js/npm installation are required.

Install the backend, frontend, and root development dependencies once:

```bash
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
cd ..
npm --prefix frontend install
npm install
```

Then start both the frontend and backend from the project root with one command:

```bash
npm run dev
```

Open <http://localhost:5173>. The API is available at <http://127.0.0.1:8000>, and interactive API documentation is at <http://127.0.0.1:8000/docs>. Vite proxies `/api` requests to the local backend. Press `Ctrl+C` once in the root terminal to stop both development servers. The backend command uses `backend/.venv/bin/python` directly, so it does not depend on the shell's active Python or conda environment.

### Troubleshooting: run services separately

To isolate frontend issues, run the frontend from the project root:

```bash
npm --prefix frontend run dev
```

To isolate backend issues, run the backend from the project root with its virtual environment's Python explicitly:

```bash
cd backend && .venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The existing backend helper remains available when the intended Python environment is already active:

```bash
cd backend
./run.sh
```

The database path is resolved from the repository root and is always `data/reaction_atlas.db`, regardless of the directory from which Python is started.

SQLAlchemy models define the database schema. On startup, a small additive SQLite upgrade runs before `create_all()`: older Drug rows receive stable numbers in `created_at`/`id` order, and a unique number index is installed without replacing any tables or rows. On the first startup only, an empty reaction database is seeded from the 18 verified reaction records in `data/reactions.json`. Existing data is never overwritten or synchronized automatically when the canonical JSON changes.

To discard the local database contents and recreate the verified seed data:

```bash
cd backend
python -m app.reset_db
```

This resets the canonical reaction/component data and collections in `data/reaction_atlas.db`, validates `data/reactions.json`, and reloads it in one transaction. It does not delete Drug records, Structure records, configuration, or uploaded assets; links to deleted reaction rows are removed by foreign-key cascade and can be restored by re-importing the relevant Drug/Structure JSON. To add or correct a canonical bootstrap reaction, edit `data/reactions.json` rather than `backend/app/seed.py`, then run the reset command when you intentionally want to rebuild the runtime database.

## Using the reaction library

Select **New reaction**, choose the general or special series, enter its positive integer number and name, and add as many components as needed. The display code is derived: general reaction 4 is `Rxn4`, while special named reaction 4 is `Rxn*4`. `Rxn*` remains reserved for named reactions; scaffold-specific `SRxn` codes are not implemented. Each component has a role (reactant, product, reagent, catalyst, solvent, condition, or other) and an optional detail/stoichiometry note. Typing the same component name with different casing or whitespace reuses the existing component record. An optional image can be uploaded for the reaction card; it appears in library results, the reaction detail, and collections.

Text inputs support shared LaTeX-style shortcuts. For example, type `\rightarrow` followed by a space to insert `→`. Both backslash and the Korean won-key character are recognized. Add, edit, or remove shortcuts from **Settings → LaTeX shortcuts**.

Subscript and superscript markup works with arbitrary text, including Korean. Use `_{text}` or `_x` for subscript and `^{text}` or `^x` for superscript; `\_` and `₩_` prefixes remain accepted for compatibility. Rich collection blocks convert the markup directly while editing; reaction form values retain the portable markup and render it typographically in cards and detail views.

The Reaction Library detail pane is directly editable: select a reaction and edit its name, class, summary, or notes in place with the same rich-text controls as collection documents. A save bar appears when the document has changes. The popup remains available as **Edit metadata** for series, number, status, slug, components, and card images. Searchable plain text remains in the reaction record while sanitized formatting is stored separately, so formatting does not replace searchable content.

The search box matches, case-insensitively:

- derived reaction code, name, slug, reaction class, summary, notes, and reaction aliases
- component names and aliases
- component roles and component detail text

Results update as you type. Searches such as `Rxn4`, `Rxn*4`, `Mannich`, `Imine`, `Michael`, `Eschweiler`, and `Nitrile` require no special syntax. The historical alias `Rxn3` resolves to active `Rxn10` and is labeled as a deprecated index; `Rxn3` is not an active reaction row.

## Collection workspace

Create a collection from the **Collections** page, then open it to use the study workspace. The left side contains manually ordered reaction cards; search by reaction index or name to add one, use the arrow controls to reorder it, or remove it without deleting the reaction itself.

The right side is a block document editor. Add rich-text paragraphs, headings, images, dividers, and embedded cards for reactions already linked to the collection. Text blocks include bold, italic, underline, highlight, color, and the same LaTeX shortcuts used by the reaction form. Images can be selected, dropped, or pasted and then resized and aligned. Select **Save** to persist the document and collection metadata to SQLite. Existing Markdown collections open as a compatible text block and are converted to the document format when saved.

## Drug database

The **Drug Database** starts empty. Every Drug has a stable human-readable code such as `Drug3`; its internal SQLite primary key remains separate. Codes survive re-import and reordering, and automatically allocated codes are never reused after deletion. Drugs are grouped by chapter and function and connect to both Rxn Library synthesis reactions and Structure Database records.

Bulk import accepts a JSON array, or an object containing a `drugs` array. Create one source-image directory per drug under `drug-images/`, then select **Import JSON**. The importer recursively discovers JPEG, PNG, GIF, and WebP files up to 8 MB, copies them into managed media storage, and links reaction codes only when they exist in the Rxn Library. Re-importing the same slug updates metadata, reaction links, and changed images without duplicating records.

```json
[
  {
    "name": "Example drug",
    "number": 3,
    "slug": "example-drug",
    "chapters": ["Chapter name"],
    "functions": ["Functional category"],
    "aliases": [],
    "description": "Optional notes",
    "image_directory": "drug-images/example-drug",
    "reaction_codes": ["Rxn1", "Rxn*2"],
    "structure_codes": ["Str1"]
  }
]
```

`number` is optional for new records; omitting it allocates the next stable Drug code. A slug re-import keeps its original number. When `image_directory` is omitted, it defaults to `drug-images/<slug>/`; a missing directory is created and reported as having no images. For safety, imports can only read image directories contained within the project's `drug-images/` directory. See `drug-images/README.md` for the same format near the source folders.

## Structure database

The **Structure Database** mirrors the Drug Database workspace with search, category filtering, image galleries, and JSON bulk import. Structures use stable `Str<number>` codes, can link to multiple reactions and drugs, and are visible from both sides of every Drug–Structure relation.

Place source images in `structure-images/<slug>/`. Import accepts a raw array or an object containing a `structures` array:

```json
{
  "structures": [
    {
      "number": 1,
      "name": "Imidazole",
      "slug": "imidazole",
      "categories": ["Heterocycle"],
      "aliases": ["1,3-diazole"],
      "description": "Optional notes",
      "image_directory": "structure-images/imidazole",
      "reaction_codes": ["Rxn4"],
      "drug_codes": ["Drug3"]
    }
  ]
}
```

Missing `Rxn`, `Drug`, or `Str` references are reported as import warnings while valid records continue. Re-import synchronizes relation order to the JSON list and does not create duplicate links. Omitting `structure_codes`/`drug_codes` preserves links created from the other importer; providing an explicit empty list clears them. Structure images use the same recursive discovery, 8 MB limit, change detection, and managed-media copy rules as Drug images.

## Import and export

**Export** in the reaction library downloads a versioned JSON snapshot containing reactions and collections. **Import** accepts either:

- a JSON array of reaction objects accepted by `POST /api/import`, or
- a JSON snapshot previously exported by ReactionAtlas.

Import updates an existing reaction when its `(series, number)` pair matches and creates it otherwise. Exported collections are included for portability, but import intentionally imports reaction records only.

Runtime import/export JSON and `data/reactions.json` serve different purposes. Runtime exports are user-data snapshots produced by the API. The tracked canonical JSON is curated bootstrap/reference data consumed only when initializing an empty database or running the explicit reset command; changes are not continuously synchronized into SQLite.

## Automatic backups

While the backend is running, ReactionAtlas creates a timestamped ZIP archive in `backups/` every 12 hours. On startup it also creates a catch-up backup when the latest archive is at least 12 hours old. Each archive contains a transactionally consistent SQLite snapshot, uploaded files from `data/media/`, the canonical `data/reactions.json`, and a checksum manifest. Existing archives are retained; ReactionAtlas does not delete them automatically.

Open **Settings → Backups** to see the latest archive, the next scheduled time, and the local backup directory, or to create a backup immediately. The generated ZIP files are ignored by Git, while `backups/README.md` remains tracked.

CSV import is also supported in the browser. Use this header (optional text columns may be omitted):

```csv
series,number,name,reaction_class,reactants,products,reagents,catalysts,solvents,notes,summary,slug,status
general,4,Imine Formation,Carbonyl chemistry,Aldehyde or ketone;Primary amine,Imine,,Acid,,Mild acid catalysis,Condensation reaction,imine-formation,active
```

Separate multiple values within a component column with a semicolon (`;`). V1 CSV parsing is deliberately simple: fields containing commas are not supported, so use JSON for those records.

## API overview

- `GET/POST /api/reactions`, `GET/PUT/DELETE /api/reactions/{id}`
- `PATCH /api/reactions/{id}/rich-text` updates only inline document fields and never overwrites metadata or components
- `GET/POST /api/components`
- `GET/POST /api/collections`, `GET/PUT/DELETE /api/collections/{id}`
- `POST/DELETE /api/collections/{id}/reactions...` and `PUT /api/collections/{id}/reorder`
- `POST /api/media`, `GET /api/media/{id}/content`
- `GET/PUT /api/settings/latex-shortcuts`
- `GET /api/backups/status`, `POST /api/backups`
- `GET /api/drugs`, `GET/DELETE /api/drugs/{id}`, `POST /api/drugs/import`
- `GET /api/structures`, `GET/DELETE /api/structures/{id}`, `POST /api/structures/import`
- `GET /api/export`, `POST /api/import`, `GET /api/health`

Reaction responses expose `series`, `number`, derived `display_code`, `name`, optional `slug`, `summary`, `reaction_class`, `status`, `notes`, aliases, and incoming/outgoing generic relations. The database enforces unique `(series, number)` pairs. The seed loader validates the JSON schema version, values, unique reaction indices, and all alias/relation references before inserting reactions, aliases, and relations in a single transaction.

## Intentionally outside V1

ReactionAtlas does not yet include authentication, sync/cloud deployment, a chemical drawing editor, OCR, AI features, or structure-aware chemistry. Possible future additions include SMILES, RDKit, SMARTS/substructure search, and reaction scheme rendering.
