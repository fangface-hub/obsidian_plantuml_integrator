# Obsidian Community Plugin Registration PR Template

Use the following text when submitting the plugin to the Obsidian community plugin list repository.

## PR Title

Add PlantUML Integrator community plugin

## PR Body

### Summary

This PR adds a new community plugin: PlantUML Integrator.

PlantUML Integrator renders PlantUML diagrams in Obsidian from both Markdown code blocks and embedded `.puml` files. It also tracks `!include` dependencies, caches the include tree, and automatically re-renders diagrams when dependent files are updated.

### Repository

- Repository: <REPOSITORY_URL>
- Latest release: <RELEASE_URL>

### Main Features

- Render `plantuml` and `puml` code blocks in Markdown preview
- Render embedded `.puml` files
- Cache `!include` dependency trees
- Automatically re-render diagrams when included files change
- Allow users to clear the cache for an individual diagram via right-click
- Support both server-based rendering and local JAR-based rendering

### Notes for Review

- The plugin does not use remote code execution.
- Server-based rendering is optional and user-configurable.
- Local rendering is supported through a user-specified PlantUML JAR.
- The plugin package includes the standard release files required by Obsidian plugins.

### Testing

The plugin has been tested with:

- PlantUML code blocks in Markdown notes
- Embedded `.puml` files
- Changes to files referenced through `!include`
- Manual cache clearing for a single rendered diagram
- Both server rendering mode and local JAR rendering mode

### Checklist

- [ ] I have read the community plugin submission guidelines
- [ ] The repository is public
- [ ] A GitHub release is available
- [ ] The release contains `manifest.json`, `main.js`, and `styles.css`
- [ ] `versions.json` is included and up to date
- [ ] The plugin has a valid open-source license

### Additional Information

If needed, I can provide more implementation details or test notes.
