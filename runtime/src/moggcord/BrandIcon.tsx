import { Image } from "react-native";
import icon from "@assets/icons/moggcord.png";

export const moggcordIconSource = { uri: icon };

/** Keep the original full-color artwork out of Discord's monochrome icon renderer. */
export function MoggcordIcon() {
    return <Image source={moggcordIconSource} style={{ width: 28, height: 28 }}
        resizeMode="contain" accessibilityIgnoresInvertColors accessible={false} />;
}
