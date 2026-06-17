import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  NativeSyntheticEvent,
  NativeScrollEvent,
  useWindowDimensions,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '../../../../lib/supabase';
import { getUserWithTimeout } from '../../../../lib/supabaseTimeout';
import { getFriendlyErrorMessage } from '../../../../lib/errorMessages';
import {
  BUILD_PERMISSION_ITEMS,
  COLLABORATION_BUILD_PERMISSIONS,
  DEFAULT_BUILD_PERMISSIONS,
  getPermissionPreset,
  isNonOwnerBuildRole,
  normalizeBuildPermissions,
  normalizeBuildRole,
  VIEW_ONLY_BUILD_PERMISSIONS,
  type BuildPermissionKey,
  type BuildPermissions,
  type BuildRole,
} from '../../../../lib/buildAccess';
import {
  clearPendingInviteCode,
  convertBuildOwnerToPartner,
  getPendingInviteCode,
  leavePartnerRole,
  removePartnerMember,
} from '../../../../lib/investmentInvite';
import { isExpertEquivalentPlan } from '../../../../src/config/subscriptionPlans';
import { AppButton } from '../../../../src/ui/components';

const NEON = '#25F0C8';
const ACCENT = '#19705C';
const PARTNER_INTRO_SEEN_KEY = 'build_partner_intro_seen_v2';

type InviteRow = {
  invite_code: string;
  expires_at: string;
  revoked_at?: string | null;
};

type IntroSlide = {
  key: string;
  icon: keyof typeof Feather.glyphMap;
  title: string;
  text: string;
};

type PartnerMember = {
  id: string;
  user_id: string;
  permissions: BuildPermissions;
  created_at: string;
};

