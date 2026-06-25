import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';

import { AppButton, AppCard } from '../../ui/components';
import type { BudgetScanFile } from './types';

const NEON = '#25F0C8';

type BudgetScanPreviewModalProps = {
  file: BudgetScanFile | null;
  fileTooLarge: boolean;
  fileTooLargeText: string;
  labels: {
    title: string;
    hint: string;
    cancel: string;
    retake: string;
    usePhoto: string;
  };
  onCancel: () => void;
  onRetake: () => void;
  onUsePhoto: () => void;
};

export function BudgetScanPreviewModal({
  file,
  fileTooLarge,
  fileTooLargeText,
  labels,
  onCancel,
  onRetake,
  onUsePhoto,
}: BudgetScanPreviewModalProps) {
  return (
    <Modal
      visible={!!file}
      animationType="fade"
      transparent
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <AppCard contentStyle={styles.card} style={styles.cardOuter} withShadow={false}>
          <Text style={styles.title}>{labels.title}</Text>
          {file?.uri ? (
            <ExpoImage source={{ uri: file.uri }} style={styles.image} contentFit="contain" />
          ) : null}
          <Text style={styles.hint}>{labels.hint}</Text>
          {fileTooLarge ? (
            <Text style={styles.error}>{fileTooLargeText}</Text>
          ) : null}
          <View style={styles.actions}>
            <AppButton
              title={labels.cancel}
              variant="secondary"
              onPress={onCancel}
              style={styles.button}
            />
            <AppButton
              title={labels.retake}
              variant="secondary"
              onPress={onRetake}
              style={styles.button}
            />
          </View>
          <AppButton
            title={labels.usePhoto}
            onPress={onUsePhoto}
            style={styles.primary}
          />
        </AppCard>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.92)',
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  cardOuter: {
    width: '100%',
  },
  card: {
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.16)',
    backgroundColor: '#050B0A',
  },
  title: {
    color: NEON,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 12,
  },
  image: {
    width: '100%',
    aspectRatio: 0.72,
    maxHeight: 520,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  hint: {
    color: 'rgba(255,255,255,0.64)',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 12,
  },
  error: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  button: {
    flex: 1,
  },
  primary: {
    width: '100%',
    marginTop: 8,
  },
});
