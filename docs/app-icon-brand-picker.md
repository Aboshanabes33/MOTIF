# App icon and easy Brand colors

Stacked on SVG interface PR126, open only. No release assets were replaced.

## App identity

MOTIF aperture SVG mark on deep-teal tile, generated from the same pinned Lucide library as the titlebar, with inherited ISC/MIT notice. Source SVG,1024px PNG and six-size Windows ICO(16/32/48/64/128/256) committed. BrowserWindow gets the packaged PNG. AppUserModelID matches builder appId. Windows executable resource editing is enabled, signing explicitly disabled. The existing portable target gets its launcher icon from win.icon. NSIS installer/uninstaller/header icons are configured for a future NSIS build, but the current target remains portable, not an installed-app wizard. No signing or certificate claim.

Previously signAndEditExecutable:false skipped both signing AND icon resources. It is now true with signExecutable:false. Regenerate assets with scripts/generate-icons.mjs and its documented ImageMagick commands. Icons and notices are on the packaged files allowlist.

Validation: local electron-builder26.18.0 Windows directory build and portable launcher build completed without signing. All six embedded RT_ICON bitmaps in BOTH inner MOTIF.exe and outer portable exe byte-match committed ICO payloads. Extracted launcher icon visually inspected. Local proof used store compression to avoid unrelated lengthy compression; shipping compression config is unchanged. Windows execution, Explorer cache, installed/pinned shortcuts and Windows taskbar rendering have not been tested. Existing pinned shortcuts may retain cached old icons until replaced. No release artifact uploaded. NSIS target not built.

## Brand colors

No code knowledge required. MOTIF current UI palette offers Deep teal/Mint/Mist/Night, plus named Blue/Red/White/Black/Green/Yellow/Orange/Purple. These are choices, not silently assigned brand colors. Visual native color input plus Add color supports custom colors. Selected colors show checkmarks and removal chips, max8 matches existing persistence schema. Existing saved colors are preserved. Optional advanced hex field is collapsed by default. Save flow and storage schema stay unchanged.

Validation: TypeScript check/build,19 tests, real Electron smoke. Edited a real saved Brand, selected Blue and White through UI, saved through IPC and read actual persisted Brand colors with existing colors preserved. Screenshot inspected for clear names, selections and visible Save/Cancel. Native color dialog looks OS-specific; Windows picker not tested. Test Brand is isolated temporary-profile metadata, not production seed data.
