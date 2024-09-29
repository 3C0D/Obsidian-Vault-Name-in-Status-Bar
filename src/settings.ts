import { PluginSettingTab, App, Setting } from "obsidian";
import StatusBarVaultName from "./main";

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
            .setName("Color")
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
                .setValue(this.plugin.settings.maxTitleLength)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.maxTitleLength = value;
                    await this.plugin.saveSettings();
                })
            );
    }
}

