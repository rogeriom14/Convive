import React from "react";
import { View, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { PrimaryButton, Screen } from "@/src/components/ui";
import { useTheme, spacing, font } from "@/src/theme";
import { useAuth } from "@/src/auth-context";

export default function Pending() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { logout, refresh } = useAuth();
  return (
    <Screen>
      <View style={{ flex: 1, padding: spacing.xl, paddingTop: insets.top + spacing.xxxl, gap: spacing.lg, alignItems: "center", justifyContent: "center" }}>
        <View style={{ backgroundColor: colors.warning, width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 44 }}>⏳</Text>
        </View>
        <Text style={{ fontSize: font.size.xxl, fontWeight: "700", color: colors.onSurface, textAlign: "center" }}>Aguardando aprovação</Text>
        <Text style={{ color: colors.muted, textAlign: "center", fontSize: font.size.base, lineHeight: 22 }}>
          Seu cadastro está sob análise do síndico. Assim que aprovado, você poderá reservar as áreas do seu prédio.
        </Text>
        <PrimaryButton testID="pending-refresh" title="Verificar novamente" onPress={async () => { await refresh(); router.replace("/"); }} />
        <PrimaryButton testID="pending-logout" title="Sair" variant="ghost" onPress={async () => { await logout(); router.replace("/(auth)/welcome"); }} />
      </View>
    </Screen>
  );
}