export default function BuildPartnerScreen() {
  const router = useRouter();
  const { t } = useTranslation(['settings', 'common']);
  const insets = useSafeAreaInsets();
  const introScrollRef = useRef<ScrollView | null>(null);
  const { width: screenWidth } = useWindowDimensions();
  const topPad = (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 16) + 8;
  const bottomPad = Math.max(60, insets.bottom + 96);

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [converting, setConverting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [plan, setPlan] = useState<string>('free');
  const [investmentId, setInvestmentId] = useState<string | null>(null);
  const [investmentName, setInvestmentName] = useState('');
  const [membershipRole, setMembershipRole] = useState<BuildRole | null>(null);
  const [permissions, setPermissions] = useState<BuildPermissions>(DEFAULT_BUILD_PERMISSIONS);
  const [invite, setInvite] = useState<InviteRow | null>(null);
  const [copiedInviteCode, setCopiedInviteCode] = useState(false);
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(null);
  const [partnerMembers, setPartnerMembers] = useState<PartnerMember[]>([]);
  const [selectedPartner, setSelectedPartner] = useState<PartnerMember | null>(null);
  const [editingPermissions, setEditingPermissions] = useState<BuildPermissions>(DEFAULT_BUILD_PERMISSIONS);
  const [savingPartnerId, setSavingPartnerId] = useState<string | null>(null);
  const [introSeen, setIntroSeen] = useState<boolean | null>(null);
  const [introIndex, setIntroIndex] = useState(0);

  const isExpert = isExpertEquivalentPlan(plan);

  const permissionItems = BUILD_PERMISSION_ITEMS as { key: BuildPermissionKey; icon: keyof typeof Feather.glyphMap }[];

  const activePreset = useMemo(() => {
    return getPermissionPreset(permissions);
  }, [permissions]);

  const introSlides = useMemo(
    () => ([
      {
        key: 'sharedBuild',
        icon: 'home',
        title: t('settings:partner.intro.benefits.sharedBuild.title'),
        text: t('settings:partner.intro.benefits.sharedBuild.subtitle'),
      },
      {
        key: 'documentation',
        icon: 'camera',
        title: t('settings:partner.intro.benefits.documentation.title'),
        text: t('settings:partner.intro.benefits.documentation.subtitle'),
      },
      {
        key: 'permissions',
        icon: 'shield',
        title: t('settings:partner.intro.benefits.permissions.title'),
        text: t('settings:partner.intro.benefits.permissions.subtitle'),
      },
    ] as IntroSlide[]),
    [t]
  );

  const handleIntroScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / Math.max(1, screenWidth));
    setIntroIndex(Math.max(0, Math.min(introSlides.length - 1, nextIndex)));
  };

  const advanceIntro = async () => {
    if (introIndex < introSlides.length - 1) {
      introScrollRef.current?.scrollTo({ x: (introIndex + 1) * screenWidth, animated: true });
      setIntroIndex((current) => Math.min(introSlides.length - 1, current + 1));
      return;
    }

    await AsyncStorage.setItem(PARTNER_INTRO_SEEN_KEY, '1');
    setIntroSeen(true);
  };

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        const user = await getUserWithTimeout();
        if (!user) return;

        const [profileRes, investmentRes, memberRes, storedIntroSeen, storedInviteCode] = await Promise.all([
          supabase
            .from('profiles')
            .select('plan')
            .eq('user_id', user.id)
            .maybeSingle(),
          supabase
            .from('inwestycje')
            .select('id,nazwa')
            .eq('user_id', user.id)
            .maybeSingle(),
          supabase
            .from('investment_members')
            .select('role')
            .eq('user_id', user.id)
            .maybeSingle(),
          AsyncStorage.getItem(PARTNER_INTRO_SEEN_KEY),
          getPendingInviteCode(),
        ]);

        if (profileRes.error) throw profileRes.error;
        if (investmentRes.error) throw investmentRes.error;
        if (!alive) return;

        const currentRole =
          normalizeBuildRole((memberRes as any)?.data?.role) ?? ((investmentRes.data as any)?.id ? 'owner' : null);

        setPlan(String((profileRes.data as any)?.plan ?? 'free'));
        setInvestmentId(String((investmentRes.data as any)?.id ?? '') || null);
        setInvestmentName(String((investmentRes.data as any)?.nazwa ?? ''));
        setMembershipRole(currentRole);
        setIntroSeen(storedIntroSeen === '1');
        setPendingInviteCode(storedInviteCode);

        if (currentRole === 'owner' && (investmentRes.data as any)?.id) {
          const inviteRes = await supabase
            .from('investment_invites')
            .select('invite_code,expires_at,revoked_at')
            .eq('investment_id', String((investmentRes.data as any).id))
            .is('revoked_at', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (inviteRes.error) throw inviteRes.error;

          if ((inviteRes.data as any)?.invite_code) {
            setInvite({
              invite_code: String((inviteRes.data as any).invite_code),
              expires_at: String((inviteRes.data as any).expires_at),
              revoked_at: (inviteRes.data as any)?.revoked_at ?? null,
            });
          } else {
            setInvite(null);
          }

          const membersRes = await supabase
            .from('investment_members')
            .select('id,user_id,permissions,created_at')
            .eq('investment_id', String((investmentRes.data as any).id))
            .eq('role', 'partner')
            .order('created_at', { ascending: false });

          if (membersRes.error) throw membersRes.error;

          setPartnerMembers(
            (membersRes.data ?? []).map((row: any) => ({
              id: String(row.id),
              user_id: String(row.user_id),
              permissions: normalizeBuildPermissions(row.permissions),
              created_at: String(row.created_at ?? ''),
            }))
          );
        } else {
          setPartnerMembers([]);
        }
      } catch (e: any) {
        Alert.alert(
          t('common:errorTitle'),
          getFriendlyErrorMessage(e, t, 'settings:partner.errors.load')
        );
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [t]);

  const togglePermission = (key: BuildPermissionKey) => {
    setPermissions((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const applyPreset = (preset: 'view' | 'collab') => {
    setPermissions(preset === 'view' ? VIEW_ONLY_BUILD_PERMISSIONS : COLLABORATION_BUILD_PERMISSIONS);
  };

  const openPartnerEditor = (member: PartnerMember) => {
    setSelectedPartner(member);
    setEditingPermissions({
      ...DEFAULT_BUILD_PERMISSIONS,
      ...(member.permissions ?? {}),
    });
  };

  const closePartnerEditor = () => {
    setSelectedPartner(null);
  };

  const toggleEditingPermission = (key: BuildPermissionKey) => {
    setEditingPermissions((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const savePartnerPermissions = async () => {
    if (!selectedPartner || savingPartnerId) return;

    setSavingPartnerId(selectedPartner.id);
    try {
      const { error } = await supabase
        .from('investment_members')
        .update({ permissions: editingPermissions, updated_at: new Date().toISOString() })
        .eq('id', selectedPartner.id);

      if (error) throw error;

      await refreshPartnerMembers();
      closePartnerEditor();
    } catch (e: any) {
      Alert.alert(
        t('common:errorTitle'),
        getFriendlyErrorMessage(e, t, 'settings:partner.errors.update')
      );
    } finally {
      setSavingPartnerId(null);
    }
  };

  const refreshPartnerMembers = async (targetInvestmentId = investmentId) => {
    if (!targetInvestmentId || membershipRole !== 'owner') {
      setPartnerMembers([]);
      return;
    }

    const membersRes = await supabase
      .from('investment_members')
      .select('id,user_id,permissions,created_at')
      .eq('investment_id', targetInvestmentId)
      .eq('role', 'partner')
      .order('created_at', { ascending: false });

    if (membersRes.error) throw membersRes.error;

    setPartnerMembers(
      (membersRes.data ?? []).map((row: any) => ({
        id: String(row.id),
        user_id: String(row.user_id),
        permissions: normalizeBuildPermissions(row.permissions),
        created_at: String(row.created_at ?? ''),
      }))
    );
  };

  const handleConvertToPartner = () => {
    if (!pendingInviteCode || !investmentId || converting) return;

    Alert.alert(
      t('settings:partner.convertWarningTitle'),
      t('settings:partner.convertWarningMessage'),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('settings:partner.convertAction'),
          style: 'destructive',
          onPress: async () => {
            setConverting(true);
            try {
              await convertBuildOwnerToPartner(pendingInviteCode);
              await clearPendingInviteCode();
              setPendingInviteCode(null);
              router.replace('/(app)/(tabs)/dashboard');
            } catch (e: any) {
              Alert.alert(
                t('common:errorTitle'),
                getFriendlyErrorMessage(e, t, 'settings:partner.errors.convert')
              );
            } finally {
              setConverting(false);
            }
          },
        },
      ]
    );
  };

  const handleLeavePartner = () => {
    if (leaving) return;

    Alert.alert(
      t('settings:partner.leaveTitle'),
      t('settings:partner.leaveMessage'),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('settings:partner.leaveAction'),
          style: 'destructive',
          onPress: async () => {
            setLeaving(true);
            try {
              await leavePartnerRole();
              router.replace('/(app)/(tabs)/dashboard');
            } catch (e: any) {
              Alert.alert(
                t('common:errorTitle'),
                getFriendlyErrorMessage(e, t, 'settings:partner.errors.leave')
              );
            } finally {
              setLeaving(false);
            }
          },
        },
      ]
    );
  };

  const handleRemovePartner = async (member: PartnerMember) => {
    if (!investmentId || membershipRole !== 'owner') return;

    Alert.alert(
      t('settings:partner.removeTitle'),
      t('settings:partner.removeMessage'),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('settings:partner.removeAction'),
          style: 'destructive',
          onPress: async () => {
            try {
              await removePartnerMember(member.id);
              await refreshPartnerMembers();
            } catch (e: any) {
              Alert.alert(
                t('common:errorTitle'),
                getFriendlyErrorMessage(e, t, 'settings:partner.errors.remove')
              );
            }
          },
        },
      ]
    );
  };

  const generateInvite = async () => {
    if (!investmentId || generating || !isExpert) return;

    setGenerating(true);
    try {
      const { data, error } = await supabase.rpc('create_investment_invite', {
        p_investment_id: investmentId,
        p_view_budget: permissions.view_budget,
        p_view_documents: permissions.view_documents,
        p_add_photos: permissions.add_photos,
        p_add_journal: permissions.add_journal,
        p_add_expenses: permissions.add_expenses,
        p_manage_tasks: permissions.manage_tasks,
      });

      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.invite_code) {
        throw new Error(t('settings:partner.errors.generate'));
      }

      setInvite({
        invite_code: String(row.invite_code),
        expires_at: String(row.expires_at),
        revoked_at: null,
      });
      setCopiedInviteCode(false);
    } catch (e: any) {
      const rawMessage = String(e?.message ?? e?.error_description ?? e?.error ?? '').trim();
      console.error('[Partner] generateInvite error:', e);
      Alert.alert(
        t('common:errorTitle'),
        rawMessage
          ? `${getFriendlyErrorMessage(e, t, 'settings:partner.errors.generate')}\n\n${rawMessage}`
          : getFriendlyErrorMessage(e, t, 'settings:partner.errors.generate')
      );
    } finally {
      setGenerating(false);
    }
  };

  const revokeInvite = async () => {
    if (!invite?.invite_code || !investmentId || membershipRole !== 'owner' || revoking) return;

    Alert.alert(
      t('settings:partner.revokeTitle'),
      t('settings:partner.revokeMessage'),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('settings:partner.revokeAction'),
          style: 'destructive',
          onPress: async () => {
            try {
              setRevoking(true);
              const { error } = await supabase
                .from('investment_invites')
                .update({ revoked_at: new Date().toISOString() })
                .eq('invite_code', invite.invite_code)
                .eq('investment_id', investmentId);

              if (error) throw error;

              setInvite(null);
              setCopiedInviteCode(false);
            } catch (e: any) {
              Alert.alert(
                t('common:errorTitle'),
                getFriendlyErrorMessage(e, t, 'settings:partner.errors.revoke')
              );
            } finally {
              setRevoking(false);
            }
          },
        },
      ]
    );
  };

  const copyInviteCode = async () => {
    if (!invite?.invite_code) return;
    try {
      await Clipboard.setStringAsync(invite.invite_code);
      setCopiedInviteCode(true);
      setTimeout(() => setCopiedInviteCode(false), 2000);
    } catch {
      Alert.alert(t('common:errorTitle'), t('settings:partner.errors.copyInvite'));
    }
  };

  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={styles.bg} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topPad, paddingBottom: bottomPad }]}
        scrollIndicatorInsets={{ bottom: insets.bottom + 76 }}
        alwaysBounceVertical
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.85}>
            <Feather name="arrow-left" size={20} color="rgba(255,255,255,0.70)" />
          </TouchableOpacity>

          <Text style={styles.screenTitle}>{t('settings:partner.title')}</Text>

          <View style={{ width: 40 }} />
        </View>

        {loading || introSeen === null ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={NEON} />
            <Text style={styles.loadingText}>{t('common:loading')}</Text>
          </View>
        ) : isNonOwnerBuildRole(membershipRole) ? (
          <View style={styles.partnerInfoCard}>
            <View style={styles.conflictIcon}>
              <Feather name="users" size={24} color="#FFB020" />
            </View>
            <Text style={styles.conflictTitle}>
              {t('settings:partner.partnerMode.title')}
            </Text>
            <Text style={styles.conflictText}>
              {t('settings:partner.partnerMode.message')}
            </Text>
            <AppButton
              title={leaving ? t('settings:partner.partnerMode.leaving') : t('settings:partner.partnerMode.leaveAction')}
              onPress={handleLeavePartner}
              loading={leaving}
              style={styles.generateButton}
            />
          </View>
        ) : !introSeen ? (
          <>
            {pendingInviteCode && investmentId ? (
              <View style={styles.warningCard}>
                <View style={styles.conflictIcon}>
                  <Feather name="alert-triangle" size={24} color="#FFB020" />
                </View>
                <Text style={styles.conflictTitle}>
                  {t('settings:partner.convertWarningTitle')}
                </Text>
                <Text style={styles.conflictText}>
                  {t('settings:partner.convertWarningMessage')}
                </Text>
                <AppButton
                  title={converting ? t('settings:partner.converting') : t('settings:partner.convertAction')}
                  onPress={handleConvertToPartner}
                  loading={converting}
                  disabled={converting}
                  style={styles.generateButton}
                />
              </View>
            ) : null}

            <View style={styles.introHero}>
              <View style={styles.heroIcon}>
                <Feather name="users" size={24} color={NEON} />
              </View>
              <Text style={styles.introTitle}>{t('settings:partner.intro.title')}</Text>
              <Text style={styles.introSubtitle}>{t('settings:partner.intro.subtitle')}</Text>
            </View>

            <ScrollView
              ref={introScrollRef}
              horizontal
              pagingEnabled
              decelerationRate="fast"
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={handleIntroScroll}
              contentContainerStyle={styles.introPagerTrack}
              style={styles.introPager}
            >
              {introSlides.map((slide) => (
                <View key={slide.key} style={[styles.introSlide, { width: Math.max(0, screenWidth - 40) }]}>
                  <View style={styles.introSlideCard}>
                    <View style={styles.introSlideIconWrap}>
                      <Feather name={slide.icon} size={32} color={NEON} />
                    </View>
                    <Text style={styles.introSlideTitle}>{slide.title}</Text>
                    <Text style={styles.introSlideText}>{slide.text}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={styles.pagination}>
              {introSlides.map((_, index) => (
                <View key={index} style={[styles.dot, introIndex === index && styles.dotActive]} />
              ))}
            </View>

            {!isExpert && (
              <View style={styles.lockedCard}>
                <View style={styles.lockedHeader}>
                  <Feather name="lock" size={18} color={NEON} />
                  <Text style={styles.lockedTitle}>{t('settings:partner.lockedTitle')}</Text>
                </View>
                <Text style={styles.lockedText}>{t('settings:partner.lockedSubtitle')}</Text>
                <AppButton
                  title={t('settings:partner.upgradeAction')}
                  onPress={() => router.push('/(app)/(tabs)/ustawienia/subskrypcja')}
                  style={styles.actionButton}
                />
              </View>
            )}

            <AppButton
              title={
                introIndex < introSlides.length - 1
                  ? t('settings:partner.intro.nextAction')
                  : t('settings:partner.intro.configureAction')
              }
              onPress={advanceIntro}
              style={styles.generateButton}
            />
          </>
        ) : (
          <>
            <View style={styles.heroCard}>
              <View style={styles.heroIcon}>
                <Feather name="users" size={24} color={NEON} />
              </View>
              <Text style={styles.heroTitle}>{t('settings:partner.heroTitle')}</Text>
              <Text style={styles.heroSubtitle}>
                {t('settings:partner.heroSubtitle')}
              </Text>
              {!!investmentName && (
                <Text style={styles.investmentName}>
                  {t('settings:partner.currentBuild', { name: investmentName })}
                </Text>
              )}
            </View>

            {pendingInviteCode && investmentId ? (
              <View style={styles.warningCard}>
                <View style={styles.conflictIcon}>
                  <Feather name="alert-triangle" size={24} color="#FFB020" />
                </View>
                <Text style={styles.conflictTitle}>
                  {t('settings:partner.convertWarningTitle')}
                </Text>
                <Text style={styles.conflictText}>
                  {t('settings:partner.convertWarningMessage')}
                </Text>
                <AppButton
                  title={converting ? t('settings:partner.converting') : t('settings:partner.convertAction')}
                  onPress={handleConvertToPartner}
                  loading={converting}
                  disabled={converting}
                  style={styles.generateButton}
                />
              </View>
            ) : null}

            {!isExpert && (
              <View style={styles.lockedCard}>
                <View style={styles.lockedHeader}>
                  <Feather name="lock" size={18} color={NEON} />
                  <Text style={styles.lockedTitle}>{t('settings:partner.lockedTitle')}</Text>
                </View>
                <Text style={styles.lockedText}>{t('settings:partner.lockedSubtitle')}</Text>
                <AppButton
                  title={t('settings:partner.upgradeAction')}
                  onPress={() => router.push('/(app)/(tabs)/ustawienia/subskrypcja')}
                  style={styles.actionButton}
                />
              </View>
            )}

            <Text style={styles.groupLabel}>{t('settings:partner.permissionsTitle')}</Text>

            <View style={[styles.presetRow, !isExpert && styles.cardDisabled]}>
              <TouchableOpacity
                onPress={() => applyPreset('view')}
                disabled={!isExpert || generating}
                style={[styles.presetCard, activePreset === 'view' && styles.presetCardActive]}
                activeOpacity={0.88}
              >
                <Text style={styles.presetLabel}>{t('settings:partner.presets.view.label')}</Text>
                <Text style={styles.presetTitle}>{t('settings:partner.presets.view.title')}</Text>
                <Text style={styles.presetText}>{t('settings:partner.presets.view.text')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => applyPreset('collab')}
                disabled={!isExpert || generating}
                style={[styles.presetCard, activePreset === 'collab' && styles.presetCardActive]}
                activeOpacity={0.88}
              >
                <Text style={styles.presetLabel}>{t('settings:partner.presets.collab.label')}</Text>
                <Text style={styles.presetTitle}>{t('settings:partner.presets.collab.title')}</Text>
                <Text style={styles.presetText}>{t('settings:partner.presets.collab.text')}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.presetSummaryCard}>
              <Text style={styles.presetSummaryTitle}>
                {t(`settings:partner.presets.${activePreset === 'collab' ? 'collab' : 'view'}.summaryTitle`)}
              </Text>
              <Text style={styles.presetSummaryText}>
                {t(`settings:partner.presets.${activePreset === 'collab' ? 'collab' : 'view'}.summaryText`)}
              </Text>
            </View>

            <View style={[styles.card, !isExpert && styles.cardDisabled]}>
              {permissionItems.map((item, index) => (
                <View
                  key={item.key}
                  style={[
                    styles.permissionRow,
                    index < permissionItems.length - 1 && styles.rowBorder,
                  ]}
                >
                  <View style={styles.rowIconWrap}>
                    <Feather name={item.icon} size={18} color={ACCENT} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>
                      {t(`settings:partner.permissions.${item.key}.title`)}
                    </Text>
                    <Text style={styles.rowSubtitle}>
                      {t(`settings:partner.permissions.${item.key}.subtitle`)}
                    </Text>
                  </View>
                  <View style={styles.permissionStateBadge}>
                    <Text style={styles.permissionStateText}>
                      {permissions[item.key] ? t('settings:partner.permissionOn') : t('settings:partner.permissionOff')}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            <AppButton
              title={generating ? t('settings:partner.generating') : t('settings:partner.generateAction')}
              onPress={generateInvite}
              loading={generating}
              disabled={!isExpert || !investmentId || generating}
              style={styles.generateButton}
            />

            {invite && (
              <View style={styles.inviteCard}>
                <Text style={styles.inviteLabel}>{t('settings:partner.inviteReady')}</Text>
                <View style={styles.inviteCodeRow}>
                  <Text selectable style={styles.inviteCode}>{invite.invite_code}</Text>
                  <TouchableOpacity
                    onPress={copyInviteCode}
                    style={styles.copyInviteBtn}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={t('settings:partner.copyInvite')}
                  >
                    <Feather name={copiedInviteCode ? 'check' : 'copy'} size={16} color={NEON} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.inviteHint}>
                  {t('settings:partner.inviteHint')}
                </Text>
                <AppButton
                  title={revoking ? t('settings:partner.revoking') : t('settings:partner.revokeAction')}
                  variant="secondary"
                  onPress={revokeInvite}
                  loading={revoking}
                  disabled={revoking || !invite?.invite_code}
                  style={styles.revokeButton}
                />
              </View>
            )}

            {membershipRole === 'owner' && partnerMembers.length > 0 ? (
              <View style={styles.partnerListCard}>
                <Text style={styles.partnerListTitle}>
                  {t('settings:partner.partnerListTitle')}
                </Text>
                {partnerMembers.map((member, index) => (
                  <View key={member.id} style={styles.partnerListRow}>
                    <View style={styles.partnerListText}>
                      <Text style={styles.partnerListName}>
                        {t('settings:partner.partnerListItem', { index: index + 1 })}
                      </Text>
                      <Text style={styles.partnerListMeta}>
                        {t('settings:partner.partnerListMeta')}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => openPartnerEditor(member)}
                      style={styles.partnerEditBtn}
                      activeOpacity={0.85}
                    >
                      <Feather name="edit-3" size={16} color={NEON} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleRemovePartner(member)}
                      style={styles.partnerRemoveBtn}
                      activeOpacity={0.85}
                    >
                      <Feather name="trash-2" size={16} color="#FFB020" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null}

            <Text style={styles.note}>{t('settings:partner.note')}</Text>
          </>
        )}
      </ScrollView>

      <Modal
        visible={selectedPartner !== null}
        transparent
        animationType="fade"
        onRequestClose={closePartnerEditor}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('settings:partner.editTitle')}</Text>
            <Text style={styles.modalSubtitle}>{t('settings:partner.editSubtitle')}</Text>

            <View style={[styles.card, styles.modalPermissionsCard]}>
              {permissionItems.map((item, index) => (
                <View
                  key={item.key}
                  style={[
                    styles.permissionRow,
                    index < permissionItems.length - 1 && styles.rowBorder,
                  ]}
                >
                  <View style={styles.rowIconWrap}>
                    <Feather name={item.icon} size={18} color={ACCENT} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>
                      {t(`settings:partner.permissions.${item.key}.title`)}
                    </Text>
                    <Text style={styles.rowSubtitle}>
                      {t(`settings:partner.permissions.${item.key}.subtitle`)}
                    </Text>
                  </View>
                  <Switch
                    value={editingPermissions[item.key]}
                    onValueChange={() => toggleEditingPermission(item.key)}
                    trackColor={{ false: 'rgba(255,255,255,0.10)', true: 'rgba(37,240,200,0.40)' }}
                    thumbColor={editingPermissions[item.key] ? NEON : 'rgba(255,255,255,0.55)'}
                    ios_backgroundColor="rgba(255,255,255,0.10)"
                  />
                </View>
              ))}
            </View>

            <View style={styles.modalButtons}>
              <AppButton title={t('common:cancel')} onPress={closePartnerEditor} style={styles.modalButton} />
              <AppButton
                title={savingPartnerId ? t('settings:partner.savingPermissions') : t('settings:partner.savePermissions')}
                onPress={savePartnerPermissions}
                loading={savingPartnerId === selectedPartner?.id}
                disabled={savingPartnerId !== null}
                style={styles.modalButton}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000' },
  content: { paddingHorizontal: 20 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenTitle: {
    color: ACCENT,
    fontFamily: 'Rubik_800ExtraBold',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  loadingWrap: {
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    fontWeight: '700',
  },
  conflictCard: {
    borderRadius: 22,
    padding: 18,
    marginBottom: 18,
    backgroundColor: '#050505',
    borderWidth: 1,
    borderColor: 'rgba(255,176,32,0.28)',
  },
  conflictIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,176,32,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,176,32,0.24)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  conflictTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  conflictText: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.56)',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: 16,
  },
  partnerInfoCard: {
    borderRadius: 22,
    padding: 18,
    marginBottom: 18,
    backgroundColor: '#050505',
    borderWidth: 1,
    borderColor: 'rgba(255,176,32,0.28)',
  },
  warningCard: {
    borderRadius: 22,
    padding: 18,
    marginBottom: 18,
    backgroundColor: '#050505',
    borderWidth: 1,
    borderColor: 'rgba(255,176,32,0.28)',
  },
  introCard: {
    borderRadius: 22,
    padding: 18,
    marginBottom: 18,
    backgroundColor: '#050505',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.18)',
    overflow: 'hidden',
  },
  introTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.35,
  },
  introSubtitle: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.58)',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 21,
  },
  introHero: {
    borderRadius: 26,
    padding: 18,
    marginBottom: 16,
    backgroundColor: '#050505',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.18)',
    overflow: 'hidden',
  },
  introPager: {
    width: '100%',
    marginBottom: 10,
  },
  introPagerTrack: {
    alignItems: 'stretch',
    paddingHorizontal: 20,
  },
  introSlide: {
    paddingRight: 0,
  },
  introSlideCard: {
    minHeight: 250,
    borderRadius: 24,
    padding: 18,
    backgroundColor: '#050505',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  introSlideIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(37,240,200,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  introSlideTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  introSlideText: {
    marginTop: 10,
    color: 'rgba(255,255,255,0.58)',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 21,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 18,
  },
  dot: {
    width: 8,
    height: 8,
    marginHorizontal: 4,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  dotActive: {
    width: 22,
    backgroundColor: NEON,
  },
  heroCard: {
    borderRadius: 22,
    padding: 18,
    marginBottom: 18,
    backgroundColor: '#050505',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(37,240,200,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.22)',
    marginBottom: 14,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: -0.25,
  },
  heroSubtitle: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  investmentName: {
    marginTop: 14,
    color: NEON,
    fontSize: 13,
    fontWeight: '900',
  },
  lockedCard: {
    borderRadius: 22,
    padding: 16,
    marginBottom: 22,
    backgroundColor: '#050505',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.18)',
    overflow: 'hidden',
  },
  lockedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  lockedTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  lockedText: {
    color: 'rgba(255,255,255,0.52)',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  actionButton: {
    marginTop: 14,
  },
  groupLabel: {
    color: 'rgba(255,255,255,0.38)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    borderRadius: 22,
    marginBottom: 18,
    backgroundColor: '#050505',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  cardDisabled: {
    opacity: 0.72,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  presetCard: {
    flex: 1,
    borderRadius: 18,
    padding: 14,
    backgroundColor: '#050505',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  presetCardActive: {
    borderColor: 'rgba(37,240,200,0.30)',
    backgroundColor: 'rgba(37,240,200,0.08)',
  },
  presetLabel: {
    color: 'rgba(255,255,255,0.40)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  presetTitle: {
    marginTop: 8,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  presetText: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.52)',
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '600',
  },
  presetSummaryCard: {
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    backgroundColor: '#050505',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.18)',
  },
  presetSummaryTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  presetSummaryText: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.52)',
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '600',
  },
  permissionRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  rowIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(25,112,92,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(25,112,92,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 15,
    fontWeight: '800',
  },
  rowSubtitle: {
    marginTop: 3,
    color: 'rgba(255,255,255,0.40)',
    fontSize: 12.5,
    fontWeight: '600',
    lineHeight: 17,
  },
  permissionStateBadge: {
    minWidth: 66,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(37,240,200,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.16)',
    alignItems: 'center',
  },
  permissionStateText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  generateButton: {
    marginBottom: 18,
  },
  inviteCard: {
    borderRadius: 22,
    padding: 18,
    marginBottom: 18,
    backgroundColor: '#050505',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.24)',
    alignItems: 'center',
    overflow: 'hidden',
  },
  inviteLabel: {
    color: 'rgba(255,255,255,0.48)',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  inviteCode: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 2,
  },
  inviteCodeRow: {
    marginTop: 10,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  copyInviteBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(37,240,200,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.18)',
  },
  inviteHint: {
    marginTop: 10,
    color: 'rgba(255,255,255,0.48)',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
    textAlign: 'center',
  },
  revokeButton: {
    alignSelf: 'stretch',
    marginTop: 14,
  },
  partnerListCard: {
    borderRadius: 22,
    padding: 18,
    marginBottom: 18,
    backgroundColor: '#050505',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  partnerListTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 12,
  },
  partnerListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  partnerListText: {
    flex: 1,
    paddingRight: 12,
  },
  partnerListName: {
    color: 'rgba(255,255,255,0.84)',
    fontSize: 14,
    fontWeight: '800',
  },
  partnerListMeta: {
    marginTop: 3,
    color: 'rgba(255,255,255,0.40)',
    fontSize: 12,
    fontWeight: '600',
  },
  partnerRemoveBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255,176,32,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,176,32,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  partnerEditBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(37,240,200,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 540,
    borderRadius: 24,
    padding: 18,
    backgroundColor: '#050505',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.18)',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  modalSubtitle: {
    marginTop: 8,
    marginBottom: 16,
    color: 'rgba(255,255,255,0.56)',
    fontSize: 13.5,
    fontWeight: '600',
    lineHeight: 20,
  },
  modalPermissionsCard: {
    marginBottom: 18,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
  },
  note: {
    color: 'rgba(255,255,255,0.34)',
    fontSize: 12.5,
    fontWeight: '600',
    lineHeight: 19,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
});
