import { addIcon, App, Menu } from "obsidian";
import { vaults_picker } from "./variables.ts";
import { vaultPaths } from "./getVaults.ts";
import StatusBarVaultName from "./main.ts";

addIcon("buttonSVG", vaults_picker);

export function vaultsMenu(plugin: StatusBarVaultName, app: App, evt: MouseEvent): void {
    const menu = new Menu();

    menu.addItem((item) => {
        item
            .setTitle(`${plugin.settings.reducedAtStart ? "Maximize" : "Minimize"} Vault Name`)
            .onClick(async () => {
                plugin.settings.reducedAtStart = !plugin.settings.reducedAtStart;
                await plugin.saveSettings();
            });
    });

    menu.addSeparator();

    const currentVaultPath = (app.vault.adapter as any).basePath;

    vaultPaths.forEach((vaultPath) => {
        const vaultName = getName(vaultPath);
        const title = currentVaultPath === vaultPath ? `${vaultName}\u00A0\u00A0\u00A0\u2713` : vaultName;

        menu.addItem((item) => {
            item
                .setTitle(title)
                .onClick(async () => {
                    if (currentVaultPath !== vaultPath) {
                        window.open(`obsidian://open?vault=${encodeURIComponent(vaultName)}`
                        );
                    }
                });
        });
    });

    menu.addSeparator();

    menu.addItem((item) => {
        item
            .setTitle('Vaults')
            .setIcon("buttonSVG")
            .onClick(async () => {
                (app as any).openVaultChooser();
            });

    });
    menu.showAtMouseEvent(evt);
}

function getName(path: string): string {
    return path.split(/[/\\]/).pop() || "";
}