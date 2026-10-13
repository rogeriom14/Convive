import React, { useCallback, useState } from "react";
import { View, Text, FlatList, RefreshControl, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { api } from "@/src/api";
import { Card, Screen, Badge } from "@/src/components/ui";
import { useTheme, spacing, font } from "@/src/theme";

export default function MyReservations() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [items, setItems] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"future" | "past">("future");

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await api.get("/reservations/mine")); } catch { setItems([]); }
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const today = new Date().toISOString().slice(0, 10);
  const filtered = items.filter(r => filter === "future" ? (r.date >= today && r.status !== "cancelled") : (r.date < today || r.status === "cancelled"));
  const formatBRL = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;

  const cancel = async (id: string) => {
    try { await api.post(`/reservations/${id}/cancel`); await load(); } catch {}
  };

  return (
    <Screen>
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.md }}>
        <Text style={{ fontSize: font.size.xxl, fontWeight: "700", color: colors.onSurface }}>Minhas reservas</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["future", "past"] as const).map(f => (
            <Pressable key={f} testID={`filter-${f}`} onPress={() => setFilter(f)} style={{
              paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999,
              backgroundColor: filter === f ? colors.brandPrimary : colors.surfaceSecondary,
              borderWidth: 1, borderColor: filter === f ? colors.brandPrimary : colors.border,
            }}>
              <Text style={{ color: filter === f ? "#FFFFFF" : colors.onSurface, fontWeight: "600" }}>
                {f === "future" ? "Futuras" : "Histórico"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 80, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={!loading ? <Text style={{ color: colors.muted, textAlign: "center", marginTop: spacing.xxl }}>Nenhuma reserva.</Text> : null}
        renderItem={({ item }) => (
          <Card testID={`res-card-${item.id}`}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface, flex: 1 }}>{item.area_name}</Text>
              {item.status === "cancelled" ? <Badge text="Cancelada" tone="error" />
                : item.charge_status === "paid" ? <Badge text="Paga" tone="success" />
                : <Badge text="Confirmada" tone="info" />}
            </View>
            <Text style={{ color: colors.muted, marginTop: 4 }}>
              {new Date(item.date + "T00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "long" })}
              {item.shift ? ` · ${item.shift.name} (${item.shift.start}-${item.shift.end})` : ""}
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
              <Text style={{ color: colors.onSurface, fontWeight: "600" }}>
                {item.total > 0 ? formatBRL(item.total) : "Sem custo"}
              </Text>
              {filter === "future" && item.status !== "cancelled" && (
                <Pressable testID={`cancel-${item.id}`} onPress={() => cancel(item.id)}>
                  <Text style={{ color: colors.error, fontWeight: "600" }}>Cancelar</Text>
                </Pressable>
              )}
            </View>
          </Card>
        )}
      />
    </Screen>
  );
}
