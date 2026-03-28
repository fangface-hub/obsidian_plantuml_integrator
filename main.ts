import {
  App,
  MarkdownPostProcessorContext,
  MarkdownRenderChild,
  Menu,
  Notice,
  Platform,
  Plugin,
  PluginSettingTab,
  Setting,
  TAbstractFile,
  TFile,
  requestUrl
} from "obsidian";
import * as plantumlEncoder from "plantuml-encoder";

type RenderMode = "server" | "localJar";

interface PlantumlIntegratorSettings {
  renderMode: RenderMode;
  serverUrl: string;
  localServerUrl: string;
  localJarPath: string;
  javaCommand: string;
  timeoutMs: number;
}

const DEFAULT_SETTINGS: PlantumlIntegratorSettings = {
  renderMode: "server",
  serverUrl: "https://kroki.io/plantuml/svg",
  localServerUrl: "http://127.0.0.1:8080/svg",
  localJarPath: "",
  javaCommand: "javaw.exe",
  timeoutMs: 10000
};

interface IncludeCacheEntry {
  versionKey: string;
  expandedSource: string;
  dependencies: Set<string>;
  dependencyMtimes: Map<string, number>;
}

interface RenderBinding {
  id: string;
  rootPath: string | null;
  cacheKey: string;
  dependencies: Set<string>;
  render: () => Promise<void>;
}

interface ExpandResult {
  expandedSource: string;
  dependencies: Set<string>;
}

export default class PlantumlIntegratorPlugin extends Plugin {
  settings!: PlantumlIntegratorSettings;
  private includeCache = new Map<string, IncludeCacheEntry>();
  private renderBindings = new Map<string, RenderBinding>();

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerMarkdownCodeBlockProcessor("plantuml", async (source, el, ctx) => {
      await this.renderPlantumlCodeBlock(source, el, ctx, "plantuml");
    });

    this.registerMarkdownCodeBlockProcessor("puml", async (source, el, ctx) => {
      await this.renderPlantumlCodeBlock(source, el, ctx, "puml");
    });

    this.registerMarkdownPostProcessor(async (el, ctx) => {
      await this.renderPumlEmbeds(el, ctx);
    });

    this.registerEvent(
      this.app.vault.on("modify", async (file) => {
        await this.onFileModified(file);
      })
    );

