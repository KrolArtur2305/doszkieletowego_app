import { useEffect, useMemo, useRef, useState } from 'react'
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { BackHandler, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'

import { formatAppCurrency, type AppCurrency, useCurrency } from '../../../../lib/currency'
import { AppButton, AppCard, AppHeader, AppScreen } from '../../../../src/ui/components'
import { colors, spacing, typography } from '../../../../src/ui/theme'

const DETAIL_SECTIONS = [
  {
    key: 'benefits',
    icon: 'plus-circle' as const,
    titleKey: 'installationDetails.sections.benefits.title',
    itemsKey: 'installationDetails.sections.benefits.items',
    accent: '#25F0C8',
    tone: 'benefit',
  },
  {
    key: 'drawbacks',
    icon: 'minus-circle' as const,
    titleKey: 'installationDetails.sections.drawbacks.title',
    itemsKey: 'installationDetails.sections.drawbacks.items',
    accent: '#F97373',
    tone: 'drawback',
  },
  {
    key: 'costs',
    icon: 'trending-up' as const,
    titleKey: 'installationDetails.sections.costs.title',
    itemsKey: 'installationDetails.sections.costs.items',
    accent: '#25F0C8',
    tone: 'neutral',
  },
  {
    key: 'questions',
    icon: 'help-circle' as const,
    titleKey: 'installationDetails.sections.questions.title',
    itemsKey: 'installationDetails.sections.questions.items',
    accent: '#25F0C8',
    tone: 'neutral',
  },
] as const

type DetailSectionKey = typeof DETAIL_SECTIONS[number]['key']
type InstallationProfileKey =
  | 'heat_pump'
  | 'recuperation'
  | 'air_conditioning'
  | 'photovoltaics'
  | 'battery_storage'
  | 'underfloor_heating'
  | 'gas'
  | 'pellet'
  | 'electric_heating'
  | 'fireplace'
  | 'external_blinds'
  | 'smart_home'
  | 'ev_charger'
  | 'alarm'
  | 'monitoring'
  | 'water_softener'
  | 'central_vacuum'
  | 'other_heating'
type CostRangeKey = 'install' | 'operation' | 'service' | 'filters' | 'singleRoom' | 'multiRoom'

type InstallationProfileCopy = {
  about: string
  benefits: string[]
  drawbacks: string[]
  costs: Array<(costs: Record<CostRangeKey, string>, context: string) => string>
  questions: string[]
}

const INSTALLATION_PROFILE_ALIASES: Record<string, InstallationProfileKey | undefined> = {
  heat_pump: 'heat_pump',
  'heating:heat_pump': 'heat_pump',
  recuperation: 'recuperation',
  air_conditioning: 'air_conditioning',
  photovoltaics: 'photovoltaics',
  battery_storage: 'battery_storage',
  underfloor_heating: 'underfloor_heating',
  'heating:gas': 'gas',
  'heating:pellet': 'pellet',
  'heating:electric': 'electric_heating',
  fireplace: 'fireplace',
  external_blinds: 'external_blinds',
  smart_home: 'smart_home',
  ev_charger: 'ev_charger',
  alarm: 'alarm',
  monitoring: 'monitoring',
  water_softener: 'water_softener',
  central_vacuum: 'central_vacuum',
  'heating:other': 'other_heating',
}

const CURRENCY_REGION_LABELS: Record<string, string> = {
  PLN: 'Polska / PLN',
  EUR: 'strefa euro / EUR',
  USD: 'USA / USD',
  GBP: 'Wielka Brytania / GBP',
  CHF: 'Szwajcaria / CHF',
  CAD: 'Kanada / CAD',
  AUD: 'Australia / AUD',
  NOK: 'Norwegia / NOK',
  CNY: 'Chiny / CNY',
  JPY: 'Japonia / JPY',
}

const COST_RANGES: Record<InstallationProfileKey, Partial<Record<AppCurrency, Record<CostRangeKey, [number, number]>>>> = {
  heat_pump: {
    PLN: { install: [35000, 70000], operation: [3500, 7500], service: [400, 900], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    EUR: { install: [9000, 18000], operation: [900, 1800], service: [150, 350], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    USD: { install: [8000, 18000], operation: [900, 2200], service: [150, 450], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    GBP: { install: [12000, 20000], operation: [800, 1800], service: [120, 350], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
  },
  recuperation: {
    PLN: { install: [18000, 35000], operation: [150, 500], service: [350, 900], filters: [250, 700], singleRoom: [0, 0], multiRoom: [0, 0] },
    EUR: { install: [4500, 9000], operation: [40, 130], service: [120, 300], filters: [70, 190], singleRoom: [0, 0], multiRoom: [0, 0] },
    USD: { install: [7000, 16000], operation: [50, 180], service: [140, 350], filters: [90, 220], singleRoom: [0, 0], multiRoom: [0, 0] },
    GBP: { install: [8000, 20000], operation: [40, 150], service: [120, 320], filters: [80, 220], singleRoom: [0, 0], multiRoom: [0, 0] },
  },
  air_conditioning: {
    PLN: { install: [0, 0], operation: [250, 900], service: [200, 600], filters: [0, 0], singleRoom: [3500, 6500], multiRoom: [10000, 25000] },
    EUR: { install: [0, 0], operation: [80, 260], service: [100, 250], filters: [0, 0], singleRoom: [1200, 2500], multiRoom: [4000, 9000] },
    USD: { install: [0, 0], operation: [100, 350], service: [120, 300], filters: [0, 0], singleRoom: [3000, 7000], multiRoom: [7000, 18000] },
    GBP: { install: [0, 0], operation: [80, 280], service: [100, 260], filters: [0, 0], singleRoom: [2000, 3500], multiRoom: [5000, 9000] },
  },
  photovoltaics: {
    PLN: { install: [18000, 35000], operation: [150, 500], service: [300, 900], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    EUR: { install: [5000, 10000], operation: [50, 150], service: [100, 300], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    USD: { install: [12000, 25000], operation: [150, 450], service: [150, 500], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    GBP: { install: [6000, 12000], operation: [80, 250], service: [120, 350], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
  },
  battery_storage: {
    PLN: { install: [20000, 45000], operation: [200, 700], service: [300, 1000], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    EUR: { install: [4500, 10000], operation: [60, 180], service: [120, 350], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    USD: { install: [8000, 18000], operation: [80, 250], service: [150, 450], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    GBP: { install: [5000, 11000], operation: [60, 200], service: [120, 350], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
  },
  underfloor_heating: {
    PLN: { install: [180, 350], operation: [0, 0], service: [200, 700], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    EUR: { install: [45, 95], operation: [0, 0], service: [80, 220], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    USD: { install: [12, 25], operation: [0, 0], service: [100, 300], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    GBP: { install: [85, 110], operation: [0, 0], service: [90, 250], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
  },
  gas: {
    PLN: { install: [18000, 35000], operation: [5000, 11000], service: [300, 800], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    EUR: { install: [5000, 11000], operation: [1200, 3000], service: [120, 300], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    USD: { install: [6000, 14000], operation: [1000, 2800], service: [120, 350], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    GBP: { install: [3500, 8000], operation: [900, 2500], service: [100, 250], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
  },
  pellet: {
    PLN: { install: [22000, 45000], operation: [6000, 13000], service: [500, 1200], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    EUR: { install: [6000, 13000], operation: [1400, 3500], service: [150, 450], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    USD: { install: [7000, 16000], operation: [1600, 4200], service: [180, 500], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    GBP: { install: [5000, 12000], operation: [1200, 3200], service: [150, 400], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
  },
  electric_heating: {
    PLN: { install: [6000, 18000], operation: [7000, 18000], service: [100, 400], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    EUR: { install: [1500, 4500], operation: [1800, 4500], service: [50, 150], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    USD: { install: [2000, 7000], operation: [1800, 5000], service: [80, 200], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    GBP: { install: [1500, 5000], operation: [1600, 4500], service: [60, 180], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
  },
  fireplace: {
    PLN: { install: [12000, 35000], operation: [2000, 6000], service: [300, 900], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    EUR: { install: [3500, 10000], operation: [600, 1800], service: [120, 350], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    USD: { install: [4000, 12000], operation: [700, 2200], service: [150, 450], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    GBP: { install: [3000, 9000], operation: [500, 1600], service: [100, 300], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
  },
  external_blinds: {
    PLN: { install: [1200, 3000], operation: [50, 200], service: [150, 500], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    EUR: { install: [300, 800], operation: [20, 60], service: [60, 180], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    USD: { install: [500, 1400], operation: [20, 80], service: [80, 250], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    GBP: { install: [700, 1600], operation: [20, 70], service: [80, 220], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
  },
  smart_home: {
    PLN: { install: [8000, 30000], operation: [200, 1200], service: [300, 1500], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    EUR: { install: [2500, 9000], operation: [80, 400], service: [150, 600], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    USD: { install: [3000, 12000], operation: [100, 600], service: [200, 800], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    GBP: { install: [2500, 10000], operation: [80, 500], service: [150, 700], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
  },
  ev_charger: {
    PLN: { install: [3000, 9000], operation: [0, 0], service: [150, 600], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    EUR: { install: [900, 2500], operation: [0, 0], service: [80, 250], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    USD: { install: [1200, 3500], operation: [0, 0], service: [100, 300], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    GBP: { install: [900, 1800], operation: [0, 0], service: [80, 250], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
  },
  alarm: {
    PLN: { install: [2500, 8000], operation: [300, 1200], service: [200, 700], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    EUR: { install: [700, 2200], operation: [100, 350], service: [80, 250], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    USD: { install: [800, 3000], operation: [120, 450], service: [100, 300], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    GBP: { install: [700, 2500], operation: [100, 400], service: [80, 260], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
  },
  monitoring: {
    PLN: { install: [3000, 12000], operation: [300, 1500], service: [250, 900], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    EUR: { install: [900, 3500], operation: [100, 450], service: [100, 300], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    USD: { install: [1000, 4500], operation: [120, 600], service: [120, 400], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    GBP: { install: [900, 3500], operation: [100, 500], service: [100, 350], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
  },
  water_softener: {
    PLN: { install: [2500, 7000], operation: [250, 900], service: [200, 600], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    EUR: { install: [700, 2000], operation: [80, 250], service: [80, 220], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    USD: { install: [900, 3000], operation: [100, 350], service: [100, 300], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    GBP: { install: [700, 1800], operation: [80, 250], service: [80, 220], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
  },
  central_vacuum: {
    PLN: { install: [4000, 10000], operation: [80, 250], service: [150, 500], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    EUR: { install: [1200, 3000], operation: [30, 90], service: [60, 180], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    USD: { install: [1500, 4000], operation: [40, 120], service: [80, 220], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    GBP: { install: [1000, 3000], operation: [30, 100], service: [70, 200], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
  },
  other_heating: {
    PLN: { install: [10000, 45000], operation: [4000, 16000], service: [300, 1200], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    EUR: { install: [3000, 13000], operation: [1000, 4000], service: [120, 450], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    USD: { install: [4000, 16000], operation: [1200, 4500], service: [150, 500], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
    GBP: { install: [3000, 12000], operation: [1000, 3500], service: [120, 400], filters: [0, 0], singleRoom: [0, 0], multiRoom: [0, 0] },
  },
}

const CURRENCY_FALLBACK_MULTIPLIER: Record<AppCurrency, number> = {
  PLN: 1,
  EUR: 0.23,
  USD: 0.25,
  GBP: 0.2,
  CHF: 0.22,
  CAD: 0.34,
  AUD: 0.38,
  JPY: 39,
  CNY: 1.8,
  NOK: 2.7,
}

const INSTALLATION_PROFILE_COPY: Record<InstallationProfileKey, InstallationProfileCopy> = {
  heat_pump: {
    about: 'Pompa ciepła to urządzenie, które pobiera energię z powietrza, gruntu albo wody i przekazuje ją do ogrzewania domu oraz ciepłej wody użytkowej.',
    benefits: [
      'Niski koszt pracy w dobrze ocieplonym domu, szczególnie z ogrzewaniem podłogowym i niską temperaturą zasilania.',
      'Jedno źródło może obsłużyć ogrzewanie oraz ciepłą wodę; przy wybranych systemach także chłodzenie.',
      'Brak komina, kotłowni na paliwo i dostaw opału, więc mniej obsługi w sezonie.',
    ],
    drawbacks: [
      'Największe ryzyko to przewymiarowanie albo niedowymiarowanie; skutkiem są taktowanie, hałas, grzałka i wysokie rachunki.',
      'W słabo ocieplonym domu albo przy małych grzejnikach może wymagać modernizacji instalacji, nie tylko wymiany źródła ciepła.',
      'Jednostka zewnętrzna wymaga miejsca, odpływu skroplin, akceptowalnego hałasu i serwisu.',
    ],
    costs: [
      (c, context) => `Szacunek dla ${context}: zakup z montażem powietrznej pompy ciepła zwykle ${c.install}.`,
      (c) => `Roczna eksploatacja w typowym domu jednorodzinnym: około ${c.operation}; wynik zależy od izolacji, temperatury zasilania i taryfy.`,
      (c) => `Przegląd i podstawowy serwis: zwykle ${c.service} rocznie; większe naprawy sprężarki lub automatyki są poza tym zakresem.`,
    ],
    questions: [
      'Jakie jest projektowe obciążenie cieplne budynku i kto bierze odpowiedzialność za dobór mocy?',
      'Jaka będzie temperatura zasilania przy mrozie i czy instalacja grzejnikowa/podłogowa ją obsłuży?',
      'Co dokładnie obejmuje cena: zasobnik, bufor, uruchomienie, fundament, elektrykę, odprowadzenie skroplin i serwis?',
    ],
  },
  recuperation: {
    about: 'Rekuperacja to wentylacja mechaniczna z odzyskiem ciepła, która wymienia powietrze w domu i odzyskuje część energii z powietrza wywiewanego.',
    benefits: [
      'Stała wymiana powietrza bez otwierania okien, z mniejszym wychładzaniem domu zimą.',
      'Lepsza kontrola wilgoci, zapachów i CO2, szczególnie w szczelnym nowym domu.',
      'Filtry ograniczają pył, kurz i część alergenów; to ważne przy smogu lub ruchliwej drodze.',
    ],
    drawbacks: [
      'Wymaga miejsca na centralę, kanały, tłumiki i rewizje; po wykończeniu domu montaż bywa dużo trudniejszy.',
      'Źle dobrane średnice lub brak tłumików oznaczają szum w sypialniach i za małe przepływy.',
      'Filtry trzeba regularnie wymieniać, a instalację okresowo kontrolować i czyścić.',
    ],
    costs: [
      (c, context) => `Szacunek dla ${context}: kompletna rekuperacja z projektem, centralą i montażem zwykle ${c.install}.`,
      (c) => `Prąd do wentylatorów: zwykle ${c.operation} rocznie przy pracy całorocznej.`,
      (c) => `Filtry: około ${c.filters} rocznie, zależnie od klasy filtrów i zanieczyszczenia powietrza.`,
    ],
    questions: [
      'Czy dostanę projekt z przepływami dla każdego pomieszczenia, średnicami kanałów i lokalizacją tłumików?',
      'Jaki poziom hałasu będzie w sypialniach przy trybie normalnym i nocnym?',
      'Czy po montażu wykonawca mierzy i reguluje przepływy anemometrem?',
    ],
  },
  air_conditioning: {
    about: 'Klimatyzacja to instalacja do chłodzenia pomieszczeń, najczęściej w układzie split lub multisplit, często z funkcją osuszania i dogrzewania.',
    benefits: [
      'Szybko obniża temperaturę w sypialniach i salonie, co realnie poprawia komfort podczas fal upałów.',
      'Nowoczesny split może też efektywnie dogrzewać jesienią i wiosną.',
      'Osuszanie powietrza pomaga przy parnych dniach, kiedy sama wentylacja nie daje komfortu.',
    ],
    drawbacks: [
      'Zły dobór miejsca nawiewu powoduje przeciągi, hałas albo chłodzenie jednej strefy zamiast pomieszczenia.',
      'Jednostka zewnętrzna wymaga miejsca, odpływu skroplin i kontroli hałasu względem sąsiadów.',
      'Przy wielu pokojach multisplit jest droższy, a awaria jednostki zewnętrznej może zatrzymać kilka pomieszczeń.',
    ],
    costs: [
      (c, context) => `Szacunek dla ${context}: klimatyzator split do jednego pomieszczenia z montażem zwykle ${c.singleRoom}.`,
      (c) => `Układ multisplit albo kilka jednostek dla domu: zwykle ${c.multiRoom}, zależnie od liczby pokoi i długości instalacji.`,
      (c) => `Prąd w sezonie chłodzenia: często ${c.operation} rocznie, ale dużo zależy od nasłonecznienia, izolacji i nastaw temperatury.`,
    ],
    questions: [
      'Jaka moc chłodnicza wychodzi z obliczeń dla każdego pomieszczenia, a nie tylko z metrażu?',
      'Gdzie pójdą skropliny i czy spadki są możliwe bez pompki?',
      'Czy instalacja obejmuje próbę szczelności, próżnię, protokół uruchomienia i wpis do karty urządzenia?',
    ],
  },
  photovoltaics: {
    about: 'Fotowoltaika to instalacja paneli, która produkuje prąd ze słońca i przekazuje go do domu, sieci albo magazynu energii.',
    benefits: [
      'Obniża rachunki za prąd, szczególnie gdy dużo energii zużywasz w dzień.',
      'Dobrze współpracuje z pompą ciepła, klimatyzacją, ładowarką EV i magazynem energii.',
      'Ma mało elementów ruchomych, więc zwykle wymaga niewielkiej obsługi.',
    ],
    drawbacks: [
      'Produkcja jest sezonowa: najwięcej latem, najmniej zimą, gdy ogrzewanie zużywa najwięcej energii.',
      'Opłacalność zależy od zasad rozliczeń z siecią, autokonsumpcji i przyszłych cen energii.',
      'Wymaga dobrego dachu, właściwego kierunku, braku cienia i miejsca na falownik.',
    ],
    costs: [
      (c, context) => `Szacunek dla ${context}: instalacja domowa około 4-8 kWp zwykle ${c.install}.`,
      (c) => `Przegląd, kontrola połączeń lub mycie w trudnych warunkach: zwykle ${c.service} rocznie albo okresowo.`,
      (c) => `Stałe koszty pracy są niskie: orientacyjnie ${c.operation} rocznie na monitoring, przeglądy drobne lub dodatkowe opłaty.`,
    ],
    questions: [
      'Jaka będzie roczna produkcja w kWh przy moim dachu, kierunku i zacienieniu?',
      'Jaki falownik, zabezpieczenia AC/DC i monitoring są w cenie?',
      'Czy konstrukcja dachu i pokrycie pozwalają na montaż bez ryzyka przecieków?',
    ],
  },
  battery_storage: {
    about: 'Magazyn energii to domowa bateria, która przechowuje prąd z fotowoltaiki lub sieci i oddaje go wtedy, gdy dom go potrzebuje.',
    benefits: [
      'Zwiększa autokonsumpcję prądu z fotowoltaiki, zamiast oddawać nadwyżki do sieci.',
      'Może podtrzymać wybrane obwody podczas awarii, jeśli system ma funkcję backupu.',
      'Pomaga przesuwać zużycie energii na tańsze godziny przy taryfach dynamicznych lub strefowych.',
    ],
    drawbacks: [
      'To droga część instalacji, więc zwrot zależy od cen energii, taryfy i realnej liczby cykli.',
      'Pojemność użytkowa jest mniejsza niż katalogowa, a bateria z czasem traci część pojemności.',
      'Wymaga miejsca, wentylacji, zabezpieczeń i zgodności z falownikiem lub systemem hybrydowym.',
    ],
    costs: [
      (c, context) => `Szacunek dla ${context}: magazyn około 5-10 kWh z osprzętem zwykle ${c.install}.`,
      (c) => `Monitoring, straty energii i drobne koszty eksploatacyjne: orientacyjnie ${c.operation} rocznie.`,
      (c) => `Serwis, kontrola zabezpieczeń lub aktualizacje systemu: zwykle ${c.service} rocznie albo okresowo.`,
    ],
    questions: [
      'Jaka jest pojemność użytkowa baterii, a nie tylko pojemność nominalna?',
      'Czy system działa jako backup przy zaniku zasilania i które obwody obejmuje?',
      'Ile cykli oraz jaki poziom pojemności po latach gwarantuje producent?',
    ],
  },
  underfloor_heating: {
    about: 'Ogrzewanie podłogowe to instalacja grzewcza w warstwie podłogi, która oddaje ciepło równomiernie przez dużą powierzchnię.',
    benefits: [
      'Daje równomierny komfort cieplny i mniej widoczne elementy instalacji niż grzejniki.',
      'Dobrze współpracuje z pompą ciepła, bo pracuje na niskiej temperaturze zasilania.',
      'Pozwala łatwiej ustawić osobne strefy grzania dla pomieszczeń.',
    ],
    drawbacks: [
      'Ma dużą bezwładność, więc wolniej reaguje na szybkie zmiany temperatury.',
      'Wymaga dobrego projektu pętli, dylatacji i izolacji pod posadzką.',
      'Nie każda podłoga i grubość wykończenia dobrze przewodzi ciepło.',
    ],
    costs: [
      (c, context) => `Szacunek dla ${context}: wodne ogrzewanie podłogowe zwykle ${c.install} za m².`,
      () => 'Koszt całkowity zależy głównie od powierzchni, liczby rozdzielaczy, automatyki i przygotowania podłoża.',
      (c) => `Serwis rozdzielaczy, odpowietrzenie lub regulacja: zwykle ${c.service} rocznie albo okresowo.`,
    ],
    questions: [
      'Czy projekt pokazuje długości pętli, rozstaw rur i przepływy dla każdego pomieszczenia?',
      'Jakie warstwy izolacji i dylatacje są przewidziane pod posadzką?',
      'Czy cena obejmuje rozdzielacze, automatykę strefową, próbę ciśnieniową i regulację?',
    ],
  },
  gas: {
    about: 'Ogrzewanie gazowe to system z kotłem gazowym, który podgrzewa wodę do instalacji grzewczej i zwykle także ciepłej wody użytkowej.',
    benefits: [
      'Działa stabilnie i szybko reaguje na zmianę temperatury w domu.',
      'Kocioł kondensacyjny zajmuje mało miejsca i jest wygodny w codziennej obsłudze.',
      'Dobrze współpracuje zarówno z grzejnikami, jak i ogrzewaniem podłogowym.',
    ],
    drawbacks: [
      'Wymaga przyłącza gazu albo zbiornika, a to może być drogie lub niedostępne na działce.',
      'Rachunki zależą od ceny gazu i opłat stałych, na które inwestor ma mały wpływ.',
      'Potrzebny jest komin/spaliny, wentylacja i regularny serwis urządzenia.',
    ],
    costs: [
      (c, context) => `Szacunek dla ${context}: kocioł gazowy z montażem i osprzętem zwykle ${c.install}.`,
      (c) => `Roczny koszt ogrzewania i ciepłej wody w typowym domu: często ${c.operation}, zależnie od izolacji i ceny gazu.`,
      (c) => `Przegląd kotła i podstawowy serwis: zwykle ${c.service} rocznie.`,
    ],
    questions: [
      'Czy w cenie jest przyłącze, komin/spaliny, zasobnik CWU i pełna automatyka?',
      'Jaką moc kotła dobrano do obciążenia cieplnego budynku?',
      'Jakie są wymagania dla wentylacji, odbioru kominiarskiego i przeglądów?',
    ],
  },
  pellet: {
    about: 'Ogrzewanie pelletem to system z kotłem na granulat drzewny, który spala paliwo automatycznie i ogrzewa wodę w instalacji grzewczej.',
    benefits: [
      'Może być dobrym wyborem tam, gdzie nie ma gazu i inwestor chce źródło inne niż prąd.',
      'Automatyczny podajnik ogranicza obsługę w porównaniu z tradycyjnym kotłem na paliwo stałe.',
      'Dobrze współpracuje z buforem i instalacją grzejnikową lub podłogową.',
    ],
    drawbacks: [
      'Wymaga miejsca na kocioł, zasobnik i suche składowanie pelletu.',
      'Potrzebna jest regularna obsługa: dosypywanie paliwa, czyszczenie i usuwanie popiołu.',
      'Koszty zależą od jakości i ceny pelletu, a słabe paliwo pogarsza pracę kotła.',
    ],
    costs: [
      (c, context) => `Szacunek dla ${context}: kocioł pelletowy z montażem i osprzętem zwykle ${c.install}.`,
      (c) => `Paliwo na sezon w typowym domu: często ${c.operation}, zależnie od zapotrzebowania i ceny pelletu.`,
      (c) => `Serwis, czyszczenie i przeglądy: zwykle ${c.service} rocznie.`,
    ],
    questions: [
      'Ile miejsca potrzeba na kocioł, zasobnik i zapas pelletu?',
      'Jak często trzeba czyścić kocioł i opróżniać popiół przy normalnym użytkowaniu?',
      'Czy cena obejmuje bufor, komin, zabezpieczenia i pierwsze uruchomienie?',
    ],
  },
  electric_heating: {
    about: 'Ogrzewanie elektryczne to system, w którym ciepło powstaje bezpośrednio z energii elektrycznej, np. w matach, kablach, grzejnikach lub kotle elektrycznym.',
    benefits: [
      'Najprostszy montaż i mało elementów technicznych w porównaniu z kotłownią wodną.',
      'Niskie koszty serwisu, bo nie ma spalania, komina ani magazynu paliwa.',
      'Dobrze sprawdza się w małych, bardzo dobrze ocieplonych domach lub jako ogrzewanie strefowe.',
    ],
    drawbacks: [
      'Eksploatacja może być droga, jeśli dom ma duże zapotrzebowanie na ciepło.',
      'Wymaga odpowiedniej mocy przyłączeniowej i dobrze zaprojektowanej instalacji elektrycznej.',
      'Opłacalność mocno zależy od taryfy, fotowoltaiki i sposobu sterowania temperaturą.',
    ],
    costs: [
      (c, context) => `Szacunek dla ${context}: wykonanie prostego ogrzewania elektrycznego zwykle ${c.install}.`,
      (c) => `Roczna eksploatacja w typowym domu może wynosić ${c.operation}, dlatego kluczowe jest zapotrzebowanie budynku na ciepło.`,
      (c) => `Serwis jest niski: zwykle ${c.service} rocznie lub okresowo na kontrolę sterowania i instalacji.`,
    ],
    questions: [
      'Jakie jest roczne zapotrzebowanie domu na energię do ogrzewania?',
      'Czy obecna moc przyłączeniowa wystarczy dla ogrzewania, kuchni, ładowarki EV i innych odbiorników?',
      'Jak będzie działało sterowanie strefami i taryfami, żeby ograniczyć koszt pracy?',
    ],
  },
  fireplace: {
    about: 'Kominek to palenisko z wkładem lub piecem, które daje ciepło miejscowo i może pełnić funkcję rekreacyjną albo dodatkowego źródła ogrzewania.',
    benefits: [
      'Daje szybkie, odczuwalne ciepło i klimat w salonie.',
      'Może być awaryjnym źródłem ciepła przy przerwie w dostawie prądu lub gazu.',
      'Dobrze zaplanowany wkład może wspierać ogrzewanie części domu.',
    ],
    drawbacks: [
      'Wymaga komina, doprowadzenia powietrza i bezpiecznych odległości od zabudowy.',
      'Potrzebuje miejsca na drewno oraz regularnego czyszczenia szyby, paleniska i komina.',
      'Źle dobrany kominek może przegrzewać salon i pogarszać jakość powietrza.',
    ],
    costs: [
      (c, context) => `Szacunek dla ${context}: wkład kominkowy z obudową i montażem zwykle ${c.install}.`,
      (c) => `Drewno lub opał w sezonie: orientacyjnie ${c.operation}, zależnie od częstotliwości używania.`,
      (c) => `Przegląd kominiarski, czyszczenie i podstawowy serwis: zwykle ${c.service} rocznie.`,
    ],
    questions: [
      'Czy projekt przewiduje doprowadzenie powietrza z zewnątrz i odpowiedni komin?',
      'Jaka moc wkładu pasuje do salonu, żeby nie przegrzewać pomieszczenia?',
      'Czy cena obejmuje wkład, obudowę, izolację, kratki, montaż i odbiór kominiarski?',
    ],
  },
  external_blinds: {
    about: 'Rolety zewnętrzne to osłony montowane po zewnętrznej stronie okien, które ograniczają słońce, przegrzewanie i poprawiają prywatność.',
    benefits: [
      'Najskuteczniej ograniczają nagrzewanie, bo zatrzymują słońce przed szybą.',
      'Poprawiają prywatność i częściowo tłumią hałas z zewnątrz.',
      'Mogą zwiększyć bezpieczeństwo, szczególnie w wersji z mocniejszym pancerzem i automatyką.',
    ],
    drawbacks: [
      'Najłatwiej zaplanować je na etapie projektu, bo potrzebują miejsca na skrzynki i prowadnice.',
      'Napędy, czujniki i piloty podnoszą cenę oraz wymagają zasilania.',
      'Przy dużym wietrze albo oblodzeniu automatyka musi być dobrze zabezpieczona.',
    ],
    costs: [
      (c, context) => `Szacunek dla ${context}: roleta zewnętrzna z montażem zwykle ${c.install} za okno.`,
      (c) => `Prąd i drobna eksploatacja napędów są niskie: orientacyjnie ${c.operation} rocznie.`,
      (c) => `Regulacja, serwis napędu lub wymiana drobnych elementów: zwykle ${c.service} okresowo.`,
    ],
    questions: [
      'Czy skrzynki będą podtynkowe, natynkowe czy nadstawne i czy pasują do elewacji?',
      'Czy cena obejmuje napędy, sterowanie, czujniki wiatru/słońca i okablowanie?',
      'Jak rozwiązać awaryjne otwieranie oraz serwis przy zabudowanych skrzynkach?',
    ],
  },
  smart_home: {
    about: 'Smart Home to system automatyki, który steruje wybranymi funkcjami domu, np. światłem, ogrzewaniem, roletami, alarmem i scenami.',
    benefits: [
      'Ułatwia codzienne sterowanie domem z aplikacji, przycisków lub automatycznych scen.',
      'Może ograniczyć zużycie energii przez harmonogramy ogrzewania, rolet i oświetlenia.',
      'Łączy różne instalacje w jeden system: alarm, rolety, oświetlenie, ogrzewanie i wentylację.',
    ],
    drawbacks: [
      'Wymaga dobrego projektu przewodów, rozdzielni i scen przed tynkami.',
      'Zbyt rozbudowany system bywa trudny w obsłudze i zależny od jednego wykonawcy.',
      'Aktualizacje, awarie internetu lub chmury mogą wpływać na część funkcji.',
    ],
    costs: [
      (c, context) => `Szacunek dla ${context}: podstawowy Smart Home dla domu zwykle ${c.install}.`,
      (c) => `Aplikacje, chmura, bramki lub energia urządzeń: orientacyjnie ${c.operation} rocznie.`,
      (c) => `Konfiguracja zmian, serwis i aktualizacje: zwykle ${c.service} rocznie albo okresowo.`,
    ],
    questions: [
      'Które funkcje mają działać lokalnie bez internetu, a które zależą od chmury?',
      'Czy system jest przewodowy, bezprzewodowy czy mieszany i co będzie w rozdzielni?',
      'Kto może później serwisować oraz rozbudować system bez wymiany całości?',
    ],
  },
  ev_charger: {
    about: 'Ładowarka EV to domowy punkt ładowania samochodu elektrycznego, zwykle montowany w garażu, na elewacji albo przy miejscu postojowym.',
    benefits: [
      'Pozwala ładować auto wygodnie w domu, najczęściej taniej niż na szybkich ładowarkach publicznych.',
      'Może współpracować z fotowoltaiką, taryfą nocną lub dynamiczną.',
      'Dobra ładowarka ma zabezpieczenia, pomiar energii i możliwość ograniczania mocy.',
    ],
    drawbacks: [
      'Może wymagać zwiększenia mocy przyłączeniowej albo modernizacji rozdzielni.',
      'Bez zarządzania mocą łatwo przeciążyć instalację przy pracy kuchni, pompy ciepła i innych odbiorników.',
      'Miejsce montażu musi uwzględniać długość kabla, warunki zewnętrzne i bezpieczeństwo użytkowania.',
    ],
    costs: [
      (c, context) => `Szacunek dla ${context}: wallbox z montażem zwykle ${c.install}.`,
      () => 'Koszt ładowania zależy głównie od ceny prądu, taryfy i zużycia samochodu w kWh/100 km.',
      (c) => `Kontrola zabezpieczeń, aktualizacje lub drobny serwis: zwykle ${c.service} rocznie albo okresowo.`,
    ],
    questions: [
      'Czy obecna moc przyłączeniowa i rozdzielnia wystarczą dla ładowarki?',
      'Czy ładowarka ma dynamiczne zarządzanie mocą i pomiar energii?',
      'Czy cena obejmuje zabezpieczenia, okablowanie, konfigurację i zgłoszenia wymagane lokalnie?',
    ],
  },
  alarm: {
    about: 'Alarm to system czujników, sygnalizatorów i centrali, który wykrywa włamanie lub wybrane zagrożenia i uruchamia powiadomienia.',
    benefits: [
      'Zwiększa bezpieczeństwo domu podczas nieobecności domowników.',
      'Może powiadamiać telefon, agencję ochrony albo sąsiadów zależnie od konfiguracji.',
      'Da się połączyć z czujkami dymu, zalania, gazu i automatyką domu.',
    ],
    drawbacks: [
      'Źle dobrane czujki powodują fałszywe alarmy i szybkie zniechęcenie do używania systemu.',
      'System wymaga zasilania awaryjnego, serwisu i okresowej wymiany akumulatorów.',
      'Monitoring agencji ochrony oznacza stałą opłatę miesięczną.',
    ],
    costs: [
      (c, context) => `Szacunek dla ${context}: alarm przewodowy lub hybrydowy z montażem zwykle ${c.install}.`,
      (c) => `Monitoring, karta SIM lub aplikacja: zwykle ${c.operation} rocznie, zależnie od usługi.`,
      (c) => `Przegląd, akumulator i drobny serwis: zwykle ${c.service} rocznie albo okresowo.`,
    ],
    questions: [
      'Ile stref i jakie typy czujek będą w projekcie?',
      'Czy system działa lokalnie przy braku internetu i ma zasilanie awaryjne?',
      'Czy cena obejmuje aplikację, komunikator GSM/LTE, sygnalizatory i konfigurację powiadomień?',
    ],
  },
  monitoring: {
    about: 'Monitoring to system kamer i rejestratora lub chmury, który zapisuje obraz z wybranych stref wokół domu.',
    benefits: [
      'Ułatwia sprawdzenie posesji, bramy, podjazdu i wejść do domu.',
      'Nagrania pomagają wyjaśnić zdarzenia, uszkodzenia albo próby włamania.',
      'Kamery z detekcją ruchu mogą wysyłać powiadomienia tylko dla ważnych zdarzeń.',
    ],
    drawbacks: [
      'Źle ustawione kamery generują dużo fałszywych alertów od drzew, cieni i samochodów.',
      'Wymaga dobrego okablowania, zasilania PoE lub stabilnej sieci Wi-Fi.',
      'Trzeba pilnować prywatności: nie nagrywać niepotrzebnie sąsiadów i przestrzeni publicznej.',
    ],
    costs: [
      (c, context) => `Szacunek dla ${context}: zestaw kilku kamer z rejestratorem i montażem zwykle ${c.install}.`,
      (c) => `Chmura, dyski, karta SIM lub prąd: zwykle ${c.operation} rocznie.`,
      (c) => `Regulacja, czyszczenie kamer i serwis sieci: zwykle ${c.service} rocznie albo okresowo.`,
    ],
    questions: [
      'Jakie strefy mają być widoczne i czy kamery nie naruszają prywatności sąsiadów?',
      'Czy system będzie oparty o PoE, Wi-Fi czy połączenie mieszane?',
      'Ile dni nagrań ma być przechowywane i gdzie: lokalnie czy w chmurze?',
    ],
  },
  water_softener: {
    about: 'Zmiękczacz wody to urządzenie, które ogranicza twardość wody, najczęściej przez wymianę jonową i regenerację solą.',
    benefits: [
      'Zmniejsza osad z kamienia na armaturze, kabinie, czajniku i sprzętach AGD.',
      'Chroni instalację, zasobnik CWU, pralkę, zmywarkę i elementy grzewcze przed odkładaniem kamienia.',
      'Poprawia komfort mycia i może zmniejszyć zużycie detergentów.',
    ],
    drawbacks: [
      'Wymaga miejsca przy wejściu wody, odpływu kanalizacyjnego i regularnego dosypywania soli.',
      'Źle ustawiony może nadmiernie zmiękczać wodę albo zwiększać zużycie soli.',
      'Nie usuwa wszystkich zanieczyszczeń, więc czasem potrzebny jest osobny filtr mechaniczny lub węglowy.',
    ],
    costs: [
      (c, context) => `Szacunek dla ${context}: zmiękczacz z montażem zwykle ${c.install}.`,
      (c) => `Sól, woda do regeneracji i drobna eksploatacja: zwykle ${c.operation} rocznie.`,
      (c) => `Przegląd, ustawienia i czyszczenie głowicy: zwykle ${c.service} rocznie albo okresowo.`,
    ],
    questions: [
      'Jaka jest twardość wody i jakie zużycie dobowe przyjęto do doboru urządzenia?',
      'Czy jest miejsce na odpływ, bypass, filtr wstępny i wygodne dosypywanie soli?',
      'Czy urządzenie ma atest do wody pitnej i jak wygląda serwis głowicy?',
    ],
  },
  central_vacuum: {
    about: 'Odkurzacz centralny to instalacja rur w ścianach i jednostki ssącej, która odprowadza kurz do centralnego zbiornika poza pomieszczeniami.',
    benefits: [
      'Odkurzanie jest cichsze w pomieszczeniach, bo silnik pracuje w garażu, kotłowni albo pomieszczeniu technicznym.',
      'Kurz i drobne pyły są odprowadzane poza część mieszkalną, co poprawia komfort alergików.',
      'Wygodnie działa z gniazdami ssącymi lub systemem węża chowanego w ścianie.',
    ],
    drawbacks: [
      'Najłatwiej wykonać instalację przed tynkami; późniejszy montaż jest trudniejszy i droższy.',
      'Źle poprowadzone rury mogą się zatykać albo dawać słabszy ciąg na końcowych gniazdach.',
      'Jednostka centralna, filtry i zbiornik wymagają okresowej obsługi.',
    ],
    costs: [
      (c, context) => `Szacunek dla ${context}: instalacja z jednostką centralną zwykle ${c.install}.`,
      (c) => `Worki, filtry i energia elektryczna: zwykle ${c.operation} rocznie.`,
      (c) => `Serwis jednostki, filtrów lub udrażnianie instalacji: zwykle ${c.service} okresowo.`,
    ],
    questions: [
      'Ile gniazd ssących potrzeba, żeby objąć cały dom bez zbyt długiego węża?',
      'Gdzie będzie jednostka centralna i gdzie zostanie wyrzucone powietrze?',
      'Czy cena obejmuje rury, gniazda, szufelki automatyczne, jednostkę i pierwszy osprzęt?',
    ],
  },
  other_heating: {
    about: 'Inne źródło ogrzewania oznacza niestandardowy system, który trzeba doprecyzować, np. kocioł olejowy, hybrydę, ogrzewanie nadmuchowe albo rozwiązanie lokalne.',
    benefits: [
      'Pozwala dobrać technologię do działki, dostępnych mediów i ograniczeń budynku.',
      'Może być sensownym rozwiązaniem tam, gdzie gaz, pompa ciepła albo pellet odpadają technicznie.',
      'Daje możliwość połączenia kilku źródeł, np. kotła, kominka, bufora i automatyki.',
    ],
    drawbacks: [
      'Bez doprecyzowania technologii trudno porównać koszty, serwis i ryzyka.',
      'Nietypowe systemy mogą mieć mniej wykonawców i droższy późniejszy serwis.',
      'Część rozwiązań wymaga dodatkowego miejsca, magazynu paliwa, komina albo zgłoszeń.',
    ],
    costs: [
      (c, context) => `Szacunek dla ${context}: inne źródło ogrzewania może kosztować ${c.install}, zależnie od technologii.`,
      (c) => `Eksploatacja jest bardzo zmienna: orientacyjnie ${c.operation} rocznie przy typowym domu.`,
      (c) => `Serwis i przeglądy: zwykle ${c.service} rocznie albo okresowo, zależnie od urządzenia.`,
    ],
    questions: [
      'Jaka dokładnie technologia jest planowana i dlaczego wybrano ją zamiast standardowych opcji?',
      'Jakie są roczne koszty paliwa lub energii przy obliczeniowym zapotrzebowaniu domu?',
      'Kto będzie serwisował system lokalnie i jakie części eksploatacyjne są wymagane?',
    ],
  },
}

function getHeaderTitleLines(title: string) {
  const words = title.trim().split(/\s+/).filter(Boolean)
  if (words.length <= 1) return [title.trim()]
  if (words.length <= 3) return words

  return [words[0], words[1], words.slice(2).join(' ')]
}

function normalizeDetailKey(value?: string | string[]) {
  const raw = Array.isArray(value) ? value[0] : value
  return String(raw ?? '').trim()
}

function roundCost(value: number, currency: AppCurrency) {
  if (currency === 'JPY' || currency === 'CNY') return Math.round(value / 100) * 100
  if (value >= 10000) return Math.round(value / 500) * 500
  if (value >= 1000) return Math.round(value / 100) * 100
  return Math.round(value / 10) * 10
}

function formatCost(value: number, locale: string, currency: AppCurrency) {
  return formatAppCurrency(roundCost(value, currency), locale, currency).replace(/([,.]00)(\D*)$/, '$2')
}

function getProfileCostRanges(profileKey: InstallationProfileKey, currency: AppCurrency) {
  const direct = COST_RANGES[profileKey][currency]
  if (direct) return direct

  const plnRanges = COST_RANGES[profileKey].PLN!
  const multiplier = CURRENCY_FALLBACK_MULTIPLIER[currency] ?? 1

  return Object.fromEntries(
    Object.entries(plnRanges).map(([key, range]) => [
      key,
      [range[0] * multiplier, range[1] * multiplier],
    ])
  ) as Record<CostRangeKey, [number, number]>
}

function formatCostRanges(profileKey: InstallationProfileKey, locale: string, currency: AppCurrency) {
  const ranges = getProfileCostRanges(profileKey, currency)

  return Object.fromEntries(
    Object.entries(ranges).map(([key, range]) => [
      key,
      range[0] === 0 && range[1] === 0
        ? ''
        : `${formatCost(range[0], locale, currency)} - ${formatCost(range[1], locale, currency)}`,
    ])
  ) as Record<CostRangeKey, string>
}

function getProfileSectionItems(
  profileCopy: InstallationProfileCopy,
  sectionKey: DetailSectionKey,
  costRanges: Record<CostRangeKey, string> | null,
  costContext: string
) {
  if (sectionKey === 'costs') {
    return costRanges ? profileCopy.costs.map((getItem) => getItem(costRanges, costContext)) : []
  }

  return profileCopy[sectionKey]
}

export default function InstallationDetailsScreen() {
  const { t } = useTranslation('project')
  const { i18n } = useTranslation()
  const { currency } = useCurrency()
  const router = useRouter()
  const params = useLocalSearchParams<{
    title?: string | string[]
    icon?: string | string[]
    detailKey?: string | string[]
    country?: string | string[]
  }>()

  const title = useMemo(() => {
    const raw = Array.isArray(params.title) ? params.title[0] : params.title
    return raw?.trim() || t('installationsSection.allTitle')
  }, [params.title, t])

  const profileKey = useMemo(
    () => INSTALLATION_PROFILE_ALIASES[normalizeDetailKey(params.detailKey)],
    [params.detailKey]
  )
  const profileCopy = profileKey ? INSTALLATION_PROFILE_COPY[profileKey] : null
  const appLocale = i18n.resolvedLanguage || i18n.language || 'pl'
  const costRanges = useMemo(
    () => profileKey ? formatCostRanges(profileKey, appLocale, currency) : null,
    [appLocale, currency, profileKey]
  )
  const rawCountry = Array.isArray(params.country) ? params.country[0] : params.country
  const country = String(rawCountry ?? '').trim()
  const costContext = country ? `${country} / ${currency}` : CURRENCY_REGION_LABELS[currency] ?? currency

  const iconName = useMemo(() => {
    const raw = Array.isArray(params.icon) ? params.icon[0] : params.icon
    return raw?.trim() || 'information-outline'
  }, [params.icon])

  const headerTitleLines = useMemo(() => getHeaderTitleLines(title), [title])
  const headerTitle = headerTitleLines.join('\n')
  const headerTitleLineCount = headerTitleLines.length
  const headerTitleSize = headerTitleLineCount === 1 ? 42 : headerTitleLineCount === 2 ? 34 : 27
  const headerTitleLineHeight = headerTitleLineCount === 1 ? 48 : headerTitleLineCount === 2 ? 36 : 29

  const [expandedSections, setExpandedSections] = useState<Record<DetailSectionKey, boolean>>({
    benefits: false,
    drawbacks: false,
    costs: false,
    questions: false,
  })

  const goBackToProject = () => {
    router.replace('/(app)/(tabs)/projekt')
  }

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      router.replace('/(app)/(tabs)/projekt')
      return true
    })

    return () => subscription.remove()
  }, [router])

  const toggleSection = (sectionKey: DetailSectionKey) => {
    setExpandedSections((current) => ({
      ...current,
      [sectionKey]: !current[sectionKey],
    }))
  }

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gestureState) => {
        return Math.abs(gestureState.dx) > 22 && Math.abs(gestureState.dy) < 18 && gestureState.dx > 0
      },
      onPanResponderRelease: (_event, gestureState) => {
        if (gestureState.dx > 60 || gestureState.vx > 0.4) {
          goBackToProject()
        }
      },
    })
  ).current

  return (
    <AppScreen scroll contentContainerStyle={styles.screen}>
      <View style={styles.content} {...panResponder.panHandlers}>
        <AppHeader
          title={headerTitle}
          style={styles.screenHeader}
          titleStyle={[
            styles.screenHeaderTitle,
            {
              fontSize: headerTitleSize,
              lineHeight: headerTitleLineHeight,
            },
          ]}
          titleWrapStyle={styles.screenHeaderTitleWrap}
          titleNumberOfLines={headerTitleLineCount}
          titleMinimumFontScale={0.7}
        />

        <View style={styles.heroIconWrap}>
          <MaterialCommunityIcons
            name={iconName as keyof typeof MaterialCommunityIcons.glyphMap}
            size={54}
            color="rgba(248,250,252,0.92)"
          />
        </View>

        <Text style={styles.lead}>
          {profileCopy?.about ?? t('installationDetails.about.text', { name: title })}
        </Text>

        {DETAIL_SECTIONS.map((section) => {
          const items =
            profileCopy
              ? getProfileSectionItems(profileCopy, section.key, costRanges, costContext)
              : t(section.itemsKey, { returnObjects: true }) as string[]
          const expanded = expandedSections[section.key]

          return (
            <AppCard key={section.key} style={styles.sectionCard} contentStyle={styles.sectionCardContent} withShadow={false}>
              <Pressable
                style={styles.sectionHeader}
                onPress={() => toggleSection(section.key)}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
              >
                <View style={styles.sectionHeaderLeft}>
                  <View
                    style={[
                      styles.sectionIcon,
                      section.tone === 'benefit'
                        ? styles.benefitIcon
                        : section.tone === 'drawback'
                          ? styles.drawbackIcon
                          : styles.neutralIcon,
                    ]}
                  >
                    <Feather
                      name={section.icon}
                      size={16}
                      color={section.tone === 'drawback' ? '#F97373' : '#25F0C8'}
                    />
                  </View>
                  <Text style={styles.sectionTitle}>{t(section.titleKey)}</Text>
                </View>
                <View
                  style={[
                    styles.sectionChevron,
                    expanded && styles.sectionChevronOpen,
                  ]}
                >
                  <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="rgba(248,250,252,0.74)" />
                </View>
              </Pressable>

              {expanded && items?.length ? (
                <View style={styles.pointsList}>
                  {items.map((item, index) => (
                    <View
                      key={`${section.key}-${index}`}
                      style={[
                        styles.pointRow,
                        section.tone === 'benefit' ? styles.pointRowBenefit : section.tone === 'drawback' ? styles.pointRowDrawback : styles.pointRowNeutral,
                      ]}
                    >
                      <View
                        style={[
                          styles.pointBadge,
                          section.tone === 'benefit'
                            ? styles.pointBadgeBenefit
                            : section.tone === 'drawback'
                              ? styles.pointBadgeDrawback
                              : styles.pointBadgeNeutral,
                        ]}
                      >
                        <Feather
                          name={section.tone === 'drawback' ? 'minus' : 'check'}
                          size={14}
                          color={section.tone === 'drawback' ? '#F97373' : '#25F0C8'}
                        />
                      </View>
                      <Text style={styles.pointText}>{item}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </AppCard>
          )
        })}

        <AppButton
          title={t('installationDetails.askAi')}
          onPress={() => router.push('/(app)/(tabs)/buddy')}
          style={styles.cta}
        />
      </View>
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: spacing.lg + 2,
    paddingTop: spacing.lg,
    paddingBottom: spacing['2xl'],
    backgroundColor: colors.bg,
  },
  content: {
    flex: 1,
  },
  screenHeader: {
    marginBottom: spacing.md,
  },
  screenHeaderTitleWrap: {
    position: 'absolute',
    left: 72,
    right: 72,
    top: 0,
    bottom: 0,
  },
  screenHeaderTitle: {
    color: colors.accent,
    ...typography.screenTitle,
    fontSize: 34,
    lineHeight: 37,
    textAlign: 'center',
  },
  heroIconWrap: {
    width: 116,
    height: 116,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  lead: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  sectionCard: {
    marginBottom: spacing.md,
  },
  sectionCardContent: {
    padding: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 44,
  },
  sectionHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionChevron: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  sectionChevronOpen: {
    backgroundColor: 'rgba(37,240,200,0.08)',
    borderColor: 'rgba(37,240,200,0.16)',
  },
  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  benefitIcon: {
    backgroundColor: 'rgba(37,240,200,0.10)',
    borderColor: 'rgba(37,240,200,0.22)',
  },
  drawbackIcon: {
    backgroundColor: 'rgba(249,115,115,0.10)',
    borderColor: 'rgba(249,115,115,0.22)',
  },
  neutralIcon: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(37,240,200,0.18)',
  },
  sectionTitle: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
  },
  sectionText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: '600',
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  pointsList: {
    marginTop: spacing.md,
    gap: 10,
  },
  pointRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  pointRowBenefit: {
    backgroundColor: 'rgba(37,240,200,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.10)',
  },
  pointRowDrawback: {
    backgroundColor: 'rgba(249,115,115,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(249,115,115,0.10)',
  },
  pointRowNeutral: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  pointBadge: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  pointBadgeBenefit: {
    backgroundColor: 'rgba(37,240,200,0.12)',
  },
  pointBadgeDrawback: {
    backgroundColor: 'rgba(249,115,115,0.12)',
  },
  pointBadgeNeutral: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  pointText: {
    flex: 1,
    color: 'rgba(255,255,255,0.80)',
    fontSize: 13.5,
    lineHeight: 19,
    fontWeight: '600',
  },
  cta: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
})
