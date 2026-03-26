# Obsidian PlantUML Integrator

An Obsidian plugin that renders PlantUML diagrams and is ready for Community Plugins publication.

## Features

- Render PlantUML code blocks (`plantuml`, `puml`) in Markdown preview.
- Render `.puml` embedded files.
- Cache include dependency trees and auto re-render when included files are modified.
- Right-click each rendered diagram to clear cache and re-render only that diagram.
- Select rendering mode: server endpoint or local PlantUML JAR.

## Build

1. Install dependencies:
   npm install
2. Build:
   npm run build

## Development

- Watch mode:
  npm run dev

Copy `manifest.json`, `main.js`, and `styles.css` to your Obsidian vault plugin folder.

## Community Plugin Release

1. Verify `manifest.json` fields: `id`, `name`, `author`, `description`, and `version`.
2. Update `versions.json` with `"<plugin version>": "<minAppVersion>"`.
3. Run `npm run build` to generate `main.js`.
4. Create a GitHub Release with the same tag as the `manifest.json` version (for example, `0.1.0`).
5. Attach the following 3 files as release assets:
    - `manifest.json`
    - `main.js`
    - `styles.css`
6. Submit a registration PR to the Obsidian community plugin list repository.

## GitHub Actions (Release ZIP)

- Workflow file: `.github/workflows/release-zip.yml`
- Trigger (manual): `workflow_dispatch`
- Trigger (automatic): `release.published`
- Output ZIP: `${id}-${version}.zip` containing `manifest.json`, `main.js`, `styles.css`, and `versions.json`
- Output destination: uploaded as a workflow artifact
- Release behavior: automatically attached to the GitHub Release when triggered by release publish

## Version Bump Checklist

1. Update `version` in `manifest.json`
2. Add the new version mapping in `versions.json`
3. `npm run build`
4. Create a git tag and GitHub Release
