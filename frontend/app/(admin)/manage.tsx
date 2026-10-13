import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, Pressable, Modal, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { api } from "@/src/api";
import { Card, Input, PrimaryButton, Screen, Badge, Toast } from "@/src/components/ui";
import { useTheme, spacing, font, radius } from "@/src/theme";

type FeeType = "fixed" | "percent" | "free";

export default function Manage() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [towers, setTowers] = useState<any[]>([]);
  const [areas, setAreas] = useState<any[]>([]);
  const [rules, setRules] = useState<any>({ min_days_ahead: 2, max_days_ahead: 60, max_active_per_apt: 2, free_cancel_hours: 24, late_cancel_charge: "cleaning" });
  const [showTower, setShowTower] = useState(false);
  const [editingTower, setEditingTower] = useState<any>(null);
  const [towerName, setTowerName] = useState("");
  const [towerError, setTowerError] = useState<string | null>(null);
  const [showArea, setShowArea] = useState(false);
  const [areaForm, setAreaForm] = useState<any>({ name: "", description: "", capacity: "", fee_type: "fixed" as FeeType, fee_value: "", cleaning_fee: "", booking_type: "day", rules: "" });
  const [savingRules, setSavingRules] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [t, a, r] = await Promise.all([api.get("/admin/towers"), api.get("/areas"), api.get("/admin/rules")]);
      setTowers(t); setAreas(a);
      if (r && Object.keys(r).length) setRules((prev: any) => ({ ...prev, ...r }));
    } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNewTower = () => { setEditingTower(null); setTowerName(""); setTowerError(null); setShowTower(true); };
  const openEditTower = (t: any) => { setEditingTower(t); setTowerName(t.name); setTowerError(null); setShowTower(true); };

  const saveTower = async () => {
    if (!towerName.trim()) return;
    setTowerError(null);
    try {
      if (editingTower) {
        await api.put(`/admin/towers/${editingTower.id}`, { name: towerName.trim() });
        showToast("Torre atualizada");
      } else {
        await api.post("/admin/towers", { name: towerName.trim() });
        showToast("Torre adicionada");
      }
      setShowTower(false); load();
    } catch (e: any) { setTowerError(e.message); }
  };

  const deleteTower = async (t: any) => {
    setTowerError(null);
    try {
      await api.del(`/admin/towers/${t.id}`);
      setShowTower(false); showToast("Torre excluída"); load();
    } catch (e: any) { setTowerError(e.message); }
  };

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2000); };

  const addArea = async () => {
    const payload = {
      name: areaForm.name, description: areaForm.description || "",
      capacity: areaForm.capacity ? Number(areaForm.capacity) : null,
      fee_type: areaForm.fee_type,
      fee_value: areaForm.fee_type === "free" ? 0 : Number(areaForm.fee_value) || 0,
      cleaning_fee: Number(areaForm.cleaning_fee) || 0,
      booking_type: areaForm.booking_type,
      rules: areaForm.rules || "",
      tower_ids: [], shifts: [], active: true,
    };
    if (!payload.name) return;
    await api.post("/admin/areas", payload);
    setShowArea(false); showToast("Área cadastrada");
    setAreaForm({ name: "", description: "", capacity: "", fee_type: "fixed", fee_value: "", cleaning_fee: "", booking_type: "day", rules: "" });
    load();
  };

  const saveRules = async () => {
    setSavingRules(true);
    try { await api.put("/admin/rules", rules); showToast("Regras salvas"); } catch {}
    setSavingRules(false);
  };

  const formatBRL = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + 80, gap: spacing.md }}>
        <Text style={{ fontSize: font.size.xxl, fontWeight: "700", color: colors.onSurface }}>Gestão</Text>

        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface }}>Torres</Text>
            <Pressable testID="add-tower" onPress={openNewTower}><Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>+ Adicionar</Text></Pressable>
          </View>
          {towers.map(t => (
            <Pressable key={t.id} testID={`tower-row-${t.id}`} onPress={() => openEditTower(t)}
              style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.divider, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.onSurface, fontWeight: "600" }}>{t.name}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{(t.apartments || []).length} apartamentos</Text>
              </View>
              <Text style={{ color: colors.brandPrimary, fontWeight: "600" }}>Editar ›</Text>
            </Pressable>
          ))}
          {towers.length === 0 && <Text style={{ color: colors.muted, paddingVertical: 12 }}>Nenhuma torre cadastrada.</Text>}
        </Card>

        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface }}>Áreas comuns</Text>
            <Pressable testID="add-area" onPress={() => setShowArea(true)}><Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>+ Adicionar</Text></Pressable>
          </View>
          {areas.map(a => (
            <View key={a.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
              <Text style={{ color: colors.onSurface, fontWeight: "600" }}>{a.name}</Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 4, alignItems: "center" }}>
                {a.fee_type === "free" ? <Badge text="Gratuita" tone="success" />
                  : a.fee_type === "percent" ? <Badge text={`${a.fee_value}% + limpeza`} tone="info" />
                  : <Text style={{ color: colors.brandPrimary, fontWeight: "600" }}>{formatBRL(a.total)}</Text>}
              </View>
            </View>
          ))}
        </Card>

        <Card>
          <Text style={{ fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface, marginBottom: 8 }}>Regras de reserva</Text>
          <Input label="Antecedência mínima (dias)" testID="rule-min" keyboardType="numeric" value={String(rules.min_days_ahead)} onChangeText={v => setRules({ ...rules, min_days_ahead: Number(v) || 0 })} />
          <View style={{ height: 8 }} />
          <Input label="Antecedência máxima (dias)" testID="rule-max" keyboardType="numeric" value={String(rules.max_days_ahead)} onChangeText={v => setRules({ ...rules, max_days_ahead: Number(v) || 0 })} />
          <View style={{ height: 8 }} />
          <Input label="Reservas ativas por apartamento" testID="rule-active" keyboardType="numeric" value={String(rules.max_active_per_apt)} onChangeText={v => setRules({ ...rules, max_active_per_apt: Number(v) || 0 })} />
          <View style={{ height: 8 }} />
          <Input label="Prazo cancelamento sem cobrança (horas)" testID="rule-cancel" keyboardType="numeric" value={String(rules.free_cancel_hours)} onChangeText={v => setRules({ ...rules, free_cancel_hours: Number(v) || 0 })} />
          <View style={{ height: 12 }} />
          <PrimaryButton testID="save-rules" title="Salvar regras" onPress={saveRules} loading={savingRules} />
        </Card>
      </ScrollView>

      <Modal visible={showTower} transparent animationType="slide" onRequestClose={() => setShowTower(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(45,42,90,0.5)", justifyContent: "flex-end" }}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={{ backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.lg }}>
              <Text style={{ fontSize: font.size.xl, fontWeight: "700", color: colors.onSurface }}>
                {editingTower ? "Editar torre" : "Nova torre"}
              </Text>
              <Input testID="new-tower-name" label="Nome da torre" placeholder="Ex: Torre Única" value={towerName} onChangeText={setTowerName} />
              {towerError && <Text style={{ color: colors.error }} testID="tower-error">{towerError}</Text>}
              <PrimaryButton testID="save-tower" title={editingTower ? "Salvar alterações" : "Adicionar"} onPress={saveTower} />
              {editingTower && (
                <PrimaryButton testID="delete-tower" title="Excluir torre" variant="danger" onPress={() => deleteTower(editingTower)} />
              )}
              <PrimaryButton title="Cancelar" variant="ghost" onPress={() => setShowTower(false)} />
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={showArea} transparent animationType="slide" onRequestClose={() => setShowArea(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(45,42,90,0.5)", justifyContent: "flex-end" }}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView style={{ backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%" }}
              contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.lg }}>
              <Text style={{ fontSize: font.size.xl, fontWeight: "700", color: colors.onSurface }}>Nova área comum</Text>
              <Input testID="area-name" label="Nome" value={areaForm.name} onChangeText={v => setAreaForm({ ...areaForm, name: v })} />
              <Input testID="area-desc" label="Descrição" value={areaForm.description} onChangeText={v => setAreaForm({ ...areaForm, description: v })} />
              <Input testID="area-cap" label="Capacidade (opcional)" keyboardType="numeric" value={areaForm.capacity} onChangeText={v => setAreaForm({ ...areaForm, capacity: v })} />
              <Text style={{ color: colors.onSurface, fontWeight: "600" }}>Forma de cobrança</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["fixed","percent","free"] as FeeType[]).map(ft => (
                  <Pressable key={ft} testID={`fee-${ft}`} onPress={() => setAreaForm({ ...areaForm, fee_type: ft })} style={{
                    flex: 1, paddingVertical: 10, borderRadius: radius.pill,
                    backgroundColor: areaForm.fee_type === ft ? colors.brandPrimary : colors.surfaceTertiary,
                    alignItems: "center",
                  }}>
                    <Text style={{ color: areaForm.fee_type === ft ? "#FFFFFF" : colors.onSurface, fontWeight: "600" }}>
                      {ft === "fixed" ? "Fixo (R$)" : ft === "percent" ? "% Condomínio" : "Gratuita"}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {areaForm.fee_type !== "free" && (
                <Input testID="area-fee-value" label={areaForm.fee_type === "percent" ? "Percentual (%)" : "Valor de uso (R$)"} keyboardType="numeric"
                  value={areaForm.fee_value} onChangeText={v => setAreaForm({ ...areaForm, fee_value: v })} />
              )}
              <Input testID="area-clean" label="Taxa de limpeza (R$)" keyboardType="numeric" value={areaForm.cleaning_fee} onChangeText={v => setAreaForm({ ...areaForm, cleaning_fee: v })} />
              <Input testID="area-rules" label="Regras (opcional)" multiline value={areaForm.rules} onChangeText={v => setAreaForm({ ...areaForm, rules: v })} style={{ minHeight: 80 }} />
              <PrimaryButton testID="save-area" title="Cadastrar área" onPress={addArea} disabled={!areaForm.name} />
              <PrimaryButton title="Cancelar" variant="ghost" onPress={() => setShowArea(false)} />
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
      {toast && <Toast message={toast} tone="success" />}
    </Screen>
  );
}
