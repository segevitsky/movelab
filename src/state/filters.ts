import { create } from 'zustand';
import type { Equipment, Pattern, Slot } from '../db/vocab';

type FiltersState = {
  pattern: Pattern | null;
  slot: Slot | null;
  equipment: Equipment | null;
  text: string;
  set: (p: Partial<Omit<FiltersState, 'set' | 'clear'>>) => void;
  clear: () => void;
};

export const useFilters = create<FiltersState>((set) => ({
  pattern: null,
  slot: null,
  equipment: null,
  text: '',
  set: (p) => set(p),
  clear: () => set({ pattern: null, slot: null, equipment: null, text: '' }),
}));
