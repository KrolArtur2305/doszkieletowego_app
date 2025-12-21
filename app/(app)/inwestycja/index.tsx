import { View, Text, StyleSheet } from 'react-native';

export default function InwestycjaScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Inwestycja</Text>
      <Text style={styles.subtitle}>Ekran w przygotowaniu</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050915',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
  },
});
