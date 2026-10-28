import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { ColorValue } from 'react-native';
import { colors } from '../../src/ui/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];
const icon = (name: IoniconName) => ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} color={color as string} size={size} />;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTitleStyle: { fontSize: 17, fontWeight: '800', color: colors.ink },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="library" options={{ title: 'Library', tabBarIcon: icon('grid-outline') }} />
      <Tabs.Screen name="today" options={{ title: 'Today', tabBarIcon: icon('play-circle-outline') }} />
      <Tabs.Screen name="goals" options={{ title: 'Goals', tabBarIcon: icon('flag-outline') }} />
      <Tabs.Screen name="dev" options={{ title: 'Dev', tabBarIcon: icon('construct-outline') }} />
    </Tabs>
  );
}
