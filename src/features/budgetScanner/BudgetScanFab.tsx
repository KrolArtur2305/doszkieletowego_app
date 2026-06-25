import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const NEON = '#25F0C8';

type BudgetScanFabProps = {
  accessibilityLabel: string;
  menuOpen?: boolean;
  onPress: () => void;
};

export function BudgetScanFab({ accessibilityLabel, menuOpen = false, onPress }: BudgetScanFabProps) {
  return (
    <TouchableOpacity
      style={styles.scanFab}
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <MaterialCommunityIcons name={menuOpen ? 'close' : 'scanner'} size={22} color={NEON} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  scanFab: {
    position: 'absolute',
    right: 26,
    bottom: 96,
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.44)',
    backgroundColor: 'rgba(5,11,10,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: NEON,
    shadowOpacity: 0.26,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 9,
  },
});
