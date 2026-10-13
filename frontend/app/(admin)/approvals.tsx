import React, { useCallback, useState } from "react";
import { View, Text, FlatList, RefreshControl, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { api } from "@/src/api";
import { Card, PrimaryButton, Screen, Badge } from "@/src/components/ui";
import { useTheme, spacing, font } from "@/src/theme";

export default function Approvals() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [items, setItems] = useState<any[]>([]); const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await api.get("/admin/pending-residents")); } catch { setItems([]); }
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const approve = async (id: string) => { try { await api.post(`/admin/residents/${id}/approve`); await load(); } catch {} };
  const reject = async (id: string) => { try { await api.post(`/admin/residents/${id}/reject`); await load(); } catch {} };

  return (
    <Screen>
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
        <Text style={{ fontSize: font.size.xxl, fontWeight: "700", color: colors.onSurface }}>Cadastros pendentes</Text>
        <Text style={{ color: colors.muted, marginTop: 4 }}>Aprove ou recuse solicitações de novos moradores.</Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 80, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={!loading ? <Text style={{ color: colors.muted, textAlign: "center", marginTop: spacing.xxl }}>Nenhum cadastro pendente.</Text> : null}
        renderItem={({ item }) => (
          <Card testID={`pending-${item.id}`}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface }}>{item.name}</Text>
              <Badge text="Pendente" tone="warning" />
            </View>
            <Text style={{ color: colors.onSurface, marginTop: 4, fontWeight: "600" }}>
              {item.tower_name} · Apto {item.apartment}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 13, marginTop: 2 }}>{item.email} · {item.phone}</Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <View style={{ flex: 1 }}><PrimaryButton testID={`approve-${item.id}`} title="Aprovar" variant="success" onPress={() => approve(item.id)} /></View>
              <View style={{ flex: 1 }}><PrimaryButton testID={`reject-${item.id}`} title="Recusar" variant="danger" onPress={() => reject(item.id)} /></View>
            </View>
          </Card>
        )}
      />
    </Screen>
  );
}
