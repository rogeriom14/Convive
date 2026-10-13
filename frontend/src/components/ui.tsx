import React from "react";
import { Pressable, Text, View, ActivityIndicator, TextInput, StyleSheet, TextInputProps, PressableProps } from "react-native";
import { useTheme, spacing, radius, font } from "@/src/theme";

export function PrimaryButton({ title, onPress, loading, disabled, testID, variant = "primary" }: {
  title: string; onPress?: () => void; loading?: boolean; disabled?: boolean; testID?: string;
  variant?: "primary" | "outline" | "ghost" | "success" | "danger";
}) {
  const { colors } = useTheme();
  const bg = variant === "primary" ? colors.brandPrimary
    : variant === "outline" ? "transparent"
    : variant === "ghost" ? "transparent"
    : variant === "success" ? colors.success
    : colors.error;
  const fg = variant === "outline" || variant === "ghost" ? colors.brandPrimary : "#FFFFFF";
  const borderColor = variant === "outline" ? colors.brandPrimary : "transparent";
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [{
        backgroundColor: bg, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: spacing.lg,
        alignItems: "center", justifyContent: "center", minHeight: 48,
        borderWidth: variant === "outline" ? 1.5 : 0, borderColor,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      }]}
    >
      {loading ? <ActivityIndicator color={fg} />
        : <Text style={{ color: fg, fontSize: font.size.base, fontWeight: "600" }}>{title}</Text>}
    </Pressable>
  );
}

export function Input({ label, testID, error, ...props }: TextInputProps & { label?: string; error?: string; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {label && <Text style={{ color: colors.onSurface, fontSize: font.size.sm, fontWeight: "600" }}>{label}</Text>}
      <TextInput
        testID={testID}
        placeholderTextColor={colors.muted}
        {...props}
        style={[{
          borderWidth: 1, borderColor: error ? colors.error : colors.border,
          backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
          paddingHorizontal: 14, paddingVertical: 12, fontSize: font.size.base,
          color: colors.onSurface, minHeight: 48,
        }, props.style as any]}
      />
      {error ? <Text style={{ color: colors.error, fontSize: 13 }}>{error}</Text> : null}
    </View>
  );
}

export function Card({ children, style, testID }: { children: React.ReactNode; style?: any; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={[{
      backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg,
      shadowColor: "#2D2A5A", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
    }, style]}>{children}</View>
  );
}

export function Badge({ text, tone = "info", testID }: { text: string; tone?: "info" | "success" | "warning" | "error"; testID?: string }) {
  const { colors } = useTheme();
  const map = {
    info: { bg: colors.brandTertiary, fg: colors.onBrandTertiary },
    success: { bg: colors.success, fg: colors.onSuccess },
    warning: { bg: colors.warning, fg: colors.onWarning },
    error: { bg: colors.error, fg: colors.onError },
  };
  const c = map[tone];
  return (
    <View testID={testID} style={{ backgroundColor: c.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: "flex-start" }}>
      <Text style={{ color: c.fg, fontSize: 12, fontWeight: "700" }}>{text}</Text>
    </View>
  );
}

export function Screen({ children, style }: { children: React.ReactNode; style?: any }) {
  const { colors } = useTheme();
  return <View style={[{ flex: 1, backgroundColor: colors.surface }, style]}>{children}</View>;
}

export function Row({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[{ flexDirection: "row", alignItems: "center" }, style]}>{children}</View>;
}

export function Toast({ message, tone = "success" }: { message: string; tone?: "success" | "error" | "info" }) {
  const { colors } = useTheme();
  const bg = tone === "success" ? colors.success : tone === "error" ? colors.error : colors.brandPrimary;
  return (
    <View style={{
      position: "absolute", left: 16, right: 16, bottom: 24, backgroundColor: bg,
      padding: 14, borderRadius: radius.md, alignItems: "center",
    }}>
      <Text style={{ color: "#FFFFFF", fontWeight: "600" }}>{message}</Text>
    </View>
  );
}
