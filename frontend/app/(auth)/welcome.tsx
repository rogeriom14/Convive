import React from "react";
import { View, Text, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ConviveLogo } from "@/src/components/logo";
import { PrimaryButton, Screen } from "@/src/components/ui";
import { useTheme, spacing, font } from "@/src/theme";
import { useAuth } from "@/src/auth-context";

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { rememberedUnit } = useAuth();

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: insets.top + spacing.xxl, gap: spacing.xl }}>
        <View style={{ alignItems: "center", gap: spacing.md, marginTop: spacing.xxl }}>
          <ConviveLogo size={72} />
          <Text style={{ color: colors.muted, fontSize: font.size.base, marginTop: spacing.sm }}>Seu condomínio, mais perto</Text>
        </View>

        <View style={{ gap: spacing.md, marginTop: spacing.xxl }}>
          {rememberedUnit ? (
            <PrimaryButton
              testID="welcome-quick-login"
              title={`Entrar como ${rememberedUnit.building?.name} · ${rememberedUnit.tower?.name} · Apto ${rememberedUnit.apartment}`}
              onPress={() => router.push("/(auth)/login-password")}
            />
          ) : null}
          <PrimaryButton
            testID="welcome-login-resident"
            title={rememberedUnit ? "Entrar com outra unidade" : "Sou morador"}
            variant={rememberedUnit ? "outline" : "primary"}
            onPress={() => router.push("/(auth)/select-building")}
          />
          <PrimaryButton
            testID="welcome-register"
            title="Criar cadastro"
            variant="outline"
            onPress={() => router.push({ pathname: "/(auth)/select-building", params: { mode: "register" } })}
          />
          <PrimaryButton
            testID="welcome-login-admin"
            title="Sou administrador"
            variant="ghost"
            onPress={() => router.push("/(auth)/login-admin")}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}
