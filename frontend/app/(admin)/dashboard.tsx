import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { Card, PrimaryButton, Screen } from "@/src/components/ui";
import { useTheme, spacing, font } from "@/src/theme";
import { useAuth } from "@/src/auth-context";

export default function AdminDashboard() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user, logout } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<any>(null); const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await api.get("/admin/dashboard")); } catch { setData({}); }
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const formatBRL = (n: number) => `R$ ${(n || 0).toFixed(2).replace(".", ",")}`;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + 80, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        <Text style={{ color: colors.muted, fontSize: 13 }}>Painel do síndico</Text>
        <Text style={{ fontSize: font.size.xxl, fontWeight: "700", color: colors.onSurface }}>{user?.building?.name || "Meu prédio"}</Text>

        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <Stat label="Reservas do mês" value={String(data?.reservas_mes ?? "-")} />
          <Stat label="Pendentes" value={String(data?.cadastros_pendentes ?? "-")} accent />
        </View>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <Stat label="Moradores" value={String(data?.total_moradores ?? "-")} />
          <Stat label="Áreas" value={String(data?.total_areas ?? "-")} />
        </View>
        <Card>
          <Text style={{ color: colors.muted, fontSize: 13 }}>Valor a lançar no mês</Text>
          <Text style={{ color: colors.brandPrimary, fontSize: font.size.xxl, fontWeight: "700", marginTop: 4 }}>{formatBRL(data?.valor_total_mes || 0)}</Text>
        </Card>

        <PrimaryButton testID="admin-logout" title="Sair" variant="outline" onPress={async () => { await logout(); router.replace("/(auth)/welcome"); }} />
      </ScrollView>
    </Screen>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  const { colors } = useTheme();
  return (
    <Card style={{ flex: 1 }}>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: accent ? colors.warning : colors.onSurface, fontSize: font.size.xxl, fontWeight: "700", marginTop: 4 }}>{value}</Text>
    </Card>
  );
}
