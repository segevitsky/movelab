import { Stack } from 'expo-router';

export default function Layout() {
  return (
    <Stack screenOptions={{ headerTitleStyle: { fontSize: 16 }, headerTransparent: false, headerShadowVisible: true, headerStyle: { backgroundColor: '#fff' }, contentStyle: { backgroundColor: '#fafafa' } }}>
      <Stack.Screen name="index" options={{ title: 'MoveLab · Phase 0' }} />
      <Stack.Screen name="capture" options={{ title: 'Capture' }} />
      <Stack.Screen name="debug" options={{ title: 'Pose debug' }} />
      <Stack.Screen name="login" options={{ title: 'Instagram login (your session)' }} />
    </Stack>
  );
}
