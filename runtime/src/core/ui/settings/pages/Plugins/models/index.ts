import { Author } from "@lib/addons/types";
import { ImageSourcePropType } from "react-native";

interface Badge {
    source: ImageSourcePropType;
    color?: string;
    onPress?: () => void;
}

export interface UnifiedPluginModel {
    id: string;
    name: string;
    description?: string;
    authors?: Author[];
    icon?: string;
    /** Moggcord's own plugins, built into the app */
    moggcord?: boolean;
    /** Position in Moggcord PC's list of popular plugins */
    popular?: number;
    /** Moggcord PC's tags */
    tags?: string[];
    /** Arrived in the last two days */
    isNew?: boolean;
    getBadges(): Badge[];
    isEnabled(): boolean;
    usePluginState(): void;
    isInstalled(): boolean;
    toggle(start: boolean): void;
    resolveSheetComponent(): Promise<{ default: React.ComponentType<any>; }>;
    getPluginSettingsComponent(): React.ComponentType<any> | null | undefined;
}
