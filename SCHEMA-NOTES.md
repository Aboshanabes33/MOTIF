# Brand metadata validation

Reads validate every required field before the record reaches the UI. Invalid JSON, bad fields and unsupported versions throw a path-specific BrandSchemaError. The source file is never rewritten, deleted, or silently omitted. The caller must display the error and offer recovery rather than treat the Brand as absent.

Version 1 remains the current on-disk shape. Version 0 and records without a version marker are treated as the legacy version-1 shape and migrated in memory only. They still must contain valid required fields. No invented names, dates or identities are substituted. Add future migrations as explicit version-to-version transformations in migrateBrand, with tests. Unknown fields remain on disk untouched, even though the renderer receives only validated fields.

Existing inline raster logo fields are shape-checked here. Byte-level upload validation belongs to issue #43. Date offsets are normalized to UTC for sorting. To recover malformed data, back up brand.json, repair the named field or restore a known-good backup, then reload. Future versions should be opened by a compatible MOTIF version, never downgraded by deleting their version marker.
