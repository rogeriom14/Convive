import React from "react";
import { Tabs } from "expo-router";
import { useTheme } from "@/src/theme";
import { ColorValue, Text } from "react-native";

function TabIcon({ label, color }: { label: string; focused: boolean; color: ColorValue }) {
  return <Text style={{ color, fontSize: 22 }}>{label}</Text>;
}

export default function ResidentLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surfaceSecondary, borderTopColor: colors.divider },
        tabBarItemStyle: { alignSelf: "center" },
      }}
    >
      <Tabs.Screen name="home" options={{ title: "Início", tabBarIcon: (p) => <TabIcon label="🏠" {...p} /> }} />
      <Tabs.Screen name="reservations" options={{ title: "Reservas", tabBarIcon: (p) => <TabIcon label="📅" {...p} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Perfil", tabBarIcon: (p) => <TabIcon label="👤" {...p} /> }} />
      <Tabs.Screen name="area/[id]" options={{ href: null }} />
    </Tabs>
  );
}
