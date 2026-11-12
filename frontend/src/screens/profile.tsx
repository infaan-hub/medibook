/**
 * PHASE 5 — Profile screens (§54).
 *
 * ProfileScreen — account details, edit name/phone, change password, sign out.
 */

import { useCallback, useEffect, useState, useRef, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { changePassword, updateMe, uploadProfileImage, removeProfileImage } from "../api/auth";
import { getPatientProfile, updatePatientProfile } from "../api/patients";
import type { GeoInput } from "../api/types";
import { ApiError } from "../api/client";
import { captureFix, LocationError, type CapturedFix } from "../lib/location";
import { useSession, useToast } from "../state/app-context";
import { Button, Card, TextField } from "../components/ui";
import { LocationLine } from "../components/Location";
import { NotificationSettings } from "../components/NotificationSettings";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { Crosshair } from "lucide-react";

function fieldErrors(error: unknown): Record<string, string> {
  if (error instanceof ApiError) {
    return Object.fromEntries(
      Object.entries(error.errors).map(([field, messages]) => [
        field,
        messages[0] ?? "Invalid value.",
      ])
    );
  }
  return {};
}

export function ProfileScreen() {
  const { t } = useTranslation();
  const { user, setUser, logout } = useSession();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [name, setName] = useState({
    first_name: user?.first_name ?? "",
    last_name: user?.last_name ?? "",
    phone: user?.phone ?? "",
  });
  const [nameErrors, setNameErrors] = useState<Record<string, string>>({});
  const [savingName, setSavingName] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // A stored photo whose bytes fail to load (deleted media, offline) must
  // degrade to initials — a broken-image icon is never the fallback.
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // Local blob preview: tracked in a ref as well so the object URL is always
  // released (new selection, success, failure, removal, unmount) — a leaked
  // blob URL keeps the file bytes alive for the lifetime of the document.
  const previewUrlRef = useRef<string | null>(null);
  const setPreview = (url: string | null) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = url;
    setPreviewUrl(url);
  };
  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    []
  );

  const [passwords, setPasswords] = useState({
    old_password: "",
    new_password: "",
    new_password_confirm: "",
  });
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({});
  const [savingPw, setSavingPw] = useState(false);

  // Patient-only: the saved position powers the "near me" prefill on Find a
  // doctor. Doctors manage their practice location on their own card screen.
  const [geo, setGeo] = useState<GeoInput>({ latitude: null, longitude: null, location_accuracy: null });
  const [locErrors, setLocErrors] = useState<Record<string, string>>({});
  const [geoError, setGeoError] = useState<string | null>(null);
  const [savingLoc, setSavingLoc] = useState(false);
  useEffect(() => {
    if (user?.role !== "patient") return;
    getPatientProfile()
      .then((response) =>
        setGeo({
          latitude: response.data.latitude,
          longitude: response.data.longitude,
          location_accuracy: response.data.location_accuracy,
        })
      )
      .catch(() => {});
  }, [user?.role]);

  if (!user) return null; // guarded by RequireSession

  async function onSaveName(event: FormEvent) {
    event.preventDefault();
    setNameErrors({});
    setSavingName(true);
    try {
      const envelope = await updateMe({
        first_name: name.first_name.trim(),
        last_name: name.last_name.trim(),
        phone: name.phone.trim(),
      });
      setUser(envelope.data);
      notify("success", t("profile.profileUpdated"));
    } catch (error) {
      const fields = fieldErrors(error);
      setNameErrors(fields);
      if (!Object.keys(fields).length) notify("error", t("profile.couldNotUpdateProfile"));
    } finally {
      setSavingName(false);
    }
  }

  /** One action: grab a fresh GPS fix and persist it as the patient's location. */
  async function onSaveLocation(event: FormEvent) {
    event.preventDefault();
    setLocErrors({});
    setGeoError(null);
    setSavingLoc(true);
    let fix: CapturedFix;
    try {
      fix = await captureFix();
    } catch (reason) {
      setGeoError(
        reason instanceof LocationError ? reason.message : t("profile.couldNotReadLocation")
      );
      setSavingLoc(false);
      return;
    }
    try {
      const envelope = await updatePatientProfile({
        latitude: fix.latitude,
        longitude: fix.longitude,
        location_accuracy: fix.accuracy,
      });
      setGeo({
        latitude: envelope.data.latitude,
        longitude: envelope.data.longitude,
        location_accuracy: envelope.data.location_accuracy,
      });
      notify("success", t("profile.locationSaved"));
    } catch (error) {
      const fields = fieldErrors(error);
      setLocErrors(fields);
      if (!Object.keys(fields).length) notify("error", t("profile.couldNotSaveLocation"));
    } finally {
      setSavingLoc(false);
    }
  }

  async function onClearLocation() {
    setSavingLoc(true);
    setGeoError(null);
    try {
      await updatePatientProfile({ latitude: null, longitude: null, location_accuracy: null });
      setGeo({ latitude: null, longitude: null, location_accuracy: null });
      notify("info", t("profile.locationCleared"));
    } catch (error) {
      notify("error", fieldErrors(error).latitude ?? t("profile.couldNotClearLocation"));
    } finally {
      setSavingLoc(false);
    }
  }

  async function onChangePassword(event: FormEvent) {
    event.preventDefault();
    setPwErrors({});
    if (passwords.new_password !== passwords.new_password_confirm) {
      setPwErrors({ new_password_confirm: t("profile.passwordsDoNotMatch") });
      return;
    }
    setSavingPw(true);
    try {
      await changePassword({
        old_password: passwords.old_password,
        new_password: passwords.new_password,
        new_password_confirm: passwords.new_password_confirm,
      });
      setPasswords({ old_password: "", new_password: "", new_password_confirm: "" });
      notify("success", t("profile.passwordUpdated"));
    } catch (error) {
      const fields = fieldErrors(error);
      setPwErrors(fields);
      if (!Object.keys(fields).length) notify("error", t("profile.couldNotChangePassword"));
    } finally {
      setSavingPw(false);
    }
  }

  const onLogout = useCallback(async () => {
    await logout();
    notify("info", t("profile.signedOut"));
    // Sign-out always → login (guest-only). Tokens are cleared so a refresh
    // cannot restore another role's session.
    navigate("/login", { replace: true });
  }, [logout, notify, navigate, t]);

  function onFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      notify("error", t("profile.selectImageFile"));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      notify("error", t("profile.imageTooLarge"));
      return;
    }
    setPreview(URL.createObjectURL(file));
    uploadImage(file);
  }

  async function uploadImage(file: File) {
    setUploading(true);
    try {
      const envelope = await uploadProfileImage(file);
      // Success → drop the local blob and render the canonical /media/{id}.
      setPreview(null);
      setUser(envelope.data);
      notify("success", t("profile.pictureUpdated"));
    } catch {
      setPreview(null);
      notify("error", t("profile.couldNotUploadPicture"));
    } finally {
      setUploading(false);
    }
  }

  function onRemoveImage() {
    setPreview(null);
    setUploading(true);
    removeProfileImage()
      .then((envelope) => {
        setUser(envelope.data);
        notify("success", t("profile.pictureRemoved"));
      })
      .catch(() => notify("error", t("profile.couldNotRemovePicture")))
      .finally(() => setUploading(false));
  }

  const storedPhoto =
    user.profile_image && user.profile_image !== brokenSrc ? user.profile_image : null;
  const shownPhoto = previewUrl || storedPhoto;

  return (
    <div className="page">
      <h1 className="page__title">{t("profile.title")}</h1>
      <p className="page__subtitle">{t("profile.subtitle")}</p>

      <Card>
        <div className="profile-hero">
          <div className="profile-hero__avatar-wrap">
            <div className="profile-hero__avatar" onClick={() => !uploading && fileInputRef.current?.click()}>
              {shownPhoto ? (
                <img
                  src={shownPhoto}
                  alt={[user.first_name, user.last_name].filter(Boolean).join(" ")}
                  className="profile-hero__img"
                  onError={() => setBrokenSrc(shownPhoto)}
                />
              ) : (
                <span className="profile-hero__initials">
                  {(() => {
                    const first = user.first_name.trim()[0] ?? "";
                    const last = user.last_name.trim()[0] ?? "";
                    return (first + last).toUpperCase() || user.email[0].toUpperCase();
                  })()}
                </span>
              )}
              <div className="profile-hero__overlay">
                {uploading ? t("profile.uploading") : t("profile.changePhoto")}
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={onFileSelect}
            />
            {(user.profile_image || previewUrl) && !uploading && (
              <button
                type="button"
                className="profile-hero__remove"
                onClick={onRemoveImage}
                aria-label={t("profile.removeProfilePicture")}
              >
                {t("profile.remove")}
              </button>
            )}
          </div>
          <div className="profile-hero__info">
            <h2 className="profile-hero__name">
              {[user.first_name, user.last_name].filter(Boolean).join(" ") || user.email}
            </h2>
            <p className="profile-hero__email">{user.email}</p>
            <span className={`role-pill role-pill--${user.role}`}>{t(`roles.${user.role}`)}</span>
          </div>
        </div>
      </Card>

      <LanguageSwitcher variant="card" />

      <Card>
        <h2 className="card__title">{t("profile.personalDetails")}</h2>
        <form className="form" onSubmit={onSaveName} noValidate>
          <div className="form__row">
            <TextField
              id="prof-first"
              label={t("profile.firstName")}
              autoComplete="given-name"
              value={name.first_name}
              error={nameErrors.first_name}
              onChange={(e) => setName({ ...name, first_name: e.target.value })}
            />
            <TextField
              id="prof-last"
              label={t("profile.lastName")}
              autoComplete="family-name"
              value={name.last_name}
              error={nameErrors.last_name}
              onChange={(e) => setName({ ...name, last_name: e.target.value })}
            />
          </div>
          <TextField
            id="prof-phone"
            label={t("profile.phone")}
            type="tel"
            autoComplete="tel"
            value={name.phone}
            error={nameErrors.phone}
            onChange={(e) => setName({ ...name, phone: e.target.value })}
          />
          <Button type="submit" loading={savingName}>
            {t("profile.saveDetails")}
          </Button>
        </form>
      </Card>

      {user.role === "patient" && (
        <Card>
          <h2 className="card__title">{t("profile.location")}</h2>
          <p className="page__subtitle">
            {t("profile.locationHint")}
          </p>
          <form className="form" onSubmit={onSaveLocation} noValidate>
            <p className="doctor-profile__location">
              <LocationLine point={geo} accuracy={geo.location_accuracy} />
            </p>
            {geoError && <p className="field__error" role="alert">{geoError}</p>}
            {Object.entries(locErrors).map(([field, msg]) => (
              <p className="field__error" key={field} role="alert">{msg}</p>
            ))}
            <div className="prompt__actions-row">
              <Button type="submit" loading={savingLoc}>
                <Crosshair size={14} /> {geo.latitude != null ? t("profile.updateMyLocation") : t("profile.shareMyLocation")}
              </Button>
              {geo.latitude != null && (
                <Button type="button" variant="ghost" onClick={() => void onClearLocation()}>
                  {t("profile.clear")}
                </Button>
              )}
            </div>
          </form>
        </Card>
      )}

      <NotificationSettings userId={user.id} />

      <Card>
        <h2 className="card__title">{t("profile.changePassword")}</h2>
        <form className="form" onSubmit={onChangePassword} noValidate>
          <TextField
            id="pw-old"
            label={t("profile.currentPassword")}
            type="password"
            autoComplete="current-password"
            required
            value={passwords.old_password}
            error={pwErrors.old_password}
            onChange={(e) => setPasswords({ ...passwords, old_password: e.target.value })}
          />
          <div className="form__row">
            <TextField
              id="pw-new"
              label={t("profile.newPassword")}
              type="password"
              autoComplete="new-password"
              required
              value={passwords.new_password}
              error={pwErrors.new_password}
              onChange={(e) => setPasswords({ ...passwords, new_password: e.target.value })}
            />
            <TextField
              id="pw-confirm"
              label={t("profile.confirmNewPassword")}
              type="password"
              autoComplete="new-password"
              required
              value={passwords.new_password_confirm}
              error={pwErrors.new_password_confirm}
              onChange={(e) => setPasswords({ ...passwords, new_password_confirm: e.target.value })}
            />
          </div>
          <Button type="submit" loading={savingPw}>
            {t("profile.updatePassword")}
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="card__title">{t("profile.account")}</h2>
        <Button variant="danger" onClick={onLogout}>
          {t("profile.signOut")}
        </Button>
      </Card>
    </div>
  );
}