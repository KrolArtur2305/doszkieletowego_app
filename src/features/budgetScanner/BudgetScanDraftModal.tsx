import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Feather } from '@expo/vector-icons';

import { AppButton, AppCard, AppInput } from '../../ui/components';
import { BUDGET_SCAN_MAX_ITEMS, type BudgetScanDraft, type BudgetScanDraftItem, type BudgetScanStageRef } from './draftTypes';

const NEON = '#25F0C8';
const STATUS_PAID = 'poniesiony';

type StageOption = BudgetScanStageRef & {
  key: string | null;
};

type BudgetScanDraftModalLabels = {
  title: string;
  emptyTitle: string;
  emptyHint: string;
  processingTitle: string;
  processingHint: string;
  addItem: string;
  itemName: string;
  itemNamePlaceholder: string;
  amount: string;
  amountPlaceholder: string;
  stage: string;
  noStage: string;
  selected: string;
  remove: string;
  maxItemsReached: string;
  cancel: string;
  save: string;
  saving: string;
};

type BudgetScanDraftModalProps = {
  draft: BudgetScanDraft | null;
  stageOptions: StageOption[];
  saving?: boolean;
  labels: BudgetScanDraftModalLabels;
  onCancel: () => void;
  onSave: (items: BudgetScanDraftItem[]) => void;
};

