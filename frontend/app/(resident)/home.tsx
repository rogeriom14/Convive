import React, { useCallback, useState } from "react";
import { View, Text, FlatList, Pressable, RefreshControl, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { api } from "@/src/api";
import { Card, Screen, Badge } from "@/src/components/ui";
import { useTheme, spacing, font } from "@/src/theme";
import { useAuth } from "@/src/auth-context";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const resolveUrl = (u?: string) => (!u ? undefined : u.startsWith("http") ? u : `${BASE}${u}`);

export default function Home() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuth();
  const [areas, setAreas] = useState<any[]>([]); const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setAreas(await api.get("/areas")); } catch { setAreas([]); }
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const formatBRL = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;

  return (
    <Screen>
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: 4 }}>
        <Text style={{ color: colors.muted, fontSize: 13 }}>Olá, {user?.name?.split(" ")[0]} 👋</Text>
        <Text style={{ fontSize: font.size.xl, fontWeight: "700", color: colors.onSurface }}>{user?.building?.name}</Text>
        <Text style={{ color: colors.muted, fontSize: font.size.sm }}>{user?.tower?.name} · Apto {user?.apartment}</Text>
      </View>
      <FlatList
        data={areas}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 80, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListHeaderComponent={<Text style={{ fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface, marginBottom: spacing.sm }}>Áreas comuns</Text>}
        ListEmptyComponent={!loading ? <Text style={{ color: colors.muted, textAlign: "center", marginTop: spacing.xxl }}>Nenhuma área cadastrada ainda.</Text> : null}
        renderItem={({ item }) => (
          <Pressable testID={`area-card-${item.id}`} onPress={() => router.push(`/(resident)/area/${item.id}`)}>
            <Card style={{ padding: 0, overflow: "hidden" }}>
              {item.photo_url && (
                <Image source={{ uri: resolveUrl(item.photo_url) }} style={{ width: "100%", height: 140 }} />
              )}
              <View style={{ padding: spacing.lg, gap: 6 }}>
                <Text style={{ fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface }}>{item.name}</Text>
                {item.description ? <Text style={{ color: colors.muted, fontSize: 14 }} numberOfLines={2}>{item.description}</Text> : null}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
                  {item.fee_type === "free" ? (
                    <Badge text="Gratuita" tone="success" />
                  ) : (
                    <Text style={{ color: colors.brandPrimary, fontWeight: "700", fontSize: font.size.base }}>{formatBRL(item.total)}</Text>
                  )}
                  {item.booking_type === "shift" && <Badge text="Por turnos" tone="info" />}
                  {item.capacity ? <Text style={{ color: colors.muted, fontSize: 13 }}>· até {item.capacity} pessoas</Text> : null}
                </View>
              </View>
            </Card>
          </Pressable>
        )}
      />
    </Screen>
  );
}
