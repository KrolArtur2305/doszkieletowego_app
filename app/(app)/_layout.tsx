import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Tabs, useRouter, useSegments } from 'expo-router';

import { useSupabaseAuth } from '../../hooks/useSupabaseAuth';
import { supabase } from '../../supabase';

export default function AppLayout() {
  const { session, initialised } = useSupabaseAuth();
  const router = useRouter();
  const segments = useSegments();

  const [checking, setChecking] = useState(true);
  const [profileComplete, setProfileComplete] = useState<boolean>(false);
  const [investmentComplete, setInvestmentComplete] = useState<boolean>(false);

  const userId = session?.user?.id;
  const currentPath = useMemo(() => segments.join('/'), [segments]);

  useEffect(() => {
    if (!initialised || !userId) return;

    let isMounted = true;
    const fetchStatus = async () => {
      setChecking(true);

      try {
        const [{ data: profileData }, { data: investmentData }] = await Promise.all([
          supabase
            .from('profiles')
            .select('profil_wypelniony')
            .eq('user_id', userId)
            .limit(1)
            .maybeSingle(),
          supabase
            .from('inwestycje')
            .select('inwestycja_wypelniona')
            .eq('user_id', userId)
            .limit(1)
            .maybeSingle(),
        ]);

        if (!isMounted) return;

        setProfileComplete(Boolean(profileData?.profil_wypelniony));
        setInvestmentComplete(Boolean(investmentData?.inwestycja_wypelniona));
      } finally {
        if (isMounted) setChecking(false);
      }
    };

    fetchStatus();

    return () => {
      isMounted = false;
    };
  }, [initialised, userId, currentPath]);

  useEffect(() => {
    if (!initialised || !userId || checking) return;

    if (!profileComplete) {
      if (currentPath !== '(app)/profil') {
        router.replace('/(app)/profil');
      }
      return;
    }

    if (!investmentComplete) {
      if (currentPath !== '(app)/inwestycja') {
        router.replace('/(app)/inwestycja');
      }
      return;
    }

    if (currentPath === '(app)/profil' || currentPath === '(app)/inwestycja') {
      router.replace('/(app)/dashboard');
    }
  }, [initialised, userId, checking, profileComplete, investmentComplete, currentPath, router]);

  if (!initialised || !session) {
    return null;
  }

  return (
    <>
      {checking && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(5,9,21,0.75)',
            zIndex: 10,
          }}
        >
          <ActivityIndicator size="large" color="#5EEAD4" />
        </View>
      )}

      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#0B1120',
            borderTopColor: 'rgba(255,255,255,0.08)',
          },
          tabBarActiveTintColor: '#5EEAD4',
          tabBarInactiveTintColor: '#94A3B8',
        }}
      >
        <Tabs.Screen
          name="dashboard/index"
          options={{
            title: 'Dashboard',
            tabBarIcon: ({ color, size }) => <Feather name="grid" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="budzet/index"
          options={{
            title: 'Budżet',
            tabBarIcon: ({ color, size }) => <Feather name="pie-chart" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="zdjecia/index"
          options={{
            title: 'Zdjęcia',
            tabBarIcon: ({ color, size }) => <Feather name="camera" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="ustawienia/index"
          options={{
            title: 'Ustawienia',
            tabBarIcon: ({ color, size }) => <Feather name="user" color={color} size={size} />,
          }}
        />
        <Tabs.Screen name="index" options={{ href: null, tabBarButton: () => null }} />
        <Tabs.Screen name="postepy/index" options={{ href: null, tabBarButton: () => null }} />
        <Tabs.Screen name="projekt/index" options={{ href: null, tabBarButton: () => null }} />
        <Tabs.Screen name="inwestycja/index" options={{ href: null, tabBarButton: () => null }} />
        <Tabs.Screen name="profil/index" options={{ href: null, tabBarButton: () => null }} />
      </Tabs>
    </>
  );
}
