import { Plugin } from 'obsidian';
import { Settings } from './settings.ts';
import { vaultsMenu } from './menu.ts';
import { DEFAULT_SETTINGS } from './variables.ts';
import type { SBVNSettings } from './interfaces.ts';
import { VaultName } from './vault-name.ts';

export default class StatusBarVaultName extends Plugin {
  settings!: SBVNSettings;
  vaultName!: VaultName;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new Settings(this.app, this));
    const statusBar = this.app.statusBar.containerEl;

    this.vaultName = new VaultName(
      () => this.settings,
      () => this.app.vault.getName(),
      statusBar,
      this.registerDomEvent.bind(this),
      (e) => vaultsMenu(this, this.app, e)
    );
  }

  onunload(): void {
    this.vaultName.getEl().detach();
  }

  async loadSettings(): Promise<void> {
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(await this.loadData())
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.vaultName.updateStyle();
    this.vaultName.updateName();
    this.vaultName.updateTooltip();
    this.vaultName.updateVisibility();
  }
}
