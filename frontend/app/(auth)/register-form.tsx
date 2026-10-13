import React, { useState } from "react";
import { View, Text, ScrollView, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Input, PrimaryButton, Screen, Card } from "@/src/components/ui";
import { useTheme, spacing, font } from "@/src/theme";
import { api } from "@/src/api";

export default function RegisterForm() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<any>();
  const { colors } = useTheme();
  const [name, setName] = useState(""); const [phone, setPhone] = useState("");
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [pw2, setPw2] = useState("");
  const [err, setErr] = useState<string | null>(null); const [step, setStep] = useState<"form" | "review">("form");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setErr(null); setLoading(true);
    try {
      await api.post("/auth/register-resident", {
        building_id: params.building_id, tower_id: params.tower_id, apartment: params.apartment,
        name, phone, email, password: pw,
      });
      router.replace("/(auth)/pending-post-register");
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  };

  if (step === "review") {
    return (
      <Screen>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl, gap: spacing.lg }}>
          <Pressable onPress={() => setStep("form")} testID="back-btn"><Text style={{ color: colors.brandPrimary, fontWeight: "600" }}>← Voltar</Text></Pressable>
          <Text style={{ fontSize: font.size.xxl, fontWeight: "700", color: colors.onSurface }}>Revisar cadastro</Text>
          <Text style={{ color: colors.muted }}>Confirme se está tudo certo antes de enviar.</Text>
          <Card>
            <Text style={{ color: colors.muted, fontSize: 13 }}>Unidade</Text>
            <Text style={{ color: colors.onSurface, fontSize: font.size.lg, fontWeight: "700", marginTop: 4 }}>
              {params.building_name} · {params.tower_name} · Apto {params.apartment}
            </Text>
          </Card>
          <Card>
            <Row label="Nome" value={name} /><Row label="Telefone" value={phone} />
            <Row label="E-mail" value={email} />
          </Card>
          {err && <Text style={{ color: colors.error }}>{err}</Text>}
          <PrimaryButton testID="submit-register" title={loading ? "Enviando..." : "Confirmar cadastro"} onPress={submit} loading={loading} />
        </ScrollView>
      </Screen>
    );
  }

  const valid = name && phone && email && pw.length >= 6 && pw === pw2;

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}>
          <Pressable onPress={() => router.back()} testID="back-btn"><Text style={{ color: colors.brandPrimary, fontWeight: "600" }}>← Voltar</Text></Pressable>
          <Text style={{ fontSize: font.size.xxl, fontWeight: "700", color: colors.onSurface }}>Seus dados</Text>
          <Text style={{ color: colors.muted, fontSize: font.size.sm }}>{params.building_name} · {params.tower_name} · Apto {params.apartment}</Text>

          <Input testID="reg-name" label="Nome completo" value={name} onChangeText={setName} />
          <Input testID="reg-phone" label="Telefone / WhatsApp" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <Input testID="reg-email" label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <Input testID="reg-pw" label="Senha (mínimo 6)" value={pw} onChangeText={setPw} secureTextEntry />
          <Input testID="reg-pw2" label="Confirme a senha" value={pw2} onChangeText={setPw2} secureTextEntry
            error={pw2 && pw !== pw2 ? "Senhas não coincidem" : undefined} />
          <PrimaryButton testID="reg-review" title="Revisar" onPress={() => setStep("review")} disabled={!valid} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
      <Text style={{ color: colors.muted }}>{label}</Text>
      <Text style={{ color: colors.onSurface, fontWeight: "600" }}>{value}</Text>
    </View>
  );
}
