import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Modal,
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
import { useTranslation } from 'react-i18next';
import { publicConfig, supabase } from '../../../../lib/supabase';
import { useSupabaseAuth } from '../../../../hooks/useSupabaseAuth';

const NEON = '#25F0C8';
const ACCENT = '#19705C';
const BUDDY_AVATAR = require('../../../../assets/buddy_avatar.png');

const AI_CHAT_ENDPOINT = publicConfig.aiChatEndpoint;
const AI_REQUEST_TIMEOUT_MS = 20000;

type Message = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at?: string;
  status?: 'streaming' | 'completed' | 'error';
  pending?: boolean;
};

type ConversationItem = {
  id: string;
  title: string | null;
  assistant_name: string | null;
  last_message_at: string | null;
  created_at: string;
};

function uid() {
  return Math.random().toString(36).slice(2) + Date.now();
}

function formatConversationDate(value: string | null | undefined, locale: string) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
  });
}

export default function BuddyChatScreen() {
  const { session } = useSupabaseAuth();
  const { t, i18n } = useTranslation('buddy');
  const topPad = (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 44) + 8;
  const uiLocale = (i18n.resolvedLanguage || i18n.language || 'en').startsWith('de')
    ? 'de-DE'
    : (i18n.resolvedLanguage || i18n.language || 'en').startsWith('pl')
      ? 'pl-PL'
      : 'en-US';

  const [buddyName, setBuddyName] = useState(t('chat.fallbackName'));
  const [loadingInitial, setLoadingInitial] = useState(true);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [historyVisible, setHistoryVisible] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);

  const QUICK_QUESTIONS = [
    { key: 'q1', label: t('chat.quickQuestions.q1') },
    { key: 'q2', label: t('chat.quickQuestions.q2') },
    { key: 'q3', label: t('chat.quickQuestions.q3') },
    { key: 'q4', label: t('chat.quickQuestions.q4') },
  ];

  const scrollRef = useRef<ScrollView>(null);
  const activeRequestAbortRef = useRef<AbortController | null>(null);
  const activeRequestTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
      dot1.setValue(0);
      dot2.setValue(0);
      dot3.setValue(0);
    };
  }, [sending, dot1, dot2, dot3]);

  useEffect(() => {
    const loadInitial = async () => {
      try {
        const userId = session?.user?.id;
        if (!userId) {
          setLoadingInitial(false);
          return;
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('ai_buddy_name')
          .eq('user_id', userId)
          .maybeSingle();

        if (error) throw error;

        const name = String(data?.ai_buddy_name ?? '').trim() || t('chat.fallbackName');
        setBuddyName(name);

        await loadConversations();
      } catch {
        setMessages([
          {
            id: uid(),
            role: 'assistant',
            content: t('chat.messages.loadDataError'),
          },
        ]);
      } finally {
        setLoadingInitial(false);
      }
    };

    loadInitial();
  }, [session?.user?.id, t]);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }, [messages]);

  useEffect(() => {
    return () => {
      activeRequestAbortRef.current?.abort();
      if (activeRequestTimeoutRef.current) {
        clearTimeout(activeRequestTimeoutRef.current);
        activeRequestTimeoutRef.current = null;
      }
    };
  }, []);

  const currentConversationTitle =
    conversations.find((c) => c.id === currentConversationId)?.title || t('chat.newConversation');

  const loadConversations = async () => {
    try {
      setLoadingHistory(true);

      const { data, error } = await supabase.rpc('get_my_ai_conversations', {
        p_limit: 20,
        p_offset: 0,
      });

      if (error) throw error;

      const rows = Array.isArray(data) ? (data as ConversationItem[]) : [];
      setConversations(rows);

      if (!currentConversationId && rows.length > 0) {
        const first = rows[0];
        setCurrentConversationId(first.id);
        await loadMessages(first.id);
      }

      if (!rows.length && messages.length === 0) {
        setMessages([
          {
            id: uid(),
            role: 'assistant',
            content: t('chat.messages.emptyHistoryIntro'),
          },
        ]);
      }
    } catch {
      setError(t('chat.errors.fetchHistory'));
    } finally {
      setLoadingHistory(false);
    }
  };

  const loadMessages = async (conversationId: string) => {
    try {
      setLoadingMessages(true);

      const { data, error } = await supabase.rpc('get_ai_messages', {
        p_conversation_id: conversationId,
        p_limit: 100,
        p_offset: 0,
      });

      if (error) throw error;

      const rows = Array.isArray(data) ? (data as Message[]) : [];
      setMessages(rows);
      setCurrentConversationId(conversationId);
    } catch {
      setError(t('chat.errors.fetchMessages'));
    } finally {
      setLoadingMessages(false);
    }
  };

  const startNewConversation = () => {
    if (sending) return;
    setCurrentConversationId(null);
    setMessages([
      {
        id: uid(),
        role: 'assistant',
        content: t('chat.messages.newConversationStarted'),
      },
    ]);
    setHistoryVisible(false);
    setError(null);
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    let requestTimedOut = false;

    try {
      setSending(true);
      setError(null);

      const {
        data: { session: activeSession },
      } = await supabase.auth.getSession();

      const accessToken = activeSession?.access_token;
      if (!accessToken) throw new Error(t('chat.errors.noSession'));

      const tempUserId = `tmp-user-${Date.now()}`;
      const tempAssistantId = `tmp-ai-${Date.now()}`;

      const optimisticUser: Message = {
        id: tempUserId,
        role: 'user',
        content: trimmed,
        created_at: new Date().toISOString(),
        pending: true,
        status: 'completed',
      };

      setMessages((prev) => [...prev, optimisticUser]);
      setInput('');
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);

      activeRequestAbortRef.current?.abort();
      if (activeRequestTimeoutRef.current) {
        clearTimeout(activeRequestTimeoutRef.current);
        activeRequestTimeoutRef.current = null;
      }

      const abortController = new AbortController();
      activeRequestAbortRef.current = abortController;
      activeRequestTimeoutRef.current = setTimeout(() => {
        requestTimedOut = true;
        abortController.abort();
      }, AI_REQUEST_TIMEOUT_MS);

      const response = await fetch(AI_CHAT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        signal: abortController.signal,
        body: JSON.stringify({
          conversation_id: currentConversationId,
          message: trimmed,
          assistant_name: buddyName,
        }),
      });

      if (!response.ok) {
        let errorText = '';
        try {
          errorText = await response.text();
        } catch {
          errorText = '';
        }
        throw new Error(errorText || t('chat.errors.aiConnection'));
      }

      let payload: {
        conversation_id?: string | null;
        assistant_message_id?: string | null;
        message?: string | null;
      } | null = null;

      try {
        payload = (await response.json()) as {
          conversation_id?: string | null;
          assistant_message_id?: string | null;
          message?: string | null;
        };
      } catch {
        throw new Error(
          t('chat.messages.invalidResponse', {
            defaultValue: 'Nie udało się odczytać odpowiedzi AI. Spróbuj ponownie.',
          })
        );
      }

      const resolvedConversationId = payload?.conversation_id || currentConversationId;
      const finalAssistantText = String(payload?.message ?? '').trim();

      if (!finalAssistantText) {
        throw new Error(
          t('chat.messages.generateFallback', {
            defaultValue: 'Nie udało mi się teraz przygotować odpowiedzi. Spróbuj ponownie za chwilę.',
          })
        );
      }

      setMessages((prev) => [
        ...prev.map((m) => (m.id === tempUserId ? { ...m, pending: false } : m)),
        {
          id: payload?.assistant_message_id || tempAssistantId,
          role: 'assistant',
          content: finalAssistantText || t('chat.messages.generateFallback'),
          created_at: new Date().toISOString(),
          pending: false,
          status: 'completed',
        },
      ]);

      if (resolvedConversationId) {
        setCurrentConversationId(resolvedConversationId);
        await loadConversations();
        await loadMessages(resolvedConversationId);
      }
    } catch (e: any) {
      const isAbortError = e?.name === 'AbortError';
      const msg = requestTimedOut
        ? t('chat.messages.timeoutError', {
            defaultValue: 'Połączenie z AI trwało zbyt długo. Spróbuj ponownie.',
          })
        : isAbortError
        ? t('chat.messages.requestCancelled', {
            defaultValue: 'Żądanie zostało przerwane. Spróbuj ponownie.',
          })
        : e?.message ?? t('chat.messages.connectionError');

      setMessages((prev) =>
        prev.map((m) =>
          m.pending && m.role === 'user'
            ? { ...m, pending: false }
            : m
        )
      );

      setError(msg);
    } finally {
      activeRequestAbortRef.current = null;
      if (activeRequestTimeoutRef.current) {
        clearTimeout(activeRequestTimeoutRef.current);
        activeRequestTimeoutRef.current = null;
      }
      setSending(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    }
  };

  return (
      <View style={styles.screen}>
        <View pointerEvents="none" style={styles.bg} />
        <View pointerEvents="none" style={styles.glowTop} />

      <View style={[styles.header, { paddingTop: Math.max(topPad - 14, 4) }]}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerIdentity}>
            <View style={styles.headerAvatarWrap}>
              <Image source={BUDDY_AVATAR} style={styles.headerAvatar} resizeMode="cover" />
              <View style={styles.onlineDot} />
            </View>

            <Text style={styles.headerName}>{buddyName}</Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerIconBtn}
            activeOpacity={0.85}
            onPress={startNewConversation}
            disabled={sending}
          >
            <Feather name="edit-3" size={17} color={NEON} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerIconBtn}
            activeOpacity={0.85}
            onPress={() => setHistoryVisible(true)}
          >
            <Feather name="clock" size={17} color={NEON} />
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {loadingInitial || loadingMessages ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={NEON} />
              <Text style={styles.loadingText}>{t('chat.loading.conversation')}</Text>
            </View>
          ) : (
            messages.map((msg) => (
              <View
                key={msg.id}
                style={[
                  styles.msgRow,
                  msg.role === 'user' ? styles.msgRowUser : styles.msgRowBuddy,
                ]}
              >
                {msg.role !== 'user' && (
                  <Image source={BUDDY_AVATAR} style={styles.msgAvatar} resizeMode="cover" />
                )}

                <BlurView
                  intensity={msg.role === 'user' ? 0 : 14}
                  tint="dark"
                  style={[
                    styles.msgBubble,
                    msg.role === 'user' ? styles.msgBubbleUser : styles.msgBubbleBuddy,
                    msg.status === 'error' && styles.msgBubbleError,
                  ]}
                >
                  <Text
                    style={[
                      styles.msgText,
                      msg.role === 'user' ? styles.msgTextUser : styles.msgTextBuddy,
                    ]}
                  >
                    {msg.content}
                  </Text>
                </BlurView>
              </View>
            ))
          )}

          {sending && (
            <View style={[styles.msgRow, styles.msgRowBuddy]}>
              <Image source={BUDDY_AVATAR} style={styles.msgAvatar} resizeMode="cover" />
              <BlurView
                intensity={14}
                tint="dark"
                style={[styles.msgBubble, styles.msgBubbleBuddy, styles.typingBubble]}
              >
                {[dot1, dot2, dot3].map((dot, i) => (
                  <Animated.View
                    key={i}
                    style={[
                      styles.typingDot,
                      {
                        opacity: dot,
                        transform: [
                          {
                            translateY: dot.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0, -4],
                            }),
                          },
                        ],
                      },
                    ]}
                  />
                ))}
              </BlurView>
            </View>
          )}

          {!!error && !sending && (
            <Text style={styles.inlineError}>{error}</Text>
          )}
        </ScrollView>

        {messages.length <= 1 && !sending && !loadingInitial && !loadingMessages && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickWrap}
            style={styles.quickScroll}
          >
            {QUICK_QUESTIONS.map((q) => (
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

        <View style={styles.inputBar}>
          <BlurView intensity={18} tint="dark" style={styles.inputWrap}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={t('chat.inputPlaceholder', { name: buddyName })}
              placeholderTextColor="#888888"
              style={styles.input}
              multiline
              maxLength={800}
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

      <Modal
        visible={historyVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setHistoryVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('chat.historyTitle')}</Text>
              <TouchableOpacity
                onPress={() => setHistoryVisible(false)}
                style={styles.modalCloseBtn}
                activeOpacity={0.85}
              >
                <Feather name="x" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.newChatBtn}
              onPress={startNewConversation}
              activeOpacity={0.9}
            >
              <Feather name="plus" size={16} color="#0B1120" />
              <Text style={styles.newChatBtnText}>{t('chat.newConversation')}</Text>
            </TouchableOpacity>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 20 }}
            >
              {loadingHistory ? (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator color={NEON} />
                  <Text style={styles.loadingText}>{t('chat.loading.history')}</Text>
                </View>
              ) : conversations.length === 0 ? (
                <Text style={styles.emptyHistoryText}>{t('chat.emptyHistory')}</Text>
              ) : (
                conversations.map((conv) => {
                  const active = conv.id === currentConversationId;
                  return (
                    <TouchableOpacity
                      key={conv.id}
                      style={[styles.historyItem, active && styles.historyItemActive]}
                      activeOpacity={0.85}
                      onPress={async () => {
                        setHistoryVisible(false);
                        await loadMessages(conv.id);
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.historyTitle} numberOfLines={1}>
                          {conv.title || t('chat.conversationFallback')}
                        </Text>
                        <Text style={styles.historyMeta}>
                          {formatConversationDate(conv.last_message_at || conv.created_at, uiLocale)}
                        </Text>
                      </View>
                      {active && <Feather name="check" size={16} color={NEON} />}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
      </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000' },
  glowTop: {
    position: 'absolute',
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: ACCENT,
    opacity: 0.07,
    top: -180,
    right: -120,
  },

  header: {
    position: 'relative',
    alignItems: 'stretch',
    paddingHorizontal: 18,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  headerTopRow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    maxWidth: '72%',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  headerAvatarWrap: { position: 'relative' },
  headerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: 'rgba(37,240,200,0.40)',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: NEON,
    borderWidth: 2,
    borderColor: '#000',
  },
  headerName: {
    marginLeft: 12,
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 24,
    flexShrink: 1,
    textAlign: 'center',
  },
  headerIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(37,240,200,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.18)',
  },

  messageList: {
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 12,
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    fontWeight: '600',
  },

  msgRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  msgRowBuddy: { justifyContent: 'flex-start' },
  msgRowUser: { justifyContent: 'flex-end' },

  msgAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    flexShrink: 0,
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.30)',
  },
  msgBubble: {
    maxWidth: '78%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    overflow: 'hidden',
  },
  msgBubbleBuddy: {
    borderBottomLeftRadius: 4,
    backgroundColor: 'rgba(37,240,200,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.16)',
  },
  msgBubbleUser: {
    borderBottomRightRadius: 4,
    backgroundColor: ACCENT,
  },
  msgBubbleError: {
    borderColor: 'rgba(252,165,165,0.35)',
    backgroundColor: 'rgba(127,29,29,0.25)',
  },

  msgText: { fontSize: 14, lineHeight: 21, fontWeight: '600' },
  msgTextBuddy: { color: 'rgba(255,255,255,0.88)' },
  msgTextUser: { color: '#FFFFFF' },

  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 14,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 99,
    backgroundColor: NEON,
  },

  inlineError: {
    color: '#FCA5A5',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
  },

  quickScroll: { maxHeight: 52 },
  quickWrap: { paddingHorizontal: 14, paddingVertical: 8, gap: 8 },
  quickChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(37,240,200,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.25)',
  },
  quickChipText: { color: NEON, fontSize: 13, fontWeight: '700' },

  inputBar: {
    paddingHorizontal: 14,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    paddingTop: 8,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.22)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    overflow: 'hidden',
    backgroundColor: '#0B0F14',
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    maxHeight: 100,
    paddingTop: 2,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: NEON,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sendBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.08)' },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#050915',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderColor: 'rgba(37,240,200,0.14)',
    minHeight: '55%',
    maxHeight: '82%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },

  newChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: NEON,
    paddingVertical: 13,
    borderRadius: 16,
    marginBottom: 14,
  },
  newChatBtnText: {
    color: '#0B1120',
    fontSize: 14,
    fontWeight: '900',
  },

  emptyHistoryText: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 13,
    fontWeight: '600',
    paddingTop: 14,
    textAlign: 'center',
  },

  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 10,
  },
  historyItemActive: {
    borderColor: 'rgba(37,240,200,0.25)',
    backgroundColor: 'rgba(37,240,200,0.06)',
  },
  historyTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 3,
  },
  historyMeta: {
    color: 'rgba(255,255,255,0.38)',
    fontSize: 12,
    fontWeight: '600',
  },
});
