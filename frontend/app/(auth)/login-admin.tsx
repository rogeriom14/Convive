import React, { useState } from "react";
import { View, Text, KeyboardAvoidingView, Platform, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Input, PrimaryButton, Screen } from "@/src/components/ui";
import { ConviveLogo } from "@/src/components/logo";
import { useTheme, spacing, font } from "@/src/theme";
import { useAuth } from "@/src/auth-context";

export default function LoginAdmin() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { loginAdmin } = useAuth();
  const [email, setEmail] = useState(""); const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null); const [loading, setLoading] = useState(false);

  const submit = async () => {
    setErr(null); setLoading(true);
    try {
      const u = await loginAdmin({ email, password: pw });
      if (u.role === "super_admin") router.replace("/(super)/dashboard");
      else router.replace("/(admin)/dashboard");
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}>
          <Pressable onPress={() => router.back()} testID="back-btn"><Text style={{ color: colors.brandPrimary, fontWeight: "600" }}>← Voltar</Text></Pressable>
          <View style={{ alignItems: "center", marginTop: spacing.lg, marginBottom: spacing.xl }}><ConviveLogo size={56} /></View>
          <Text style={{ fontSize: font.size.xxl, fontWeight: "700", color: colors.onSurface }}>Acesso administrativo</Text>
          <Text style={{ color: colors.muted, fontSize: font.size.sm }}>Para síndicos, subsíndicos, portaria e super administrador.</Text>
          <Input testID="admin-email" label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <Input testID="admin-password" label="Senha" value={pw} onChangeText={setPw} secureTextEntry />
          {err && <Text style={{ color: colors.error }} testID="admin-login-error">{err}</Text>}
          <PrimaryButton testID="admin-login-submit" title="Entrar" onPress={submit} loading={loading} disabled={!email || !pw} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
