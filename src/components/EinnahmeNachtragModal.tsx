import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { formatMedicationUnit } from '../constants/MedicationUnits';
import type {
  NachtragRangeMode,
  OffeneEinnahmeNachtragGroup,
  OffeneEinnahmeNachtragItem,
} from '../services/EinnahmeNachtragService';

interface Props {
  visible: boolean;
  title: string;
  subtitle: string;
  groups: OffeneEinnahmeNachtragGroup[];
  loading: boolean;
  mode: NachtragRangeMode;
  customDate?: Date;
  showRangeSelector?: boolean;
  saving: boolean;
  onModeChange: (mode: NachtragRangeMode, customDate?: Date) => void;
  onSave: (items: OffeneEinnahmeNachtragItem[]) => Promise<void>;
  onClose: () => void;
}

export default function EinnahmeNachtragModal({
  visible,
  title,
  subtitle,
  groups,
  loading,
  mode,
  customDate,
  showRangeSelector = true,
  saving,
  onModeChange,
  onSave,
  onClose,
}: Props) {
  const allItems = useMemo(() => groups.flatMap(group => group.items), [groups]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCustomDates, setShowCustomDates] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSelectedIds(new Set(allItems.map(item => item.id)));
  }, [allItems, visible]);

  useEffect(() => {
    if (mode !== 'custom') {
      setShowCustomDates(false);
    }
  }, [mode]);

  const selectedItems = allItems.filter(item => selectedIds.has(item.id));

  const toggleItem = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleDay = (group: OffeneEinnahmeNachtragGroup) => {
    const allSelected = group.items.every(item => selectedIds.has(item.id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      for (const item of group.items) {
        if (allSelected) {
          next.delete(item.id);
        } else {
          next.add(item.id);
        }
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (selectedItems.length === 0) {
      Alert.alert('Nichts ausgewählt', 'Bitte wähle mindestens eine Einnahme aus.');
      return;
    }
    await onSave(selectedItems);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Nachtrag schließen"
          >
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
        </View>

        {showRangeSelector ? (
          <View style={styles.rangeSection}>
            <View style={styles.chipRow}>
              <RangeChip
                label="Gestern"
                active={mode === 'yesterday'}
                onPress={() => onModeChange('yesterday')}
              />
              <RangeChip
                label="Letzte 7 Tage"
                active={mode === 'sevenDays'}
                onPress={() => onModeChange('sevenDays')}
              />
              <RangeChip
                label="Anderes Datum"
                active={mode === 'custom'}
                onPress={() => {
                  setShowCustomDates(prev => !prev);
                  if (mode !== 'custom') onModeChange('custom', customDate || yesterday());
                }}
              />
            </View>
            {showCustomDates ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.customDateRow}
              >
                {buildCustomDateOptions().map(date => (
                  <RangeChip
                    key={date.toISOString()}
                    label={formatShortDate(date)}
                    active={mode === 'custom' && sameLocalDay(date, customDate || yesterday())}
                    onPress={() => onModeChange('custom', date)}
                  />
                ))}
              </ScrollView>
            ) : null}
          </View>
        ) : null}

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentInner}
        >
          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#1F6F8B" />
              <Text style={styles.loadingText}>Offene Einnahmen werden geprüft ...</Text>
            </View>
          ) : groups.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>Keine offenen Einnahmen gefunden</Text>
              <Text style={styles.emptyText}>Für den ausgewählten Zeitraum ist nichts nachzutragen.</Text>
            </View>
          ) : (
            groups.map(group => {
              const daySelected = group.items.every(item => selectedIds.has(item.id));
              const selectedCount = group.items.filter(item => selectedIds.has(item.id)).length;
              return (
                <View key={group.datumIso} style={styles.dayCard}>
                  <TouchableOpacity
                    style={styles.dayHeader}
                    onPress={() => toggleDay(group)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: daySelected }}
                    accessibilityLabel={`${group.datumLabel}: alle Einnahmen auswählen`}
                  >
                    <Text style={styles.checkbox}>{daySelected ? '✓' : ''}</Text>
                    <View style={styles.dayTitleWrap}>
                      <Text style={styles.dayTitle}>{group.datumLabel}</Text>
                      <Text style={styles.daySub}>
                        {selectedCount} von {group.items.length} ausgewählt
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {group.items.map(item => {
                    const selected = selectedIds.has(item.id);
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.itemRow}
                        onPress={() => toggleItem(item.id)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected }}
                        accessibilityLabel={`${item.medikamentName}, ${item.slotLabel}, ${item.dosis} ${item.einheit}`}
                      >
                        <Text style={[styles.itemCheckbox, selected && styles.itemCheckboxActive]}>
                          {selected ? '✓' : ''}
                        </Text>
                        <View style={styles.itemTextWrap}>
                          <Text style={styles.itemTitle}>
                            {item.medikamentName} · {item.slotLabel}
                          </Text>
                          <Text style={styles.itemSub}>
                            {item.slotUhrzeit} Uhr · {item.dosis} {formatMedicationUnit(item.dosis, item.einheit)}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })
          )}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={onClose}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Abbrechen"
          >
            <Text style={styles.secondaryButtonText}>Abbrechen</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.primaryButton,
              (selectedItems.length === 0 || saving || loading) && styles.primaryButtonDisabled,
            ]}
            onPress={handleSave}
            disabled={selectedItems.length === 0 || saving || loading}
            accessibilityRole="button"
            accessibilityLabel="Ausgewählte Einnahmen speichern"
          >
            <Text style={styles.primaryButtonText}>
              {saving ? 'Speichert ...' : `Ausgewählte speichern (${selectedItems.length})`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function RangeChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.rangeChip, active && styles.rangeChipActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.rangeChipText, active && styles.rangeChipTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function buildCustomDateOptions(): Date[] {
  const today = startOfLocalDay(new Date());
  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - index - 1);
    return date;
  });
}

