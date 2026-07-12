# Obsidian PlantUML Integrator

An Obsidian plugin that renders PlantUML diagrams and is ready for Community Plugins publication.

## Features

- Render PlantUML code blocks (`plantuml`, `puml`) in Markdown preview.
- Render `.puml` embedded files.
- Cache include dependency trees and auto re-render when included files are modified.
- Right-click each rendered diagram to clear cache and re-render only that diagram.
- Select rendering mode: remote server endpoint or local PlantUML server.

### Code block rendering image

![Code block rendering image](code_block.drawio.svg)

## Render Modes

### Server mode (default)

Uses a remote PlantUML-compatible HTTP endpoint (e.g. [kroki.io](https://kroki.io)).
Configure **PlantUML server URL** in settings (default: `https://kroki.io/plantuml/svg`).

### Local jar mode

Runs a local [PlantUML](https://plantuml.com/download) PicoWeb server and sends requests to it.
This mode does **not** invoke `java` directly from the plugin; you must start the server yourself.

**Why?** Due to platform security constraints, Obsidian plugins cannot spawn external processes. Instead, the plugin communicates with a running PlantUML server via HTTP.

**Starting the local server:**

```sh
java -jar "<path-to-plantuml.jar>" -picoweb
```

The server listens on port 8080 by default.

**Start the local server automatically at user login:**

You can register the PlantUML PicoWeb command as a per-user startup entry so it is launched when you sign in.

Windows (HKCU Run):

```powershell
$runKey = 'Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run'
$javaCommand = 'javaw.exe'
$javaExe = (Get-Command $javaCommand -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source)
if (-not $javaExe) { $javaExe = $javaCommand }
$jarPath = 'C:\path\to\plantuml.jar'
$command = '"' + $javaExe + '" -jar "' + $jarPath + '" -picoweb'
New-Item -Path $runKey -Force | Out-Null
Set-ItemProperty -Path $runKey -Name 'PlantUML PicoWeb' -Value $command
```

macOS (LaunchAgent):

```sh
mkdir -p ~/Library/LaunchAgents
cat > ~/Library/LaunchAgents/com.user.plantuml.picoweb.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
   <dict>
      <key>Label</key>
      <string>com.user.plantuml.picoweb</string>
      <key>ProgramArguments</key>
      <array>
         <string>/usr/bin/java</string>
         <string>-jar</string>
         <string>/path/to/plantuml.jar</string>
         <string>-picoweb</string>
      </array>
      <key>RunAtLoad</key>
      <true/>
      <key>KeepAlive</key>
      <true/>
   </dict>
</plist>
EOF
launchctl load ~/Library/LaunchAgents/com.user.plantuml.picoweb.plist
```

Linux (systemd user service):

```sh
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/plantuml-picoweb.service <<'EOF'
[Unit]
Description=PlantUML PicoWeb server

[Service]
ExecStart=/usr/bin/java -jar /path/to/plantuml.jar -picoweb
Restart=on-failure

[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload
systemctl --user enable --now plantuml-picoweb.service
```

**Check whether the login startup registration is active:**

Windows:

```powershell
(Get-ItemProperty -Path 'Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'PlantUML PicoWeb').'PlantUML PicoWeb'
```

macOS:

```sh
launchctl list | grep com.user.plantuml.picoweb
```

Linux:

```sh
systemctl --user status plantuml-picoweb.service
```

**Remove the login startup registration:**

Windows:

```powershell
Remove-ItemProperty -Path 'Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'PlantUML PicoWeb'
```

macOS:

```sh
launchctl unload ~/Library/LaunchAgents/com.user.plantuml.picoweb.plist
rm ~/Library/LaunchAgents/com.user.plantuml.picoweb.plist
```

Linux:

```sh
systemctl --user disable --now plantuml-picoweb.service
rm ~/.config/systemd/user/plantuml-picoweb.service
systemctl --user daemon-reload
```

Replace the Java executable and JAR path with values that match your environment.

**Plugin settings:**

### Settings screen image

![Settings screen image](setting_image.drawio.svg)

| Setting | Description | Default |
| --- | --- | --- |
| Render mode | Choose where plantuml rendering is processed. | `Server` |
| Plantuml server URL | Used when render mode is server. Kroki endpoint is recommended. | `https://kroki.io/plantuml/svg` |
| Local plantuml server URL | Used when render mode is local JAR. Example: `http://127.0.0.1:8080/svg` | `http://127.0.0.1:8080/svg` |
| Path to the local plantuml jar | Used to build the local server start command. | *(empty)* |
| Java command | Command used to execute java (for example, javaw.exe or full path). | `javaw.exe` |
| Process timeout (ms) | Timeout for local jar execution. | `10000` |
| Local server start command | Copy this command to start the local plantuml server. | Auto-generated from `Java command` and `Path to the local plantuml jar` |
| Local server stop command | Copy this command to stop the local plantuml server. | Platform-specific auto-generated value |
| Login startup command | Displayed command for registering local server startup at login. | Platform-specific auto-generated value |
| Login startup unregister command | Displayed command for unregistering local server startup at login. | Platform-specific auto-generated value |

**Convenience feature:** Right-click any rendered diagram and select **Copy local server start command** to copy the `javaw.exe -jar ...` command to the clipboard.

If the server is not running, the plugin shows the start command in the error message.

## Security and Permissions

### Clipboard Access

This plugin requests `clipboard-read` and `clipboard-write` permissions exclusively for **user-initiated copy operations**:

**When clipboard is accessed:**

- Right-click any rendered diagram → **Copy local server start command**: Copies the Java command to start the PlantUML server
- Settings screen → **Local server start command** field → Right-click → **Copy**: Copies the auto-generated start command
- Settings screen → **Copy login startup command**: Copies the platform-specific command to register the server for auto-start
- Settings screen → **Copy login startup unregister command**: Copies the command to remove auto-start registration
- Settings screen → **Copy local server stop command**: Copies the command to stop the PlantUML server

**Important:**

- Clipboard is never accessed automatically or in the background
- Access only occurs when the user explicitly clicks a "Copy" button or menu item
- No data is read from or written to the clipboard except the commands specified above

## Build

1. Install dependencies:

   ```sh
   npm install
   ```

2. Build:

   ```sh
   npm run build
   ```

## Development

Watch mode:

```sh
npm run dev
```

Copy `manifest.json`, `main.js`, and `styles.css` to your Obsidian vault plugin folder.

## Lint

Run lint checks:

```sh
npm run lint
```

Run lint checks with auto-fix:

```sh
npm run lint:fix
```

`npm run lint:fix` only applies ESLint auto-fixes and does not update version files.

## Community Plugin Release

1. Verify `manifest.json` fields: `id`, `name`, `author`, `description`, and `version`.
2. Run `npm run lint:fix`.
3. Run `npm run lint` to verify the plugin meets Obsidian guidelines. This will check:

   - TypeScript code for sentence-case UI text
   - Plugin manifest structure and configuration
   - Other Obsidian plugin best practices

4. Bump the version based on the type of release:
   - **For bug fixes (patch):** `npm run version:patch` (e.g., `0.1.12` → `0.1.13`)
   - **For new features (minor):** `npm run version:minor` (e.g., `0.1.12` → `0.2.0`)
   - **For breaking changes (major):** `npm run version:major` (e.g., `0.1.12` → `1.0.0`)

   This updates `package.json`, `manifest.json`, and `versions.json` together.

5. Run `npm run build` to generate `main.js`.

6. Create a GitHub Release with the same tag as the `manifest.json` version (for example, `0.1.0`).

7. The GitHub Actions workflow automatically:

   - Generates release notes from git commits since the previous tag
   - Creates artifact attestations for `main.js` and `styles.css` to establish provenance
   - Verifies all release requirements (manifest fields, permissions, assets)
   - Attaches release notes and attestations to the GitHub Release

8. Attach the following 3 files as release assets:

   - `manifest.json`
   - `main.js`
   - `styles.css`

9. Submit a registration PR to the Obsidian community plugin list repository.

### Artifact Attestations

Each GitHub Release includes artifact attestations for `main.js` and `styles.css`. These attestations cryptographically verify the provenance of the release assets, proving they were built from the source repository.

**Verifying attestations:**

Users can verify the authenticity and provenance of release assets using the GitHub CLI:

```sh
gh attestation verify <artifact-file> --owner fangface-hub --repo obsidian_plantuml_integrator
```

Learn more: [Using artifact attestations to establish provenance for builds](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations/using-artifact-attestations-to-establish-provenance-for-builds)

## Version Management

This project follows [Semantic Versioning](https://semver.org/) (MAJOR.MINOR.PATCH).

### Version Bump Commands

- **Major version bump** (breaking changes):

  ```sh
  npm run version:major
  ```

  Bumps major version and resets minor and patch to 0 (e.g., `0.1.12` → `1.0.0`)

- **Minor version bump** (new features):

  ```sh
  npm run version:minor
  ```

  Bumps minor version and resets patch to 0 (e.g., `0.1.12` → `0.2.0`)

- **Patch version bump** (bug fixes):

  ```sh
  npm run version:patch
  ```

  Bumps patch version only (e.g., `0.1.12` → `0.1.13`)

### What the version commands do

Each version bump command automatically updates:

- `package.json` - Package version
- `manifest.json` - Plugin manifest version
- `versions.json` - Version history with minimum Obsidian version

When bumping major or minor versions, lower version numbers reset to 0 per semantic versioning standards.

## GitHub Actions (Release ZIP)

- Workflow file: `.github/workflows/release-zip.yml`
- Trigger (manual): `workflow_dispatch`
- Trigger (automatic): `release.published`
- Output ZIP: `${id}-${version}.zip` containing `manifest.json`, `main.js`, `styles.css`, and `versions.json`
- Output destination: uploaded as a workflow artifact
- Release behavior: automatically attached to the GitHub Release when triggered by release publish

## Version Bump Checklist

1. Run `npm run version:patch`
2. Verify the updated version in `manifest.json` and `versions.json`
3. `npm run build`
4. Create a git tag and GitHub Release

## Support the Project

If you find this plugin helpful, consider sponsoring the project:

[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-GitHub-ff69b4?style=for-the-badge)](https://github.com/sponsors/fangface-hub)
