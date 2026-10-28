import React from 'react';
import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';

const icon = (glyph: string) => ({ color }: { color: ColorValue }) => <Text style={{ fontSize: 18, color }}>{glyph}</Text>;

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#d85a30', headerTitleStyle: { fontSize: 16 } }}>
      <Tabs.Screen name="library" options={{ title: 'Library', tabBarIcon: icon('▦') }} />
      <Tabs.Screen name="today" options={{ title: 'Today', tabBarIcon: icon('▶') }} />
      <Tabs.Screen name="goals" options={{ title: 'Goals', tabBarIcon: icon('◎') }} />
      <Tabs.Screen name="dev" options={{ title: 'Dev', tabBarIcon: icon('⚙') }} />
    </Tabs>
  );
}
