import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/src/api";
import { Card, Input, PrimaryButton, Screen, Toast } from "@/src/components/ui";
import { useTheme, spacing, font } from "@/src/theme";

export default function EditBuilding() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const [form, setForm] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const b = await api.get<any>(`/super/buildings/${id}`);
      setForm({
        name: b.name || "", cnpj: b.cnpj || "", address: b.address || "",
        city: b.city || "", state: b.state || "", cep: b.cep || "",
        phone: b.phone || "", logo_url: b.logo_url || "",
        default_condo_fee: b.default_condo_fee != null ? String(b.default_condo_fee) : "",
      });
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form) return;
    setErr(null); setSaving(true);
    try {
      await api.put(`/super/buildings/${id}`, {
        name: form.name, cnpj: form.cnpj || null,
        address: form.address || null, city: form.city || null,
        state: form.state || null, cep: form.cep || null,
        phone: form.phone || null, logo_url: form.logo_url || null,
        default_condo_fee: form.default_condo_fee ? Number(form.default_condo_fee) : null,
      });
      setToast("Alterações salvas");
      setTimeout(() => { setToast(null); router.back(); }, 1200);
    } catch (e: any) { setErr(e.message); }
    setSaving(false);
  };

  if (loading || !form) {
    return <Screen><Text style={{ padding: spacing.xl, color: colors.muted, textAlign: "center" }}>Carregando...</Text></Screen>;
  }

  const set = (k: string) => (v: string) => setForm({ ...form, [k]: v });

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}>
          <Pressable onPress={() => router.back()} testID="back-btn"><Text style={{ color: colors.brandPrimary, fontWeight: "600" }}>← Voltar</Text></Pressable>
          <Text style={{ fontSize: font.size.xxl, fontWeight: "700", color: colors.onSurface }}>Editar prédio</Text>
          <Text style={{ color: colors.muted, fontSize: font.size.sm }}>Atualize os dados de cadastro do condomínio.</Text>

          <Card>
            <Input testID="edit-name" label="Nome do condomínio" value={form.name} onChangeText={set("name")} />
            <View style={{ height: 12 }} />
            <Input testID="edit-cnpj" label="CNPJ (opcional)" value={form.cnpj} onChangeText={set("cnpj")} />
            <View style={{ height: 12 }} />
            <Input testID="edit-phone" label="Telefone de contato" value={form.phone} onChangeText={set("phone")} keyboardType="phone-pad" />
          </Card>

          <Card>
            <Text style={{ color: colors.onSurface, fontWeight: "700", marginBottom: 8 }}>Endereço</Text>
            <Input testID="edit-cep" label="CEP" value={form.cep} onChangeText={set("cep")} />
            <View style={{ height: 12 }} />
            <Input testID="edit-address" label="Rua e número" value={form.address} onChangeText={set("address")} />
            <View style={{ height: 12 }} />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 2 }}><Input testID="edit-city" label="Cidade" value={form.city} onChangeText={set("city")} /></View>
              <View style={{ flex: 1 }}><Input testID="edit-state" label="UF" value={form.state} onChangeText={set("state")} maxLength={2} autoCapitalize="characters" /></View>
            </View>
          </Card>

          <Card>
            <Text style={{ color: colors.onSurface, fontWeight: "700", marginBottom: 4 }}>Taxa condominial</Text>
            <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 8 }}>Usada quando alguma área cobra por percentual do condomínio.</Text>
            <Input testID="edit-fee" label="Valor mensal (R$)" placeholder="Ex: 800.00" value={form.default_condo_fee} onChangeText={set("default_condo_fee")} keyboardType="decimal-pad" />
          </Card>

          {err && <Text style={{ color: colors.error }} testID="edit-err">{err}</Text>}
          <PrimaryButton testID="save-edit" title="Salvar alterações" onPress={submit} loading={saving} disabled={!form.name} />
          <PrimaryButton title="Cancelar" variant="ghost" onPress={() => router.back()} />
        </ScrollView>
      </KeyboardAvoidingView>
      {toast && <Toast message={toast} tone="success" />}
    </Screen>
  );
}