    this.addSettingTab(new PlantumlIntegratorSettingTab(this.app, this));
  }

  onunload(): void {
    this.renderBindings.clear();
    this.includeCache.clear();
  }

  private async renderPlantumlCodeBlock(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
    lang: string
  ): Promise<void> {
    const container = el.createDiv({ cls: "plantuml-integrator-container" });
    const rootPath = this.resolveContextPath(ctx.sourcePath);
    const blockKey = `${ctx.sourcePath}::${lang}::${this.simpleHash(source)}`;

    const bindingId = `${blockKey}::${Date.now()}::${Math.random().toString(36).slice(2)}`;

    const render = async (): Promise<void> => {
      container.empty();
      try {
        const expandResult = await this.expandPlantumlSource(source, rootPath, blockKey);
        const svg = await this.renderSvg(expandResult.expandedSource);
        this.renderSvgIntoContainer(container, svg);

        this.renderBindings.set(bindingId, {
          id: bindingId,
          rootPath,
          cacheKey: blockKey,
          dependencies: expandResult.dependencies,
          render
        });
      } catch (error) {
        container.createDiv({
          cls: "plantuml-integrator-error",
          text: this.buildRenderErrorMessage(error)
        });
      }
    };

    this.attachContextMenu(container, bindingId);
    await render();

    ctx.addChild(
      new (class extends MarkdownRenderChild {
        plugin: PlantumlIntegratorPlugin;
        id: string;

        constructor(containerEl: HTMLElement, plugin: PlantumlIntegratorPlugin, id: string) {
          super(containerEl);
          this.plugin = plugin;
          this.id = id;
        }

        onunload(): void {
          this.plugin.renderBindings.delete(this.id);
        }
      })(container, this, bindingId)
    );
  }

  private async renderPumlEmbeds(el: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<void> {
    const embeds = el.querySelectorAll<HTMLElement>(".internal-embed[src$='.puml'], .internal-embed[data-href$='.puml']");

    for (const embed of Array.from(embeds)) {
      const src = embed.getAttribute("src") ?? embed.getAttribute("data-href");
      if (!src) {
        continue;
      }

      const linkPath = src.split("#")[0];
      const file = this.app.metadataCache.getFirstLinkpathDest(linkPath, ctx.sourcePath);
      if (!(file instanceof TFile) || file.extension.toLowerCase() !== "puml") {
        continue;
      }

      const container = createDiv({ cls: "plantuml-integrator-container" });
      embed.empty();
      embed.appendChild(container);

      const cacheKey = `file::${file.path}`;
      const bindingId = `${cacheKey}::${Date.now()}::${Math.random().toString(36).slice(2)}`;

      const render = async (): Promise<void> => {
        container.empty();
        try {
          const source = await this.app.vault.cachedRead(file);
          const expandResult = await this.expandPlantumlSource(source, file.path, cacheKey);
          const svg = await this.renderSvg(expandResult.expandedSource);
          this.renderSvgIntoContainer(container, svg);

          const deps = new Set(expandResult.dependencies);
          deps.add(file.path);

          this.renderBindings.set(bindingId, {
            id: bindingId,
            rootPath: file.path,
            cacheKey,
            dependencies: deps,
            render
          });
        } catch (error) {
          container.createDiv({
            cls: "plantuml-integrator-error",
            text: this.buildRenderErrorMessage(error)
          });
        }
      };

      this.attachContextMenu(container, bindingId);
      await render();

      ctx.addChild(
        new (class extends MarkdownRenderChild {
          plugin: PlantumlIntegratorPlugin;
          id: string;

          constructor(containerEl: HTMLElement, plugin: PlantumlIntegratorPlugin, id: string) {
            super(containerEl);
            this.plugin = plugin;
            this.id = id;
          }

          onunload(): void {
            this.plugin.renderBindings.delete(this.id);
          }
        })(container, this, bindingId)
      );
    }
  }

  private async onFileModified(file: TAbstractFile): Promise<void> {
    if (!(file instanceof TFile)) {
      return;
    }

    const changedPath = file.path;

    for (const [cacheKey, cache] of this.includeCache.entries()) {
      if (cache.dependencies.has(changedPath)) {
        this.includeCache.delete(cacheKey);
      }
    }

    const rerenders: Promise<void>[] = [];
    for (const binding of this.renderBindings.values()) {
      if (binding.dependencies.has(changedPath) || binding.rootPath === changedPath) {
        rerenders.push(binding.render());
      }
    }

    await Promise.all(rerenders);
  }

  private resolveContextPath(sourcePath: string): string | null {
    const file = this.app.vault.getAbstractFileByPath(sourcePath);
    if (file instanceof TFile) {
      return file.path;
    }
    return null;
  }

  private async expandPlantumlSource(
    source: string,
    rootPath: string | null,
    cacheKey: string
  ): Promise<ExpandResult> {
    const versionKey = `${rootPath ?? "inline"}::${this.simpleHash(source)}`;
    const cached = this.includeCache.get(cacheKey);
    if (cached && cached.versionKey === versionKey) {
      let allFresh = true;
      for (const [depPath, mtime] of cached.dependencyMtimes.entries()) {
        const currentMtime = this.getFileMtime(depPath);
        if (currentMtime === null || currentMtime !== mtime) {
          allFresh = false;
          break;
        }
      }
      if (allFresh) {
        return {
          expandedSource: cached.expandedSource,
          dependencies: new Set(cached.dependencies)
        };
      }
    }

    const visited = new Set<string>();
    const includeOnceSet = new Set<string>();
    const dependencies = new Set<string>();

    const expandedSource = await this.expandRecursive(source, rootPath, visited, includeOnceSet, dependencies);

    const dependencyMtimes = new Map<string, number>();
    for (const depPath of dependencies) {
      const mtime = this.getFileMtime(depPath);
      if (mtime !== null) {
        dependencyMtimes.set(depPath, mtime);
      }
    }

    this.includeCache.set(cacheKey, {
      versionKey,
      expandedSource,
      dependencies: new Set(dependencies),
      dependencyMtimes
    });

    return { expandedSource, dependencies };
  }

  private async expandRecursive(
    source: string,
    currentPath: string | null,
    visited: Set<string>,
    includeOnceSet: Set<string>,
    dependencies: Set<string>
  ): Promise<string> {
    const includePattern = /^\s*!(include|include_once|include_many)\s+(.+)\s*$/gm;

    let result = "";
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = includePattern.exec(source)) !== null) {
      const whole = match[0];
      const includeType = match[1];
      const includeTargetRaw = match[2]?.trim() ?? "";
      const includeTarget = this.normalizeIncludeTarget(includeTargetRaw);

      result += source.slice(lastIndex, match.index);
      lastIndex = match.index + whole.length;

      if (!includeTarget || includeTarget.startsWith("<")) {
        result += whole;
        continue;
      }

      const resolved = this.resolveIncludePath(includeTarget, currentPath);
      if (!resolved) {
        result += whole;
        continue;
      }

      dependencies.add(resolved);

      if (includeType === "include_once" && includeOnceSet.has(resolved)) {
        continue;
      }
      includeOnceSet.add(resolved);

      if (visited.has(resolved)) {
        result += `\n' Circular include skipped: ${resolved}\n`;
        continue;
      }

      const includeFile = this.app.vault.getAbstractFileByPath(resolved);
      if (!(includeFile instanceof TFile)) {
        result += `\n' Include not found: ${resolved}\n`;
        continue;
      }

      visited.add(resolved);
      try {
        const includeSource = await this.app.vault.cachedRead(includeFile);
        const expandedInclude = await this.expandRecursive(
          includeSource,
          includeFile.path,
          visited,
          includeOnceSet,
          dependencies
        );

        result += `\n' Begin include: ${resolved}\n${expandedInclude}\n' End include: ${resolved}\n`;
      } finally {
        visited.delete(resolved);
      }
    }

    result += source.slice(lastIndex);
    return result;
  }

  private normalizeIncludeTarget(target: string): string {
    const withoutQuotes = target.replace(/^"|"$/g, "").replace(/^'|'$/g, "");
    return withoutQuotes.trim();
  }

  private resolveIncludePath(includeTarget: string, currentPath: string | null): string | null {
    const direct = this.app.vault.getAbstractFileByPath(includeTarget);
    if (direct instanceof TFile) {
      return direct.path;
    }

    if (!currentPath) {
      return null;
    }

    const currentFile = this.app.vault.getAbstractFileByPath(currentPath);
    const parent = currentFile instanceof TFile ? currentFile.parent?.path ?? "" : "";
    const merged = parent ? `${parent}/${includeTarget}` : includeTarget;

    const normalized = merged
      .replace(/\\/g, "/")
      .replace(/\/\.\//g, "/")
      .replace(/\/+/g, "/");

    const file = this.app.vault.getAbstractFileByPath(normalized);
    if (file instanceof TFile) {
      return file.path;
    }

    return null;
  }

  private async renderSvg(source: string): Promise<string> {
    if (this.settings.renderMode === "server") {
      return await this.renderByServer(source);
    }
    return await this.renderByLocalJar(source);
  }

  private async renderByServer(source: string): Promise<string> {
    return await this.renderByServerUrl(this.settings.serverUrl, source);
  }

  private async renderByServerUrl(url: string, source: string): Promise<string> {
    const response = await requestUrl({
      url,
      method: "POST",
      body: source,
      contentType: "text/plain; charset=utf-8"
    });

    if (response.status >= 400) {
      throw new Error(`PlantUML server error: ${response.status}`);
    }

    const svg = response.text;
    if (!svg.trim()) {
      throw new Error("PlantUML server returned an empty response.");
    }

    return svg;
  }

  private async renderByLocalJar(source: string): Promise<string> {
    try {
      const localRenderUrl = this.buildLocalServerRenderUrl(source);
      const response = await requestUrl({
        url: localRenderUrl,
        method: "GET"
      });

      if (response.status >= 400) {
        throw new Error(`Local PlantUML server error: ${response.status}`);
      }

      const svg = response.text;
      if (!svg.trim()) {
        throw new Error("Local PlantUML server returned an empty response.");
      }

      return svg;
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  private buildLocalServerRenderUrl(source: string): string {
    const configured = this.settings.localServerUrl.trim() || DEFAULT_SETTINGS.localServerUrl;
    const normalized = configured.replace(/\/+$/, "");
    const base = /\/svg$/i.test(normalized) ? normalized : `${normalized}/svg`;
    const encoded = plantumlEncoder.encode(source);
    return `${base}/${encoded}`;
  }

  private renderSvgIntoContainer(container: HTMLElement, svg: string): void {
    container.empty();
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, "image/svg+xml");
    const parseError = doc.querySelector("parsererror");
    if (parseError) {
      throw new Error("PlantUML response is not valid SVG.");
    }

    const svgElement = doc.documentElement;
    if (!svgElement || svgElement.tagName.toLowerCase() !== "svg") {
      throw new Error("PlantUML response does not contain an SVG root element.");
    }

    container.appendChild(svgElement);
  }

  private attachContextMenu(container: HTMLElement, bindingId: string): void {
    container.addEventListener("contextmenu", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();

      const menu = new Menu();
      menu.addItem((item) => {
        item.setTitle("Clear plantuml cache and re-render").onClick(async () => {
          const binding = this.renderBindings.get(bindingId);
          if (!binding) {
            return;
          }

          this.includeCache.delete(binding.cacheKey);
          await binding.render();
          new Notice("Plantuml cache cleared and diagram re-rendered.");
        });
      });

      menu.addItem((item) => {
        item.setTitle("Copy local server start command").onClick(async () => {
          const command = this.getLocalServerStartCommand();

          try {
            await navigator.clipboard.writeText(command);
            new Notice("Local server start command copied.");
          } catch (error) {
            new Notice(`Failed to copy command: ${this.errorToMessage(error)}`);
          }
        });
      });

      menu.addItem((item) => {
        item.setTitle("Copy login startup command").onClick(async () => {
          const command = this.getLoginStartupRegistrationCommand();

          if (!command) {
            new Notice("Login startup command is not available on this platform.");
            return;
          }

          try {
            await navigator.clipboard.writeText(command);
            new Notice("Login startup command copied.");
          } catch (error) {
            new Notice(`Failed to copy command: ${this.errorToMessage(error)}`);
          }
        });
      });

      menu.showAtMouseEvent(evt);
    });
  }

  private getLocalServerStartCommand(): string {
    const cmd = this.settings.javaCommand.trim() || "javaw.exe";
    const jarPath = this.settings.localJarPath.trim() || "<path-to-plantuml.jar>";
    return `${cmd} -jar "${jarPath}" -picoweb`;
  }

  private escapeForPowerShellSingleQuotedString(value: string): string {
    return value.replace(/'/g, "''");
  }

  private getLoginStartupRegistrationCommand(): string | null {
    const cmd = this.settings.javaCommand.trim() || "javaw.exe";
    const jarPath = this.settings.localJarPath.trim() || "<path-to-plantuml.jar>";

    if (Platform.isWin) {
      const escapedCommand = this.escapeForPowerShellSingleQuotedString(cmd);
      const escapedJarPath = this.escapeForPowerShellSingleQuotedString(jarPath);
      return `$runKey = 'Registry::HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'; New-Item -Path $runKey -Force | Out-Null; $javaCommand = '${escapedCommand}'; $jarPath = '${escapedJarPath}'; $javaExe = (Get-Command $javaCommand -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source); if (-not $javaExe) { $javaExe = $javaCommand }; $command = '"' + $javaExe + '" -jar "' + $jarPath + '" -picoweb'; Set-ItemProperty -Path $runKey -Name 'PlantUML PicoWeb' -Value $command`;
    }

    if (Platform.isMacOS) {
      return "launchctl load ~/Library/LaunchAgents/com.user.plantuml.picoweb.plist";
    }

    if (Platform.isLinux) {
      return "systemctl --user enable --now plantuml-picoweb.service";
    }

    return null;
  }

  private getPlatformLabel(): string | null {
    if (Platform.isWin) {
      return "Windows";
    }

    if (Platform.isMacOS) {
      return "macOS";
    }

    if (Platform.isLinux) {
      return "Linux";
    }

    return null;
  }

  private buildRenderErrorMessage(error: unknown): string {
    const message = this.errorToMessage(error);
    if (this.settings.renderMode !== "localJar") {
      return message;
    }

    const command = this.getLocalServerStartCommand();
    const startupCommand = this.getLoginStartupRegistrationCommand();
    const platformLabel = this.getPlatformLabel();
    const lines = [
      message,
      "Tip: Start a local PlantUML server and try again.",
      "Server URL example: http://127.0.0.1:8080/svg",
      `Start command: ${command}`
    ];

    if (startupCommand && platformLabel) {
      lines.push(`Start at login (${platformLabel}): ${startupCommand}`);
      lines.push("See README for the full setup steps.");
    }

    return lines.join("\n");
  }

  private getFileMtime(path: string): number | null {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      return null;
    }
    return file.stat.mtime;
  }

  private simpleHash(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  private errorToMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}

class PlantumlIntegratorSettingTab extends PluginSettingTab {
  plugin: PlantumlIntegratorPlugin;

  constructor(app: App, plugin: PlantumlIntegratorPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Rendering")
      .setHeading();

    new Setting(containerEl)
      .setName("Render mode")
      .setDesc("Choose where plantuml rendering is processed.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("server", "Server")
          .addOption("localJar", "Local jar")
          .setValue(this.plugin.settings.renderMode)
          .onChange(async (value: string) => {
            this.plugin.settings.renderMode = value === "localJar" ? "localJar" : "server";
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Plantuml server URL")
      .setDesc("Used when render mode is server. Kroki endpoint is recommended.")
      .addText((text) => {
        text
          .setPlaceholder("https://kroki.io/plantuml/svg")
          .setValue(this.plugin.settings.serverUrl)
          .onChange(async (value) => {
            this.plugin.settings.serverUrl = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Local plantuml server URL")
      .setDesc("Used when render mode is local jar. Example: http://127.0.0.1:8080/svg")
      .addText((text) => {
        text
          .setPlaceholder("http://127.0.0.1:8080/svg")
          .setValue(this.plugin.settings.localServerUrl)
          .onChange(async (value) => {
            this.plugin.settings.localServerUrl = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Local plantuml JAR path")
      .setDesc("Used to build the local server start command.")
      .addText((text) => {
        text
          .setPlaceholder("C:/tools/plantuml.jar")
          .setValue(this.plugin.settings.localJarPath)
          .onChange(async (value) => {
            this.plugin.settings.localJarPath = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Java command")
      .setDesc("Command used to execute Java (for example: javaw.exe or full path).")
      .addText((text) => {
        text
          .setPlaceholder("javaw.exe")
          .setValue(this.plugin.settings.javaCommand)
          .onChange(async (value) => {
            this.plugin.settings.javaCommand = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Process timeout (ms)")
      .setDesc("Timeout for local jar execution.")
      .addText((text) => {
        text
          .setPlaceholder("10000")
          .setValue(String(this.plugin.settings.timeoutMs))
          .onChange(async (value) => {
            const parsed = Number(value);
            this.plugin.settings.timeoutMs = Number.isFinite(parsed) && parsed > 0 ? parsed : 10000;
            await this.plugin.saveSettings();
          });
      });
  }
}
