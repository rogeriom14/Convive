import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, Modal, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { api } from "@/src/api";
import { Card, PrimaryButton, Screen, Toast, Badge } from "@/src/components/ui";
import { useTheme, spacing, font, radius } from "@/src/theme";

function ymd(d: Date) { return d.toISOString().slice(0, 10); }
function monthKey(d: Date) { return d.toISOString().slice(0, 7); }
function daysInMonth(year: number, month: number) { return new Date(year, month + 1, 0).getDate(); }

const WEEK = ["D", "S", "T", "Q", "Q", "S", "S"];
const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

export default function AreaCalendar() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const [area, setArea] = useState<any>(null);
  const [cursor, setCursor] = useState(new Date());
  const [taken, setTaken] = useState<Record<string, any[]>>({});
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedShift, setSelectedShift] = useState<number | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { (async () => {
    try {
      const [a, list] = await Promise.all([
        api.get(`/areas/${id}`),
        api.get<any[]>(`/areas/${id}/reservations?month=${monthKey(new Date())}`),
      ]);
      // Refetch computed totals via list endpoint
      try {
        const areas = await api.get<any[]>("/areas");
        const enriched = areas.find(x => x.id === id);
        setArea({ ...a, ...(enriched || {}) });
      } catch { setArea(a); }
      const grouped: Record<string, any[]> = {};
      list.forEach(r => { grouped[r.date] = grouped[r.date] || []; grouped[r.date].push(r); });
      setTaken(grouped);
    } catch {}
  })(); }, [id]);

  useEffect(() => { if (area) loadMonth(); }, [cursor]);
  const loadMonth = async () => {
    const key = monthKey(cursor);
    try {
      const list = await api.get<any[]>(`/areas/${id}/reservations?month=${key}`);
      const grouped: Record<string, any[]> = {};
      list.forEach(r => { grouped[r.date] = grouped[r.date] || []; grouped[r.date].push(r); });
      setTaken(grouped);
    } catch { setTaken({}); }
  };

  const year = cursor.getFullYear(); const month = cursor.getMonth();
  const first = new Date(year, month, 1); const startWeekday = first.getDay();
  const totalDays = daysInMonth(year, month);
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(new Date(year, month, d));

  const today = new Date(); today.setHours(0,0,0,0);
  const formatBRL = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;

  const isDayFullyTaken = (d: Date) => {
    const list = taken[ymd(d)] || [];
    if (!area) return false;
    if (area.booking_type === "day") return list.length > 0;
    return list.length >= (area.shifts?.length || 0);
  };

  const openDay = (d: Date) => {
    if (d < today) return;
    if (isDayFullyTaken(d)) return;
    setSelectedDate(d); setSelectedShift(null); setAccepted(false); setErr(null);
    setShowConfirm(true);
  };

  const availableShifts = useMemo(() => {
    if (!area || !selectedDate) return [];
    const list = taken[ymd(selectedDate)] || [];
    const takenIdx = new Set(list.map(r => r.shift_index));
    return (area.shifts || []).map((s: any, i: number) => ({ ...s, index: i, taken: takenIdx.has(i) }));
  }, [area, selectedDate, taken]);

  const submit = async () => {
    if (!selectedDate) return;
    setBusy(true); setErr(null);
    try {
      await api.post("/reservations", {
        area_id: id, date: ymd(selectedDate),
        shift_index: area.booking_type === "shift" ? selectedShift : null,
        accepted_rules: accepted,
      });
      setShowConfirm(false); setToast("Reserva confirmada!");
      setTimeout(() => setToast(null), 2000);
      await loadMonth();
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  if (!area) return <Screen><ActivityIndicator style={{ marginTop: 80 }} color={colors.brandPrimary} /></Screen>;

  const total = area.fee_type === "free" ? 0 : (area.total ?? (area.fee_value + area.cleaning_fee));
  const usage = area.usage ?? (area.fee_type === "fixed" ? area.fee_value : 0);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + 100, gap: spacing.md }}>
        <Pressable onPress={() => router.back()} testID="back-btn"><Text style={{ color: colors.brandPrimary, fontWeight: "600" }}>← Voltar</Text></Pressable>
        <Text style={{ fontSize: font.size.xxl, fontWeight: "700", color: colors.onSurface }}>{area.name}</Text>
        {area.description ? <Text style={{ color: colors.muted }}>{area.description}</Text> : null}

        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Pressable testID="cal-prev" onPress={() => setCursor(new Date(year, month - 1, 1))}><Text style={{ color: colors.brandPrimary, fontSize: 24 }}>‹</Text></Pressable>
            <Text style={{ fontWeight: "700", color: colors.onSurface, fontSize: font.size.base }}>{MONTHS[month]} {year}</Text>
            <Pressable testID="cal-next" onPress={() => setCursor(new Date(year, month + 1, 1))}><Text style={{ color: colors.brandPrimary, fontSize: 24 }}>›</Text></Pressable>
          </View>
          <View style={{ flexDirection: "row", marginTop: spacing.md }}>
            {WEEK.map((w, i) => <Text key={i} style={{ flex: 1, textAlign: "center", color: colors.muted, fontSize: 12, fontWeight: "600" }}>{w}</Text>)}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 6 }}>
            {cells.map((d, i) => {
              if (!d) return <View key={i} style={{ width: `${100/7}%`, aspectRatio: 1 }} />;
              const key = ymd(d);
              const past = d < today;
              const takenAll = isDayFullyTaken(d);
              const partial = !past && !takenAll && (taken[key] || []).length > 0 && area.booking_type === "shift";
              let bg = colors.success; let fg = "#FFFFFF";
              if (past) { bg = colors.info; fg = colors.onInfo; }
              else if (takenAll) { bg = colors.error; fg = "#FFFFFF"; }
              else if (partial) { bg = colors.warning; fg = colors.onWarning; }
              return (
                <Pressable key={i} testID={`cal-day-${key}`} onPress={() => openDay(d)} disabled={past || takenAll} style={{ width: `${100/7}%`, aspectRatio: 1, padding: 3 }}>
                  <View style={{ flex: 1, backgroundColor: bg, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: fg, fontWeight: "600" }}>{d.getDate()}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: spacing.md }}>
            <Legend color={colors.success} text="Livre" />
            <Legend color={colors.error} text="Reservado" />
            <Legend color={colors.warning} text="Parcial" />
            <Legend color={colors.info} text="Indisponível" />
          </View>
        </Card>

        <Card>
          <Text style={{ fontWeight: "700", color: colors.onSurface, fontSize: font.size.base, marginBottom: 6 }}>Valores</Text>
          {area.fee_type === "free" ? (
            <Badge text="Sem custo" tone="success" />
          ) : (
            <>
              <Row label={area.fee_type === "percent" ? `Taxa de uso (${area.fee_value}% do condomínio)` : "Taxa de uso"} value={formatBRL(usage)} />
              <Row label="Taxa de limpeza" value={formatBRL(area.cleaning_fee)} />
              <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: 6 }} />
              <Row label="Total" value={formatBRL(total)} bold />
            </>
          )}
        </Card>

        {area.rules ? (
          <Card>
            <Text style={{ fontWeight: "700", color: colors.onSurface, marginBottom: 6 }}>Regras de uso</Text>
            <Text style={{ color: colors.onSurfaceSecondary, lineHeight: 20 }}>{area.rules}</Text>
          </Card>
        ) : null}
      </ScrollView>

      <Modal visible={showConfirm} transparent animationType="slide" onRequestClose={() => setShowConfirm(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(45,42,90,0.5)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.lg }}>
            <Text style={{ fontSize: font.size.xl, fontWeight: "700", color: colors.onSurface }}>Confirmar reserva</Text>
            <Text style={{ color: colors.muted }}>{area.name}</Text>
            <Text style={{ color: colors.onSurface, fontWeight: "600" }}>
              {selectedDate?.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
            </Text>
            {area.booking_type === "shift" && (
              <View style={{ gap: 8 }}>
                <Text style={{ color: colors.muted, fontSize: 13 }}>Turno</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {availableShifts.map((s: any) => (
                    <Pressable key={s.index} disabled={s.taken} onPress={() => setSelectedShift(s.index)} testID={`shift-${s.index}`} style={{
                      paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill,
                      backgroundColor: s.taken ? colors.info : selectedShift === s.index ? colors.brandPrimary : colors.surfaceTertiary,
                      opacity: s.taken ? 0.6 : 1,
                    }}>
                      <Text style={{ color: selectedShift === s.index ? "#FFFFFF" : colors.onSurface, fontWeight: "600" }}>
                        {s.name} · {s.start}-{s.end} {s.taken ? "(reservado)" : ""}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
            <View style={{ padding: 12, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md }}>
              {area.fee_type === "free" ? (
                <Text style={{ color: colors.success, fontWeight: "700" }}>Sem custo</Text>
              ) : (
                <>
                  <Row label="Taxa de uso" value={formatBRL(usage)} />
                  <Row label="Taxa de limpeza" value={formatBRL(area.cleaning_fee)} />
                  <Row label="Total" value={formatBRL(total)} bold />
                </>
              )}
            </View>
            <Pressable onPress={() => setAccepted(!accepted)} testID="accept-rules" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.brandPrimary, backgroundColor: accepted ? colors.brandPrimary : "transparent", alignItems: "center", justifyContent: "center" }}>
                {accepted && <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>✓</Text>}
              </View>
              <Text style={{ flex: 1, color: colors.onSurface, fontSize: 14 }}>
                {area.fee_type === "free" ? "Li e aceito as regras de uso." : "Li e aceito as regras e o valor que será lançado no meu boleto."}
              </Text>
            </Pressable>
            {err && <Text style={{ color: colors.error }} testID="confirm-error">{err}</Text>}
            <PrimaryButton testID="confirm-reserve" title="Confirmar reserva" onPress={submit} loading={busy}
              disabled={!accepted || (area.booking_type === "shift" && selectedShift === null)} />
            <PrimaryButton title="Cancelar" variant="ghost" onPress={() => setShowConfirm(false)} />
          </View>
        </View>
      </Modal>
      {toast && <Toast message={toast} tone="success" />}
    </Screen>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ color: colors.muted }}>{label}</Text>
      <Text style={{ color: colors.onSurface, fontWeight: bold ? "700" : "500" }}>{value}</Text>
    </View>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ color: colors.onSurface, fontSize: 12 }}>{text}</Text>
    </View>
  );
}
