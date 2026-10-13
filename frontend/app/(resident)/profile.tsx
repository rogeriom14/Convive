import React from "react";
import { View, Text, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Card, PrimaryButton, Screen } from "@/src/components/ui";
import { useTheme, spacing, font } from "@/src/theme";
import { useAuth } from "@/src/auth-context";

export default function Profile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { user, logout, clearRememberedUnit } = useAuth();

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + 80, gap: spacing.md }}>
        <Text style={{ fontSize: font.size.xxl, fontWeight: "700", color: colors.onSurface }}>Meu perfil</Text>

        <Card>
          <Text style={{ color: colors.muted, fontSize: 13 }}>Nome</Text>
          <Text style={{ color: colors.onSurface, fontSize: font.size.lg, fontWeight: "600" }}>{user?.name}</Text>
          <View style={{ height: spacing.md }} />
          <Text style={{ color: colors.muted, fontSize: 13 }}>E-mail</Text>
          <Text style={{ color: colors.onSurface }}>{user?.email}</Text>
        </Card>

        <Card>
          <Text style={{ color: colors.muted, fontSize: 13 }}>Unidade vinculada</Text>
          <Text style={{ color: colors.onSurface, fontSize: font.size.lg, fontWeight: "700", marginTop: 4 }}>{user?.building?.name}</Text>
          <Text style={{ color: colors.onSurface }}>{user?.tower?.name} · Apto {user?.apartment}</Text>
        </Card>

        <PrimaryButton testID="profile-logout" title="Sair" variant="outline" onPress={async () => {
          await clearRememberedUnit(); await logout(); router.replace("/(auth)/welcome");
        }} />
      </ScrollView>
    </Screen>
  );
}
