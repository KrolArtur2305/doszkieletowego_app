import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { supabase } from '../../../../lib/supabase';
import {
  isDoneStageStatus,
  isHiddenStageStatus,
  resolveCurrentStageGroupCode,
  summarizeGroupProgress,
  type StageGroupCode,
  type StageTemplateRow,
  type UserStageRow,
} from '../../../../lib/postepyModel';
import { getStageDisplayName, getStageGroupDisplayName } from '../../../../lib/stageModel';

type ProfileRow = {
  build_type: string | null;
  current_stage_code: string | null;
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

function safeOrder(n: number | null | undefined) {
  return typeof n === 'number' && Number.isFinite(n) ? n : 9999;
}

function normalizeBuildType(buildType: string | null | undefined) {
  return String(buildType ?? '').trim().toLowerCase() === 'szkieletowy' ? 'timber_frame' : 'masonry';
}

function upsertItemStatus(items: StageItem[], rowId: string | null | undefined, status: string) {
  if (!rowId) return items;
  return items.map((item) =>
    item.userStage?.id === rowId ? { ...item, status } : item
  );
}

export default function WszystkieEtapyScreen() {
  const { t } = useTranslation('stages');
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [templates, setTemplates] = useState<StageTemplateRow[]>([]);
  const [userStages, setUserStages] = useState<UserStageRow[]>([]);

  const [showPrevCount, setShowPrevCount] = useState(0);
  const PREV_STEP = 10;

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
          legacyName: String(template.stage_group_code ?? ''),
        }),
        stageCode: String(template.stage_code ?? '').trim().toUpperCase(),
        groupCode: (template.stage_group_code as StageGroupCode) ?? 'foundations',
        orderIndex: safeOrder(template.order_index),
        status: match?.status ?? 'pending',
        userStage: match,
        templateId: template.id,
      };
    });

    const customItems: StageItem[] = userStages
      .filter((row) => String(row.source ?? '').trim().toLowerCase() === 'custom')
      .map((row) => ({
        key: `custom-${row.id}`,
        title: row.custom_name?.trim() || t('all.customStage', { defaultValue: 'Etap własny' }),
        stageCode: String(row.stage_code ?? '').trim().toUpperCase(),
        groupCode: resolveCurrentStageGroupCode(templates, profile?.build_type, row.stage_code),
        orderIndex: safeOrder(row.order_index),
        status: row.status ?? 'pending',
        userStage: row,
        templateId: row.template_id ?? null,
      }));

    return [...templateItems, ...customItems].sort((a, b) => a.orderIndex - b.orderIndex || a.title.localeCompare(b.title));
  }, [profile?.build_type, t, templates, userStages]);

  const listView = useMemo(() => {
    const visible = stageItems.filter((item) => !isHiddenStageStatus(item.status));

    if (visible.length === 0) {
      return { visible: [] as StageItem[], hiddenPrevDone: [] as StageItem[] };
    }

    const firstNotDoneIdx = visible.findIndex((item) => !isDoneStageStatus(item.status));
    if (firstNotDoneIdx === -1) {
      return { visible, hiddenPrevDone: [] as StageItem[] };
    }

    const prevDone = visible.slice(0, firstNotDoneIdx).filter((item) => isDoneStageStatus(item.status));
    const rest = visible.slice(firstNotDoneIdx);
    const sliceCount = Math.min(showPrevCount, prevDone.length);
    const prevToShow = sliceCount > 0 ? prevDone.slice(prevDone.length - sliceCount) : [];
    const hiddenPrev = prevDone.slice(0, Math.max(0, prevDone.length - sliceCount));

    return { visible: [...prevToShow, ...rest], hiddenPrevDone: hiddenPrev };
  }, [showPrevCount, stageItems]);

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
          setProfile(null);
          setTemplates([]);
          setUserStages([]);
          return;
        }

        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('build_type, current_stage_code')
          .eq('user_id', user.id)
          .single();
        if (profileError) throw profileError;

        const workflowCode = normalizeBuildType((profileData as ProfileRow | null)?.build_type);
        const [templateRes, userStageRes] = await Promise.all([
          supabase
            .from('stage_templates')
            .select('id, workflow_code, stage_group_code, stage_code, name_key, order_index, is_active')
            .eq('workflow_code', workflowCode)
            .eq('is_active', true)
            .order('order_index', { ascending: true }),
          supabase
            .from('user_stages')
            .select('id, user_id, project_id, template_id, workflow_code, stage_group_code, stage_code, source, status, custom_name, custom_name_key, order_index, updated_at, created_at')
            .eq('user_id', user.id)
            .order('order_index', { ascending: true }),
        ]);

        if (templateRes.error) throw templateRes.error;
        if (userStageRes.error) throw userStageRes.error;

        if (!alive) return;
        setProfile((profileData as ProfileRow | null) ?? null);
        setTemplates((templateRes.data ?? []) as StageTemplateRow[]);
        setUserStages((userStageRes.data ?? []) as UserStageRow[]);
        setShowPrevCount(0);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? t('errors.fetchFailed'));
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

  const setSaving = (id: string, v: boolean) => {
    setSavingIds((prev) => ({ ...prev, [id]: v }));
  };

  const updateStatus = async (item: StageItem) => {
    const nextStatus = isDoneStageStatus(item.status) ? 'pending' : 'done';
    const userId = item.userStage?.user_id ?? null;
    if (!userId) return;

    const optimisticRowId = item.userStage?.id ?? null;
    if (optimisticRowId) {
      setUserStages((prev) =>
        prev.map((row) => (row.id === optimisticRowId ? { ...row, status: nextStatus } : row))
      );
    }

    try {
      setSaving(item.key, true);

      if (item.userStage?.id) {
        const { error } = await supabase.from('user_stages').update({ status: nextStatus }).eq('id', item.userStage.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('user_stages')
          .insert({
            user_id: userId,
            template_id: item.templateId,
            workflow_code: normalizeBuildType(profile?.build_type),
            stage_group_code: item.groupCode,
            stage_code: item.stageCode || null,
            source: 'template',
            status: nextStatus,
            order_index: item.orderIndex,
          })
          .select('id, user_id, project_id, template_id, workflow_code, stage_group_code, stage_code, source, status, custom_name, custom_name_key, order_index, updated_at, created_at')
          .single();

        if (error) throw error;
        if (data) {
          setUserStages((prev) => [...prev, data as UserStageRow]);
        }
      }
    } catch (e: any) {
      if (optimisticRowId) {
        setUserStages((prev) =>
          prev.map((row) => (row.id === optimisticRowId ? { ...row, status: item.status } : row))
        );
      }
      setError(e?.message ?? t('errors.updateFailed'));
    } finally {
      setSaving(item.key, false);
    }
  };

  const canShowPrev = !loading && listView.hiddenPrevDone.length > 0;

  const currentGroupCode = resolveCurrentStageGroupCode(templates, profile?.build_type, profile?.current_stage_code);
  const currentProgress = summarizeGroupProgress(userStages, [], currentGroupCode);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.85}>
            <Feather name="arrow-left" size={18} color="#EAFBF6" />
            <Text style={styles.backText}>{t('all.back')}</Text>
          </TouchableOpacity>

          <Text style={styles.title}>{t('all.title')}</Text>

          <View style={{ width: 62 }} />
        </View>

        <BlurView intensity={16} tint="dark" style={styles.card}>
          <View style={styles.summaryRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardLabel}>{t('hero.cardLabel', { defaultValue: 'Postępy' })}</Text>
              <Text style={styles.sectionTitle}>
                {t('all.completed', {
                  done: currentProgress.done,
                  total: currentProgress.total,
                  defaultValue: `${currentProgress.done} / ${currentProgress.total}`,
                })}
              </Text>
              <Text style={styles.muted}>
                {t('all.hint', { defaultValue: 'Widok oparty o stage_templates i user_stages.' })}
              </Text>
            </View>
            <View style={styles.miniPill}>
              <Feather name="layers" size={14} color={NEON} />
              <Text style={styles.miniPillText}>
                {t('all.visible', { count: listView.visible.length, defaultValue: `${listView.visible.length}` })}
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
          ) : stageItems.length === 0 ? (
            <Text style={styles.muted}>{t('all.noStagesHint')}</Text>
          ) : (
            <View>
              {!!error && <Text style={styles.error}>{error}</Text>}

              {canShowPrev && (
                <TouchableOpacity
                  activeOpacity={0.86}
                  onPress={() => setShowPrevCount((v) => v + PREV_STEP)}
                  style={styles.showPrevBtn}
                >
                  <Feather name="chevron-up" size={16} color="#EAFBF6" />
                  <Text style={styles.showPrevText}>
                    {t('all.showPrevious', { count: Math.min(PREV_STEP, listView.hiddenPrevDone.length) })}
                  </Text>
                </TouchableOpacity>
              )}

              {listView.visible.map((item) => {
                const done = isDoneStageStatus(item.status);
                const saving = !!savingIds[item.key];

                return (
                  <View key={item.key} style={styles.row}>
                    <TouchableOpacity
                      style={[styles.checkbox, done && styles.checkboxDone]}
                      onPress={() => updateStatus(item)}
                      activeOpacity={0.85}
                    >
                      {done ? <Feather name="check" size={16} color="#022C22" /> : null}
                    </TouchableOpacity>

                    <View style={{ flex: 1 }}>
                      <View style={styles.rowTop}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
                          {item.title}
                        </Text>
                        {saving ? <ActivityIndicator size="small" color={NEON} /> : null}
                      </View>

                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {getStageGroupDisplayName(t, item.groupCode)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </BlurView>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingTop: 16, paddingHorizontal: 18, paddingBottom: 140 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  backText: { color: '#EAFBF6', fontWeight: '900', fontSize: 13.5 },

  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.2,
  },

  card: {
    borderRadius: 28,
    padding: 16,
    marginBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.026)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },

  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardLabel: {
    color: 'rgba(255,255,255,0.55)',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontSize: 11.5,
    fontWeight: '800',
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 8,
    letterSpacing: -0.2,
  },
  miniPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.14)',
    backgroundColor: 'rgba(37,240,200,0.06)',
  },
  miniPillText: {
    color: NEON,
    fontWeight: '900',
    fontSize: 12,
  },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  loadingText: { color: 'rgba(255,255,255,0.55)', fontWeight: '800' },

  muted: { color: 'rgba(255,255,255,0.50)', marginTop: 4, lineHeight: 20 },

  error: { marginBottom: 10, color: '#FCA5A5', fontWeight: '800' },

  showPrevBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.14)',
    marginBottom: 10,
  },
  showPrevText: { color: '#EAFBF6', fontWeight: '900' },

  row: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },

  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxDone: {
    backgroundColor: NEON,
    borderColor: NEON,
    shadowColor: NEON,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },

  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  rowTitle: { color: '#FFFFFF', fontWeight: '900', fontSize: 15.5, flex: 1 },
  rowMeta: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '700',
    fontSize: 11.5,
  },
});
