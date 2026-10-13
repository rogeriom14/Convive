import React, { useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { api } from "@/src/api";
import { Card, Input, Screen } from "@/src/components/ui";
import { useTheme, spacing, font, radius } from "@/src/theme";

export default function SelectBuilding() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { colors } = useTheme();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async (query = "") => {
    setLoading(true);
    try { setItems(await api.get(`/buildings/search?q=${encodeURIComponent(query)}`)); }
    catch { setItems([]); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { const t = setTimeout(() => load(q), 300); return () => clearTimeout(t); }, [q]);

  const chooseBuilding = (b: any) => {
    router.push({ pathname: "/(auth)/select-tower", params: { building_id: b.id, building_name: b.name, mode: mode || "" } });
  };

  return (
    <Screen>
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.md, backgroundColor: colors.surface }}>
        <Pressable onPress={() => router.back()} testID="back-btn"><Text style={{ color: colors.brandPrimary, fontWeight: "600" }}>← Voltar</Text></Pressable>
        <Text style={{ fontSize: font.size.xxl, fontWeight: "700", color: colors.onSurface }}>Encontre seu prédio</Text>
        <Text style={{ color: colors.muted, fontSize: font.size.sm }}>Busque pelo nome, cidade ou CEP.</Text>
        <Input testID="building-search-input" placeholder="Ex: Alpinus, São Paulo, 01310..." value={q} onChangeText={setQ} autoCapitalize="none" />
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(q)} />}
        ListEmptyComponent={!loading ? (
          <Text style={{ color: colors.muted, textAlign: "center", marginTop: spacing.xxl }}>Nenhum prédio encontrado.</Text>
        ) : null}
        renderItem={({ item }) => (
          <Pressable testID={`building-card-${item.id}`} onPress={() => chooseBuilding(item)}>
            <Card>
              <Text style={{ fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface }}>{item.name}</Text>
              <Text style={{ color: colors.muted, marginTop: 4, fontSize: font.size.sm }}>
                {[item.address, item.city, item.state].filter(Boolean).join(" · ")}
              </Text>
            </Card>
          </Pressable>
        )}
      />
      {loading && <ActivityIndicator style={{ position: "absolute", top: 220, alignSelf: "center" }} color={colors.brandPrimary} />}
    </Screen>
  );
}
