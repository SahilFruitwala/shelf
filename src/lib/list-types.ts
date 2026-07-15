import type { ItemType, ListType } from '#/db/schema'

/** Shelves that can hold any item type (restaurants, movies, places, …). */
export function isMultiTypeShelf(type: ListType): boolean {
  return type === 'mixed' || type === 'trip'
}

export function isTripShelf(type: ListType): boolean {
  return type === 'trip'
}

export function shelfAcceptsItemType(
  listType: ListType,
  itemType: ItemType,
): boolean {
  return isMultiTypeShelf(listType) || listType === itemType
}
