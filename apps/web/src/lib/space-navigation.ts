export type SpaceNavigationTarget = {
  id: string;
  pages: Array<{ id: string }>;
};

export type SpaceNavigationClick = {
  button: number;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
};

export function spaceNavigationHref(space: SpaceNavigationTarget) {
  const query = new URLSearchParams({ space: space.id });
  if (space.pages[0]) query.set("page", space.pages[0].id);
  return `/?${query.toString()}`;
}

export function opensSpacePicker(click: SpaceNavigationClick) {
  return click.button === 0
    && !click.altKey
    && !click.ctrlKey
    && !click.metaKey
    && !click.shiftKey;
}
