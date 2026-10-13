import React, { useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { api } from "@/src/api";
import { Card, Screen } from "@/src/components/ui";
import { useTheme, spacing, font } from "@/src/theme";

export default function SelectTower() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { building_id, building_name, mode } = useLocalSearchParams<{ building_id: string; building_name: string; mode?: string }>();
  const { colors } = useTheme();
  const [towers, setTowers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const t = await api.get<any[]>(`/buildings/${building_id}/towers`);
        setTowers(t);
        // Single tower auto-select
        if (t.length === 1 && (t[0].single || true)) {
          if (t.length === 1) {
            router.replace({ pathname: "/(auth)/select-apartment", params: {
              building_id, building_name, tower_id: t[0].id, tower_name: t[0].name, mode: mode || "",
            }});
            return;
          }
        }
      } catch { setTowers([]); }
      setLoading(false);
    })();
  }, [building_id]);

  return (
    <Screen>
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm, backgroundColor: colors.surface }}>
        <Pressable onPress={() => router.back()} testID="back-btn"><Text style={{ color: colors.brandPrimary, fontWeight: "600" }}>← Voltar</Text></Pressable>
        <Text style={{ fontSize: font.size.xxl, fontWeight: "700", color: colors.onSurface }}>Selecione a torre</Text>
        <Text style={{ color: colors.muted, fontSize: font.size.sm }}>Selecione a torre ou bloco onde você mora em {building_name}.</Text>
      </View>
      {loading ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} /> : (
        <FlatList
          data={towers}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}
          renderItem={({ item }) => (
            <Pressable testID={`tower-card-${item.id}`} onPress={() =>
              router.push({ pathname: "/(auth)/select-apartment", params: {
                building_id, building_name, tower_id: item.id, tower_name: item.name, mode: mode || "",
              }})
            }>
              <Card>
                <Text style={{ fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface }}>{item.name}</Text>
                <Text style={{ color: colors.muted, marginTop: 4, fontSize: font.size.sm }}>
                  {(item.apartments || []).length} apartamentos cadastrados
                </Text>
              </Card>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}
