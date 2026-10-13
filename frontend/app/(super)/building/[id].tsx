import React, { useCallback, useState } from "react";
import { View, Text, FlatList, RefreshControl, Pressable, Modal, KeyboardAvoidingView, Platform, ScrollView, Image, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { api } from "@/src/api";
import { Card, Input, PrimaryButton, Screen, Badge, Toast } from "@/src/components/ui";
import { useTheme, spacing, font, radius } from "@/src/theme";

type FeeType = "fixed" | "percent" | "free";

const emptyForm = { name: "", description: "", capacity: "", fee_type: "fixed" as FeeType, fee_value: "", cleaning_fee: "", booking_type: "day", rules: "" };

export default function BuildingDetail() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const [building, setBuilding] = useState<any>(null);
  const [areas, setAreas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingArea, setEditingArea] = useState<any>(null); // null = closed, {} = new, area = edit
  const [confirmDelete, setConfirmDelete] = useState<any>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, a] = await Promise.all([
        api.get(`/super/buildings/${id}`),
        api.get(`/super/buildings/${id}/areas`),
      ]);
      setBuilding(b); setAreas(a);
    } catch {}
    setLoading(false);
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 1800); };

  const openNew = () => {
    setEditingArea({ __new: true });
    setForm(emptyForm); setErr(null);
  };
  const openEdit = (a: any) => {
    setEditingArea(a);
    setForm({
      name: a.name || "",
      description: a.description || "",
      capacity: a.capacity != null ? String(a.capacity) : "",
      fee_type: a.fee_type,
      fee_value: a.fee_value != null ? String(a.fee_value) : "",
      cleaning_fee: a.cleaning_fee != null ? String(a.cleaning_fee) : "",
      booking_type: a.booking_type || "day",
      rules: a.rules || "",
    });
    setErr(null);
  };
  const closeModal = () => { setEditingArea(null); setForm(emptyForm); setErr(null); };

  const saveArea = async () => {
    setErr(null);
    if (!form.name) { setErr("Informe o nome"); return; }
    const payload = {
      name: form.name, description: form.description || "",
      capacity: form.capacity ? Number(form.capacity) : null,
      fee_type: form.fee_type,
      fee_value: form.fee_type === "free" ? 0 : Number(form.fee_value) || 0,
      cleaning_fee: Number(form.cleaning_fee) || 0,
      booking_type: form.booking_type, rules: form.rules || "",
      tower_ids: editingArea?.tower_ids || [],
      shifts: editingArea?.shifts || [],
      active: editingArea?.active !== undefined ? editingArea.active : true,
    };
    try {
      if (editingArea?.__new) {
        await api.post(`/super/buildings/${id}/areas`, payload);
        showToast("Área cadastrada");
      } else {
        await api.put(`/super/areas/${editingArea.id}`, payload);
        showToast("Área atualizada");
      }
      closeModal(); load();
    } catch (e: any) { setErr(e.message); }
  };

  const deleteArea = async () => {
    if (!confirmDelete) return;
    try {
      await api.del(`/super/areas/${confirmDelete.id}`);
      setConfirmDelete(null); showToast("Área excluída"); load();
    } catch (e: any) {
      setConfirmDelete(null); showToast(e.message || "Erro ao excluir");
    }
  };

  const uploadPhoto = async () => {
    if (!editingArea || editingArea.__new) {
      setErr("Salve a área primeiro para adicionar a foto"); return;
    }
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { setErr("Permissão negada para acessar a galeria"); return; }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"], quality: 0.7, allowsEditing: true, aspect: [16, 9],
        base64: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      setUploading(true); setErr(null);
      let base64 = asset.base64 || "";
      if (!base64) {
        // Fallback: fetch the uri and convert to base64
        const resp = await fetch(asset.uri);
        const blob = await resp.blob();
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const r = String(reader.result || "");
            const idx = r.indexOf(",");
            resolve(idx >= 0 ? r.slice(idx + 1) : r);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }
      const filename = asset.fileName || `photo-${Date.now()}.jpg`;
      const content_type = asset.mimeType || "image/jpeg";
      const data = await api.post<{ photo_url: string }>(
        `/super/areas/${editingArea.id}/photo`,
        { filename, content_type, data_base64: base64 },
      );
      showToast("Foto atualizada");
      setEditingArea({ ...editingArea, photo_url: data.photo_url });
      load();
    } catch (e: any) { setErr(e.message || "Falha no upload"); }
    setUploading(false);
  };

  const formatBRL = (n: number) => `R$ ${(n || 0).toFixed(2).replace(".", ",")}`;

  return (
    <Screen>
      <FlatList
        data={areas}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <Pressable onPress={() => router.back()} testID="back-btn"><Text style={{ color: colors.brandPrimary, fontWeight: "600" }}>← Voltar</Text></Pressable>
            <Text style={{ color: colors.muted, fontSize: 13 }}>Prédio</Text>
            <Text style={{ fontSize: font.size.xxl, fontWeight: "700", color: colors.onSurface }}>{building?.name || "..."}</Text>
            <Text style={{ color: colors.muted }}>
              {[building?.address, building?.city, building?.state].filter(Boolean).join(" · ")}
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <Pressable style={{ flex: 1 }} testID="stat-residents" onPress={() => router.push(`/(super)/residents/${id}`)}>
                <Stat label="Moradores" value={String(building?.residents_count ?? "-")} />
              </Pressable>
              <Pressable style={{ flex: 1 }} testID="stat-towers" onPress={() => router.push(`/(super)/towers/${id}`)}>
                <Stat label="Torres" value={String((building?.towers || []).length)} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <Stat label="Áreas ativas" value={String(building?.areas_count ?? "-")} />
              </View>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.md }}>
              <Text style={{ fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface }}>Áreas de lazer</Text>
              <Pressable testID="add-area-btn" onPress={openNew}>
                <Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>+ Adicionar</Text>
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={!loading ? <Text style={{ color: colors.muted, textAlign: "center", marginTop: spacing.md }}>Nenhuma área cadastrada.</Text> : null}
        renderItem={({ item }) => (
          <Card testID={`super-area-${item.id}`}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface }}>{item.name}</Text>
                {item.description ? <Text style={{ color: colors.muted, fontSize: 13, marginTop: 2 }} numberOfLines={2}>{item.description}</Text> : null}
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
                  {item.fee_type === "free" ? <Badge text="Gratuita" tone="success" />
                    : item.fee_type === "percent" ? <Badge text={`${item.fee_value}% + limpeza`} tone="info" />
                    : <Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>{formatBRL(item.total)}</Text>}
                  {item.booking_type === "shift" && <Badge text="Por turnos" tone="info" />}
                  {!item.active && <Badge text="Inativa" tone="error" />}
                </View>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.md }}>
              <Pressable testID={`edit-area-${item.id}`} onPress={() => openEdit(item)}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: colors.brandPrimary, alignItems: "center" }}>
                <Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>Editar</Text>
              </Pressable>
              <Pressable testID={`del-area-${item.id}`} onPress={() => setConfirmDelete(item)}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.error, alignItems: "center" }}>
                <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>Excluir</Text>
              </Pressable>
            </View>
          </Card>
        )}
      />

      <Modal visible={!!editingArea} transparent animationType="slide" onRequestClose={closeModal}>
        <View style={{ flex: 1, backgroundColor: "rgba(45,42,90,0.5)", justifyContent: "flex-end" }}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView style={{ backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%" }}
              contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.lg }}>
              <Text style={{ fontSize: font.size.xl, fontWeight: "700", color: colors.onSurface }}>
                {editingArea?.__new ? `Nova área em ${building?.name}` : `Editar área`}
              </Text>
              {!editingArea?.__new && (
                <View style={{ gap: 8 }}>
                  <Text style={{ color: colors.onSurface, fontWeight: "600" }}>Foto da área</Text>
                  {editingArea?.photo_url ? (
                    <Image
                      testID="area-photo-preview"
                      source={{ uri: editingArea.photo_url.startsWith("http") ? editingArea.photo_url : `${BASE}${editingArea.photo_url}` }}
                      style={{ width: "100%", height: 160, borderRadius: 12, backgroundColor: colors.surfaceTertiary }}
                    />
                  ) : (
                    <View style={{ width: "100%", height: 120, borderRadius: 12, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: colors.muted }}>Sem foto ainda</Text>
                    </View>
                  )}
                  <Pressable testID="upload-photo-btn" onPress={uploadPhoto} disabled={uploading} style={{
                    paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: colors.brandPrimary,
                    alignItems: "center", opacity: uploading ? 0.6 : 1,
                  }}>
                    {uploading ? <ActivityIndicator color={colors.brandPrimary} />
                      : <Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>
                          {editingArea?.photo_url ? "Trocar foto" : "Enviar foto"}
                        </Text>}
                  </Pressable>
                </View>
              )}
              <Input testID="area-name" label="Nome" placeholder="Ex: Salão de Festas" value={form.name} onChangeText={v => setForm({ ...form, name: v })} />
              <Input testID="area-desc" label="Descrição" value={form.description} onChangeText={v => setForm({ ...form, description: v })} />
              <Input testID="area-cap" label="Capacidade (opcional)" keyboardType="numeric" value={form.capacity} onChangeText={v => setForm({ ...form, capacity: v })} />
              <Text style={{ color: colors.onSurface, fontWeight: "600" }}>Forma de cobrança</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["fixed","percent","free"] as FeeType[]).map(ft => (
                  <Pressable key={ft} testID={`fee-${ft}`} onPress={() => setForm({ ...form, fee_type: ft })} style={{
                    flex: 1, paddingVertical: 10, borderRadius: radius.pill,
                    backgroundColor: form.fee_type === ft ? colors.brandPrimary : colors.surfaceTertiary,
                    alignItems: "center",
                  }}>
                    <Text style={{ color: form.fee_type === ft ? "#FFFFFF" : colors.onSurface, fontWeight: "600" }}>
                      {ft === "fixed" ? "Fixo (R$)" : ft === "percent" ? "% Condomínio" : "Gratuita"}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {form.fee_type !== "free" && (
                <Input testID="area-fee-value" label={form.fee_type === "percent" ? "Percentual (%)" : "Valor de uso (R$)"} keyboardType="numeric"
                  value={form.fee_value} onChangeText={v => setForm({ ...form, fee_value: v })} />
              )}
              <Input testID="area-clean" label="Taxa de limpeza (R$)" keyboardType="numeric" value={form.cleaning_fee} onChangeText={v => setForm({ ...form, cleaning_fee: v })} />
              <Input testID="area-rules" label="Regras (opcional)" multiline value={form.rules} onChangeText={v => setForm({ ...form, rules: v })} style={{ minHeight: 80 }} />
              {err && <Text style={{ color: colors.error }} testID="area-err">{err}</Text>}
              <PrimaryButton testID="save-area" title={editingArea?.__new ? "Cadastrar área" : "Salvar alterações"} onPress={saveArea} disabled={!form.name} />
              <PrimaryButton title="Cancelar" variant="ghost" onPress={closeModal} />
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={!!confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(45,42,90,0.6)", justifyContent: "center", padding: spacing.lg }}>
          <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: 20, padding: spacing.lg, gap: spacing.md }}>
            <Text style={{ fontSize: font.size.xl, fontWeight: "700", color: colors.onSurface }}>Excluir área?</Text>
            <Text style={{ color: colors.muted }}>
              A área {`"${confirmDelete?.name || ""}"`} ficará indisponível para novas reservas. As reservas já feitas serão mantidas.
            </Text>
            <PrimaryButton testID="confirm-del-area" title="Sim, excluir" variant="danger" onPress={deleteArea} />
            <PrimaryButton title="Cancelar" variant="ghost" onPress={() => setConfirmDelete(null)} />
          </View>
        </View>
      </Modal>

      {toast && <Toast message={toast} tone="success" />}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <Card>
      <Text style={{ color: colors.muted, fontSize: 11 }}>{label}</Text>
      <Text style={{ color: colors.onSurface, fontSize: font.size.lg, fontWeight: "700", marginTop: 4 }}>{value}</Text>
    </Card>
  );
}
