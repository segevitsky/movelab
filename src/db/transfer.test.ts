import { describe, expect, it } from 'vitest';
import { parseTransfer, TRANSFER_VERSION } from './transferFormat';

describe('library transfer file', () => {
  it('rejects non-JSON and foreign files', () => {
    expect(() => parseTransfer('nope')).toThrow('Not a JSON file');
    expect(() => parseTransfer('{"hello":1}')).toThrow('Not a MoveLab library file');
    expect(() => parseTransfer(JSON.stringify({ app: 'movelab', version: TRANSFER_VERSION }))).toThrow('No exercises');
  });

  it('rejects files from a newer format', () => {
    expect(() => parseTransfer(JSON.stringify({ app: 'movelab', version: TRANSFER_VERSION + 1, exercises: [] }))).toThrow('newer MoveLab');
  });

  it('fills missing optional tables with empty lists', () => {
    const t = parseTransfer(JSON.stringify({ app: 'movelab', version: TRANSFER_VERSION, exportedAt: 1, exercises: [{ id: 'ex_1', name: 'x', updatedAt: 1 }] }));
    expect(t.exercises).toHaveLength(1);
    expect(t.sources).toEqual([]);
    expect(t.frameworks).toEqual([]);
    expect(t.goals).toEqual([]);
    expect(t.pairing).toEqual([]);
    expect(t.sourceExercise).toEqual([]);
  });
});
