export const API_ERROR_MESSAGES = {
  AUTH_REQUIRED: {
    en: "You must be signed in.",
    de: "Du musst angemeldet sein.",
  },
  ACCESS_DENIED: {
    en: "You do not have access.",
    de: "Du hast keinen Zugriff.",
  },
  WRITE_ACCESS_REQUIRED: {
    en: "You do not have write access.",
    de: "Du hast keinen Schreibzugriff.",
  },
  INVALID_INPUT: {
    en: "The submitted data is invalid.",
    de: "Die eingegebenen Daten sind ungültig.",
  },
  COLLABORATION_PAGE_ID_REQUIRED: {
    en: "The page ID is missing.",
    de: "Die Seiten-ID fehlt.",
  },
  COLLABORATION_NOT_CONFIGURED: {
    en: "The collaboration server is not configured.",
    de: "Der Kollaborationsserver ist nicht konfiguriert.",
  },
  COLLABORATION_CONFIG_INVALID: {
    en: "The collaboration configuration is invalid.",
    de: "Die Kollaborationskonfiguration ist ungültig.",
  },
  FOLDER_PARENT_INVALID: {
    en: "The selected parent folder is invalid.",
    de: "Der ausgewählte übergeordnete Ordner ist ungültig.",
  },
  FOLDER_SELF_PARENT: {
    en: "A folder cannot be placed inside itself.",
    de: "Ein Ordner kann nicht in sich selbst liegen.",
  },
  FOLDER_DESCENDANT_PARENT: {
    en: "A folder cannot be moved into one of its subfolders.",
    de: "Ein Ordner kann nicht in einen seiner Unterordner verschoben werden.",
  },
  FOLDER_NAME_CONFLICT: {
    en: "A folder with this name already exists at this level.",
    de: "Auf dieser Ebene existiert bereits ein Ordner mit diesem Namen.",
  },
  PAGE_PARENT_INVALID: {
    en: "The selected parent page is invalid.",
    de: "Die ausgewählte übergeordnete Seite ist ungültig.",
  },
  FOLDER_INVALID: {
    en: "The selected folder is invalid.",
    de: "Der ausgewählte Ordner ist ungültig.",
  },
  PREFERENCES_INVALID: {
    en: "The selected preferences are invalid.",
    de: "Die ausgewählten Einstellungen sind ungültig.",
  },
  IMAGE_MISSING: {
    en: "An image is required.",
    de: "Ein Bild ist erforderlich.",
  },
  IMAGE_EMPTY: {
    en: "The image file is empty.",
    de: "Die Bilddatei ist leer.",
  },
  IMAGE_TOO_LARGE: {
    en: "The image exceeds the configured upload limit.",
    de: "Das Bild überschreitet das konfigurierte Upload-Limit.",
  },
  IMAGE_INVALID_TYPE: {
    en: "Only valid PNG, JPEG, WebP, and GIF images are allowed.",
    de: "Es sind nur gültige PNG-, JPEG-, WebP- und GIF-Bilder erlaubt.",
  },
  IMAGE_SAVE_FAILED: {
    en: "The image could not be saved.",
    de: "Das Bild konnte nicht gespeichert werden.",
  },
  FILE_MISSING: {
    en: "A file is required.",
    de: "Eine Datei ist erforderlich.",
  },
  FILE_EMPTY: {
    en: "The file is empty.",
    de: "Die Datei ist leer.",
  },
  FILE_TOO_LARGE: {
    en: "The file exceeds the configured upload limit.",
    de: "Die Datei überschreitet das konfigurierte Upload-Limit.",
  },
  FILE_INVALID_TYPE: {
    en: "Only Markdown, LaTeX, Excalidraw, and PDF files are supported.",
    de: "Es werden nur Markdown-, LaTeX-, Excalidraw- und PDF-Dateien unterstützt.",
  },
  FILE_INVALID_CONTENT: {
    en: "The file content is invalid or does not match the selected file type.",
    de: "Der Dateiinhalt ist ungültig oder entspricht nicht dem ausgewählten Dateityp.",
  },
  FILE_SAVE_FAILED: {
    en: "The file could not be saved.",
    de: "Die Datei konnte nicht gespeichert werden.",
  },
  VERSION_INVALID: {
    en: "The submitted version is invalid.",
    de: "Die übermittelte Version ist ungültig.",
  },
  VERSION_SNAPSHOT_INVALID: {
    en: "The version snapshot is invalid or larger than 25 MB.",
    de: "Der Versionsstand ist ungültig oder größer als 25 MB.",
  },
  VERSION_NOT_FOUND: {
    en: "The version was not found.",
    de: "Die Version wurde nicht gefunden.",
  },
  PAGE_SHARE_MANAGE_REQUIRED: {
    en: "Only space owners and administrators may manage page links.",
    de: "Nur Bereichseigentümer und Administratoren dürfen Seitenlinks verwalten.",
  },
  PAGE_SHARE_INVALID: {
    en: "The page link settings are invalid.",
    de: "Die Einstellungen des Seitenlinks sind ungültig.",
  },
  PAGE_SHARE_NOT_FOUND: {
    en: "The page link was not found.",
    de: "Der Seitenlink wurde nicht gefunden.",
  },
  FOLDER_SHARE_MANAGE_REQUIRED: {
    en: "Only space owners and administrators may manage folder links.",
    de: "Nur Bereichseigentümer und Administratoren dürfen Ordnerlinks verwalten.",
  },
  FOLDER_SHARE_INVALID: {
    en: "The folder link settings are invalid.",
    de: "Die Einstellungen des Ordnerlinks sind ungültig.",
  },
  FOLDER_SHARE_NOT_FOUND: {
    en: "The folder link was not found.",
    de: "Der Ordnerlink wurde nicht gefunden.",
  },
  SPACE_NOT_FOUND: {
    en: "The space was not found.",
    de: "Der Bereich wurde nicht gefunden.",
  },
  SPACE_OWNER_OR_ADMIN_REQUIRED: {
    en: "Only space owners and administrators may perform this action.",
    de: "Nur Bereichseigentümer und Administratoren dürfen diese Aktion ausführen.",
  },
  SPACE_PERMISSION_MANAGE_REQUIRED: {
    en: "Only space owners and administrators may manage permissions.",
    de: "Nur Bereichseigentümer und Administratoren dürfen Rechte verwalten.",
  },
  PERMISSIONS_INVALID: {
    en: "The selected permissions are invalid.",
    de: "Die ausgewählten Rechte sind ungültig.",
  },
  PERMISSION_DUPLICATE: {
    en: "A permission was included more than once.",
    de: "Eine Freigabe wurde mehrfach angegeben.",
  },
  PERMISSION_SUBJECT_NOT_FOUND: {
    en: "A selected user or team was not found.",
    de: "Ein ausgewählter Benutzer oder ein ausgewähltes Team wurde nicht gefunden.",
  },
  SPACE_DELETE_REQUIRED: {
    en: "Only space owners and administrators may delete this space.",
    de: "Nur Bereichseigentümer und Administratoren dürfen diesen Bereich löschen.",
  },
  SPACE_DELETE_CONFIRMATION_MISMATCH: {
    en: "The space name does not match the confirmation.",
    de: "Der Bereichsname stimmt nicht mit der Bestätigung überein.",
  },
  TEAM_ADMIN_REQUIRED: {
    en: "Only administrators may manage teams.",
    de: "Nur Administratoren dürfen Teams verwalten.",
  },
  TEAM_MEMBER_DUPLICATE: {
    en: "A user may only appear once in a team.",
    de: "Ein Benutzer darf pro Team nur einmal vorkommen.",
  },
  TEAM_MEMBER_NOT_FOUND: {
    en: "At least one selected user was not found.",
    de: "Mindestens ein ausgewählter Benutzer wurde nicht gefunden.",
  },
  TEAM_NAME_CONFLICT: {
    en: "A team with this name already exists.",
    de: "Ein Team mit diesem Namen existiert bereits.",
  },
  ADMIN_REQUIRED: {
    en: "Only administrators may perform this action.",
    de: "Nur Administratoren dürfen diese Aktion ausführen.",
  },
  USER_CREATE_INPUT_INVALID: {
    en: "A name, a valid email address, and a password of at least 12 characters are required.",
    de: "Name, gültige E-Mail-Adresse und ein Passwort mit mindestens 12 Zeichen sind erforderlich.",
  },
  EMAIL_CONFLICT: {
    en: "This email address is already in use.",
    de: "Diese E-Mail-Adresse ist bereits vergeben.",
  },
  OWN_ADMIN_ACCOUNT_REQUIRED: {
    en: "You cannot deactivate your own administrator account or remove its administrator role.",
    de: "Du kannst dein eigenes Administratorkonto weder deaktivieren noch ihm die Administratorrolle entziehen.",
  },
  USER_NOT_FOUND: {
    en: "The user was not found.",
    de: "Der Benutzer wurde nicht gefunden.",
  },
  LAST_ADMIN_REQUIRED: {
    en: "At least one active administrator is required.",
    de: "Mindestens ein aktiver Administrator ist erforderlich.",
  },
  PROFILE_IMAGE_SELF_ONLY: {
    en: "You may only change your own profile image.",
    de: "Du darfst nur dein eigenes Profilbild ändern.",
  },
} as const;