function yesterday(): Date {
  const date = startOfLocalDay(new Date());
  date.setDate(date.getDate() - 1);
  return date;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function sameLocalDay(a: Date, b: Date): boolean {
  return startOfLocalDay(a).getTime() === startOfLocalDay(b).getTime();
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).replace('.', '');
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  header: {
    paddingTop: 58,
    paddingHorizontal: 18,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
  },
  closeButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  closeText: {
    fontSize: 24,
    color: '#374151',
    fontWeight: '800',
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    fontSize: 26,
    color: '#111827',
    fontWeight: '900',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 16,
    lineHeight: 22,
    color: '#4B5563',
    fontWeight: '600',
  },
  rangeSection: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  customDateRow: {
    paddingTop: 10,
    gap: 8,
  },
  rangeChip: {
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2F7',
    borderWidth: 1,
    borderColor: '#D8DEE8',
  },
  rangeChipActive: {
    backgroundColor: '#1F6F8B',
    borderColor: '#1F6F8B',
  },
  rangeChipText: {
    fontSize: 16,
    color: '#374151',
    fontWeight: '800',
  },
  rangeChipTextActive: {
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 16,
    paddingBottom: 24,
  },
  loadingBox: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 17,
    color: '#4B5563',
    fontWeight: '600',
  },
  emptyBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    minHeight: 140,
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 22,
    color: '#111827',
    fontWeight: '800',
  },
  emptyText: {
    marginTop: 8,
    fontSize: 17,
    color: '#4B5563',
    lineHeight: 24,
  },
  dayCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  dayHeader: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  checkbox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    textAlign: 'center',
    lineHeight: 34,
    backgroundColor: '#1F6F8B',
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    marginRight: 12,
  },
  dayTitleWrap: {
    flex: 1,
  },
  dayTitle: {
    fontSize: 21,
    color: '#111827',
    fontWeight: '900',
  },
  daySub: {
    marginTop: 3,
    fontSize: 15,
    color: '#6B7280',
    fontWeight: '700',
  },
  itemRow: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
  },
  itemCheckbox: {
    width: 30,
    height: 30,
    borderRadius: 15,
    textAlign: 'center',
    lineHeight: 30,
    borderWidth: 2,
    borderColor: '#9CA3AF',
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    marginRight: 12,
  },
  itemCheckboxActive: {
    backgroundColor: '#1F6F8B',
    borderColor: '#1F6F8B',
  },
  itemTextWrap: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 19,
    color: '#111827',
    fontWeight: '800',
  },
  itemSub: {
    marginTop: 4,
    fontSize: 16,
    color: '#4B5563',
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  secondaryButton: {
    minHeight: 54,
    borderRadius: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2F7',
  },
  secondaryButtonText: {
    fontSize: 17,
    color: '#374151',
    fontWeight: '800',
  },
  primaryButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1F6F8B',
  },
  primaryButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  primaryButtonText: {
    fontSize: 17,
    color: '#FFFFFF',
    fontWeight: '900',
    textAlign: 'center',
  },
});
