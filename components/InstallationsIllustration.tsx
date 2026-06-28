import React from 'react';
import { Image, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

type InstallationsIllustrationProps = {
  style?: StyleProp<ViewStyle>;
};

export function InstallationsIllustration({ style }: InstallationsIllustrationProps) {
  return (
    <View style={[styles.wrap, style]}>
      <Image
        source={require('../assets/installations-hero.png')}
        style={styles.image}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    aspectRatio: 2.15,
    overflow: 'hidden',
    borderRadius: 24,
    backgroundColor: '#04070A',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
