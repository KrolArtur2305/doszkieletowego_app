import React from 'react';
import {
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
  ScrollViewProps,
} from 'react-native';

import { colors } from '../tokens';

type AppScreenProps = {
  children: React.ReactNode;
  background?: React.ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: ScrollViewProps['contentContainerStyle'];
  showsVerticalScrollIndicator?: boolean;
};

export function AppScreen({
  children,
  background,
  scroll = false,
  style,
  contentContainerStyle,
  showsVerticalScrollIndicator = false,
}: AppScreenProps) {
  return (
    <View style={[styles.screen, style]}>
      <View pointerEvents="none" style={styles.blackBase} />
      {background}

      {scroll ? (
        <ScrollView
          style={styles.fill}
          contentContainerStyle={contentContainerStyle}
          showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={styles.fill}>{children}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  fill: {
    flex: 1,
  },
  blackBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
  },
});
