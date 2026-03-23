import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../../../lib/supabase';
import { useSupabaseAuth } from '../../../../hooks/useSupabaseAuth';

const NEON = '#25F0C8';
const ACCENT = '#19705C';
const BUDDY_AVATAR = require('../../../../assets/buddy_avatar.png');

// ─── Types ────────────────────────────────────────────────────────────────────

type Message = {
  id: string;
  role: 'user' | 'buddy';
  text: string;
  ts: number;
};

type BuildContext = {
  buddyName: string;
  plannedBudget: number;
  spentTotal: number;
  budgetPct: number;
  obecnyEtap: string;
  kolejnyEtap: string;
  etapyTotal: number;
  etapyDone: number;
  todayTasks: string[];
  dataStart: string | null;
  dataKoniec: string | null;
};

// ─── Quick questions ──────────────────────────────────────────────────────────

const QUICK_QUESTIONS = [
  { key: 'q1', label: 'Jak idzie budżet?' },
  { key: 'q2', label: 'Który etap teraz?' },
  { key: 'q3', label: 'Co dziś mam?' },
  { key: 'q4', label: 'Kiedy koniec?' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPLN(v: number) {
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency', currency: 'PLN', maximumFractionDigits: 0,
  }).format(v);
}

function pad2(n: number) { return String(n).padStart(2, '0'); }
function toYMD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function uid() { return Math.random().toString(36).slice(2) + Date.now(); }

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(ctx: BuildContext): string {
  return `Jesteś ${ctx.buddyName} — inteligentny kierownik budowy AI w aplikacji BuildIQ. Rozmawiasz z właścicielem budowy domu. Jesteś profesjonalny, konkretny i przyjazny. Odpowiadasz po polsku, zwięźle (max 3-4 zdania), używasz liczb i faktów z kontekstu.

DANE O BUDOWIE:
- Budżet: ${formatPLN(ctx.spentTotal)} wydane z ${formatPLN(ctx.plannedBudget)} (${ctx.budgetPct}%)
- Obecny etap: ${ctx.obecnyEtap}
- Kolejny etap: ${ctx.kolejnyEtap}
- Postęp: ${ctx.etapyDone} z ${ctx.etapyTotal} etapów ukończonych
- Start budowy: ${ctx.dataStart ?? 'nie ustawiono'}
- Planowany koniec: ${ctx.dataKoniec ?? 'nie ustawiono'}
- Zadania na dziś: ${ctx.todayTasks.length > 0 ? ctx.todayTasks.join(', ') : 'brak'}

Odpowiadaj na podstawie tych danych. Jeśli czegoś nie wiesz — powiedz szczerze.`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BuddyChatScreen() {
  const { session } = useSupabaseAuth();
  const topPad = (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 44) + 8;

  const [buddyName, setBuddyName] = useState('Kierownik');
  const [context, setContext] = useState<BuildContext | null>(null);
  const [contextLoading, setContextLoading] = useState(true);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const scrollRef = useRef<ScrollView>(null);

  // Typing dots animation
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!sending) return;
    const anim = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay(600),
        ])
      );
    const a1 = anim(dot1, 0);
    const a2 = anim(dot2, 200);
    const a3 = anim(dot3, 400);
    a1.start(); a2.start(); a3.start();
    return () => {
      a1.stop(); a2.stop(); a3.stop();
      dot1.setValue(0); dot2.setValue(0); dot3.setValue(0);
    };
  }, [sending, dot1, dot2, dot3]);

  // ── Load build context ──
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const userId = session?.user?.id;
        if (!userId) return;

        const today = toYMD(new Date());

        const [profileRes, invRes, expRes, etapyRes, tasksRes] = await Promise.all([
          supabase.from('profiles').select('ai_buddy_name').eq('user_id', userId).maybeSingle(),
          supabase.from('inwestycje').select('budzet,data_start,data_koniec').eq('user_id', userId).maybeSingle(),
          supabase.from('wydatki').select('kwota,status').eq('user_id', userId),
          supabase.from('etapy').select('nazwa,kolejnosc,status').eq('user_id', userId).order('kolejnosc', { ascending: true }),
          supabase.from('zadania').select('nazwa').eq('user_id', userId).eq('data', today),
        ]);

        if (!alive) return;

        const name = profileRes.data?.ai_buddy_name ?? 'Kierownik';
        setBuddyName(name);

        const plannedBudget = Number(invRes.data?.budzet ?? 0);
        const spentTotal = (expRes.data ?? [])
          .filter((w: any) => String(w.status ?? '').toLowerCase().trim() === 'poniesiony')
          .reduce((acc: number, w: any) => acc + Number(w.kwota ?? 0), 0);
        const budgetPct = plannedBudget > 0 ? Math.round((spentTotal / plannedBudget) * 100) : 0;

        const etapy = (etapyRes.data ?? []) as any[];
        const isDone = (s: string | null) => (s ?? '').toLowerCase().trim() === 'zrealizowany';
        const etapyDone = etapy.filter(e => isDone(e.status)).length;
        const currentIdx = etapy.findIndex(e => !isDone(e.status));
        const obecnyEtap = currentIdx >= 0
          ? etapy[currentIdx].nazwa
          : etapy.length > 0 ? 'Wszystkie ukończone' : 'Brak etapów';
        const kolejnyEtap = currentIdx >= 0 && etapy[currentIdx + 1]
          ? etapy[currentIdx + 1].nazwa : '—';

        const todayTasks = (tasksRes.data ?? []).map((task: any) => task.nazwa);

        const ctx: BuildContext = {
          buddyName: name,
          plannedBudget,
          spentTotal,
          budgetPct,
          obecnyEtap,
          kolejnyEtap,
          etapyTotal: etapy.length,
          etapyDone,
          todayTasks,
          dataStart: invRes.data?.data_start ?? null,
          dataKoniec: invRes.data?.data_koniec ?? null,
        };

        setContext(ctx);

        // Auto-brief przy wejściu
        const parts: string[] = [];
        if (ctx.etapyTotal > 0) {
          parts.push(`Jesteś na etapie **${ctx.obecnyEtap}** (${ctx.etapyDone}/${ctx.etapyTotal} ukończonych).`);
        }
        if (ctx.plannedBudget > 0) {
          const statusLabel = ctx.budgetPct >= 90 ? '⚠️ Budżet krytyczny'
            : ctx.budgetPct >= 70 ? '⚡ Budżet wysoki' : '✅ Budżet pod kontrolą';
          parts.push(`${statusLabel}: ${formatPLN(ctx.spentTotal)} z ${formatPLN(ctx.plannedBudget)} (${ctx.budgetPct}%).`);
        }
        if (ctx.todayTasks.length > 0) {
          const shown = ctx.todayTasks.slice(0, 3).join(', ');
          const extra = ctx.todayTasks.length > 3 ? ` i ${ctx.todayTasks.length - 3} więcej` : '';
          parts.push(`Na dziś: ${shown}${extra}.`);
        }

        const briefText = parts.length > 0
          ? parts.join('\n\n') + '\n\nCzego potrzebujesz?'
          : 'Cześć! Jestem gotowy. Uzupełnij dane o budowie, żebym mógł lepiej pomagać.';

        setMessages([{ id: uid(), role: 'buddy', text: briefText, ts: Date.now() }]);
      } catch {
        setMessages([{ id: uid(), role: 'buddy', text: 'Cześć! Wystąpił problem z pobieraniem danych. Spróbuj ponownie.', ts: Date.now() }]);
      } finally {
        if (alive) setContextLoading(false);
      }
    };
    load();
    return () => { alive = false; };
  }, [session?.user?.id]);

  // ── Send ──
  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending || !context) return;

    const userMsg: Message = { id: uid(), role: 'user', text: trimmed, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);

    try {
      const history = messages.map(m => ({
        role: m.role === 'buddy' ? 'assistant' : 'user',
        content: m.text,
      }));

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: buildSystemPrompt(context),
          messages: [...history, { role: 'user', content: trimmed }],
        }),
      });

      const data = await response.json();
      const replyText = data?.content?.[0]?.text ?? 'Przepraszam, nie udało się uzyskać odpowiedzi.';

      setMessages(prev => [...prev, { id: uid(), role: 'buddy', text: replyText, ts: Date.now() }]);
    } catch {
      setMessages(prev => [...prev, {
        id: uid(), role: 'buddy',
        text: 'Przepraszam, wystąpił błąd połączenia. Spróbuj ponownie.',
        ts: Date.now(),
      }]);
    } finally {
      setSending(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={styles.bg} />
      <View pointerEvents="none" style={styles.glowTop} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad }]}>
        <View style={styles.headerAvatarWrap}>
          <Image source={BUDDY_AVATAR} style={styles.headerAvatar} resizeMode="cover" />
          <View style={styles.onlineDot} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName}>{buddyName}</Text>
          <Text style={styles.headerSub}>Kierownik budowy AI</Text>
        </View>
        <View style={styles.headerBadge}>
          <Feather name="cpu" size={11} color="#0B1120" />
          <Text style={styles.headerBadgeText}>AI</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {contextLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={NEON} />
              <Text style={styles.loadingText}>Analizuję Twoją budowę…</Text>
            </View>
          ) : (
            messages.map(msg => (
              <View
                key={msg.id}
                style={[styles.msgRow, msg.role === 'user' ? styles.msgRowUser : styles.msgRowBuddy]}
              >
                {msg.role === 'buddy' && (
                  <Image source={BUDDY_AVATAR} style={styles.msgAvatar} resizeMode="cover" />
                )}
                <BlurView
                  intensity={msg.role === 'buddy' ? 14 : 0}
                  tint="dark"
                  style={[
                    styles.msgBubble,
                    msg.role === 'buddy' ? styles.msgBubbleBuddy : styles.msgBubbleUser,
                  ]}
                >
                  <Text style={[styles.msgText, msg.role === 'user' ? styles.msgTextUser : styles.msgTextBuddy]}>
                    {msg.text}
                  </Text>
                </BlurView>
              </View>
            ))
          )}

          {sending && (
            <View style={[styles.msgRow, styles.msgRowBuddy]}>
              <Image source={BUDDY_AVATAR} style={styles.msgAvatar} resizeMode="cover" />
              <BlurView intensity={14} tint="dark" style={[styles.msgBubble, styles.msgBubbleBuddy, styles.typingBubble]}>
                {[dot1, dot2, dot3].map((dot, i) => (
                  <Animated.View
                    key={i}
                    style={[
                      styles.typingDot,
                      {
                        opacity: dot,
                        transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
                      },
                    ]}
                  />
                ))}
              </BlurView>
            </View>
          )}
        </ScrollView>

        {/* Quick questions — pokazuj tylko gdy mała historia */}
        {messages.length <= 1 && !sending && !contextLoading && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickWrap}
            style={styles.quickScroll}
          >
            {QUICK_QUESTIONS.map(q => (
              <TouchableOpacity
                key={q.key}
                style={styles.quickChip}
                onPress={() => sendMessage(q.label)}
                activeOpacity={0.85}
              >
                <Text style={styles.quickChipText}>{q.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Input */}
        <View style={styles.inputBar}>
          <BlurView intensity={18} tint="dark" style={styles.inputWrap}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={`Zapytaj ${buddyName}…`}
              placeholderTextColor="rgba(255,255,255,0.28)"
              style={styles.input}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
              onPress={() => sendMessage(input)}
              disabled={!input.trim() || sending}
              activeOpacity={0.85}
            >
              <Feather
                name="send"
                size={18}
                color={input.trim() && !sending ? '#0B1120' : 'rgba(255,255,255,0.25)'}
              />
            </TouchableOpacity>
          </BlurView>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000' },
  glowTop: {
    position: 'absolute', width: 360, height: 360, borderRadius: 180,
    backgroundColor: ACCENT, opacity: 0.07, top: -180, right: -120,
  },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 18, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  headerAvatarWrap: { position: 'relative' },
  headerAvatar: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 2, borderColor: 'rgba(37,240,200,0.40)',
  },
  onlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: NEON, borderWidth: 2, borderColor: '#000',
  },
  headerName: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
  headerSub: { color: 'rgba(255,255,255,0.42)', fontSize: 12, fontWeight: '600', marginTop: 1 },
  headerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
    backgroundColor: NEON,
  },
  headerBadgeText: { color: '#0B1120', fontSize: 10, fontWeight: '900' },

  messageList: { paddingHorizontal: 14, paddingTop: 16, paddingBottom: 8, gap: 12 },
  loadingWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 12 },
  loadingText: { color: 'rgba(255,255,255,0.45)', fontSize: 13, fontWeight: '600' },

  msgRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  msgRowBuddy: { justifyContent: 'flex-start' },
  msgRowUser: { justifyContent: 'flex-end' },

  msgAvatar: {
    width: 30, height: 30, borderRadius: 15, flexShrink: 0,
    borderWidth: 1, borderColor: 'rgba(37,240,200,0.30)',
  },
  msgBubble: { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, overflow: 'hidden' },
  msgBubbleBuddy: {
    borderBottomLeftRadius: 4,
    backgroundColor: 'rgba(37,240,200,0.06)',
    borderWidth: 1, borderColor: 'rgba(37,240,200,0.16)',
  },
  msgBubbleUser: { borderBottomRightRadius: 4, backgroundColor: ACCENT },

  msgText: { fontSize: 14, lineHeight: 21, fontWeight: '600' },
  msgTextBuddy: { color: 'rgba(255,255,255,0.88)' },
  msgTextUser: { color: '#FFFFFF' },

  typingBubble: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 14 },
  typingDot: { width: 7, height: 7, borderRadius: 99, backgroundColor: NEON },

  quickScroll: { maxHeight: 52 },
  quickWrap: { paddingHorizontal: 14, paddingVertical: 8, gap: 8 },
  quickChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    backgroundColor: 'rgba(37,240,200,0.08)',
    borderWidth: 1, borderColor: 'rgba(37,240,200,0.25)',
  },
  quickChipText: { color: NEON, fontSize: 13, fontWeight: '700' },

  inputBar: {
    paddingHorizontal: 14,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    paddingTop: 8,
  },
  inputWrap: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(37,240,200,0.22)',
    paddingHorizontal: 14, paddingVertical: 10, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  input: {
    flex: 1, color: '#FFFFFF', fontSize: 15, fontWeight: '600',
    maxHeight: 100, paddingTop: 2,
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: NEON,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  sendBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.08)' },
});