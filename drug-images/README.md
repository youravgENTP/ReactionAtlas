# Drug image import directory

Create one directory per drug here and place that drug's JPEG, PNG, GIF, or WebP images inside it. The folder name normally matches the drug slug used in the import JSON.

For example, a JSON record with `"slug": "example-drug"` uses `drug-images/example-drug/` by default. You may instead set `"image_directory": "drug-images/custom-folder"`.

The importer recursively finds supported images, copies them to ReactionAtlas-managed media storage, and links them to the drug. Each image must be 8 MB or smaller. Re-importing the same JSON updates the drug, reaction links, and changed images without creating duplicates.

Example format only (this file does not create a drug):

```json
[
  {
    "name": "Example drug",
    "slug": "example-drug",
    "chapters": ["Chapter name"],
    "functions": ["Functional category"],
    "aliases": [],
    "description": "Optional notes",
    "image_directory": "drug-images/example-drug",
    "reaction_codes": ["Rxn1", "Rxn*2"]
  }
]
```
