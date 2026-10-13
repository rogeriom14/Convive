import React from "react";
import { View, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { PrimaryButton, Screen, Card } from "@/src/components/ui";
import { useTheme, spacing, font } from "@/src/theme";

export default function PendingPostRegister() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <Screen>
      <View style={{ flex: 1, padding: spacing.xl, paddingTop: insets.top + spacing.xxxl, gap: spacing.lg, alignItems: "center", justifyContent: "center" }}>
        <View style={{ backgroundColor: colors.warning, width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 44 }}>⏳</Text>
        </View>
        <Text style={{ fontSize: font.size.xxl, fontWeight: "700", color: colors.onSurface, textAlign: "center" }}>Cadastro enviado!</Text>
        <Text style={{ color: colors.muted, textAlign: "center", fontSize: font.size.base, lineHeight: 22 }}>
          Sua solicitação foi enviada ao síndico. Você receberá um aviso assim que for aprovado.
        </Text>
        <PrimaryButton testID="pending-back" title="Voltar ao início" onPress={() => router.replace("/(auth)/welcome")} />
      </View>
    </Screen>
  );
}
