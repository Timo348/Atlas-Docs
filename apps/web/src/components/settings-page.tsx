"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import {
  ArrowLeft, BookOpen, CalendarDays, Camera, ChartNoAxesCombined, Download, FileCode2, KeyRound, LogOut, Palette,
  ShieldCheck, UserRound, Users, Workflow,
} from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { usePreferences } from "@/components/preferences-provider";
import { apiErrorMessage } from "@/lib/api-errors";
import { copyGanttAppearance, type FileViewDefaults, type Preferences } from "@/lib/preferences";

type SettingsSection = "profile" | "security" | "appearance" | "workspace" | "files" | "export";
type BusySection = SettingsSection | null;
type SettingsUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "MEMBER";
  metricsAccess: boolean;
  hasAvatar: boolean;
  avatarVersion: number;
  canChangePassword: boolean;
};
type AppearanceDraft = Pick<Preferences, "colorTheme" | "uiFont" | "editorFont" | "fontSize" | "compactMode" | "ganttAppearance">;
type WorkspaceDraft = Pick<Preferences, "language" | "defaultSpaceId">;

export function SettingsPage({
  user,
  spaces,
}: {
  user: SettingsUser;
  spaces: { id: string; name: string }[];
}) {
  const { preferences, setPreferences, text } = usePreferences();
  const [section, setSection] = useState<SettingsSection>("profile");
  const [displayName, setDisplayName] = useState(user.name);
  const [hasAvatar, setHasAvatar] = useState(user.hasAvatar);
  const [avatarVersion, setAvatarVersion] = useState(user.avatarVersion);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarRemovalRequested, setAvatarRemovalRequested] = useState(false);
  const [appearanceDraft, setAppearanceDraft] = useState<AppearanceDraft>(() => ({
    colorTheme: preferences.colorTheme,
    uiFont: preferences.uiFont,
    editorFont: preferences.editorFont,
    fontSize: preferences.fontSize,
    compactMode: preferences.compactMode,
    ganttAppearance: copyGanttAppearance(preferences.ganttAppearance),
  }));
  const [workspaceDraft, setWorkspaceDraft] = useState<WorkspaceDraft>(() => ({
    language: preferences.language,
    defaultSpaceId: preferences.defaultSpaceId,
  }));
  const [fileViewDraft, setFileViewDraft] = useState<FileViewDefaults>(() => ({ ...preferences.fileViewDefaults }));
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [busySection, setBusySection] = useState<BusySection>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const busy = busySection !== null;
  const visibleAvatar = hasAvatar && !avatarRemovalRequested;

  function activate(nextSection: SettingsSection) {
    setSection(nextSection);
    setError("");
    setNotice("");
  }


  async function persistPreferences(next: Preferences, target: Exclude<BusySection, null>, saved: { en: string; de: string }) {
    setBusySection(target);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(apiErrorMessage(result, text, {
          en: "The settings could not be saved.",
          de: "Die Einstellungen konnten nicht gespeichert werden.",
        }));
        return;
      }
      setPreferences(result as Preferences);
      setNotice(next.language === "de" ? saved.de : saved.en);
    } catch {
      setError(text("The settings could not be saved.", "Die Einstellungen konnten nicht gespeichert werden."));
    } finally {
      setBusySection(null);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusySection("profile");
    setError("");
    setNotice("");
    try {
      let changed = false;
      const trimmedName = displayName.trim();
      if (trimmedName !== user.name) {
        const response = await fetch("/api/account/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmedName }),
        });
        const result = await response.json();
        if (!response.ok) {
          setError(apiErrorMessage(result, text, {
            en: "The profile could not be saved.",
            de: "Das Profil konnte nicht gespeichert werden.",
          }));
          return;
        }
        setDisplayName((result as { name: string }).name);
        changed = true;
      }
      if (avatarFile) {
        const form = new FormData();
        form.set("image", avatarFile);
        const response = await fetch("/api/users/" + user.id + "/avatar", { method: "PUT", body: form });
        const result = await response.json();
        if (!response.ok) {
          setError(apiErrorMessage(result, text, {
            en: "The profile image could not be saved.",
            de: "Das Profilbild konnte nicht gespeichert werden.",
          }));
          return;
        }
        setHasAvatar(true);
        setAvatarVersion(Date.now());
        setAvatarFile(null);
        setAvatarRemovalRequested(false);
        changed = true;
      } else if (avatarRemovalRequested && hasAvatar) {
        const response = await fetch("/api/users/" + user.id + "/avatar", { method: "DELETE" });
        if (!response.ok) {
          setError(text("The profile image could not be removed.", "Das Profilbild konnte nicht entfernt werden."));
          return;
        }
        setHasAvatar(false);
        setAvatarRemovalRequested(false);
        changed = true;
      }
      setNotice(changed
        ? text("Profile saved.", "Profil gespeichert.")
        : text("There are no profile changes to save.", "Es gibt keine Profiländerungen zu speichern."));
    } catch {
      setError(text("The profile could not be saved.", "Das Profil konnte nicht gespeichert werden."));
    } finally {
      setBusySection(null);
    }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== passwordConfirmation) {
      setError(text("The new passwords do not match.", "Die neuen Passwörter stimmen nicht überein."));
      setNotice("");
      return;
    }
    setBusySection("security");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/account/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(apiErrorMessage(result, text, {
          en: "The password could not be changed.",
          de: "Das Passwort konnte nicht geändert werden.",
        }));
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setPasswordConfirmation("");
      setNotice(text("Password changed.", "Passwort geändert."));
    } catch {
      setError(text("The password could not be changed.", "Das Passwort konnte nicht geändert werden."));
    } finally {
      setBusySection(null);
    }
  }

  return (
    <main className="settings-page">
      <aside className="settings-sidebar">
        <Link href="/" className="settings-back-link"><ArrowLeft size={16} /> {text("Back to workspace", "Zurück zum Workspace")}</Link>
        <button className="settings-identity" type="button" onClick={() => activate("profile")}>
          <span className="settings-avatar">
            {visibleAvatar ? <img src={"/api/users/" + user.id + "/avatar?v=" + avatarVersion} alt="" /> : initials(displayName)}
          </span>
          <span><strong>{displayName}</strong><small>{text("Account settings", "Kontoeinstellungen")}</small></span>
        </button>

        <nav className="settings-navigation" aria-label={text("Settings navigation", "Einstellungsnavigation")}>
          <SettingsNavGroup label={text("Account", "Konto")}>
            <SettingsNavButton active={section === "profile"} icon={<UserRound size={17} />} onClick={() => activate("profile")}>{text("Profile", "Profil")}</SettingsNavButton>
            <SettingsNavButton active={section === "security"} icon={<KeyRound size={17} />} onClick={() => activate("security")}>{text("Password & security", "Passwort & Sicherheit")}</SettingsNavButton>
          </SettingsNavGroup>
          <SettingsNavGroup label={text("Experience", "Darstellung")}>
            <SettingsNavButton active={section === "appearance"} icon={<Palette size={17} />} onClick={() => activate("appearance")}>{text("Appearance", "Design")}</SettingsNavButton>
          </SettingsNavGroup>
          <SettingsNavGroup label={text("Preferences", "Präferenzen")}>
            <SettingsNavLink href="/calendar" icon={<CalendarDays size={17} />}>{text("Calendar", "Kalender")}</SettingsNavLink>
            <SettingsNavButton active={section === "workspace"} icon={<BookOpen size={17} />} onClick={() => activate("workspace")}>{text("Workspace", "Arbeitsbereich")}</SettingsNavButton>
            <SettingsNavButton active={section === "files"} icon={<FileCode2 size={17} />} onClick={() => activate("files")}>{text("File opening", "Dateien öffnen")}</SettingsNavButton>
          </SettingsNavGroup>
          <SettingsNavGroup label={text("Data", "Daten")}>
            <SettingsNavButton active={section === "export"} icon={<Download size={17} />} onClick={() => activate("export")}>{text("Data & export", "Daten & Export")}</SettingsNavButton>
            {user.role !== "ADMIN" && user.metricsAccess && <SettingsNavLink href="/admin/dashboard" icon={<ChartNoAxesCombined size={17} />}>{text("Instance dashboard", "Instanz-Dashboard")}</SettingsNavLink>}
          </SettingsNavGroup>
          {user.role === "ADMIN" && (
            <SettingsNavGroup label={text("Administration", "Administration")}>
              <SettingsNavLink href="/admin/dashboard" icon={<ChartNoAxesCombined size={17} />}>{text("Instance dashboard", "Instanz-Dashboard")}</SettingsNavLink>
              <SettingsNavLink href="/admin/users" icon={<ShieldCheck size={17} />}>{text("User management", "Benutzerverwaltung")}</SettingsNavLink>
              <SettingsNavLink href="/admin/teams" icon={<Users size={17} />}>{text("Team management", "Teamverwaltung")}</SettingsNavLink>
            </SettingsNavGroup>
          )}
        </nav>

        <button className="settings-signout" type="button" onClick={() => signOut({ callbackUrl: "/signin" })}>
          <LogOut size={17} /> {text("Sign out", "Abmelden")}
        </button>
      </aside>

      <section className="settings-main">
        <div className="settings-content">
          {section === "profile" && (
            <>
              <SettingsSectionHeader
                icon={<UserRound size={22} />}
                title={text("Profile", "Profil")}
                description={text("Update the information shown to people you work with.", "Aktualisiere die Informationen, die Mitarbeitende von dir sehen.")}
              />
              <form className="settings-card settings-profile-card" onSubmit={(event) => void saveProfile(event)}>
                <div className="settings-avatar-large">
                  {visibleAvatar ? <img src={"/api/users/" + user.id + "/avatar?v=" + avatarVersion} alt="" /> : initials(displayName)}
                </div>
                <div className="settings-profile-fields">
                  <label className="settings-field">
                    <span>{text("Profile image", "Profilbild")}</span>
                    <span className="settings-avatar-actions">
                      <span className="file-picker"><Camera size={16} /> {text("Choose image", "Bild auswählen")}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          onChange={(event) => {
                            setAvatarFile(event.target.files?.[0] || null);
                            setAvatarRemovalRequested(false);
                          }}
                        />
                      </span>
                      {hasAvatar && !avatarFile && !avatarRemovalRequested && (
                        <button className="button compact secondary-button" type="button" disabled={busy} onClick={() => setAvatarRemovalRequested(true)}>
                          {text("Remove image", "Bild entfernen")}
                        </button>
                      )}
                    </span>
                    <small>{avatarFile
                      ? text("Selected: " + avatarFile.name, "Ausgewählt: " + avatarFile.name)
                      : avatarRemovalRequested
                        ? text("The image will be removed when you save.", "Das Bild wird beim Speichern entfernt.")
                        : text("PNG, JPEG, WebP, or GIF. Maximum 5 MB.", "PNG, JPEG, WebP oder GIF. Maximal 5 MB.")}</small>
                  </label>
                  <div className="settings-field-grid">
                    <label className="settings-field">
                      <span>{text("Display name", "Anzeigename")}</span>
                      <input value={displayName} minLength={2} maxLength={100} required disabled={busy} onChange={(event) => setDisplayName(event.target.value)} />
                    </label>
                    <label className="settings-field">
                      <span>{text("Email address", "E-Mail-Adresse")}</span>
                      <input value={user.email} readOnly aria-readonly="true" />
                    </label>
                  </div>
                </div>
                <footer className="settings-card-footer">
                  <small>{text("Your email address is managed by your sign-in method.", "Deine E-Mail-Adresse wird über deine Anmeldemethode verwaltet.")}</small>
                  <button className="button compact primary-button" disabled={busy} type="submit">{busySection === "profile" ? text("Saving…", "Speichern…") : text("Save profile", "Profil speichern")}</button>
                </footer>
              </form>
            </>
          )}

          {section === "security" && (
            <>
              <SettingsSectionHeader
                icon={<KeyRound size={22} />}
                title={text("Password & security", "Passwort & Sicherheit")}
                description={text("Keep the credentials for your local Atlas account up to date.", "Halte die Zugangsdaten für dein lokales Atlas-Konto aktuell.")}
              />
              {user.canChangePassword ? (
                <form className="settings-card settings-form-card" onSubmit={(event) => void savePassword(event)}>
                  <div className="settings-card-copy">
                    <h2>{text("Change password", "Passwort ändern")}</h2>
                    <p>{text("Confirm your current password before choosing a new one.", "Bestätige dein aktuelles Passwort, bevor du ein neues festlegst.")}</p>
                  </div>
                  <div className="settings-field-grid">
                    <label className="settings-field">
                      <span>{text("Current password", "Aktuelles Passwort")}</span>
                      <input type="password" autoComplete="current-password" value={currentPassword} required disabled={busy} onChange={(event) => setCurrentPassword(event.target.value)} />
                    </label>
                    <span />
                    <label className="settings-field">
                      <span>{text("New password", "Neues Passwort")}</span>
                      <input type="password" autoComplete="new-password" minLength={12} maxLength={128} value={newPassword} required disabled={busy} onChange={(event) => setNewPassword(event.target.value)} />
                      <small>{text("12 to 128 characters.", "12 bis 128 Zeichen.")}</small>
                    </label>
                    <label className="settings-field">
                      <span>{text("Confirm new password", "Neues Passwort bestätigen")}</span>
                      <input type="password" autoComplete="new-password" minLength={12} maxLength={128} value={passwordConfirmation} required disabled={busy} onChange={(event) => setPasswordConfirmation(event.target.value)} />
                    </label>
                  </div>
                  <footer className="settings-card-footer">
                    <span />
                    <button className="button compact primary-button" disabled={busy} type="submit">{busySection === "security" ? text("Changing…", "Ändern…") : text("Change password", "Passwort ändern")}</button>
                  </footer>
                </form>
              ) : (
                <section className="settings-card settings-provider-card">
                  <span className="settings-provider-icon"><Workflow size={22} /></span>
                  <div>
                    <h2>{text("Managed by your identity provider", "Über deinen Identity Provider verwaltet")}</h2>
                    <p>{text("This account does not have a local Atlas password. Change your password through the provider you used to sign in.", "Dieses Konto besitzt kein lokales Atlas-Passwort. Ändere dein Passwort beim Provider, über den du dich angemeldet hast.")}</p>
                  </div>
                </section>
              )}
            </>
          )}

          {section === "appearance" && (
            <>
              <SettingsSectionHeader
                icon={<Palette size={22} />}
                title={text("Appearance", "Design")}
                description={text("Choose how Atlas looks and how text is presented.", "Wähle, wie Atlas aussieht und wie Text dargestellt wird.")}
              />
              <section className="settings-card settings-form-card">
                <div className="settings-field-grid">
                  <label className="settings-field">
                    <span>{text("Color theme", "Farbschema")}</span>
                    <select value={appearanceDraft.colorTheme} disabled={busy} onChange={(event) => setAppearanceDraft({ ...appearanceDraft, colorTheme: event.target.value as Preferences["colorTheme"] })}>
                      <option value="system">{text("System", "System")}</option>
                      <option value="light">{text("Light", "Hell")}</option>
                      <option value="dark">{text("Dark", "Dunkel")}</option>
                    </select>
                  </label>
                  <label className="settings-field">
                    <span>{text("Interface font", "Oberflächenschrift")}</span>
                    <select value={appearanceDraft.uiFont} disabled={busy} onChange={(event) => setAppearanceDraft({ ...appearanceDraft, uiFont: event.target.value as Preferences["uiFont"] })}>
                      <option value="inter">Inter</option>
                      <option value="helvetica">Helvetica / Arial</option>
                      <option value="serif">Lora</option>
                      <option value="system">{text("System font", "Systemschrift")}</option>
                    </select>
                  </label>
                  <label className="settings-field">
                    <span>{text("Editor font", "Editorschrift")}</span>
                    <select value={appearanceDraft.editorFont} disabled={busy} onChange={(event) => setAppearanceDraft({ ...appearanceDraft, editorFont: event.target.value as Preferences["editorFont"] })}>
                      <option value="mono">{text("Monospace", "Monospace")}</option>
                      <option value="sans">{text("Sans serif", "Serifenlos")}</option>
                    </select>
                  </label>
                  <label className="settings-field">
                    <span>{text("Text size", "Textgröße")}</span>
                    <select value={appearanceDraft.fontSize} disabled={busy} onChange={(event) => setAppearanceDraft({ ...appearanceDraft, fontSize: event.target.value as Preferences["fontSize"] })}>
                      <option value="small">{text("Small", "Klein")}</option>
                      <option value="medium">{text("Medium", "Mittel")}</option>
                      <option value="large">{text("Large", "Groß")}</option>
                    </select>
                  </label>
                </div>
                <label className="settings-checkbox">
                  <input type="checkbox" checked={appearanceDraft.compactMode} disabled={busy} onChange={(event) => setAppearanceDraft({ ...appearanceDraft, compactMode: event.target.checked })} />
                  <span><strong>{text("Compact navigation", "Kompakte Navigation")}</strong><small>{text("Show more items in the workspace sidebar.", "Zeige mehr Einträge in der Seitenleiste des Workspaces.")}</small></span>
                </label>
                <footer className="settings-card-footer">
                  <span />
                  <button
                    className="button compact primary-button"
                    disabled={busy}
                    type="button"
                    onClick={() => void persistPreferences({ ...preferences, ...appearanceDraft }, "appearance", {
                      en: "Appearance saved.",
                      de: "Design gespeichert.",
                    })}
                  >
                    {busySection === "appearance" ? text("Saving…", "Speichern…") : text("Save appearance", "Design speichern")}
                  </button>
                </footer>
              </section>
            </>
          )}

          {section === "workspace" && (
            <>
              <SettingsSectionHeader
                icon={<BookOpen size={22} />}
                title={text("Workspace preferences", "Arbeitsbereich-Präferenzen")}
                description={text("Set the language and the space Atlas opens first.", "Lege Sprache und den Bereich fest, den Atlas zuerst öffnet.")}
              />
              <section className="settings-card settings-form-card">
                <div className="settings-field-grid">
                  <label className="settings-field">
                    <span>{text("Language", "Sprache")}</span>
                    <select value={workspaceDraft.language} disabled={busy} onChange={(event) => setWorkspaceDraft({ ...workspaceDraft, language: event.target.value as Preferences["language"] })}>
                      <option value="en">English</option>
                      <option value="de">Deutsch</option>
                    </select>
                  </label>
                  <label className="settings-field">
                    <span>{text("Start space", "Startbereich")}</span>
                    <select value={workspaceDraft.defaultSpaceId || ""} disabled={busy} onChange={(event) => setWorkspaceDraft({ ...workspaceDraft, defaultSpaceId: event.target.value || null })}>
                      <option value="">{text("Automatic · first available", "Automatisch · erster verfügbarer Bereich")}</option>
                      {spaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}
                    </select>
                    <small>{text("Used when Atlas opens without a direct page or space link.", "Wird verwendet, wenn Atlas ohne direkten Seiten- oder Bereichslink geöffnet wird.")}</small>
                  </label>
                </div>
                <footer className="settings-card-footer">
                  <span />
                  <button
                    className="button compact primary-button"
                    disabled={busy}
                    type="button"
                    onClick={() => void persistPreferences({ ...preferences, ...workspaceDraft }, "workspace", {
                      en: "Workspace preferences saved.",
                      de: "Arbeitsbereich-Präferenzen gespeichert.",
                    })}
                  >
                    {busySection === "workspace" ? text("Saving…", "Speichern…") : text("Save workspace preferences", "Arbeitsbereich speichern")}
                  </button>
                </footer>
              </section>
            </>
          )}

          {section === "files" && (
            <>
              <SettingsSectionHeader
                icon={<FileCode2 size={22} />}
                title={text("File opening", "Dateien öffnen")}
                description={text("Choose the first view for each file type that offers more than one useful mode.", "Wähle die Startansicht für jeden Dateityp mit mehreren sinnvollen Ansichten.")}
              />
              <section className="settings-card settings-form-card">
                <div className="settings-card-copy">
                  <h2>{text("Default views", "Standardansichten")}</h2>
                  <p>{text("These settings apply when you next open a file. They do not change files that are already open.", "Diese Einstellungen gelten beim nächsten Öffnen einer Datei. Bereits offene Dateien bleiben unverändert.")}</p>
                </div>
                <div className="settings-file-view-list">
                  <FileViewSetting
                    title={text("Markdown", "Markdown")}
                    description={text("Open the editor or rendered preview first.", "Öffne zuerst den Editor oder die gerenderte Vorschau.")}
                    value={fileViewDraft.markdown}
                    disabled={busy}
                    options={[
                      { value: "write", label: text("Write", "Schreiben") },
                      { value: "preview", label: text("Preview", "Vorschau") },
                    ]}
                    onChange={(value) => setFileViewDraft({ ...fileViewDraft, markdown: value as FileViewDefaults["markdown"] })}
                  />
                  <FileViewSetting
                    title={text("LaTeX", "LaTeX")}
                    description={text("Open the source or rendered preview first.", "Öffne zuerst den Quelltext oder die gerenderte Vorschau.")}
                    value={fileViewDraft.latex}
                    disabled={busy}
                    options={[
                      { value: "write", label: text("Source", "Quelltext") },
                      { value: "preview", label: text("Preview", "Vorschau") },
                    ]}
                    onChange={(value) => setFileViewDraft({ ...fileViewDraft, latex: value as FileViewDefaults["latex"] })}
                  />
                  <FileViewSetting
                    title={text("Mermaid", "Mermaid")}
                    description={text("Open the rendered diagram alone or together with its source.", "Öffne das gerenderte Diagramm allein oder zusammen mit dem Quelltext.")}
                    value={fileViewDraft.mermaid}
                    disabled={busy}
                    options={[
                      { value: "diagram", label: text("Diagram", "Diagramm") },
                      { value: "source-and-diagram", label: text("Text + diagram", "Text + Diagramm") },
                    ]}
                    onChange={(value) => setFileViewDraft({ ...fileViewDraft, mermaid: value as FileViewDefaults["mermaid"] })}
                  />
                </div>
                <footer className="settings-card-footer">
                  <small>{text("Canvas, Todo, text, archived Gantt files, and uploaded files keep their available view.", "Canvas, Todo, Text, archivierte Gantt-Dateien und hochgeladene Dateien behalten ihre verfügbare Ansicht.")}</small>
                  <button
                    className="button compact primary-button"
                    disabled={busy}
                    type="button"
                    onClick={() => void persistPreferences({ ...preferences, fileViewDefaults: fileViewDraft }, "files", {
                      en: "File opening preferences saved.",
                      de: "Datei-Öffnungspräferenzen gespeichert.",
                    })}
                  >
                    {busySection === "files" ? text("Saving…", "Speichern…") : text("Save file preferences", "Datei-Präferenzen speichern")}
                  </button>
                </footer>
              </section>
            </>
          )}

          {section === "export" && (
            <>
              <SettingsSectionHeader
                icon={<Download size={22} />}
                title={text("Data & export", "Daten & Export")}
                description={text("Download a portable copy of the workspaces you can access.", "Lade eine portable Kopie der Bereiche herunter, auf die du Zugriff hast.")}
              />
              <section className="settings-card settings-export-card">
                <span className="settings-provider-icon"><Download size={22} /></span>
                <div>
                  <h2>{text("Portable workspace export", "Portabler Arbeitsbereich-Export")}</h2>
                  <p>{text("The export contains current documents, referenced images, and canvases. It does not include document history, accounts, or permissions.", "Der Export enthält aktuelle Dokumente, referenzierte Bilder und Canvas-Dateien. Dokumenthistorie, Konten und Rechte sind nicht enthalten.")}</p>
                  <a className="button compact secondary-button" href="/api/backups/export?scope=accessible" onClick={() => setNotice(text("Portable export started.", "Portabler Export gestartet."))}>
                    <Download size={15} /> {text("Export my accessible spaces", "Meine sichtbaren Bereiche exportieren")}
                  </a>
                </div>
              </section>
              {user.role === "ADMIN" && (
                <section className="settings-card settings-export-card">
                  <span className="settings-provider-icon"><ShieldCheck size={22} /></span>
                  <div>
                    <h2>{text("Administrator export", "Administrator-Export")}</h2>
                    <p>{text("Administrators may also download the complete portable instance export.", "Administratoren können zusätzlich den vollständigen portablen Instanz-Export herunterladen.")}</p>
                    <div className="settings-inline-actions">
                      <a className="button compact secondary-button" href="/api/backups/export?scope=instance" onClick={() => setNotice(text("Complete instance export started.", "Kompletter Instanz-Export gestartet."))}>
                        <Download size={15} /> {text("Export complete instance", "Komplette Instanz exportieren")}
                      </a>
                      <Link className="button compact secondary-button" href="/admin/dashboard"><ChartNoAxesCombined size={15} /> {text("Open instance dashboard", "Instanz-Dashboard öffnen")}</Link>
                      <Link className="button compact secondary-button" href="/admin/users"><ShieldCheck size={15} /> {text("Manage users", "Benutzer verwalten")}</Link>
                      <Link className="button compact secondary-button" href="/admin/teams"><Users size={15} /> {text("Manage teams", "Teams verwalten")}</Link>
                    </div>
                  </div>
                </section>
              )}
            </>
          )}

          {error && <p className="settings-feedback settings-error" role="alert">{error}</p>}
          {notice && <p className="settings-feedback settings-notice-page" role="status">{notice}</p>}
        </div>
      </section>
    </main>
  );
}

function SettingsSectionHeader({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <header className="settings-section-header">
      <span>{icon}</span>
      <div><h1>{title}</h1><p>{description}</p></div>
    </header>
  );
}

function SettingsNavGroup({ label, children }: { label: string; children: ReactNode }) {
  return <section className="settings-nav-group"><p>{label}</p>{children}</section>;
}

function SettingsNavButton({
  active,
  icon,
  children,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
}) {
  return <button className={"settings-nav-item" + (active ? " active" : "")} type="button" aria-current={active ? "page" : undefined} onClick={onClick}>{icon}<span>{children}</span></button>;
}

function SettingsNavLink({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  return <Link className="settings-nav-item" href={href}>{icon}<span>{children}</span></Link>;
}

function FileViewSetting({
  title,
  description,
  value,
  options,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  value: string;
  options: { value: string; label: string }[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="settings-file-view">
      <span><strong>{title}</strong><small>{description}</small></span>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}
