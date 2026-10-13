import React, { useCallback, useState } from "react";
import { View, Text, FlatList, RefreshControl, Pressable, Modal, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/src/api";
import { Card, Input, PrimaryButton, Screen, Badge, Toast } from "@/src/components/ui";
import { useTheme, spacing, font, radius } from "@/src/theme";

export default function ResidentsList() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { bid } = useLocalSearchParams<{ bid: string }>();
  const { colors } = useTheme();
  const [building, setBuilding] = useState<any>(null);
  const [residents, setResidents] = useState<any[]>([]);
  const [towers, setTowers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({ name: "", email: "", phone: "", tower_id: "", apartment: "", status: "approved" });
  const [err, setErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<any>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, r, t] = await Promise.all([
        api.get(`/super/buildings/${bid}`),
        api.get(`/super/buildings/${bid}/residents`),
        api.get(`/super/buildings/${bid}/towers`),
      ]);
      setBuilding(b); setResidents(r); setTowers(t);
    } catch {}
    setLoading(false);
  }, [bid]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 1600); };

  const openEdit = (r: any) => {
    setEditing(r);
    setForm({
      name: r.name || "", email: r.email || "", phone: r.phone || "",
      tower_id: r.tower_id || "", apartment: r.apartment || "",
      status: r.status || "approved",
    });
    setErr(null);
  };
  const close = () => { setEditing(null); setErr(null); };

  const save = async () => {
    setErr(null);
    if (!form.name || !form.email || !form.tower_id || !form.apartment) {
      setErr("Preencha nome, e-mail, torre e apartamento"); return;
    }
    try {
      await api.put(`/super/residents/${editing.id}`, {
        name: form.name, email: form.email, phone: form.phone || null,
        tower_id: form.tower_id, apartment: form.apartment, status: form.status,
      });
      showToast("Morador atualizado");
      close(); load();
    } catch (e: any) { setErr(e.message); }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      await api.del(`/super/residents/${confirmDelete.id}`);
      setConfirmDelete(null); showToast("Morador excluído"); load();
    } catch {}
  };

  return (
    <Screen>
      <FlatList
        data={residents}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <Pressable onPress={() => router.back()} testID="back-btn"><Text style={{ color: colors.brandPrimary, fontWeight: "600" }}>← Voltar</Text></Pressable>
            <Text style={{ color: colors.muted, fontSize: 13 }}>Prédio</Text>
            <Text style={{ fontSize: font.size.xl, fontWeight: "700", color: colors.onSurface }}>{building?.name || "..."}</Text>
            <Text style={{ fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface, marginTop: spacing.md }}>Moradores cadastrados</Text>
          </View>
        }
        ListEmptyComponent={!loading ? <Text style={{ color: colors.muted, textAlign: "center", marginTop: spacing.md }}>Nenhum morador cadastrado.</Text> : null}
        renderItem={({ item }) => (
          <Card testID={`resident-card-${item.id}`}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <Text style={{ fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface, flex: 1 }}>{item.name}</Text>
              {item.status === "pending" ? <Badge text="Pendente" tone="warning" /> : <Badge text="Aprovado" tone="success" />}
            </View>
            <Text style={{ color: colors.onSurface, marginTop: 4, fontWeight: "600" }}>{item.tower_name || "-"} · Apto {item.apartment}</Text>
            <Text style={{ color: colors.muted, fontSize: 13, marginTop: 2 }}>{item.email}{item.phone ? ` · ${item.phone}` : ""}</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.md }}>
              <Pressable testID={`edit-resident-${item.id}`} onPress={() => openEdit(item)}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: colors.brandPrimary, alignItems: "center" }}>
                <Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>Editar</Text>
              </Pressable>
              <Pressable testID={`del-resident-${item.id}`} onPress={() => setConfirmDelete(item)}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.error, alignItems: "center" }}>
                <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>Excluir</Text>
              </Pressable>
            </View>
          </Card>
        )}
      />

      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={close}>
        <View style={{ flex: 1, backgroundColor: "rgba(45,42,90,0.5)", justifyContent: "flex-end" }}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView style={{ backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%" }}
              contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.lg }}>
              <Text style={{ fontSize: font.size.xl, fontWeight: "700", color: colors.onSurface }}>Editar morador</Text>
              <Input testID="res-name" label="Nome" value={form.name} onChangeText={v => setForm({ ...form, name: v })} />
              <Input testID="res-email" label="E-mail" value={form.email} onChangeText={v => setForm({ ...form, email: v })} autoCapitalize="none" keyboardType="email-address" />
              <Input testID="res-phone" label="Telefone" value={form.phone} onChangeText={v => setForm({ ...form, phone: v })} keyboardType="phone-pad" />
              <Text style={{ color: colors.onSurface, fontWeight: "600" }}>Torre</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {towers.map(t => (
                  <Pressable key={t.id} testID={`res-tower-${t.id}`} onPress={() => setForm({ ...form, tower_id: t.id })} style={{
                    paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill,
                    backgroundColor: form.tower_id === t.id ? colors.brandPrimary : colors.surfaceTertiary,
                  }}>
                    <Text style={{ color: form.tower_id === t.id ? "#FFFFFF" : colors.onSurface, fontWeight: "600" }}>{t.name}</Text>
                  </Pressable>
                ))}
              </View>
              <Input testID="res-apt" label="Apartamento" value={form.apartment} onChangeText={v => setForm({ ...form, apartment: v })} />
              <Text style={{ color: colors.onSurface, fontWeight: "600" }}>Status</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["approved","pending"] as const).map(s => (
                  <Pressable key={s} testID={`res-status-${s}`} onPress={() => setForm({ ...form, status: s })} style={{
                    flex: 1, paddingVertical: 10, borderRadius: radius.pill,
                    backgroundColor: form.status === s ? (s === "approved" ? colors.success : colors.warning) : colors.surfaceTertiary,
                    alignItems: "center",
                  }}>
                    <Text style={{ color: form.status === s ? "#FFFFFF" : colors.onSurface, fontWeight: "600" }}>
                      {s === "approved" ? "Aprovado" : "Pendente"}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {err && <Text style={{ color: colors.error }} testID="res-err">{err}</Text>}
              <PrimaryButton testID="save-resident" title="Salvar alterações" onPress={save} />
              <PrimaryButton title="Cancelar" variant="ghost" onPress={close} />
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={!!confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(45,42,90,0.6)", justifyContent: "center", padding: spacing.lg }}>
          <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: 20, padding: spacing.lg, gap: spacing.md }}>
            <Text style={{ fontSize: font.size.xl, fontWeight: "700", color: colors.onSurface }}>Excluir morador?</Text>
            <Text style={{ color: colors.muted }}>
              {`"${confirmDelete?.name || ""}"`} perderá o acesso ao app. Reservas passadas continuarão registradas.
            </Text>
            <PrimaryButton testID="confirm-del-resident" title="Sim, excluir" variant="danger" onPress={doDelete} />
            <PrimaryButton title="Cancelar" variant="ghost" onPress={() => setConfirmDelete(null)} />
          </View>
        </View>
      </Modal>

      {toast && <Toast message={toast} tone="success" />}
    </Screen>
  );
}
