import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { db, schema } from '../../src/db';

/** Phase 3: read-only view of the seeded goals (marking stages = Phase 7). */
export default function Goals() {
  const { data } = useLiveQuery(db.select().from(schema.goal));
  return (
    <ScrollView contentContainerStyle={styles.container} contentInsetAdjustmentBehavior="automatic">
      {(data ?? []).map((g) => (
        <View key={g.id} style={styles.card}>
          <Text style={styles.title}>{g.name} <Text style={styles.small}>· {g.slot}{g.active ? ' · active' : ''}</Text></Text>
          {g.stages.map((s, i) => (
            <Text key={i} style={[styles.stage, i === g.currentStage && styles.stageCur]}>
              {i + 1}. {s.name} <Text style={styles.small}>— {s.criterion}{s.exerciseId ? '' : ' · (not linked)'}</Text>
            </Text>
          ))}
          {!!g.notes && <Text style={styles.small}>{g.notes}</Text>}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12, paddingBottom: 80 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 12, gap: 4 },
  title: { fontWeight: '700', fontSize: 15 },
  stage: { fontSize: 13, color: '#333' },
  stageCur: { fontWeight: '700', color: '#d85a30' },
  small: { fontSize: 12, color: '#777', fontWeight: '400' },
});
