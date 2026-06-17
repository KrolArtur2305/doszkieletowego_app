import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { supabase } from '../../../../lib/supabase';
import { fetchCurrentBuildAccess, type BuildAccess } from '../../../../lib/buildAccess';
import { getFriendlyErrorMessage } from '../../../../lib/errorMessages';
import {
  MAIN_STAGE_TIMELINE,
  getGroupDisplayKey,
  normalizeWorkflowCode,
  resolveCurrentStageGroupCode,
  summarizeGroupProgress,
  summarizeOverallProgressBySubstages,
  type StageGroupCode,
  type StageTemplateRow,
  type UserStageRow} from '../../../../lib/postepyModel';
import { FuturisticDonutSvg } from '../../../../components/FuturisticDonutSvg';
import { useSupabaseAuth } from '../../../../hooks/useSupabaseAuth';
import { AppHeader } from '../../../../src/ui/components';
import { colors } from '../../../../src/ui/theme';

type ProfileRow = {
  build_type: string | null;
  current_stage_code: string | null;
};

const NEON = colors.accentBright;
const USER_STAGE_SELECT =
  'id, user_id, project_id, template_id, workflow_code, stage_group_code, stage_code, source, status, custom_name, custom_name_key, order_index, updated_at, created_at';

function safeNumber(n: number | null | undefined) {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

function progressWithTemplateFallback(
  userStages: UserStageRow[],
  templates: StageTemplateRow[],
  groupCode: StageGroupCode
) {
  return summarizeGroupProgress(userStages, [], groupCode, templates);
}

function getUpcomingHintKey(groupCode?: StageGroupCode | null) {
  return groupCode ? `upcoming.hints.${groupCode}` : 'upcoming.hint';
}

export default function PostepyScreen() {
  const { t } = useTranslation('stages');
  const router = useRouter();
  const { session, loading: authLoading } = useSupabaseAuth();
  const userId = session?.user?.id;
  const [buildAccess, setBuildAccess] = useState<BuildAccess | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [templates, setTemplates] = useState<StageTemplateRow[]>([]);
  const [userStages, setUserStages] = useState<UserStageRow[]>([]);

  const loadProgress = useCallback(() => {
    let cancelled = false;

    const load = async () => {
      if (authLoading) return;

      setLoading(true);
      setError(null);

      if (!userId) {
        if (!cancelled) {
          setProfile(null);
          setTemplates([]);
          setUserStages([]);
          setLoading(false);
        }
        return;
      }

      try {
        const access = buildAccess ?? (await fetchCurrentBuildAccess(userId));
        if (!buildAccess) setBuildAccess(access);
        const scopeUserId = access?.ownerUserId ?? userId;

        const { data: profileRes, error: profileError } = await supabase
          .from('profiles')
          .select('build_type, current_stage_code')
          .eq('user_id', scopeUserId)
          .maybeSingle();

        if (profileError) throw profileError;

        const workflowCode = normalizeWorkflowCode((profileRes as ProfileRow | null)?.build_type);

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
            .eq('user_id', scopeUserId)
            .eq('workflow_code', workflowCode)
            .order('order_index', { ascending: true })]);

        const nextProfile = (profileRes as ProfileRow | null) ?? null;
        const nextTemplates = (templateRes.data ?? []) as StageTemplateRow[];
        const nextUserStages = (userStageRes.data ?? []) as UserStageRow[];

        if (templateRes.error) throw templateRes.error;
        if (userStageRes.error) throw userStageRes.error;

        if (!cancelled) {
          setProfile(nextProfile);
          setTemplates(nextTemplates);
          setUserStages(nextUserStages);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(getFriendlyErrorMessage(e, t, 'errors.fetchFailed'));
          setProfile(null);
          setTemplates([]);
          setUserStages([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [authLoading, buildAccess, userId, t]);

  useFocusEffect(loadProgress);

  const viewModel = useMemo(() => {
    const workflowCode = normalizeWorkflowCode(profile?.build_type);
    const workflowTemplates = templates.filter((row) => row.workflow_code === workflowCode);
    const currentStageCode = String(profile?.current_stage_code ?? '').trim().toUpperCase();
    const currentGroupCode = resolveCurrentStageGroupCode(workflowTemplates, profile?.build_type, currentStageCode);
    const currentGroupLabelKey = getGroupDisplayKey(currentGroupCode);
    const currentGroupLabel = t(currentGroupLabelKey);
    const currentProgress = progressWithTemplateFallback(userStages, workflowTemplates, currentGroupCode);
    const currentPercent = currentProgress.total > 0 ? Math.round((currentProgress.done / currentProgress.total) * 100) : 0;
    const currentTimelineIndex = Math.max(
      0,
      MAIN_STAGE_TIMELINE.findIndex((item) => item.stage_group_code === currentGroupCode)
    );
    const timeline = MAIN_STAGE_TIMELINE.map((item, index) => {
      const progress = progressWithTemplateFallback(userStages, workflowTemplates, item.stage_group_code);
      return {
        ...item,
        title: t(item.label_key),
        done: index < currentTimelineIndex || progress.total > 0 && progress.done >= progress.total,
        active: index === currentTimelineIndex,
        progressPercent: index < currentTimelineIndex
          ? 100
          : progress.total > 0
            ? Math.round((progress.done / progress.total) * 100)
            : 0};
    });
    const overallProgress = summarizeOverallProgressBySubstages(
      userStages,
      [],
      currentGroupCode,
      workflowTemplates
    );
    const overallPercent = overallProgress.percent;
    const nextTimelineItem = timeline[currentTimelineIndex + 1] ?? null;
    const nextTimelineHint = t(getUpcomingHintKey(nextTimelineItem?.stage_group_code));

    return {
      workflowCode,
      currentStageCode,
      currentGroupCode,
      currentGroupLabel,
      currentProgress,
      currentPercent,
      overallProgress,
      overallPercent,
      timeline,
      nextTimelineItem,
      nextTimelineHint,
    };
  }, [profile?.build_type, profile?.current_stage_code, templates, t, userStages]);

  const onOpenAll = () => router.push('/(app)/(tabs)/postepy/wszystkie');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <AppHeader title={t('screenTitle')} />
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}

      <BlurView intensity={18} tint="dark" style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardLabel}>{t('hero.cardLabel')}</Text>
            <Text style={styles.heroTitle}>{viewModel.currentGroupLabel}</Text>
            <Text style={styles.heroMeta}>
              {t('hero.completedSteps', {
                done: safeNumber(viewModel.overallProgress.done),
                total: safeNumber(viewModel.overallProgress.total)})}
            </Text>
          </View>
          <View style={styles.heroDonutWrap}>
            {loading ? (
              <ActivityIndicator color={NEON} />
            ) : (
              <FuturisticDonutSvg
                value={viewModel.overallPercent / 100}
                label=""
                isActive
                animated={false}
                size={96}
                stroke={11}
              />
            )}
          </View>
        </View>

        <View style={styles.timelineWrap}>
          <Text style={styles.timelineLabel}>{t('timeline.cardLabel')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timelineRow}>
            {viewModel.timeline.map((item) => (
              <View key={item.stage_group_code} style={styles.timelineItem}>
                <View style={[styles.timelineDot, item.done && styles.timelineDotDone, item.active && styles.timelineDotActive]} />
                <Text style={[styles.timelineText, item.done && styles.timelineTextDone, item.active && styles.timelineTextActive]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.timelinePct}>{item.progressPercent}%</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </BlurView>

      <TouchableOpacity activeOpacity={0.92} onPress={onOpenAll}>
        <BlurView intensity={16} tint="dark" style={styles.card}>
          <View style={styles.substageTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardLabel}>{t('substeps.cardLabel')}</Text>
              <Text style={styles.sectionTitle}>
                {t('substeps.completed', {
                  done: safeNumber(viewModel.currentProgress.done),
                  total: safeNumber(viewModel.currentProgress.total)})}
              </Text>
            </View>
            <FuturisticDonutSvg
              value={viewModel.currentPercent / 100}
              label=""
              isActive
              animated={false}
              size={96}
              stroke={11}
            />
          </View>
          <View style={styles.substageCta}>
            <Text style={styles.substageCtaText}>{t('substeps.cta')}</Text>
            <Feather name="arrow-right" size={15} color={NEON} />
          </View>
        </BlurView>
      </TouchableOpacity>

      <BlurView intensity={16} tint="dark" style={styles.card}>
        <Text style={styles.cardLabel}>{t('upcoming.cardLabel')}</Text>
        <Text style={styles.stageName}>
          {t('upcoming.stageLine', {
            stage: viewModel.nextTimelineItem?.title ?? t('common.none'),
          })}
        </Text>
        <Text style={styles.muted}>{viewModel.nextTimelineHint}</Text>
      </BlurView>

      {!loading && !viewModel.currentProgress.total && (
        <Text style={styles.muted}>{t('fallback.noCurrentStage')}</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 16,
    backgroundColor: 'transparent'},
  content: {
    paddingBottom: 140},
  header: {
    minHeight: 120,
    marginBottom: 12},
  error: {
    color: '#FCA5A5',
    marginBottom: 8,
    fontWeight: '800'},
  heroCard: {
    borderRadius: 28,
    padding: 16,
    marginBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.026)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.14)',
    overflow: 'hidden'},
  card: {
    borderRadius: 28,
    padding: 16,
    marginBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.026)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden'},
  cardLabel: {
    color: 'rgba(255,255,255,0.55)',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontSize: 11.5,
    fontWeight: '800'},
  orderCardLabel: {
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontSize: 12,
    fontWeight: '900'},
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14},
  heroDonutWrap: {
    width: 112,
    alignItems: 'center',
    justifyContent: 'center'},
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 25,
    fontWeight: '900',
    marginTop: 8,
    letterSpacing: -0.3},
  heroMeta: {
    color: 'rgba(255,255,255,0.68)',
    marginTop: 6,
    fontWeight: '700',
    fontSize: 13.5},
  timelineWrap: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 12},
  timelineLabel: {
    color: 'rgba(255,255,255,0.46)',
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1},
  timelineRow: {
    gap: 14,
    paddingBottom: 2},
  timelineItem: {
    width: 74,
    alignItems: 'center'},
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'transparent',
    marginBottom: 6},
  timelineDotDone: {
    backgroundColor: NEON,
    borderColor: NEON,
    shadowColor: NEON,
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 }},
  timelineDotActive: {
    borderColor: NEON,
    backgroundColor: 'rgba(37,240,200,0.18)'},
  timelineText: {
    color: 'rgba(255,255,255,0.48)',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center'},
  timelineTextDone: { color: '#FFFFFF' },
  timelineTextActive: { color: NEON },
  timelinePct: {
    marginTop: 3,
    color: 'rgba(255,255,255,0.34)',
    fontSize: 10,
    fontWeight: '700'},
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12},
  sectionSubtitle: {
    marginTop: 3,
    color: 'rgba(255,255,255,0.58)',
    fontSize: 12.2,
    fontWeight: '700'},
  orderList: {
    marginTop: 9,
    gap: 8},
  orderRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 11,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.028)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)'},
  orderIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(37,240,200,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.16)'},
  orderName: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 14},
  orderLead: {
    color: 'rgba(255,255,255,0.58)',
    marginTop: 1,
    fontSize: 11.1,
    fontWeight: '700'},
  orderPill: {
    paddingHorizontal: 9,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(37,240,200,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.18)'},
  orderPillText: {
    color: NEON,
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 0.2},
  stageName: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '900',
    marginTop: 8},
  muted: {
    color: 'rgba(255,255,255,0.50)',
    marginTop: 8,
    lineHeight: 20},
  substageTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12},
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 8,
    marginBottom: 10,
    letterSpacing: -0.2},
  substageCta: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8},
  substageCtaText: {
    color: NEON,
    fontWeight: '900',
    fontSize: 12.5,
    textTransform: 'uppercase',
    letterSpacing: 0.4}});
