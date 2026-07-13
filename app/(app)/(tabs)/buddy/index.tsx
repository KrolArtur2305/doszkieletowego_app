import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { publicConfig, supabase } from '../../../../lib/supabase';
import { getAppLocale } from '../../../../lib/i18n';
import { useSupabaseAuth } from '../../../../hooks/useSupabaseAuth';
import { useSubscription } from '../../../../hooks/useSubscription';
import type { SubscriptionPlanKey } from '../../../../src/config/subscriptionPlans';
import { fetchCurrentBuildAccess } from '../../../../lib/buildAccess';
import { loadSharedBuddyName } from '../../../../src/services/buddy/name';
import {
  DEFAULT_BUDDY_AVATAR_ID,
  type BuddyAvatarId,
  getBuddyAvatarSource,
  loadBuddyAvatarId} from '../../../../src/services/buddy/avatar';
import { useOnlineActionGuard } from '../../../../src/services/network/NetworkStatusProvider';

const NEON = '#25F0C8';
const ACCENT = '#19705C';
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
    month: '2-digit'});
}

function displayAssistantText(value: string) {
  return value
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/(^|\s)\*([^*\n]+)\*(?=\s|$|[.,;:!?])/g, '$1$2')
    .replace(/(^|\s)_([^_\n]+)_(?=\s|$|[.,;:!?])/g, '$1$2')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[*]\s+/gm, '- ')
    .trim();
}

type LimitNotice = {
  title: string;
  message: string;
  ctaLabel: string;
  targetPlan: SubscriptionPlanKey | null;
};

function parseLimitError(raw: string): { code: string | null; message: string | null } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return {
      code: typeof parsed.code === 'string' ? parsed.code : null,
      message: typeof parsed.error === 'string' ? parsed.error : null,
    };
  } catch {
    return { code: null, message: trimmed };
  }
}

function buildLimitNotice(
  plan: SubscriptionPlanKey,
  code: string | null,
  t: (key: string, params?: Record<string, unknown>) => string,
): LimitNotice {
  if (code === 'trial_ai_limit_reached' || plan === 'free_trial') {
    return {
      title: t('limitModal.trialTitle'),
      message: t('limitModal.trialMessage'),
      ctaLabel: t('limitModal.upgradeCta'),
      targetPlan: 'pro',
    };
  }

  if (code === 'free_ai_limit_reached' || plan === 'free') {
    return {
      title: t('limitModal.freeTitle'),
      message: t('limitModal.freeMessage'),
      ctaLabel: t('limitModal.upgradeCta'),
      targetPlan: 'pro',
    };
  }

  if (plan === 'pro') {
    return {
      title: t('limitModal.proTitle'),
      message: t('limitModal.proMessage'),
      ctaLabel: t('limitModal.expertCta'),
      targetPlan: 'expert',
    };
  }

  return {
    title: t('limitModal.expertTitle'),
    message: t('limitModal.expertMessage'),
    ctaLabel: t('limitModal.manageCta'),
    targetPlan: null,
  };
}

