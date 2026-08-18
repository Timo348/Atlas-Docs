type LandingSpaceRequest = {
  pageSpaceId?: string | null;
  requestedSpaceId?: string | null;
  defaultSpaceId?: string | null;
};

export function preferredLandingSpace(
  accessibleSpaceIds: string[],
  request: LandingSpaceRequest,
) {
  const accessible = new Set(accessibleSpaceIds);
  return [request.pageSpaceId, request.requestedSpaceId, request.defaultSpaceId]
    .find((spaceId): spaceId is string => Boolean(spaceId && accessible.has(spaceId)))
    || accessibleSpaceIds[0]
    || null;
}
