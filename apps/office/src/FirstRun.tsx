import { useRef, useState } from "react";
import {
  Banner,
  Button,
  FormGrid,
  PinField,
  TextField,
  beep,
  fieldMessage,
  plainMessage,
  toAppError,
  useInitialFocus,
  type SessionInfo,
} from "@gokul/ui";
import { useApi } from "./apiContext";

export interface FirstRunProps {
  onCreated: (result: { recoveryCode: string; session: SessionInfo }) => void;
  /** Another PC/app created the owner meanwhile: start the checks again. */
  onAlreadySetup: () => void;
}

type Errors = Partial<Record<"shopName" | "name" | "pin" | "confirm", string>>;

export function FirstRun({ onCreated, onAlreadySetup }: FirstRunProps) {
  const api = useApi();
  const [shopName, setShopName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const shopRef = useRef<HTMLInputElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const pinRef = useRef<HTMLInputElement | null>(null);
  useInitialFocus(() => shopRef.current);

  const submit = async () => {
    if (busy.current) return;
    if (pin !== confirm) {
      setErrors({ confirm: "The two PINs do not match. Type them again." });
      setPin("");
      setConfirm("");
      beep();
      pinRef.current?.focus();
      return;
    }
    busy.current = true;
    setSaving(true);
    setErrors({});
    setGeneral(null);
    try {
      const result = await api.setupOwner(shopName, ownerName, pin);
      onCreated(result);
    } catch (raw) {
      const err = toAppError(raw);
      if (err.code === "ALREADY_SETUP") {
        onAlreadySetup();
        return;
      }
      const next: Errors = {};
      const shopMsg = fieldMessage(err, "shopName");
      const nameMsg = fieldMessage(err, "name");
      const pinMsg = fieldMessage(err, "pin");
      if (shopMsg) next.shopName = shopMsg;
      if (nameMsg) next.name = nameMsg;
      if (pinMsg) next.pin = pinMsg;
      if (shopMsg || nameMsg || pinMsg) {
        setErrors(next);
        if (pinMsg && !shopMsg && !nameMsg) {
          setPin("");
          setConfirm("");
          pinRef.current?.focus();
        } else if (shopMsg) shopRef.current?.focus();
        else nameRef.current?.focus();
      } else {
        setGeneral(
          err.code === "INTERNAL" || err.code === "DB_BUSY"
            ? "Could not save the owner. Nothing was saved. Press Enter to try again."
            : plainMessage(err),
        );
      }
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="gk-center">
      <h1 className="gk-content-title">Welcome to Gokul Office</h1>
      <p>This computer has no users yet. Create the owner account first.</p>
      <p className="gk-muted">The owner can change shop settings and add staff.</p>
      {general ? <Banner kind="error">{general}</Banner> : null}
      <FormGrid onLast={() => void submit()}>
        <TextField
          label="Shop name"
          name="shopName"
          value={shopName}
          onChange={setShopName}
          error={errors.shopName}
          readOnly={saving}
          inputRef={shopRef}
          maxLength={40}
          required
        />
        <TextField
          label="Owner name"
          name="ownerName"
          value={ownerName}
          onChange={setOwnerName}
          error={errors.name}
          readOnly={saving}
          inputRef={nameRef}
          maxLength={40}
          required
        />
        <PinField
          label="PIN (6 digits)"
          name="pin"
          stacked={false}
          value={pin}
          onChange={setPin}
          readOnly={saving}
          error={errors.pin}
          inputRef={pinRef}
        />
        <PinField
          label="Confirm PIN"
          name="confirmPin"
          stacked={false}
          value={confirm}
          onChange={setConfirm}
          readOnly={saving}
          error={errors.confirm}
        />
      </FormGrid>
      <div className="gk-actions">
        <Button
          label={saving ? "Creating..." : "Create owner"}
          keyHint="Enter"
          variant="primary"
          onClick={() => void submit()}
        />
      </div>
      <p className="gk-hint">
        Keep this PIN secret. Write it down and keep it in a safe place. You will also get a recovery code on the next
        screen.
      </p>
    </div>
  );
}
