import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';

const NEON = '#25F0C8';

type FloatingAddButtonProps = {
  onPress: () => void;
};

export function FloatingAddButton({ onPress }: FloatingAddButtonProps) {
  return (
    <TouchableOpacity style={styles.fab} onPress={onPress} activeOpacity={0.88}>
      <Feather name="plus" size={24} color="#0B1120" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 22,
    bottom: 100,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: NEON,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: NEON,
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
  },
});
