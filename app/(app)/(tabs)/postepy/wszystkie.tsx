import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { supabase } from '../../../../lib/supabase';
import { getFriendlyErrorMessage } from '../../../../lib/errorMessages';
import {
  MAIN_STAGE_TIMELINE,
  isDoneStageStatus,
  isHiddenStageStatus,
  normalizeStageGroupCode,
  normalizeWorkflowCode,
  resolveCurrentStageGroupCode,
  type StageGroupCode,
  type StageTemplateRow,
  type UserStageRow} from '../../../../lib/postepyModel';
import { getStageDisplayName, getStageGroupDisplayName } from '../../../../lib/stageModel';
import { getBuddyAvatarSource } from '../../../../src/services/buddy/avatar';

type ProfileRow = {
  build_type: string | null;
  current_stage_code: string | null;
  ai_buddy_name?: string | null;
  ai_buddy_avatar?: string | null;
};

type StageItem = {
  key: string;
  title: string;
  stageCode: string;
  groupCode: StageGroupCode;
  orderIndex: number;
  status: string | null;
  userStage: UserStageRow | null;
  templateId: string | null;
};

const NEON = '#25F0C8';
const USER_STAGE_SELECT =
  'id, user_id, project_id, template_id, workflow_code, stage_group_code, stage_code, source, status, custom_name, custom_name_key, order_index, updated_at, created_at';

function safeOrder(n: number | null | undefined) {
  return typeof n === 'number' && Number.isFinite(n) ? n : 9999;
}

function getNextStageTemplate(
  templates: StageTemplateRow[],
  currentGroupCode: StageGroupCode
): StageTemplateRow | null {
  const currentIndex = MAIN_STAGE_TIMELINE.findIndex((item) => item.stage_group_code === currentGroupCode);
  if (currentIndex < 0) return null;

  for (const group of MAIN_STAGE_TIMELINE.slice(currentIndex + 1)) {
    const match = templates.find(
      (template) =>
        normalizeStageGroupCode(template.stage_group_code) === group.stage_group_code &&
        template.is_active !== false
    );
    if (match) return match;
  }

  return null;
}

