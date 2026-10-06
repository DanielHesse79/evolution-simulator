import type { Species } from '../sim/species';

type NamedCreation = Pick<Species, 'name' | 'playerMade'>;
export const CREATION_MARK = '✦';

/** Display-only labels: never change scientific names or species identity. */
export function speciesNameText(sp: NamedCreation): string {
  return `${sp.playerMade ? `${CREATION_MARK} ` : ''}${sp.name}`;
}

export function speciesNameHTML(sp: NamedCreation): string {
  const name = sp.name.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  const mark = sp.playerMade
    ? `<span class="creation-mark" role="img" aria-label="Created by you" title="Created by you">${CREATION_MARK}</span>`
    : '';
  return `${mark}${name}`;
}