export default function BuddyChatScreen() {
  const { session } = useSupabaseAuth();
  const { access } = useSubscription();
  const router = useRouter();
  const { t, i18n } = useTranslation('buddy');
  const ensureOnlineAction = useOnlineActionGuard();
  const insets = useSafeAreaInsets();
  const topPad = (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 44) + 8;
  const uiLocale = getAppLocale(i18n.resolvedLanguage || i18n.language);

  const [buddyName, setBuddyName] = useState(t('chat.fallbackName'));
  const [avatarId, setAvatarId] = useState<BuddyAvatarId>(DEFAULT_BUDDY_AVATAR_ID);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [activeInvestmentId, setActiveInvestmentId] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [historyVisible, setHistoryVisible] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [limitNotice, setLimitNotice] = useState<LimitNotice | null>(null);

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);

  const QUICK_QUESTIONS = [
    { key: 'q1', label: t('chat.quickQuestions.q1') },
    { key: 'q2', label: t('chat.quickQuestions.q2') },
    { key: 'q3', label: t('chat.quickQuestions.q3') },
    { key: 'q4', label: t('chat.quickQuestions.q4') }];

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
          Animated.delay(600)])
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

        const access = await fetchCurrentBuildAccess(userId);
        setActiveInvestmentId(access?.investmentId ?? null);
        const name = await loadSharedBuddyName(userId, access?.ownerUserId);
        setBuddyName(name || t('chat.fallbackName'));
        setAvatarId(await loadBuddyAvatarId(userId));

        await loadConversations();
      } catch {
        setMessages([
          {
            id: uid(),
            role: 'assistant',
            content: t('chat.messages.loadDataError')}]);
      } finally {
        setLoadingInitial(false);
      }
    };

    loadInitial();
  }, [session?.user?.id, t]);

  useFocusEffect(
    React.useCallback(() => {
      const userId = session?.user?.id;
      if (!userId) return;

      let active = true;
      loadBuddyAvatarId(userId).then((nextAvatarId) => {
        if (active) setAvatarId(nextAvatarId);
      });

      return () => {
        active = false;
      };
    }, [session?.user?.id])
  );

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
  const avatarSource = getBuddyAvatarSource(avatarId);

  const loadConversations = async () => {
    try {
      setLoadingHistory(true);

      const { data, error } = await supabase.rpc('get_my_ai_conversations', {
        p_limit: 20,
        p_offset: 0});

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
            content: t('chat.messages.emptyHistoryIntro')}]);
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
        p_offset: 0});

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
        content: t('chat.messages.newConversationStarted')}]);
    setHistoryVisible(false);
    setError(null);
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    if (!ensureOnlineAction('Kierownik AI wymaga internetu. Sprawdź połączenie i spróbuj ponownie.')) return;

    let requestTimedOut = false;

    const clearPendingUserMessage = () => {
      setMessages((prev) =>
        prev.map((m) =>
          m.pending && m.role === 'user'
            ? { ...m, pending: false }
            : m
        )
      );
    };

    try {
      setSending(true);
      setError(null);
      setLimitNotice(null);

      const {
        data: { session: activeSession }} = await supabase.auth.getSession();

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
        status: 'completed'};

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
          Authorization: `Bearer ${accessToken}`},
        signal: abortController.signal,
        body: JSON.stringify({
          conversation_id: currentConversationId,
          investment_id: activeInvestmentId,
          message: trimmed,
          assistant_name: buddyName,
          app_language: i18n.resolvedLanguage || i18n.language || 'en'})});

      if (!response.ok) {
        let errorText = '';
        try {
          errorText = await response.text();
        } catch {
          errorText = '';
        }
        const parsed = parseLimitError(errorText);
        if (
          response.status === 403 &&
          parsed?.code &&
          (parsed.code.includes('limit') ||
            parsed.code === 'trial_expired' ||
            parsed.code === 'subscription_required')
        ) {
          clearPendingUserMessage();
          setLimitNotice(buildLimitNotice(access.currentPlan, parsed.code, t));
          return;
        }
        throw new Error(parsed?.message || errorText || t('chat.errors.aiConnection'));
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
          t('chat.messages.invalidResponse')
        );
      }

      const resolvedConversationId = payload?.conversation_id || currentConversationId;
      const finalAssistantText = String(payload?.message ?? '').trim();

      if (!finalAssistantText) {
        throw new Error(
          t('chat.messages.generateFallback')
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
          status: 'completed'}]);

      if (resolvedConversationId) {
        setCurrentConversationId(resolvedConversationId);
        await loadConversations();
        await loadMessages(resolvedConversationId);
      }
    } catch (e: any) {
      if (limitNotice) {
        return;
      }
      const isAbortError = e?.name === 'AbortError';
      const msg = requestTimedOut
        ? t('chat.messages.timeoutError')
        : isAbortError
        ? t('chat.messages.requestCancelled')
        : String(e?.message ?? '').trim() || t('chat.messages.connectionError');

      clearPendingUserMessage();

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

  const handleLimitNoticeAction = () => {
    const targetPlan = limitNotice?.targetPlan;
    setLimitNotice(null);

    if (targetPlan) {
      router.push({
        pathname: '/(app)/(tabs)/ustawienia/subskrypcja',
        params: { planKey: targetPlan },
      });
      return;
    }

    router.push('/(app)/(tabs)/ustawienia/subskrypcja');
  };

  return (
      <View style={styles.screen}>
        <View pointerEvents="none" style={styles.bg} />

      <View style={[styles.header, { paddingTop: Math.max(topPad - 14, 4) }]}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerIdentity}>
            <View style={styles.headerAvatarWrap}>
              <Image source={avatarSource} style={styles.headerAvatar} resizeMode="cover" />
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
            <Feather name="plus" size={19} color={NEON} />
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
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onTouchStart={Keyboard.dismiss}
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
                  msg.role === 'user' ? styles.msgRowUser : styles.msgRowBuddy]}
              >
                {msg.role !== 'user' && (
                  <Image source={avatarSource} style={styles.msgAvatar} resizeMode="cover" />
                )}

                <BlurView
                  intensity={msg.role === 'user' ? 0 : 14}
                  tint="dark"
                  style={[
                    styles.msgBubble,
                    msg.role === 'user' ? styles.msgBubbleUser : styles.msgBubbleBuddy,
                    msg.status === 'error' && styles.msgBubbleError]}
                >
                  <Text
                    style={[
                      styles.msgText,
                      msg.role === 'user' ? styles.msgTextUser : styles.msgTextBuddy]}
                  >
                    {msg.role === 'assistant' ? displayAssistantText(msg.content) : msg.content}
                  </Text>
                </BlurView>
              </View>
            ))
          )}

          {sending && (
            <View style={[styles.msgRow, styles.msgRowBuddy]}>
              <Image source={avatarSource} style={styles.msgAvatar} resizeMode="cover" />
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
                              outputRange: [0, -4]})}]}]}
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

        <View
          style={[
            styles.inputBar,
            { paddingBottom: Math.max(Platform.OS === 'ios' ? 24 : 12, insets.bottom + 12) },
          ]}
        >
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
        visible={!!limitNotice}
        transparent
        animationType="fade"
        onRequestClose={() => setLimitNotice(null)}
      >
        <View style={styles.limitBackdrop}>
          <Pressable style={styles.limitBackdropPressable} onPress={() => setLimitNotice(null)} />
          <View style={styles.limitCardWrap}>
            <BlurView intensity={22} tint="dark" style={styles.limitCard}>
              <View style={styles.limitTopRow}>
                <View style={styles.limitIconWrap}>
                  <Feather name="zap" size={22} color={NEON} />
                </View>
                <TouchableOpacity
                  style={styles.limitCloseBtn}
                  activeOpacity={0.85}
                  onPress={() => setLimitNotice(null)}
                >
                  <Feather name="x" size={18} color="rgba(255,255,255,0.72)" />
                </TouchableOpacity>
              </View>

              <Text style={styles.limitTitle}>{limitNotice?.title}</Text>
              <Text style={styles.limitMessage}>{limitNotice?.message}</Text>

              <TouchableOpacity
                style={styles.limitCta}
                activeOpacity={0.9}
                onPress={handleLimitNoticeAction}
              >
                <Text style={styles.limitCtaText}>
                  {limitNotice?.ctaLabel}
                </Text>
                <Feather name="arrow-right" size={16} color="#07120F" />
              </TouchableOpacity>
            </BlurView>
          </View>
        </View>
      </Modal>

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
    right: -120},

  header: {
    position: 'relative',
    alignItems: 'stretch',
    paddingHorizontal: 18,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)'},
  headerTopRow: {
    alignItems: 'center',
    justifyContent: 'center'},
  headerIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    maxWidth: '72%'},
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4},
  headerAvatarWrap: { position: 'relative' },
  headerAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 2,
    borderColor: 'rgba(37,240,200,0.40)'},
  onlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: NEON,
    borderWidth: 2,
    borderColor: '#000'},
  headerName: {
    marginLeft: 12,
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 28,
    flexShrink: 1,
    textAlign: 'center'},
  headerIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(37,240,200,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.18)'},

  messageList: {
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 12},
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12},
  loadingText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    fontWeight: '600'},

  msgRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  msgRowBuddy: { justifyContent: 'flex-start' },
  msgRowUser: { justifyContent: 'flex-end' },

  msgAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    flexShrink: 0,
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.30)'},
  msgBubble: {
    maxWidth: '78%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    overflow: 'hidden'},
  msgBubbleBuddy: {
    borderBottomLeftRadius: 4,
    backgroundColor: 'rgba(37,240,200,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.16)'},
  msgBubbleUser: {
    borderBottomRightRadius: 4,
    backgroundColor: ACCENT},
  msgBubbleError: {
    borderColor: 'rgba(252,165,165,0.35)',
    backgroundColor: 'rgba(127,29,29,0.25)'},

  msgText: { fontSize: 14, lineHeight: 21, fontWeight: '600' },
  msgTextBuddy: { color: 'rgba(255,255,255,0.88)' },
  msgTextUser: { color: '#FFFFFF' },

  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 14},
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 99,
    backgroundColor: NEON},

  inlineError: {
    color: '#FCA5A5',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8},

  limitBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.64)',
    justifyContent: 'flex-end'},
  limitBackdropPressable: {
    ...StyleSheet.absoluteFillObject},
  limitCardWrap: {
    paddingHorizontal: 16,
    paddingBottom: 18},
  limitCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.20)',
    backgroundColor: 'rgba(5,10,14,0.96)',
    padding: 18,
    overflow: 'hidden'},
  limitTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14},
  limitIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(37,240,200,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.26)'},
  limitCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)'},
  limitTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '900',
    marginBottom: 8},
  limitMessage: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600'},
  limitCta: {
    marginTop: 16,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: NEON,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16},
  limitCtaText: {
    color: '#07120F',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0},

  quickScroll: { maxHeight: 52 },
  quickWrap: { paddingHorizontal: 14, paddingVertical: 8, gap: 8 },
  quickChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(37,240,200,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.25)'},
  quickChipText: { color: NEON, fontSize: 13, fontWeight: '700' },

  inputBar: {
    paddingHorizontal: 14,
    paddingTop: 8},
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
    backgroundColor: '#0B0F14'},
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    maxHeight: 100,
    paddingTop: 2},
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: NEON,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0},
  sendBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.08)' },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end'},
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
    maxHeight: '82%'},
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16},
  modalTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900'},
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)'},

  newChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: NEON,
    paddingVertical: 13,
    borderRadius: 16,
    marginBottom: 14},
  newChatBtnText: {
    color: '#0B1120',
    fontSize: 14,
    fontWeight: '900'},

  emptyHistoryText: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 13,
    fontWeight: '600',
    paddingTop: 14,
    textAlign: 'center'},

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
    marginBottom: 10},
  historyItemActive: {
    borderColor: 'rgba(37,240,200,0.25)',
    backgroundColor: 'rgba(37,240,200,0.06)'},
  historyTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 3},
  historyMeta: {
    color: 'rgba(255,255,255,0.38)',
    fontSize: 12,
    fontWeight: '600'}});
