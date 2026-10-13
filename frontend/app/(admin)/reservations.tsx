import React, { useCallback, useState } from "react";
import { View, Text, FlatList, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { api } from "@/src/api";
import { Card, PrimaryButton, Screen, Badge } from "@/src/components/ui";
import { useTheme, spacing, font } from "@/src/theme";

export default function AdminReservations() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [items, setItems] = useState<any[]>([]); const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await api.get("/admin/reservations")); } catch { setItems([]); }
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const markPaid = async (id: string) => { try { await api.post(`/admin/reservations/${id}/mark-paid`); await load(); } catch {} };
  const cancel = async (id: string) => { try { await api.post(`/reservations/${id}/cancel`); await load(); } catch {} };
  const formatBRL = (n: number) => `R$ ${(n || 0).toFixed(2).replace(".", ",")}`;

  return (
    <Screen>
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
        <Text style={{ fontSize: font.size.xxl, fontWeight: "700", color: colors.onSurface }}>Todas as reservas</Text>
        <Text style={{ color: colors.muted, marginTop: 4 }}>Gerencie cobrança e status.</Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 80, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={!loading ? <Text style={{ color: colors.muted, textAlign: "center", marginTop: spacing.xxl }}>Sem reservas.</Text> : null}
        renderItem={({ item }) => (
          <Card testID={`admin-res-${item.id}`}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontSize: font.size.base, fontWeight: "700", color: colors.onSurface, flex: 1 }}>{item.area_name}</Text>
              {item.status === "cancelled" ? <Badge text="Cancelada" tone="error" />
                : item.charge_status === "paid" ? <Badge text="Paga" tone="success" />
                : <Badge text="A lançar" tone="warning" />}
            </View>
            <Text style={{ color: colors.muted, marginTop: 2, fontSize: 13 }}>
              {new Date(item.date + "T00:00").toLocaleDateString("pt-BR")}{item.shift ? ` · ${item.shift.name}` : ""}
            </Text>
            <Text style={{ color: colors.onSurface, marginTop: 4, fontWeight: "600" }}>{item.resident_name} · {item.tower_name} · Apto {item.apartment}</Text>
            <Text style={{ color: colors.brandPrimary, marginTop: 4, fontWeight: "700" }}>{item.total > 0 ? formatBRL(item.total) : "Gratuita"}</Text>
            {item.status !== "cancelled" && (
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                {item.charge_status !== "paid" && item.total > 0 && (
                  <View style={{ flex: 1 }}><PrimaryButton testID={`paid-${item.id}`} title="Marcar paga" variant="success" onPress={() => markPaid(item.id)} /></View>
                )}
                <View style={{ flex: 1 }}><PrimaryButton testID={`admin-cancel-${item.id}`} title="Cancelar" variant="outline" onPress={() => cancel(item.id)} /></View>
              </View>
            )}
          </Card>
        )}
      />
    </Screen>
  );
}
