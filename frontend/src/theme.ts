// Convive design tokens - Light + Dark
import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#F5F4FB",
  onSurface: "#2D2A5A",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#2D2A5A",
  surfaceTertiary: "#F0EEFA",
  onSurfaceTertiary: "#2D2A5A",
  surfaceInverse: "#2D2A5A",
  onSurfaceInverse: "#FFFFFF",
  muted: "#6C6A8A",

  brand: "#6C5CE7",
  onBrand: "#FFFFFF",
  brandPrimary: "#6C5CE7",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#8374EB",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#E8E5FB",
  onBrandTertiary: "#6C5CE7",

  success: "#00C2A8",
  onSuccess: "#FFFFFF",
  warning: "#FFB547",
  onWarning: "#2D2A5A",
  error: "#FF6B6B",
  onError: "#FFFFFF",
  info: "#C9C7D9",
  onInfo: "#2D2A5A",

  border: "#C9C7D9",
  borderStrong: "#6C6A8A",
  divider: "#EAE8F4",
};

const dark: typeof light = {
  surface: "#16142E",
  onSurface: "#FFFFFF",
  surfaceSecondary: "#24214A",
  onSurfaceSecondary: "#FFFFFF",
  surfaceTertiary: "#1F1C3D",
  onSurfaceTertiary: "#FFFFFF",
  surfaceInverse: "#FFFFFF",
  onSurfaceInverse: "#16142E",
  muted: "#C9C7D9",

  brand: "#6C5CE7",
  onBrand: "#FFFFFF",
  brandPrimary: "#6C5CE7",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#8374EB",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#2D2A5A",
  onBrandTertiary: "#C9C7D9",

  success: "#00C2A8",
  onSuccess: "#FFFFFF",
  warning: "#FFB547",
  onWarning: "#16142E",
  error: "#FF6B6B",
  onError: "#FFFFFF",
  info: "#6C6A8A",
  onInfo: "#FFFFFF",

  border: "#2D2A5A",
  borderStrong: "#6C6A8A",
  divider: "#1F1C3D",
};

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;
export const themes: { light: ThemeColors; dark?: ThemeColors } = { light, dark };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };
export const font = {
  regular: "System",
  semibold: "System",
  weight: { regular: "400" as const, medium: "500" as const, semibold: "600" as const, bold: "700" as const },
  size: { sm: 15, base: 16, lg: 18, xl: 22, xxl: 28 },
};

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}
setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system && system !== "unspecified" && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

// Legacy alias
export const colors = light;
