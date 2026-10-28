import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { db, schema } from '../../src/db';
import { colors, radius, shadow, slotColor, tint } from '../../src/ui/theme';

/** Phase 3: read-only view of the seeded goals (marking stages = Phase 7). */
export default function Goals() {
  const { data } = useLiveQuery(db.select().from(schema.goal));
  return (
    <ScrollView contentContainerStyle={styles.container} contentInsetAdjustmentBehavior="automatic">
      {(data ?? []).map((g) => (
        <View key={g.id} style={[styles.card, shadow.card, { borderLeftColor: (g.slot && slotColor[g.slot]) || colors.accent }]}>
          <Text style={styles.title}>{g.name} <Text style={[styles.pill, { backgroundColor: tint((g.slot && slotColor[g.slot]) || colors.accent), color: (g.slot && slotColor[g.slot]) || colors.accent }]}> {g.slot} </Text>{g.active ? <Text style={styles.small}> · active</Text> : null}</Text>
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
  container: { padding: 16, gap: 12, paddingBottom: 80, backgroundColor: colors.bg },
  card: { backgroundColor: colors.surface, borderRadius: radius.l, padding: 14, gap: 4, borderLeftWidth: 4 },
  title: { fontWeight: '800', fontSize: 16, color: colors.ink, marginBottom: 4 },
  pill: { fontSize: 11, fontWeight: '700', borderRadius: 6, overflow: 'hidden' },
  stage: { fontSize: 13, color: colors.inkSoft, lineHeight: 19 },
  stageCur: { fontWeight: '700', color: colors.accent },
  small: { fontSize: 12, color: colors.muted, fontWeight: '400' },
});
