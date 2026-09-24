/**
 * PHASE 5 — Profile screens (§54).
 *
 * ProfileScreen — account details, edit name/phone, change password, sign out.
 */

import { useCallback, useEffect, useState, useRef, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { changePassword, updateMe, uploadProfileImage, removeProfileImage } from "../api/auth";
import { getPatientProfile, updatePatientProfile } from "../api/patients";
import { ApiError } from "../api/client";
import { useSession, useToast } from "../state/app-context";
import { Button, Card, TextField } from "../components/ui";

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
  const [uploading, setUploading] = useState(false);

  const [passwords, setPasswords] = useState({
    old_password: "",
    new_password: "",
    new_password_confirm: "",
  });
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({});
  const [savingPw, setSavingPw] = useState(false);

  // Patient-only: the saved location powers the nearby-doctor prefill on
  // Find a doctor. Doctors manage their location on their own card screen.
  const [location, setLocation] = useState({ city: "", address: "" });
  const [locErrors, setLocErrors] = useState<Record<string, string>>({});
  const [savingLoc, setSavingLoc] = useState(false);
  useEffect(() => {
    if (user?.role !== "patient") return;
    getPatientProfile()
      .then((response) => setLocation({ city: response.data.city ?? "", address: response.data.address ?? "" }))
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
      notify("success", "Profile updated.");
    } catch (error) {
      const fields = fieldErrors(error);
      setNameErrors(fields);
      if (!Object.keys(fields).length) notify("error", "Could not update profile.");
    } finally {
      setSavingName(false);
    }
  }

  async function onSaveLocation(event: FormEvent) {
    event.preventDefault();
    setLocErrors({});
    setSavingLoc(true);
    try {
      const envelope = await updatePatientProfile({
        city: location.city.trim(),
        address: location.address.trim(),
      });
      setLocation({ city: envelope.data.city ?? "", address: envelope.data.address ?? "" });
      notify("success", "Location saved — nearby doctors surface first on Find a doctor.");
    } catch (error) {
      const fields = fieldErrors(error);
      setLocErrors(fields);
      if (!Object.keys(fields).length) notify("error", "Could not save your location.");
    } finally {
      setSavingLoc(false);
    }
  }

  async function onChangePassword(event: FormEvent) {
    event.preventDefault();
    setPwErrors({});
    if (passwords.new_password !== passwords.new_password_confirm) {
      setPwErrors({ new_password_confirm: "Passwords do not match." });
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
      notify("success", "Password updated.");
    } catch (error) {
      const fields = fieldErrors(error);
      setPwErrors(fields);
      if (!Object.keys(fields).length) notify("error", "Could not change password.");
    } finally {
      setSavingPw(false);
    }
  }

  const onLogout = useCallback(async () => {
    await logout();
    notify("info", "Signed out.");
    // Sign-out always → login (guest-only). Tokens are cleared so a refresh
    // cannot restore another role's session.
    navigate("/login", { replace: true });
  }, [logout, notify, navigate]);

  function onFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      notify("error", "Please select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      notify("error", "Image must be under 5 MB.");
      return;
    }
    setPreviewUrl(URL.createObjectURL(file));
    uploadImage(file);
  }

  async function uploadImage(file: File) {
    setUploading(true);
    try {
      const envelope = await uploadProfileImage(file);
      setUser(envelope.data);
      notify("success", "Profile picture updated.");
    } catch {
      setPreviewUrl(null);
      notify("error", "Could not upload profile picture.");
    } finally {
      setUploading(false);
    }
  }

  function onRemoveImage() {
    setPreviewUrl(null);
    setUploading(true);
    removeProfileImage()
      .then((envelope) => {
        setUser(envelope.data);
        notify("success", "Profile picture removed.");
      })
      .catch(() => notify("error", "Could not remove profile picture."))
      .finally(() => setUploading(false));
  }

  return (
    <div className="page">
      <h1 className="page__title">Profile</h1>
      <p className="page__subtitle">Account settings and security.</p>

      <Card>
        <div className="profile-hero">
          <div className="profile-hero__avatar-wrap">
            <div className="profile-hero__avatar" onClick={() => !uploading && fileInputRef.current?.click()}>
              {previewUrl || user.profile_image ? (
                <img
                  src={previewUrl || user.profile_image!}
                  alt={[user.first_name, user.last_name].filter(Boolean).join(" ")}
                  className="profile-hero__img"
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
                {uploading ? "Uploading…" : "Change photo"}
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
                aria-label="Remove profile picture"
              >
                Remove
              </button>
            )}
          </div>
          <div className="profile-hero__info">
            <h2 className="profile-hero__name">
              {[user.first_name, user.last_name].filter(Boolean).join(" ") || user.email}
            </h2>
            <p className="profile-hero__email">{user.email}</p>
            <span className={`role-pill role-pill--${user.role}`}>{user.role}</span>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="card__title">Personal details</h2>
        <form className="form" onSubmit={onSaveName} noValidate>
          <div className="form__row">
            <TextField
              id="prof-first"
              label="First name"
              autoComplete="given-name"
              value={name.first_name}
              error={nameErrors.first_name}
              onChange={(e) => setName({ ...name, first_name: e.target.value })}
            />
            <TextField
              id="prof-last"
              label="Last name"
              autoComplete="family-name"
              value={name.last_name}
              error={nameErrors.last_name}
              onChange={(e) => setName({ ...name, last_name: e.target.value })}
            />
          </div>
          <TextField
            id="prof-phone"
            label="Phone"
            type="tel"
            autoComplete="tel"
            value={name.phone}
            error={nameErrors.phone}
            onChange={(e) => setName({ ...name, phone: e.target.value })}
          />
          <Button type="submit" loading={savingName}>
            Save details
          </Button>
        </form>
      </Card>

      {user.role === "patient" && (
        <Card>
          <h2 className="card__title">Location &amp; address</h2>
          <p className="page__subtitle">Used to surface nearby doctors first on Find a doctor.</p>
          <form className="form" onSubmit={onSaveLocation} noValidate>
            <TextField
              id="prof-city"
              label="City / area"
              autoComplete="address-level2"
              value={location.city}
              error={locErrors.city}
              onChange={(e) => setLocation({ ...location, city: e.target.value })}
            />
            <TextField
              id="prof-address"
              label="Address"
              autoComplete="street-address"
              value={location.address}
              error={locErrors.address}
              onChange={(e) => setLocation({ ...location, address: e.target.value })}
            />
            <Button type="submit" loading={savingLoc}>
              Save location
            </Button>
          </form>
        </Card>
      )}

      <Card>
        <h2 className="card__title">Change password</h2>
        <form className="form" onSubmit={onChangePassword} noValidate>
          <TextField
            id="pw-old"
            label="Current password"
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
              label="New password"
              type="password"
              autoComplete="new-password"
              required
              value={passwords.new_password}
              error={pwErrors.new_password}
              onChange={(e) => setPasswords({ ...passwords, new_password: e.target.value })}
            />
            <TextField
              id="pw-confirm"
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              required
              value={passwords.new_password_confirm}
              error={pwErrors.new_password_confirm}
              onChange={(e) => setPasswords({ ...passwords, new_password_confirm: e.target.value })}
            />
          </div>
          <Button type="submit" loading={savingPw}>
            Update password
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="card__title">Account</h2>
        <Button variant="danger" onClick={onLogout}>
          Sign out
        </Button>
      </Card>
    </div>
  );
}