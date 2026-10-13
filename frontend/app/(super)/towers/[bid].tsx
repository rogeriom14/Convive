import React, { useCallback, useState } from "react";
import { View, Text, FlatList, RefreshControl, Pressable, Modal, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/src/api";
import { Card, Input, PrimaryButton, Screen, Toast } from "@/src/components/ui";
import { useTheme, spacing, font } from "@/src/theme";

export default function TowersList() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { bid } = useLocalSearchParams<{ bid: string }>();
  const { colors } = useTheme();
  const [building, setBuilding] = useState<any>(null);
  const [towers, setTowers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<any>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, t] = await Promise.all([
        api.get(`/super/buildings/${bid}`),
        api.get(`/super/buildings/${bid}/towers`),
      ]);
      setBuilding(b); setTowers(t);
    } catch {}
    setLoading(false);
  }, [bid]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 1600); };

  const openNew = () => { setEditing({ __new: true }); setName(""); setErr(null); };
  const openEdit = (t: any) => { setEditing(t); setName(t.name); setErr(null); };
  const close = () => { setEditing(null); setName(""); setErr(null); };

  const save = async () => {
    if (!name.trim()) { setErr("Informe o nome"); return; }
    setErr(null);
    try {
      if (editing?.__new) {
        await api.post(`/super/buildings/${bid}/towers`, { name: name.trim() });
        showToast("Torre adicionada");
      } else {
        await api.put(`/super/towers/${editing.id}`, { name: name.trim() });
        showToast("Torre atualizada");
      }
      close(); load();
    } catch (e: any) { setErr(e.message); }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      await api.del(`/super/towers/${confirmDelete.id}`);
      setConfirmDelete(null); showToast("Torre excluída"); load();
    } catch (e: any) {
      setErr(e.message);
      setConfirmDelete(null);
    }
  };

  return (
    <Screen>
      <FlatList
        data={towers}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <Pressable onPress={() => router.back()} testID="back-btn"><Text style={{ color: colors.brandPrimary, fontWeight: "600" }}>← Voltar</Text></Pressable>
            <Text style={{ color: colors.muted, fontSize: 13 }}>Prédio</Text>
            <Text style={{ fontSize: font.size.xl, fontWeight: "700", color: colors.onSurface }}>{building?.name || "..."}</Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.md }}>
              <Text style={{ fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface }}>Torres cadastradas</Text>
              <Pressable testID="add-tower-btn" onPress={openNew}>
                <Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>+ Adicionar</Text>
              </Pressable>
            </View>
            {err && !editing && !confirmDelete && (
              <Text testID="tower-inline-err" style={{ color: colors.error }}>{err}</Text>
            )}
          </View>
        }
        ListEmptyComponent={!loading ? <Text style={{ color: colors.muted, textAlign: "center", marginTop: spacing.md }}>Nenhuma torre cadastrada.</Text> : null}
        renderItem={({ item }) => (
          <Card testID={`tower-card-${item.id}`}>
            <Text style={{ fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface }}>{item.name}</Text>
            <Text style={{ color: colors.muted, fontSize: 13, marginTop: 2 }}>
              {item.residents_count} moradores · {(item.apartments || []).length} apartamentos
            </Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.md }}>
              <Pressable testID={`edit-tower-${item.id}`} onPress={() => openEdit(item)}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: colors.brandPrimary, alignItems: "center" }}>
                <Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>Editar</Text>
              </Pressable>
              <Pressable testID={`del-tower-${item.id}`} onPress={() => setConfirmDelete(item)}
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
            <View style={{ backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.lg }}>
              <Text style={{ fontSize: font.size.xl, fontWeight: "700", color: colors.onSurface }}>
                {editing?.__new ? "Nova torre" : "Editar torre"}
              </Text>
              <Input testID="tower-name" label="Nome da torre" placeholder="Ex: Torre Única" value={name} onChangeText={setName} />
              {err && <Text style={{ color: colors.error }} testID="tower-err">{err}</Text>}
              <PrimaryButton testID="save-tower" title={editing?.__new ? "Adicionar" : "Salvar alterações"} onPress={save} />
              <PrimaryButton title="Cancelar" variant="ghost" onPress={close} />
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={!!confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(45,42,90,0.6)", justifyContent: "center", padding: spacing.lg }}>
          <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: 20, padding: spacing.lg, gap: spacing.md }}>
            <Text style={{ fontSize: font.size.xl, fontWeight: "700", color: colors.onSurface }}>Excluir torre?</Text>
            <Text style={{ color: colors.muted }}>
              A torre {`"${confirmDelete?.name || ""}"`} será removida definitivamente. Só é possível excluir torres sem moradores cadastrados.
            </Text>
            <PrimaryButton testID="confirm-del-tower" title="Sim, excluir" variant="danger" onPress={doDelete} />
            <PrimaryButton title="Cancelar" variant="ghost" onPress={() => setConfirmDelete(null)} />
          </View>
        </View>
      </Modal>

      {toast && <Toast message={toast} tone="success" />}
    </Screen>
  );
}