export type ApiErrorCode = keyof typeof API_ERROR_MESSAGES;
export type ApiErrorLanguage = keyof (typeof API_ERROR_MESSAGES)[ApiErrorCode];
export type ApiErrorPayload = {
  code: ApiErrorCode;
  error: string;
};

type TextSelector = (english: string, german: string) => string;
type LocalizedFallback = { en: string; de: string };

export class CodedApiError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode) {
    super(API_ERROR_MESSAGES[code].en);
    this.name = "CodedApiError";
    this.code = code;
  }
}

export function apiErrorBody(code: ApiErrorCode): ApiErrorPayload {
  return {
    code,
    error: API_ERROR_MESSAGES[code].en,
  };
}

export function apiErrorResponse(code: ApiErrorCode, status: number): Response {
  return Response.json(apiErrorBody(code), { status });
}

export function apiErrorCode(error: unknown, fallback: ApiErrorCode): ApiErrorCode {
  return error instanceof CodedApiError ? error.code : fallback;
}

export function isCodedApiError(error: unknown): error is CodedApiError {
  return error instanceof CodedApiError;
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export function apiErrorMessage(
  payload: unknown,
  text: TextSelector,
  fallback: LocalizedFallback,
): string {
  const code = apiErrorCodeFromPayload(payload);
  if (!code) return text(fallback.en, fallback.de);
  const message = API_ERROR_MESSAGES[code];
  return text(message.en, message.de);
}

export function apiErrorCodeFromPayload(payload: unknown): ApiErrorCode | null {
  if (!payload || typeof payload !== "object" || !Object.hasOwn(payload, "code")) return null;
  const code = (payload as { code?: unknown }).code;
  return typeof code === "string" && Object.hasOwn(API_ERROR_MESSAGES, code)
    ? code as ApiErrorCode
    : null;
}
