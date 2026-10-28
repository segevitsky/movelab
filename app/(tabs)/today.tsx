import React from 'react';
import { Text, View } from 'react-native';

export default function Today() {
  return (
    <View style={{ flex: 1, padding: 24, justifyContent: 'center' }}>
      <Text style={{ fontWeight: '700', fontSize: 18 }}>Today</Text>
      <Text style={{ color: '#666', marginTop: 8 }}>Generated workouts arrive in Phase 5 (frameworks + generator). Presets are already seeded.</Text>
    </View>
  );
}
