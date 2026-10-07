# Structure image import directory

Create one folder per structure under this directory. The folder normally uses the structure slug, for example `structure-images/imidazole/`.

The Structure Database importer recursively copies JPEG, PNG, GIF, and WebP images up to 8 MB into ReactionAtlas-managed media storage. Re-importing updates changed images without creating duplicates.

```json
{
  "structures": [
    {
      "number": 1,
      "name": "Imidazole",
      "slug": "imidazole",
      "categories": ["Heterocycle"],
      "aliases": ["1,3-diazole"],
      "image_directory": "structure-images/imidazole",
      "reaction_codes": ["Rxn4"],
      "drug_codes": ["Drug3"]
    }
  ]
}
```

`number` is optional for a new structure. When omitted, the next unused stable `Str<number>` code is assigned. Existing structures keep their number when re-imported.
