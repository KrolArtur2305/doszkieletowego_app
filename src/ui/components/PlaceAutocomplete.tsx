import { forwardRef, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

import {
  GEOCODING_COUNTRIES,
  getPlaceLocalityName,
  searchPlaces,
  type PlaceSuggestion,
} from '../../services/geocoding/places';
import { AppInput } from './AppInput';
import { colors, radius, spacing, typography } from '../tokens';

type Props = {
  countryLabel: string;
  label: string;
  placeholder: string;
  value: string;
  selectedPlace: PlaceSuggestion | null;
  defaultCountryCode?: string;
  error?: string | null;
  disabled?: boolean;
  showSelectedDetails?: boolean;
  onChangeText: (value: string) => void;
  onSelect: (place: PlaceSuggestion) => void;
};

export const PlaceAutocomplete = forwardRef<TextInput, Props>(function PlaceAutocomplete({
  countryLabel,
  label,
  placeholder,
  value,
  selectedPlace,
  defaultCountryCode = 'pl',
  error,
  disabled,
  showSelectedDetails = true,
  onChangeText,
  onSelect,
}: Props, ref) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [countryCode, setCountryCode] = useState(defaultCountryCode);
  const [countryModalOpen, setCountryModalOpen] = useState(false);
  const requestIdRef = useRef(0);

  const selectedCountry =
    GEOCODING_COUNTRIES.find((country) => country.code === countryCode) ??
    GEOCODING_COUNTRIES[0];

  useEffect(() => {
    const query = value.trim();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (disabled || selectedPlace || query.length < 3) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(() => {
      searchPlaces(query, countryCode)
        .then((places) => {
          if (requestIdRef.current === requestId) setSuggestions(places);
        })
        .catch(() => {
          if (requestIdRef.current === requestId) setSuggestions([]);
        })
        .finally(() => {
          if (requestIdRef.current === requestId) setLoading(false);
        });
    }, 650);

    return () => clearTimeout(timer);
  }, [countryCode, disabled, selectedPlace, value]);

  const showSuggestions = focused && !selectedPlace && suggestions.length > 0;

  return (
    <View style={styles.wrap}>
      <Text style={styles.countryLabel}>{countryLabel}</Text>
      <TouchableOpacity
        activeOpacity={0.86}
        disabled={disabled}
        onPress={() => setCountryModalOpen(true)}
        style={styles.countrySelect}
      >
        <Feather name="globe" size={16} color={colors.accentBright} />
        <Text style={styles.countryText}>{selectedCountry.label}</Text>
        <Feather name="chevron-down" size={16} color="rgba(255,255,255,0.38)" />
      </TouchableOpacity>

      <AppInput
        ref={ref}
        label={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        editable={!disabled}
        error={error || undefined}
        onFocus={() => setFocused(true)}
        style={styles.input}
      />

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.accentBright} />
        </View>
      ) : null}

      {selectedPlace && showSelectedDetails ? (
        <View style={styles.selectedBox}>
          <Feather name="map-pin" size={15} color={colors.accentBright} />
          <View style={styles.selectedTextWrap}>
            <Text style={styles.selectedTitle} numberOfLines={1}>
              {getPlaceLocalityName(selectedPlace)}
            </Text>
            <Text style={styles.selectedSubtitle} numberOfLines={2}>
              {selectedPlace.placeName}
            </Text>
          </View>
        </View>
      ) : null}

      {showSuggestions ? (
        <View style={styles.suggestions}>
          {suggestions.map((place) => (
            <TouchableOpacity
              key={place.id}
              activeOpacity={0.84}
              style={styles.suggestionRow}
              onPress={() => {
                onSelect(place);
                setFocused(false);
                setSuggestions([]);
              }}
            >
              <Feather name="map-pin" size={15} color="rgba(255,255,255,0.52)" />
              <View style={styles.suggestionTextWrap}>
                <Text style={styles.suggestionTitle} numberOfLines={1}>
                  {getPlaceLocalityName(place)}
                </Text>
                <Text style={styles.suggestionSubtitle} numberOfLines={2}>
                  {place.placeName}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <Modal
        transparent
        visible={countryModalOpen}
        animationType="fade"
        onRequestClose={() => setCountryModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.countryCard}>
            <Text style={styles.countryModalTitle}>{countryLabel}</Text>
            <ScrollView style={styles.countryList}>
              {GEOCODING_COUNTRIES.map((country) => {
                const active = country.code === countryCode;
                return (
                  <TouchableOpacity
                    key={country.code}
                    activeOpacity={0.86}
                    style={[styles.countryOption, active && styles.countryOptionActive]}
                    onPress={() => {
                      setCountryCode(country.code);
                      setSuggestions([]);
                      setCountryModalOpen(false);
                    }}
                  >
                    <Text style={[styles.countryOptionText, active && styles.countryOptionTextActive]}>
                      {country.label}
                    </Text>
                    {active ? <Feather name="check" size={16} color={colors.accentBright} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
  },
  countryLabel: {
    ...typography.label,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  countrySelect: {
    minHeight: 48,
    marginBottom: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#111',
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  countryText: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  input: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
    backgroundColor: '#111',
    borderColor: '#222',
  },
  loadingRow: {
    position: 'absolute',
    right: spacing.lg,
    top: 42,
  },
  selectedBox: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.22)',
    backgroundColor: 'rgba(37,240,200,0.08)',
    padding: spacing.md,
  },
  selectedTextWrap: {
    flex: 1,
  },
  selectedTitle: {
    ...typography.label,
    color: colors.text,
  },
  selectedSubtitle: {
    ...typography.meta,
    marginTop: 2,
    color: colors.textMuted,
    lineHeight: 17,
  },
  suggestions: {
    marginTop: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#080808',
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  suggestionTextWrap: {
    flex: 1,
  },
  suggestionTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  suggestionSubtitle: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: 'rgba(0,0,0,0.76)',
  },
  countryCard: {
    maxHeight: '78%',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: '#050505',
    padding: spacing.md,
  },
  countryModalTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  countryList: {
    marginTop: spacing.xs,
  },
  countryOption: {
    minHeight: 48,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  countryOptionActive: {
    backgroundColor: 'rgba(37,240,200,0.10)',
  },
  countryOptionText: {
    flex: 1,
    color: colors.textSoft,
    fontSize: 14,
    fontWeight: '800',
  },
  countryOptionTextActive: {
    color: colors.text,
  },
});
