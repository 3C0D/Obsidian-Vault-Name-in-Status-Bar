import { addIcon, App, Menu } from "obsidian";
import { vaults_picker } from "./variables";
import { vaultPaths } from "./getVaults";

addIcon("buttonSVG", vaults_picker);

export function vaultsMenu(app: App, evt: MouseEvent) {
    const menu = new Menu()

    menu.addItem((item) => {
        item
            .setTitle(`${this.settings.reducedAtStart ? "Maximize" : "Minimize"} Vault Name`)
            .onClick(async () => {
                this.settings.reducedAtStart = !this.settings.reducedAtStart
                await this.saveSettings();
            })
    })

    menu.addSeparator();

    const currentVaultPath = app.vault.adapter.basePath;

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
                })
        })
    })

    menu.addSeparator();

    menu.addItem((item) => {
        item
            .setTitle('Vaults')
            .setIcon("buttonSVG")
            .onClick(async () => {
                app.openVaultChooser();
            })

    })
    menu.showAtMouseEvent(evt);
}

function getName(path: string) {
    return path.split(/[/\\]/).pop() || "";
}