export default function WszystkieEtapyScreen() {
  const { t } = useTranslation('stages');
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [savingAll, setSavingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [templates, setTemplates] = useState<StageTemplateRow[]>([]);
  const [userStages, setUserStages] = useState<UserStageRow[]>([]);
  const [draftStatuses, setDraftStatuses] = useState<Record<string, string>>({});
  const [completionModal, setCompletionModal] = useState<{
    visible: boolean;
    nextStageName: string;
  }>({ visible: false, nextStageName: '' });

  type SaveStagesRpcResult = {
    saved_rows?: UserStageRow[];
    advanced?: boolean;
    next_stage_code?: string | null;
  };

  const stageItems = useMemo(() => {
    const templateItems: StageItem[] = templates.map((template) => {
      const match =
        userStages.find(
          (row) =>
            String(row.template_id ?? '').trim() === String(template.id ?? '').trim() ||
            String(row.stage_code ?? '').trim().toUpperCase() === String(template.stage_code ?? '').trim().toUpperCase()
        ) ?? null;

      return {
        key: `template-${template.id}`,
        title: getStageDisplayName(t, {
          stageCode: template.stage_code,
          nameKey: template.name_key,
          legacyName: String(template.stage_group_code ?? '')}),
        stageCode: String(template.stage_code ?? '').trim().toUpperCase(),
        groupCode: normalizeStageGroupCode(template.stage_group_code) ?? 'stan_zero',
        orderIndex: safeOrder(template.order_index),
        status: draftStatuses[`template-${template.id}`] ?? match?.status ?? 'pending',
        userStage: match,
        templateId: template.id};
    });

    const customItems: StageItem[] = userStages
      .filter((row) => String(row.source ?? '').trim().toLowerCase() === 'custom')
      .map((row) => ({
        key: `custom-${row.id}`,
        title: row.custom_name?.trim() || t('all.customStage'),
        stageCode: String(row.stage_code ?? '').trim().toUpperCase(),
        groupCode:
          normalizeStageGroupCode(row.stage_group_code) ??
          resolveCurrentStageGroupCode(templates, profile?.build_type, row.stage_code),
        orderIndex: safeOrder(row.order_index),
        status: draftStatuses[`custom-${row.id}`] ?? row.status ?? 'pending',
        userStage: row,
        templateId: row.template_id ?? null}));

    return [...templateItems, ...customItems].sort((a, b) => a.orderIndex - b.orderIndex || a.title.localeCompare(b.title));
  }, [draftStatuses, profile?.build_type, t, templates, userStages]);

  const currentGroupCode = useMemo(
    () => resolveCurrentStageGroupCode(templates, profile?.build_type, profile?.current_stage_code),
    [profile?.build_type, profile?.current_stage_code, templates]
  );

  const currentGroupItems = useMemo(() => {
    return stageItems.filter((item) => item.groupCode === currentGroupCode);
  }, [currentGroupCode, stageItems]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        const user = userData.user;

        if (!user) {
          if (!alive) return;
          setCurrentUserId(null);
          setProfile(null);
          setTemplates([]);
          setUserStages([]);
          return;
        }

        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('build_type, current_stage_code, ai_buddy_name, ai_buddy_avatar')
          .eq('user_id', user.id)
          .maybeSingle();
        if (profileError) throw profileError;

        const workflowCode = normalizeWorkflowCode((profileData as ProfileRow | null)?.build_type);
        const [templateRes, userStageRes] = await Promise.all([
          supabase
            .from('stage_templates')
            .select('id, workflow_code, stage_group_code, stage_code, name_key, order_index, is_active')
            .eq('workflow_code', workflowCode)
            .eq('is_active', true)
            .order('order_index', { ascending: true }),
          supabase
            .from('user_stages')
            .select(USER_STAGE_SELECT)
            .eq('user_id', user.id)
            .eq('workflow_code', workflowCode)
            .order('order_index', { ascending: true })]);

        if (templateRes.error) throw templateRes.error;
        if (userStageRes.error) throw userStageRes.error;

        if (!alive) return;
        setCurrentUserId(user.id);
        setProfile((profileData as ProfileRow | null) ?? null);
        setTemplates((templateRes.data ?? []) as StageTemplateRow[]);
        setUserStages((userStageRes.data ?? []) as UserStageRow[]);
        setDraftStatuses({});
      } catch (e: any) {
        if (!alive) return;
        setError(getFriendlyErrorMessage(e, t, 'errors.fetchFailed'));
        setProfile(null);
        setTemplates([]);
        setUserStages([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, [t]);

  const mergeSavedStages = (savedRows: UserStageRow[]) => {
    setUserStages((prev) => {
      const next = [...prev];
      savedRows.forEach((saved) => {
        const byId = next.findIndex((row) => row.id === saved.id);
        if (byId >= 0) {
          next[byId] = saved;
          return;
        }

        const byTemplateOrCode = next.findIndex(
          (row) =>
            (!!saved.template_id && row.template_id === saved.template_id) ||
            (!!saved.stage_code &&
              row.workflow_code === saved.workflow_code &&
              String(row.stage_code ?? '').trim().toUpperCase() === String(saved.stage_code ?? '').trim().toUpperCase())
        );

        if (byTemplateOrCode >= 0) next[byTemplateOrCode] = saved;
        else next.push(saved);
      });
      return next;
    });
  };

  const changedItems = currentGroupItems.filter((item) => {
    if (!(item.key in draftStatuses)) return false;
    const originalStatus = item.userStage?.status ?? 'pending';
    return draftStatuses[item.key] !== originalStatus;
  });

  const hasDraftChanges = changedItems.length > 0;

  const saveChanges = async () => {
    if (!hasDraftChanges || savingAll) return;

    const userId = currentUserId;
    if (!userId) return;

    const nextTemplate = getNextStageTemplate(templates, currentGroupCode);
    const shouldAdvance =
      !!nextTemplate &&
      currentGroupItems.length > 0 &&
      currentGroupItems.every((item) => isDoneStageStatus(item.status) || isHiddenStageStatus(item.status));

    try {
      setSavingAll(true);
      setError(null);

      const workflowCode = normalizeWorkflowCode(profile?.build_type);
      const nextStageCode = shouldAdvance && nextTemplate?.stage_code
        ? String(nextTemplate.stage_code ?? '').trim().toUpperCase()
        : null;

      const { data: rpcData, error: rpcError } = await supabase.rpc('save_user_stage_statuses', {
        p_items: changedItems.map((item) => ({
          id: item.userStage?.id && !String(item.userStage.id).startsWith('optimistic-')
            ? item.userStage.id
            : null,
          template_id: item.templateId,
          workflow_code: workflowCode,
          stage_group_code: item.groupCode,
          stage_code: item.stageCode || null,
          source: item.userStage?.source ?? 'template',
          status: draftStatuses[item.key],
          order_index: item.orderIndex,
        })),
        p_next_stage_code: nextStageCode,
      });

      if (rpcError) throw rpcError;

      const rpcResult = (rpcData ?? {}) as SaveStagesRpcResult;
      const savedRows = Array.isArray(rpcResult.saved_rows) ? rpcResult.saved_rows : [];
      mergeSavedStages(savedRows);
      setDraftStatuses({});

      if (nextStageCode) {
        setProfile((prev) => (prev ? { ...prev, current_stage_code: nextStageCode } : prev));
        setCompletionModal({
          visible: true,
          nextStageName: getStageGroupDisplayName(t, normalizeStageGroupCode(nextTemplate?.stage_group_code))});
      } else {
        router.replace('/(app)/(tabs)/postepy');
      }
    } catch (e: any) {
      setError(getFriendlyErrorMessage(e, t, 'errors.updateFailed'));
    } finally {
      setSavingAll(false);
    }
  };

  const toggleDone = (item: StageItem) => {
    const nextStatus = isDoneStageStatus(item.status) ? 'pending' : 'done';
    setDraftStatuses((prev) => ({ ...prev, [item.key]: nextStatus }));
  };

  const toggleNotApplicable = (item: StageItem) => {
    const nextStatus = isHiddenStageStatus(item.status) ? 'pending' : 'not_applicable';
    setDraftStatuses((prev) => ({ ...prev, [item.key]: nextStatus }));
  };

  const cancelChanges = () => {
    setDraftStatuses({});
    router.replace('/(app)/(tabs)/postepy');
  };

  const currentProgress = {
    done: currentGroupItems.filter((item) => isDoneStageStatus(item.status)).length,
    total: currentGroupItems.filter((item) => !isHiddenStageStatus(item.status)).length};

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.replace('/(app)/(tabs)/postepy')} style={styles.backBtn} activeOpacity={0.85}>
            <Feather name="arrow-left" size={18} color="#EAFBF6" />
            <Text style={styles.backText}>{t('all.back')}</Text>
          </TouchableOpacity>

          <Text style={styles.title}>{t('all.title')}</Text>

          <View style={{ width: 62 }} />
        </View>

        <BlurView intensity={16} tint="dark" style={styles.card}>
          <View style={styles.summaryRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardLabel}>{t('hero.cardLabel')}</Text>
              <Text style={styles.sectionTitle}>
                {t('all.completed', {
                  done: currentProgress.done,
                  total: currentProgress.total,
                })}
              </Text>
              <Text style={styles.muted}>
                {t('all.hint')}
              </Text>
            </View>
            <View style={styles.miniPill}>
              <Feather name="layers" size={14} color={NEON} />
              <Text style={styles.miniPillText}>
                {t('all.visible', { count: currentGroupItems.length })}
              </Text>
            </View>
          </View>
        </BlurView>

        <BlurView intensity={16} tint="dark" style={styles.card}>
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={NEON} />
              <Text style={styles.loadingText}>{t('common.loading')}</Text>
            </View>
          ) : currentGroupItems.length === 0 ? (
            <Text style={styles.muted}>{t('all.noStagesHint')}</Text>
          ) : (
            <View>
              {!!error && <Text style={styles.error}>{error}</Text>}

              {currentGroupItems.map((item) => {
                const done = isDoneStageStatus(item.status);
                const notApplicable = isHiddenStageStatus(item.status);
                const saving = savingAll && item.key in draftStatuses;

                return (
                  <View key={item.key} style={[styles.row, notApplicable && styles.rowMuted]}>
                    <TouchableOpacity
                      style={[styles.checkbox, done && styles.checkboxDone, notApplicable && styles.checkboxMuted]}
                      onPress={() => toggleDone(item)}
                      activeOpacity={0.85}
                    >
                      {done ? <Feather name="check" size={16} color="#022C22" /> : null}
                    </TouchableOpacity>

                    <View style={{ flex: 1 }}>
                      <View style={styles.rowTop}>
                        <Text style={[styles.rowTitle, notApplicable && styles.rowTitleMuted]} numberOfLines={1}>
                          {item.title}
                        </Text>
                        {saving ? <ActivityIndicator size="small" color={NEON} /> : null}
                      </View>

                      <Text style={[styles.rowMeta, notApplicable && styles.rowMetaMuted]} numberOfLines={1}>
                        {getStageGroupDisplayName(t, item.groupCode)}
                      </Text>

                      <TouchableOpacity
                        activeOpacity={0.82}
                        onPress={() => toggleNotApplicable(item)}
                        style={[styles.notApplicablePill, notApplicable && styles.notApplicablePillActive]}
                      >
                        <Feather
                          name={notApplicable ? 'slash' : 'minus-circle'}
                          size={13}
                          color={notApplicable ? 'rgba(255,255,255,0.42)' : NEON}
                        />
                        <Text style={[styles.notApplicableText, notApplicable && styles.notApplicableTextActive]}>
                          {notApplicable ? t('all.markApplicable') : t('all.markNotApplicable')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </BlurView>

        <View style={{ height: 32 }} />
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          activeOpacity={0.86}
          onPress={cancelChanges}
          disabled={savingAll}
          style={[styles.footerButton, styles.cancelButton, savingAll && styles.footerButtonDisabled]}
        >
          <Text style={styles.cancelButtonText}>{t('cancel', { ns: 'common' })}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.86}
          onPress={saveChanges}
          disabled={!hasDraftChanges || savingAll}
          style={[
            styles.footerButton,
            styles.saveButton,
            (!hasDraftChanges || savingAll) && styles.footerButtonDisabled]}
        >
          {savingAll ? (
            <ActivityIndicator size="small" color="#022C22" />
          ) : (
            <Text style={styles.saveButtonText}>{t('save', { ns: 'common' })}</Text>
          )}
        </TouchableOpacity>
      </View>

      <Modal
        visible={completionModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setCompletionModal({ visible: false, nextStageName: '' })}
      >
        <View style={styles.modalBackdrop}>
          <BlurView intensity={22} tint="dark" style={styles.completionCard}>
            <View style={styles.buddyAvatarFrame}>
              <Image
                source={getBuddyAvatarSource(profile?.ai_buddy_avatar)}
                style={styles.buddyAvatar}
                resizeMode="cover"
              />
            </View>
            <Text style={styles.completionEyebrow}>
              {String(profile?.ai_buddy_name ?? '').trim() || t('all.completion.defaultBuddyName')}
            </Text>
            <Text style={styles.completionTitle}>{t('all.completion.title')}</Text>
            <Text style={styles.completionBody}>
              {t('all.completion.body', { stage: completionModal.nextStageName })}
            </Text>
            <TouchableOpacity
              activeOpacity={0.88}
              style={styles.completionButton}
              onPress={() => {
                setCompletionModal({ visible: false, nextStageName: '' });
                router.replace('/(app)/(tabs)/postepy');
              }}
            >
              <Text style={styles.completionButtonText}>{t('all.completion.cta')}</Text>
            </TouchableOpacity>
          </BlurView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingTop: 16, paddingHorizontal: 18, paddingBottom: 190 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12},
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)'},
  backText: { color: '#EAFBF6', fontWeight: '900', fontSize: 13.5 },

  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.2},

  card: {
    borderRadius: 28,
    padding: 16,
    marginBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.026)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden'},

  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12},
  cardLabel: {
    color: 'rgba(255,255,255,0.55)',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontSize: 11.5,
    fontWeight: '800'},
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 8,
    letterSpacing: -0.2},
  miniPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.14)',
    backgroundColor: 'rgba(37,240,200,0.06)'},
  miniPillText: {
    color: NEON,
    fontWeight: '900',
    fontSize: 12},
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  loadingText: { color: 'rgba(255,255,255,0.55)', fontWeight: '800' },

  muted: { color: 'rgba(255,255,255,0.50)', marginTop: 4, lineHeight: 20 },

  error: { marginBottom: 10, color: '#FCA5A5', fontWeight: '800' },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 26,
    backgroundColor: 'rgba(5,5,5,0.92)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)'},
  footerButton: {
    flex: 1,
    height: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1},
  cancelButton: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.12)'},
  saveButton: {
    backgroundColor: NEON,
    borderColor: NEON},
  footerButtonDisabled: {
    opacity: 0.48},
  cancelButtonText: {
    color: '#EAFBF6',
    fontWeight: '900',
    fontSize: 14},
  saveButtonText: {
    color: '#022C22',
    fontWeight: '900',
    fontSize: 14},

  row: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)'},
  rowMuted: {
    opacity: 0.58},

  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2},
  checkboxDone: {
    backgroundColor: NEON,
    borderColor: NEON,
    shadowColor: NEON,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 }},
  checkboxMuted: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.10)'},

  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  rowTitle: { color: '#FFFFFF', fontWeight: '900', fontSize: 15.5, flex: 1 },
  rowTitleMuted: {
    color: 'rgba(255,255,255,0.42)',
    textDecorationLine: 'line-through'},
  rowMeta: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '700',
    fontSize: 11.5},
  rowMetaMuted: {
    color: 'rgba(255,255,255,0.32)'},
  notApplicablePill: {
    marginTop: 10,
    alignSelf: 'flex-start',
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(37,240,200,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.16)'},
  notApplicablePillActive: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.10)'},
  notApplicableText: {
    color: NEON,
    fontSize: 11.5,
    fontWeight: '900'},
  notApplicableTextActive: {
    color: 'rgba(255,255,255,0.42)'},

  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 22,
    backgroundColor: 'rgba(0,0,0,0.72)'},
  completionCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 28,
    padding: 22,
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(5,5,5,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.22)'},
  buddyAvatar: {
    width: 88,
    height: 88,
    borderRadius: 44},
  buddyAvatarFrame: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    backgroundColor: 'rgba(37,240,200,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.32)'},
  completionEyebrow: {
    color: NEON,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    textAlign: 'center'},
  completionTitle: {
    marginTop: 8,
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.2},
  completionBody: {
    marginTop: 10,
    color: 'rgba(255,255,255,0.68)',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
    textAlign: 'center'},
  completionButton: {
    marginTop: 18,
    minWidth: 132,
    height: 44,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(37,240,200,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.42)'},
  completionButtonText: {
    color: NEON,
    fontWeight: '900',
    fontSize: 14}});
