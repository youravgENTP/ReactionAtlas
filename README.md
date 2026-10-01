# ReactionAtlas

ReactionAtlas is a small, local-only reaction index and study tool for organic and medicinal chemistry exam preparation. Human-readable identifiers such as `Rxn4` and `Rxn*4` stay central: search an index, reaction name, alias, reagent, reactant, product, note, or component role; inspect the reaction card; then organize reactions in a Markdown-based study collection.

All data stays on your computer in SQLite. There is no login, cloud service, or telemetry.

## Project structure

```text
backend/app/       FastAPI application, SQLAlchemy models, API routers, and seed data
frontend/src/      React/TypeScript interface
data/              Local SQLite database (created on first backend startup)
docs/              Project documentation
```

## Setup and startup

Python 3.10+ and a current Node.js/npm installation are required.

Start the backend in one terminal:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
./run.sh
```

The API is available at <http://127.0.0.1:8000>; interactive API documentation is at <http://127.0.0.1:8000/docs>.

Start the frontend in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api` requests to the local backend. The database path is resolved from the repository root and is always `data/reaction_atlas.db`, regardless of the directory from which Python is started.

On the first startup only, an empty database is seeded with the 16 verified reaction records described below. Existing data is never overwritten.

To discard the local database contents and recreate the verified seed data:

```bash
cd backend
python -m app.reset_db
```

This resets only the SQLite application tables in `data/reaction_atlas.db`; it does not touch configuration or uploaded assets.

## Using the reaction library

Select **New reaction**, choose the general or special series, enter its positive integer number and name, and add as many components as needed. The display code is derived: general reaction 4 is `Rxn4`, while special reaction 4 is `Rxn*4`. Each component has a role (reactant, product, reagent, catalyst, solvent, condition, or other) and an optional detail/stoichiometry note. Typing the same component name with different casing or whitespace reuses the existing component record.

The search box matches, case-insensitively:

- derived reaction code, name, slug, reaction class, summary, notes, and reaction aliases
- component names and aliases
- component roles and component detail text

Results update as you type. Searches such as `Rxn4`, `Rxn*4`, `Mannich`, `Imine`, `Michael`, `Eschweiler`, and `Nitrile` require no special syntax. The historical alias `Rxn3` resolves to active `Rxn10` and is labeled as a deprecated index; `Rxn3` is not an active reaction row.

## Collection workspace

Create a collection from the **Collections** page, then open it to use the study workspace. The left side contains manually ordered reaction cards; search by reaction index or name to add one, use the arrow controls to reorder it, or remove it without deleting the reaction itself.

The right side is a plain Markdown editor with a rendered preview. Use `[[Rxn4]]` or `[[Rxn*4]]` in Markdown to create a reaction reference; selecting it in preview scrolls the corresponding card into view. Select **Save** to persist the Markdown and collection metadata to SQLite.

## Import and export

**Export** in the reaction library downloads a versioned JSON snapshot containing reactions and collections. **Import** accepts either:

- a JSON array of reaction objects accepted by `POST /api/import`, or
- a JSON snapshot previously exported by ReactionAtlas.

Import updates an existing reaction when its `(series, number)` pair matches and creates it otherwise. Exported collections are included for portability, but import intentionally imports reaction records only.

CSV import is also supported in the browser. Use this header (optional text columns may be omitted):

```csv
series,number,name,reaction_class,reactants,products,reagents,catalysts,solvents,notes,summary,slug,status
general,4,Imine Formation,Carbonyl chemistry,Aldehyde or ketone;Primary amine,Imine,,Acid,,Mild acid catalysis,Condensation reaction,imine-formation,active
```

Separate multiple values within a component column with a semicolon (`;`). V1 CSV parsing is deliberately simple: fields containing commas are not supported, so use JSON for those records.

## API overview

- `GET/POST /api/reactions`, `GET/PUT/DELETE /api/reactions/{id}`
- `GET/POST /api/components`
- `GET/POST /api/collections`, `GET/PUT/DELETE /api/collections/{id}`
- `POST/DELETE /api/collections/{id}/reactions...` and `PUT /api/collections/{id}/reorder`
- `GET /api/export`, `POST /api/import`, `GET /api/health`

Reaction responses expose `series`, `number`, derived `display_code`, `name`, optional `slug`, `summary`, `reaction_class`, `status`, `notes`, aliases, and incoming/outgoing generic relations. The database enforces unique `(series, number)` pairs. Seeded relations use `subtype_of` for Amidation → Nucleophilic Acyl Substitution, because Amidation is modeled as the more specific reaction, and `method_for` for both reduction methods → Nitrile Reduction.

## Intentionally outside V1

ReactionAtlas does not yet include authentication, sync/cloud deployment, a rich-text or chemical drawing editor, OCR, AI features, or structure-aware chemistry. Possible future additions include structure images, SMILES, RDKit, SMARTS/substructure search, and reaction scheme rendering.
