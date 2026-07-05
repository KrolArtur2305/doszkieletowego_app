import { memo } from 'react';
import { Feather } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { AppButton, AppCard } from '../src/ui/components';
import { colors, radius, spacing, typography } from '../src/ui/theme';
import { getBuildInfoLabel, type RuntimeDiagnosticSnapshot } from '../lib/runtimeDiagnostics';

type RuntimeCrashReportProps = {
  title: string;
  subtitle: string;
  snapshot?: RuntimeDiagnosticSnapshot | null;
  errorText?: string | null;
  onDismiss: () => void;
};

function formatSnapshot(snapshot?: RuntimeDiagnosticSnapshot | null, errorText?: string | null) {
  const lines: string[] = [];

  if (errorText) {
    lines.push(errorText);
  }

  if (snapshot?.lastError) {
    lines.push(`name: ${snapshot.lastError.name}`);
    lines.push(`message: ${snapshot.lastError.message}`);
    if (snapshot.lastError.phase) lines.push(`phase: ${snapshot.lastError.phase}`);
    if (snapshot.lastError.timestamp) lines.push(`time: ${snapshot.lastError.timestamp}`);
    if (snapshot.lastCheckpoint) lines.push(`checkpoint: ${snapshot.lastCheckpoint}`);
    if (snapshot.lastError.stack) lines.push(`stack:\n${snapshot.lastError.stack}`);
    if (snapshot.lastError.componentStack) lines.push(`componentStack:\n${snapshot.lastError.componentStack}`);
  }

  const buildInfo = getBuildInfoLabel();
  if (buildInfo) lines.push(`build: ${buildInfo}`);

  return lines.join('\n\n');
}

function RuntimeCrashReportComponent({
  title,
  subtitle,
  snapshot,
  errorText,
  onDismiss,
}: RuntimeCrashReportProps) {
  const details = formatSnapshot(snapshot, errorText);

  const copyDetails = async () => {
    if (!details.trim()) return;
    await Clipboard.setStringAsync(details);
  };

  return (
    <View style={styles.screen}>
      <AppCard style={styles.card} contentStyle={styles.cardContent} withShadow={false}>
        <View style={styles.iconWrap}>
          <Feather name="alert-triangle" size={24} color="#F97373" />
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        <ScrollView style={styles.logWrap} contentContainerStyle={styles.logContent}>
          <Text selectable style={styles.logText}>
            {details || 'No diagnostic data was captured.'}
          </Text>
        </ScrollView>

        <View style={styles.actions}>
          <AppButton title="Kopiuj błąd" variant="secondary" onPress={copyDetails} style={styles.actionBtn} />
          <AppButton title="Wróć do aplikacji" onPress={onDismiss} style={styles.actionBtn} />
        </View>

        <Pressable onPress={copyDetails} hitSlop={10} style={styles.smallLink}>
          <Text style={styles.smallLinkText}>Skopiuj pełne dane diagnostyczne</Text>
        </Pressable>
      </AppCard>
    </View>
  );
}

export const RuntimeCrashReport = memo(RuntimeCrashReportComponent);

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg + 2,
    paddingVertical: spacing.xl,
    backgroundColor: colors.bg,
  },
  card: {
    width: '100%',
  },
  cardContent: {
    padding: spacing.lg,
  },
  iconWrap: {
    width: 56,
    height: 56,
    alignSelf: 'center',
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(249,115,115,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(249,115,115,0.22)',
    marginBottom: spacing.md,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  logWrap: {
    maxHeight: 320,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  logContent: {
    padding: spacing.md,
  },
  logText: {
    color: '#F8FAFC',
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: 'monospace',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: spacing.lg,
  },
  actionBtn: {
    flex: 1,
  },
  smallLink: {
    alignItems: 'center',
    marginTop: spacing.md,
  },
  smallLinkText: {
    color: colors.accentBright,
    fontSize: 12,
    fontWeight: '700',
  },
});