function createManualItem(defaultStage: BudgetScanStageRef | null): BudgetScanDraftItem {
  return {
    id: `scan_item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    total: 0,
    currency: null,
    date: null,
    status: STATUS_PAID,
    expenseType: 'material',
    categoryCode: 'other',
    stage: defaultStage,
    description: null,
    store: null,
    confidence: 0,
    selected: true,
    sourceText: null,
  };
}

export function BudgetScanDraftModal({
  draft,
  stageOptions,
  saving = false,
  labels,
  onCancel,
  onSave,
}: BudgetScanDraftModalProps) {
  const [items, setItems] = useState<BudgetScanDraftItem[]>([]);
  const [stageMenuOpenFor, setStageMenuOpenFor] = useState<string | null>(null);

  const hasItems = items.length > 0;
  const isProcessing = draft?.status === 'processing';
  const warningMessage = draft?.errorMessage ?? draft?.validation?.message ?? null;

  useEffect(() => {
    setItems(draft?.items ?? []);
    setStageMenuOpenFor(null);
  }, [draft?.id, draft?.items, draft?.status]);

  const addItem = () => {
    if (items.length >= BUDGET_SCAN_MAX_ITEMS) return;
    setItems((prev) => [...prev, createManualItem(draft?.defaultStage ?? null)]);
  };

  const updateItem = (id: string, patch: Partial<BudgetScanDraftItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const toggleSelected = (itemId: string) => {
    setItems((prev) => prev.map((item) => (
      item.id === itemId ? { ...item, selected: !item.selected } : item
    )));
  };

  const selectStage = (itemId: string, stage: BudgetScanStageRef | null) => {
    updateItem(itemId, { stage });
    setStageMenuOpenFor(null);
  };

  return (
    <Modal visible={!!draft} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <AppCard contentStyle={styles.card} style={styles.cardOuter} withShadow={false}>
          <View style={styles.header}>
            <Text style={styles.title}>{labels.title}</Text>
            <TouchableOpacity onPress={onCancel} style={styles.iconButton} activeOpacity={0.85}>
              <Feather name="x" size={18} color="rgba(255,255,255,0.72)" />
            </TouchableOpacity>
          </View>

          {draft?.file.uri ? (
            <ExpoImage source={{ uri: draft.file.uri }} style={styles.preview} contentFit="cover" />
          ) : null}

          {isProcessing ? (
            <View style={styles.processingBox}>
              <ActivityIndicator color={NEON} />
              <Text style={styles.processingTitle}>{labels.processingTitle}</Text>
              <Text style={styles.processingHint}>{labels.processingHint}</Text>
            </View>
          ) : null}

          {warningMessage ? (
            <View style={styles.warningBox}>
              <Feather name="alert-triangle" size={16} color="#FDE68A" />
              <Text style={styles.warningText}>{warningMessage}</Text>
            </View>
          ) : null}

          {!isProcessing ? (
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            >
              {!hasItems ? (
                <View style={styles.emptyBox}>
                  <Feather name="file-text" size={24} color={NEON} />
                  <Text style={styles.emptyTitle}>{labels.emptyTitle}</Text>
                  <Text style={styles.emptyHint}>{labels.emptyHint}</Text>
                </View>
              ) : null}

              {items.length >= BUDGET_SCAN_MAX_ITEMS ? (
                <Text style={styles.limitText}>{labels.maxItemsReached}</Text>
              ) : null}

              {hasItems ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.tableWrap}>
                    <View style={styles.tableHeader}>
                      <Text style={[styles.headerCell, styles.indexCol]}>#</Text>
                      <Text style={[styles.headerCell, styles.nameCol]}>{labels.itemName}</Text>
                      <Text style={[styles.headerCell, styles.amountCol]}>{labels.amount}</Text>
                      <Text style={[styles.headerCell, styles.stageCol]}>{labels.stage}</Text>
                      <Text style={[styles.headerCell, styles.checkCol]}>{labels.selected}</Text>
                      <Text style={[styles.headerCell, styles.iconCol]}>{labels.remove}</Text>
                    </View>

                    {items.map((item, index) => {
                      const stageLabel = item.stage?.label ?? draft?.defaultStage?.label ?? labels.noStage;

                      return (
                        <View key={item.id} style={[styles.row, !item.selected && styles.rowOff]}>
                          <Text style={[styles.indexValue, styles.indexCol]}>{index + 1}</Text>

                          <View style={styles.nameCol}>
                            <AppInput
                              value={item.name}
                              onChangeText={(value) => updateItem(item.id, { name: value })}
                              placeholder={labels.itemNamePlaceholder}
                              style={styles.cellInput}
                            />
                          </View>

                          <View style={styles.amountCol}>
                            <AppInput
                              value={item.total > 0 ? String(item.total) : ''}
                              onChangeText={(value) => {
                                const next = Number.parseFloat(String(value).replace(',', '.'));
                                updateItem(item.id, { total: Number.isFinite(next) ? next : 0 });
                              }}
                              placeholder={labels.amountPlaceholder}
                              keyboardType="numeric"
                              style={styles.cellInput}
                            />
                          </View>

                          <View style={styles.stageCol}>
                            <View style={styles.stageSelectWrap}>
                              <TouchableOpacity
                                onPress={() => setStageMenuOpenFor((open) => (open === item.id ? null : item.id))}
                                style={[styles.stageSelect, stageMenuOpenFor === item.id && styles.stageSelectOpen]}
                                activeOpacity={0.85}
                              >
                                <Text style={styles.stageSelectText} numberOfLines={1}>
                                  {stageLabel}
                                </Text>
                                <Feather
                                  name={stageMenuOpenFor === item.id ? 'chevron-up' : 'chevron-down'}
                                  size={16}
                                  color="rgba(220,255,245,0.82)"
                                />
                              </TouchableOpacity>

                              {stageMenuOpenFor === item.id ? (
                                <View style={styles.stageDropdown}>
                                  <TouchableOpacity
                                    onPress={() => selectStage(item.id, null)}
                                    style={[styles.stageDropdownItem, !item.stage && styles.stageDropdownItemOn]}
                                    activeOpacity={0.85}
                                  >
                                    <Text style={[styles.stageDropdownText, !item.stage && styles.stageDropdownTextOn]} numberOfLines={1}>
                                      {labels.noStage}
                                    </Text>
                                  </TouchableOpacity>

                                  {stageOptions.map((stage) => {
                                    const isActive = stage.key === item.stage?.key;
                                    return (
                                      <TouchableOpacity
                                        key={stage.key ?? stage.label}
                                        onPress={() => selectStage(item.id, stage)}
                                        style={[styles.stageDropdownItem, isActive && styles.stageDropdownItemOn]}
                                        activeOpacity={0.85}
                                      >
                                        <Text style={[styles.stageDropdownText, isActive && styles.stageDropdownTextOn]} numberOfLines={1}>
                                          {stage.label}
                                        </Text>
                                      </TouchableOpacity>
                                    );
                                  })}
                                </View>
                              ) : null}
                            </View>
                          </View>

                          <TouchableOpacity
                            onPress={() => toggleSelected(item.id)}
                            style={styles.checkCol}
                            activeOpacity={0.85}
                          >
                            <Feather
                              name={item.selected ? 'check-square' : 'square'}
                              size={18}
                              color={item.selected ? NEON : 'rgba(255,255,255,0.45)'}
                            />
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => removeItem(item.id)}
                            style={styles.iconCol}
                            activeOpacity={0.85}
                          >
                            <Feather name="trash-2" size={17} color="#FCA5A5" />
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>
              ) : null}
            </ScrollView>
          ) : null}

          <View style={styles.footer}>
            <AppButton
              title={labels.addItem}
              variant="secondary"
              onPress={addItem}
              disabled={saving || isProcessing || items.length >= BUDGET_SCAN_MAX_ITEMS}
              style={styles.footerButton}
            />
            <AppButton
              title={saving ? labels.saving : labels.save}
              disabled={saving || isProcessing}
              loading={saving}
              onPress={() => onSave(items)}
              style={styles.footerButton}
            />
          </View>
        </AppCard>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#000000',
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  cardOuter: {
    width: '100%',
    maxHeight: '96%',
  },
  card: {
    padding: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.14)',
    backgroundColor: '#050B0A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: {
    flex: 1,
    color: NEON,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  preview: {
    width: '100%',
    height: 116,
    borderRadius: 16,
    backgroundColor: '#000000',
    marginBottom: 10,
  },
  processingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.14)',
    backgroundColor: 'rgba(37,240,200,0.06)',
    paddingVertical: 18,
    marginBottom: 10,
    gap: 6,
  },
  processingTitle: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 14,
    fontWeight: '900',
  },
  processingHint: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 18,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(253,230,138,0.24)',
    backgroundColor: 'rgba(253,230,138,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  warningText: {
    flex: 1,
    color: '#FDE68A',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  list: {
    maxHeight: 470,
  },
  listContent: {
    gap: 10,
    paddingBottom: 4,
  },
  emptyBox: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.14)',
    backgroundColor: 'rgba(37,240,200,0.06)',
    padding: 16,
  },
  emptyTitle: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 14,
    fontWeight: '900',
    marginTop: 8,
  },
  emptyHint: {
    color: 'rgba(255,255,255,0.54)',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 4,
  },
  limitText: {
    color: '#FDE68A',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 18,
  },
  tableWrap: {
    minWidth: 820,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    paddingBottom: 6,
  },
  headerCell: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  rowOff: {
    opacity: 0.55,
  },
  indexCol: {
    width: 30,
    flexShrink: 0,
  },
  indexValue: {
    color: 'rgba(255,255,255,0.76)',
    fontSize: 12,
    fontWeight: '800',
    paddingTop: 12,
    textAlign: 'center',
  },
  nameCol: {
    width: 240,
    flexShrink: 0,
  },
  amountCol: {
    width: 116,
    flexShrink: 0,
  },
  stageCol: {
    width: 220,
    flexShrink: 0,
  },
  checkCol: {
    width: 42,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
  },
  iconCol: {
    width: 34,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
  },
  cellInput: {
    minHeight: 42,
  },
  stageSelectWrap: {
    position: 'relative',
    zIndex: 20,
    elevation: 8,
  },
  stageSelect: {
    minHeight: 42,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.20)',
    backgroundColor: 'rgba(255,255,255,0.045)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  stageSelectOpen: {
    borderColor: 'rgba(37,240,200,0.42)',
    backgroundColor: 'rgba(37,240,200,0.10)',
  },
  stageSelectText: {
    flex: 1,
    color: 'rgba(220,255,245,0.96)',
    fontWeight: '900',
    fontSize: 12,
  },
  stageDropdown: {
    position: 'absolute',
    top: 45,
    left: 0,
    right: 0,
    zIndex: 30,
    elevation: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.18)',
    backgroundColor: '#07120F',
    overflow: 'hidden',
  },
  stageDropdownItem: {
    minHeight: 30,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.055)',
  },
  stageDropdownItemOn: {
    backgroundColor: 'rgba(37,240,200,0.12)',
  },
  stageDropdownText: {
    color: '#94A3B8',
    fontWeight: '800',
    fontSize: 12,
  },
  stageDropdownTextOn: {
    color: 'rgba(220,255,245,0.98)',
  },
  footer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  footerButton: {
    flex: 1,
  },
});
