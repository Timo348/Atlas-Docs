export type EffectiveSpaceRole = "OWNER" | "EDITOR" | "VIEWER";

const roleWeight: Record<EffectiveSpaceRole, number> = {
  VIEWER: 1,
  EDITOR: 2,
  OWNER: 3,
};

export function strongestSpaceRole(
  roles: Array<EffectiveSpaceRole | null | undefined>,
): EffectiveSpaceRole | null {
  return roles.reduce<EffectiveSpaceRole | null>((strongest, role) => {
    if (!role) return strongest;
    if (!strongest || roleWeight[role] > roleWeight[strongest]) return role;
    return strongest;
  }, null);
}

export function spaceRoleLabel(role: EffectiveSpaceRole, language: "en" | "de") {
  if (language === "de") {
    return role === "OWNER" ? "Eigentümer" : role === "EDITOR" ? "Kann bearbeiten" : "Nur lesen";
  }
  return role === "OWNER" ? "Owner" : role === "EDITOR" ? "Can edit" : "Read only";
}
