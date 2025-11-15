import { useMemo, useState } from 'react';
import { Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';

const stages = ['Wszystkie', 'Stan zero', 'SSO', 'SSZ', 'Deweloperski'];

// TODO: Podłącz Supabase Storage → photos/<userId>
const mockPhotos = [
  {
    id: 'photo-1',
    title: 'Zalany fundament',
    stage: 'Stan zero',
    author: 'Nadzór inwestorski',
    date: '04.02.2025',
    image: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 'photo-2',
    title: 'Ściany parteru',
    stage: 'SSO',
    author: 'Ekipa murarska',
    date: '08.02.2025',
    image: 'https://images.unsplash.com/photo-1501594907352-04cda38ebc29?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 'photo-3',
    title: 'Strop piętra',
    stage: 'SSZ',
    author: 'Inspektor nadzoru',
    date: '12.02.2025',
    image: 'https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 'photo-4',
    title: 'Instalacja elektryczna',
    stage: 'Deweloperski',
    author: 'SmartGrid sp. z o.o.',
    date: '15.02.2025',
    image: 'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=900&q=80',
  },
];

export default function ZdjeciaScreen() {
  const [activeStage, setActiveStage] = useState('Wszystkie');
  const [modalVisible, setModalVisible] = useState(false);

  const filteredPhotos = useMemo(
    () => mockPhotos.filter((photo) => activeStage === 'Wszystkie' || photo.stage === activeStage),
    [activeStage],
  );

  return (
    <View style={styles.wrapper}>
      <View style={styles.glow} />
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} style={styles.container}>
        <BlurView intensity={70} tint="dark" style={styles.headerCard}>
          <View>
            <Text style={styles.title}>Zdjęcia z budowy</Text>
            <Text style={styles.subtitle}>Każdy etap udokumentowany w Supabase Storage</Text>
          </View>
          <TouchableOpacity style={styles.addButton} onPress={() => setModalVisible(true)}>
            <Feather name="upload" color="#0F172A" size={18} />
            <Text style={styles.addButtonText}>Dodaj zdjęcie</Text>
          </TouchableOpacity>
        </BlurView>

        <View style={styles.stageRow}>
          {stages.map((stage) => {
            const isActive = activeStage === stage;
            return (
              <TouchableOpacity
                key={stage}
                style={[styles.stageChip, isActive && styles.stageChipActive]}
                onPress={() => setActiveStage(stage)}
              >
                <Text style={[styles.stageChipText, isActive && styles.stageChipTextActive]}>{stage}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.photoGrid}>
          {filteredPhotos.map((photo) => (
            <BlurView key={photo.id} intensity={60} tint="dark" style={styles.photoCard}>
              <Image source={{ uri: photo.image }} style={styles.photoImage} />
              <View style={styles.photoInfo}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={styles.photoTitle}>{photo.title}</Text>
                  <View style={styles.stageBadge}>
                    <Text style={styles.stageBadgeText}>{photo.stage}</Text>
                  </View>
                </View>
                <Text style={styles.photoMeta}>{photo.author}</Text>
                <Text style={styles.photoMeta}>{photo.date}</Text>
              </View>
            </BlurView>
          ))}
        </View>
      </ScrollView>

      <Modal animationType="fade" transparent visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <BlurView intensity={90} tint="dark" style={styles.modalContent}>
            <Text style={styles.modalTitle}>Dodaj nowe zdjęcie</Text>
            <Text style={styles.modalDescription}>
              W następnym kroku podepniemy Supabase Storage. Na razie możesz zasymulować dodanie zdjęcia.
            </Text>
            <TextInput placeholder="Tytuł zdjęcia" placeholderTextColor="#94A3B8" style={styles.input} />
            <TextInput placeholder="Opis / notatka" placeholderTextColor="#94A3B8" style={[styles.input, { height: 80 }]} multiline />
            <TouchableOpacity style={styles.primaryAction}>
              <Feather name="cloud" color="#0F172A" size={18} />
              <Text style={styles.primaryActionText}>Wybierz z rolki</Text>
            </TouchableOpacity>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.secondaryAction} onPress={() => setModalVisible(false)}>
                <Text style={styles.secondaryActionText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primarySave} onPress={() => setModalVisible(false)}>
                <Text style={styles.primarySaveText}>Zapisz szkic</Text>
              </TouchableOpacity>
            </View>
          </BlurView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#050915' },
  container: { paddingTop: 40, paddingHorizontal: 16 },
  glow: {
    position: 'absolute',
    width: 420,
    height: 420,
    borderRadius: 999,
    backgroundColor: '#22D3EE',
    opacity: 0.15,
    top: 120,
    left: -140,
  },
  headerCard: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 20,
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },
  title: { color: '#F8FAFC', fontSize: 24, fontWeight: '800' },
  subtitle: { color: '#94A3B8', marginTop: 6 },
  addButton: {
    backgroundColor: '#5EEAD4',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addButtonText: { color: '#0F172A', fontWeight: '700' },
  stageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 18 },
  stageChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  stageChipActive: { backgroundColor: 'rgba(94,234,212,0.15)', borderColor: 'rgba(94,234,212,0.6)' },
  stageChipText: { color: '#94A3B8', fontWeight: '600' },
  stageChipTextActive: { color: '#5EEAD4' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 16 },
  photoCard: {
    width: '48%',
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  photoImage: { width: '100%', height: 150 },
  photoInfo: { padding: 14 },
  photoTitle: { color: '#F8FAFC', fontWeight: '700', flex: 1, marginRight: 8 },
  stageBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(94,234,212,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  stageBadgeText: { color: '#5EEAD4', fontSize: 11, fontWeight: '700' },
  photoMeta: { color: '#94A3B8', marginTop: 4, fontSize: 13 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5,9,21,0.8)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 20,
  },
  modalTitle: { color: '#F8FAFC', fontSize: 22, fontWeight: '800' },
  modalDescription: { color: '#94A3B8', marginVertical: 12 },
  input: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 14,
    color: '#F8FAFC',
    marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  primaryAction: {
    borderRadius: 18,
    backgroundColor: 'rgba(94,234,212,0.2)',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(94,234,212,0.4)',
    marginBottom: 14,
  },
  primaryActionText: { color: '#5EEAD4', fontWeight: '700' },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  secondaryAction: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 14,
    alignItems: 'center',
  },
  secondaryActionText: { color: '#E2E8F0', fontWeight: '600' },
  primarySave: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: '#5EEAD4',
    padding: 14,
    alignItems: 'center',
  },
  primarySaveText: { color: '#0F172A', fontWeight: '800' },
});
