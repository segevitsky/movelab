import React from 'react';
import { Linking, Text, type StyleProp, type TextStyle } from 'react-native';
import { colors } from './theme';
import { splitCreator, creatorUrl } from './creatorHandle';
export { splitCreator, creatorUrl } from './creatorHandle';

/**
 * An exercise name whose creator handle ("· @coach") is a tappable link to the creator's page
 * (owner, 2026-11-01). Works inside a pressable row: the nested Text takes the tap.
 */
export function CreatorName({ name, style, linkStyle, numberOfLines, adjustsFontSizeToFit, minimumFontScale, link = true }: {
  name: string; style?: StyleProp<TextStyle>; linkStyle?: StyleProp<TextStyle>; numberOfLines?: number;
  adjustsFontSizeToFit?: boolean; minimumFontScale?: number; /** false = plain text (player) */ link?: boolean;
}) {
  const { base, handle } = splitCreator(name);
  return (
    <Text style={style} numberOfLines={numberOfLines} adjustsFontSizeToFit={adjustsFontSizeToFit} minimumFontScale={minimumFontScale}>
      {base}
      {handle ? (
        <Text
          style={[{ color: colors.accent }, linkStyle]}
          onPress={link ? () => Linking.openURL(creatorUrl(handle)).catch(() => {}) : undefined}
          accessibilityRole={link ? 'link' : undefined}
        >
          {' · @'}{handle}
        </Text>
      ) : null}
    </Text>
  );
}
