import { PluginSettingTab, App, Setting } from "obsidian";
import StatusBarVaultName from "./main.ts";

export class Settings extends PluginSettingTab {
    plugin: StatusBarVaultName;

    constructor(app: App, plugin: StatusBarVaultName) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName("Enable vault name")
            .setDesc("Show the vault Name in the status bar (vault list in submenu)")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableVaultName)
                .onChange(async (value) => {
                    this.plugin.settings.enableVaultName = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName("Vault Name Color")
            .setDesc("Choose the color of the vault name in the status bar")
            .addColorPicker(color => color
                .setValue(this.plugin.settings.color)
                .onChange(async (value) => {
                    this.plugin.settings.color = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName("Font Size")
            .setDesc("Adjust the font size of the vault name (in em)")
            .addSlider(slider => slider
                .setLimits(1, 3, 0.1)
                .setValue(this.plugin.settings.fontSize)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.fontSize = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName("Enable Maximum Length")
            .setDesc("Truncate the vault name if it exceeds the maximum length")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableMaxLength)
                .onChange(async (value) => {
                    this.plugin.settings.enableMaxLength = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName("Maximum Length")
            .setDesc("Maximum number of characters to display in the vault name")
            .addSlider(slider => slider
                .setLimits(5, 30, 1)
                .setValue(this.plugin.settings.maxVaultNameLength)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.maxVaultNameLength = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName("Enable Line Width Control")
            .setDesc("Show a control in the status bar to adjust the editor line width")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableLineWidth)
                .onChange(async (value) => {
                    this.plugin.settings.enableLineWidth = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName("Line Width Color")
            .setDesc("Choose the color of the line width icon in the status bar")
            .addColorPicker(color => color
                .setValue(this.plugin.settings.lineWidthColor)
                .onChange(async (value) => {
                    this.plugin.settings.lineWidthColor = value;
                    await this.plugin.saveSettings();
                })
            );
    }
}
