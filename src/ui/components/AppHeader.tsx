import React from 'react';
import { Image as ExpoImage } from 'expo-image';
import { ImageStyle, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';

import { colors, header, typography } from '../tokens';

const APP_LOGO = require('../../../assets/logo.png');

type AppHeaderProps = {
  title: string;
  style?: StyleProp<ViewStyle>;
  rightSlot?: React.ReactNode;
  logoStyle?: StyleProp<ImageStyle>;
  titleStyle?: StyleProp<TextStyle>;
  titleWrapStyle?: StyleProp<ViewStyle>;
  height?: number;
  sideSlotWidth?: number;
  titleNumberOfLines?: number;
  titleMinimumFontScale?: number;
};

export function AppHeader({
  title,
  style,
  rightSlot,
  logoStyle,
  titleStyle,
  titleWrapStyle,
  height = header.height,
  sideSlotWidth = header.sideSlot,
  titleNumberOfLines = 1,
  titleMinimumFontScale = 0.8,
}: AppHeaderProps) {
  return (
    <View style={[styles.root, { height }, style]}>
      <View style={[styles.sideSlot, { width: sideSlotWidth, height }]}>
        <ExpoImage
          source={APP_LOGO}
          style={[styles.logo, logoStyle]}
          contentFit="contain"
          cachePolicy="memory-disk"
        />
      </View>

      <View pointerEvents="none" style={[styles.titleWrap, titleWrapStyle]}>
        <Text
          numberOfLines={titleNumberOfLines}
          adjustsFontSizeToFit
          minimumFontScale={titleMinimumFontScale}
          style={[styles.title, titleStyle]}
        >
          {title}
        </Text>
      </View>

      <View style={[styles.sideSlot, { width: sideSlotWidth, height }]}>{rightSlot}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sideSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: header.sideSlot,
    height: header.logoHeight,
  },
  titleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  title: {
    color: colors.accent,
    ...typography.screenTitle,
    fontSize: 42,
    lineHeight: 48,
    textAlign: 'center',
  },
});
