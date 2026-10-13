import React, { useState, useEffect } from "react";
import { View, Text, KeyboardAvoidingView, Platform, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Input, PrimaryButton, Screen, Card } from "@/src/components/ui";
import { useTheme, spacing, font } from "@/src/theme";
import { useAuth } from "@/src/auth-context";

export default function LoginPassword() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<any>();
  const { colors } = useTheme();
  const { loginResident, rememberUnit, rememberedUnit } = useAuth();
  const [pw, setPw] = useState(""); const [err, setErr] = useState<string | null>(null); const [loading, setLoading] = useState(false);

  const unit = params.building_id ? {
    building_id: params.building_id, building_name: params.building_name,
    tower_id: params.tower_id, tower_name: params.tower_name, apartment: params.apartment,
  } : rememberedUnit ? {
    building_id: rememberedUnit.building.id, building_name: rememberedUnit.building.name,
    tower_id: rememberedUnit.tower.id, tower_name: rememberedUnit.tower.name, apartment: rememberedUnit.apartment,
  } : null;

  useEffect(() => { if (!unit) router.replace("/(auth)/welcome"); }, []);
  if (!unit) return null;

  const submit = async () => {
    setErr(null); setLoading(true);
    try {
      const user = await loginResident({ building_id: unit.building_id, tower_id: unit.tower_id, apartment: unit.apartment, password: pw });
      await rememberUnit({
        building: { id: unit.building_id, name: unit.building_name },
        tower: { id: unit.tower_id, name: unit.tower_name },
        apartment: unit.apartment,
      });
      if (user.status !== "approved") router.replace("/(auth)/pending");
      else router.replace("/(resident)/home");
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}>
          <Pressable onPress={() => router.back()} testID="back-btn"><Text style={{ color: colors.brandPrimary, fontWeight: "600" }}>← Voltar</Text></Pressable>
          <Text style={{ fontSize: font.size.xxl, fontWeight: "700", color: colors.onSurface }}>Digite sua senha</Text>
          <Card>
            <Text style={{ color: colors.muted, fontSize: 13 }}>Entrar como</Text>
            <Text style={{ color: colors.onSurface, fontSize: font.size.lg, fontWeight: "700", marginTop: 4 }}>
              {unit.building_name} · {unit.tower_name} · Apto {unit.apartment}
            </Text>
          </Card>
          <Input testID="login-password" label="Senha" value={pw} onChangeText={setPw} secureTextEntry />
          {err && <Text style={{ color: colors.error }} testID="login-error">{err}</Text>}
          <PrimaryButton testID="login-submit" title="Entrar" onPress={submit} loading={loading} disabled={!pw} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
