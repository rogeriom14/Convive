import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Input, PrimaryButton, Screen } from "@/src/components/ui";
import { useTheme, spacing, font } from "@/src/theme";

export default function SelectApartment() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ building_id: string; building_name: string; tower_id: string; tower_name: string; mode?: string }>();
  const { colors } = useTheme();
  const [apt, setApt] = useState("");

  const next = () => {
    if (!apt.trim()) return;
    const target = params.mode === "register" ? "/(auth)/register-form" : "/(auth)/login-password";
    router.push({ pathname: target, params: { ...params, apartment: apt.trim() }});
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}>
          <Pressable onPress={() => router.back()} testID="back-btn"><Text style={{ color: colors.brandPrimary, fontWeight: "600" }}>← Voltar</Text></Pressable>
          <Text style={{ fontSize: font.size.xxl, fontWeight: "700", color: colors.onSurface }}>Seu apartamento</Text>
          <Text style={{ color: colors.muted, fontSize: font.size.sm }}>{params.building_name} · {params.tower_name}</Text>

          <View style={{ height: spacing.md }} />
          <Input testID="apartment-input" label="Digite o número do seu apto" placeholder="Ex: 101" value={apt} onChangeText={setApt} keyboardType="numbers-and-punctuation" autoFocus />

          <PrimaryButton testID="apartment-continue" title="Continuar" onPress={next} disabled={!apt.trim()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
