import React, { useCallback, useState } from "react";
import { View, Text, FlatList, RefreshControl, Pressable, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { Card, PrimaryButton, Screen, Badge, Toast } from "@/src/components/ui";
import { useTheme, spacing, font } from "@/src/theme";
import { useAuth } from "@/src/auth-context";

type Section =
  | { type: "header" }
  | { type: "pending-title" }
  | { type: "pending"; item: any }
  | { type: "pending-empty" }
  | { type: "buildings-title" }
  | { type: "building"; item: any };

export default function SuperDashboard() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { logout } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, b, p] = await Promise.all([
        api.get("/super/stats"),
        api.get("/super/buildings"),
        api.get("/super/pending-residents"),
      ]);
      setStats(s); setBuildings(b); setPending(p);
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 1800); };
  const approve = async (id: string) => { try { await api.post(`/admin/residents/${id}/approve`); showToast("Cadastro aprovado"); load(); } catch {} };
  const reject = async (id: string) => { try { await api.post(`/admin/residents/${id}/reject`); showToast("Cadastro recusado"); load(); } catch {} };
  const deleteBuilding = async () => {
    if (!confirmDelete) return;
    try { await api.del(`/super/buildings/${confirmDelete.id}`); setConfirmDelete(null); showToast("Prédio excluído"); load(); } catch {}
  };

  const data: Section[] = [
    { type: "header" },
    { type: "pending-title" },
    ...(pending.length ? pending.map(p => ({ type: "pending" as const, item: p })) : [{ type: "pending-empty" as const }]),
    { type: "buildings-title" },
    ...buildings.map(b => ({ type: "building" as const, item: b })),
  ];

  const renderItem = ({ item: row }: { item: Section }) => {
    if (row.type === "header") {
      return (
        <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
          <Text style={{ color: colors.muted, fontSize: 13 }}>Super administrador</Text>
          <Text style={{ fontSize: font.size.xxl, fontWeight: "700", color: colors.onSurface }}>Plataforma Convive</Text>
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <Stat label="Prédios" value={String(stats?.total_buildings ?? "-")} />
            <Stat label="Moradores" value={String(stats?.total_residents ?? "-")} />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <Stat label="Reservas" value={String(stats?.total_reservations ?? "-")} />
            <Stat label="Pendentes" value={String(stats?.pending_residents ?? "-")} accent />
          </View>
        </View>
      );
    }
    if (row.type === "pending-title") {
      return (
        <Text style={{ fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface, marginTop: 8, marginBottom: 4 }}>
          Cadastros pendentes
        </Text>
      );
    }
    if (row.type === "pending-empty") {
      return <Text style={{ color: colors.muted, marginBottom: spacing.md }}>Nenhum cadastro aguardando aprovação.</Text>;
    }
    if (row.type === "pending") {
      const p = row.item;
      return (
        <Card testID={`super-pending-${p.id}`} style={{ marginBottom: spacing.md }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <Text style={{ fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface, flex: 1 }}>{p.name}</Text>
            <Badge text="Pendente" tone="warning" />
          </View>
          <View style={{ marginTop: 8, padding: 10, backgroundColor: colors.surfaceTertiary, borderRadius: 10 }}>
            <Text style={{ color: colors.muted, fontSize: 12 }}>Prédio</Text>
            <Text style={{ color: colors.onSurface, fontWeight: "700" }}>{p.building_name || "-"}</Text>
            <Text style={{ color: colors.onSurface, marginTop: 2 }}>{p.tower_name || "-"} · Apto {p.apartment}</Text>
          </View>
          <Text style={{ color: colors.muted, fontSize: 13, marginTop: 8 }}>{p.email} · {p.phone}</Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <View style={{ flex: 1 }}><PrimaryButton testID={`super-approve-${p.id}`} title="Aprovar" variant="success" onPress={() => approve(p.id)} /></View>
            <View style={{ flex: 1 }}><PrimaryButton testID={`super-reject-${p.id}`} title="Recusar" variant="danger" onPress={() => reject(p.id)} /></View>
          </View>
        </Card>
      );
    }
    if (row.type === "buildings-title") {
      return (
        <Text style={{ fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface, marginTop: spacing.md, marginBottom: spacing.sm }}>
          Prédios cadastrados
        </Text>
      );
    }
    const b = row.item;
    return (
      <Card testID={`super-building-${b.id}`} style={{ marginBottom: spacing.md }}>
        <Pressable onPress={() => router.push(`/(super)/building/${b.id}`)}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface, flex: 1 }}>{b.name}</Text>
            <Badge text={b.active ? "Ativo" : "Inativo"} tone={b.active ? "success" : "error"} />
          </View>
          <Text style={{ color: colors.muted, marginTop: 4, fontSize: 13 }}>{[b.city, b.state].filter(Boolean).join(" · ")}</Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
            <Text style={{ color: colors.onSurface }}>{b.residents} moradores</Text>
            <Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>Ver áreas ›</Text>
          </View>
        </Pressable>
        <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.md }}>
          <Pressable testID={`edit-building-${b.id}`} onPress={() => router.push(`/(super)/edit-building/${b.id}`)}
            style={{ flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: colors.brandPrimary, alignItems: "center" }}>
            <Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>Editar</Text>
          </Pressable>
          <Pressable testID={`delete-building-${b.id}`} onPress={() => setConfirmDelete(b)}
            style={{ flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.error, alignItems: "center" }}>
            <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>Excluir</Text>
          </Pressable>
        </View>
      </Card>
    );
  };

  return (
    <Screen>
      <FlatList
        data={data}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        renderItem={renderItem}
        ListFooterComponent={
          <PrimaryButton testID="super-logout" title="Sair" variant="outline"
            onPress={async () => { await logout(); router.replace("/(auth)/welcome"); }} />
        }
      />

      <Modal visible={!!confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(45,42,90,0.6)", justifyContent: "center", padding: spacing.lg }}>
          <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: 20, padding: spacing.lg, gap: spacing.md }}>
            <Text style={{ fontSize: font.size.xl, fontWeight: "700", color: colors.onSurface }}>Excluir prédio?</Text>
            <Text style={{ color: colors.muted }}>
              O prédio {`"${confirmDelete?.name || ""}"`} será desativado. Os cadastros de moradores e o histórico de reservas serão preservados, mas ninguém poderá mais fazer login ou reservar.
            </Text>
            <PrimaryButton testID="confirm-del-building" title="Sim, excluir" variant="danger" onPress={deleteBuilding} />
            <PrimaryButton title="Cancelar" variant="ghost" onPress={() => setConfirmDelete(null)} />
          </View>
        </View>
      </Modal>

      {toast && <Toast message={toast} tone="success" />}
    </Screen>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  const { colors } = useTheme();
  return (
    <Card style={{ flex: 1 }}>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: accent ? colors.warning : colors.brandPrimary, fontSize: font.size.xxl, fontWeight: "700", marginTop: 4 }}>{value}</Text>
    </Card>
  );
}
