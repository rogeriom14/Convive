import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, radius } from "@/src/theme";

export function ConviveIcon({ size = 56 }: { size?: number }) {
  const r = size * 0.28;
  const strokeW = size * 0.13;
  const dot = size * 0.22;
  return (
    <View style={[styles.iconBox, { width: size, height: size, borderRadius: size * 0.28, backgroundColor: colors.brandPrimary }]}>
      {/* C shape */}
      <View style={{
        width: size * 0.62, height: size * 0.62, borderRadius: (size * 0.62) / 2,
        borderWidth: strokeW, borderColor: "#FFFFFF",
        borderRightColor: "transparent", transform: [{ rotate: "-45deg" }],
      }} />
      {/* Mint dot */}
      <View style={{
        position: "absolute", right: size * 0.22, top: size * 0.5 - dot / 2,
        width: dot, height: dot, borderRadius: dot / 2, backgroundColor: colors.success,
      }} />
    </View>
  );
}

export function ConviveLogo({ size = 40, showName = true, dark = false }: { size?: number; showName?: boolean; dark?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <ConviveIcon size={size} />
      {showName && (
        <Text style={{ fontSize: size * 0.62, fontWeight: "700", color: dark ? "#FFFFFF" : colors.onSurface, letterSpacing: -0.5 }}>
          convive
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  iconBox: { alignItems: "center", justifyContent: "center" },
});
