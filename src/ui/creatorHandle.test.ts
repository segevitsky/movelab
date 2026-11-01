import { describe, expect, it } from 'vitest';
import { creatorUrl, splitCreator } from './creatorHandle';

describe('creator handle in names', () => {
  it('splits "name · @handle"', () => {
    expect(splitCreator('Push 1 · @floweducationbr')).toEqual({ base: 'Push 1', handle: 'floweducationbr' });
    expect(splitCreator('Core 2 - @alx_yako.fit')).toEqual({ base: 'Core 2', handle: 'alx_yako.fit' });
  });
  it('leaves plain names alone', () => {
    expect(splitCreator('Hollow hold')).toEqual({ base: 'Hollow hold', handle: null });
    expect(splitCreator('email me @ home')).toEqual({ base: 'email me @ home', handle: null });
  });
  it('builds the creator page URL', () => {
    expect(creatorUrl('alx_yako.')).toBe('https://www.instagram.com/alx_yako/');
  });
});
