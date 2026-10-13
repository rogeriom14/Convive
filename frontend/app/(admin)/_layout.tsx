import React from "react";
import { Tabs } from "expo-router";
import { useTheme } from "@/src/theme";
import { ColorValue, Text } from "react-native";

function TabIcon({ label, color }: { label: string; focused: boolean; color: ColorValue }) {
  return <Text style={{ color, fontSize: 22 }}>{label}</Text>;
}

export default function AdminLayout() {
  const { colors } = useTheme();
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.brandPrimary,
      tabBarInactiveTintColor: colors.muted,
      tabBarStyle: { backgroundColor: colors.surfaceSecondary, borderTopColor: colors.divider },
      tabBarItemStyle: { alignSelf: "center" },
    }}>
      <Tabs.Screen name="dashboard" options={{ title: "Painel", tabBarIcon: (p) => <TabIcon label="📊" {...p} /> }} />
      <Tabs.Screen name="approvals" options={{ title: "Aprovações", tabBarIcon: (p) => <TabIcon label="✅" {...p} /> }} />
      <Tabs.Screen name="reservations" options={{ title: "Reservas", tabBarIcon: (p) => <TabIcon label="📅" {...p} /> }} />
      <Tabs.Screen name="manage" options={{ title: "Gestão", tabBarIcon: (p) => <TabIcon label="⚙️" {...p} /> }} />
    </Tabs>
  );
}
