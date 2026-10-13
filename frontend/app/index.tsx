import React, { useEffect } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/src/auth-context";
import { ConviveLogo } from "@/src/components/logo";
import { colors } from "@/src/theme";

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", gap: 24 }} testID="splash-screen">
        <ConviveLogo size={72} dark />
        <Text style={{ color: "#FFFFFF", fontSize: 16, opacity: 0.9 }}>Seu condomínio, mais perto</Text>
        <ActivityIndicator color="#FFFFFF" style={{ marginTop: 12 }} />
      </View>
    );
  }

  if (!user) return <Redirect href="/(auth)/welcome" />;
  if (user.role === "resident" && user.status !== "approved") return <Redirect href="/(auth)/pending" />;
  if (user.role === "super_admin") return <Redirect href="/(super)/dashboard" />;
  if (user.role === "admin") return <Redirect href="/(admin)/dashboard" />;
  return <Redirect href="/(resident)/home" />;
}
