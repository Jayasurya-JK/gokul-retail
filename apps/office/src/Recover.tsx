import { useEffect, useMemo, useRef, useState } from "react";
import {
  Banner,
  Button,
  FormGrid,
  LAYER,
  LockedNotice,
  PinField,
  TextField,
  beep,
  fieldMessage,
  backendMessage,
  toAppError,
  useInitialFocus,
  useKeymap,
  type Binding,
} from "@gokul/ui";
import { useApi } from "./apiContext";

export interface RecoverProps {
  /** `newCode` is the replacement recovery code (shown once). */
  onRecovered: (newCode: string) => void;
  onBack: () => void;
}

/** Owner forgot the PIN: recovery code + new PIN. Same lock-out rules apply in Rust. */
export function Recover({ onRecovered, onBack }: RecoverProps) {
  const api = useApi();
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ code?: string; pin?: string; confirm?: string }>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lockSecs, setLockSecs] = useState<number | null>(null);
  const busy = useRef(false);
  const wasLocked = useRef(false);
  const codeRef = useRef<HTMLInputElement | null>(null);
  const pinRef = useRef<HTMLInputElement | null>(null);
  useInitialFocus(() => codeRef.current);
  useEffect(() => {
    // The lock ended: the cursor goes back to the code box.
    if (lockSecs === null && wasLocked.current) codeRef.current?.focus();
    wasLocked.current = lockSecs !== null;
  }, [lockSecs]);

  const keys = useMemo<Binding[]>(
    () => [
      { keys: ["Enter"], label: "Next / Reset PIN" },
      { keys: ["Esc"], label: "Back to sign in", run: onBack },
    ],
    [onBack],
  );
  useKeymap(keys, { layer: LAYER.screen });

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
      const result = await api.recoverOwnerPin(code.replace(/[\s-]/g, ""), pin);
      onRecovered(result.recoveryCode);
    } catch (raw) {
      const err = toAppError(raw);
      const pinMsg = fieldMessage(err, "newPin") ?? fieldMessage(err, "pin");
      if (pinMsg) {
        setErrors({ pin: pinMsg });
        setPin("");
        setConfirm("");
        pinRef.current?.focus();
      } else {
        if (err.code === "LOCKED") {
          setCode("");
          setLockSecs(err.secondsLeft ?? 30);
          beep();
        } else if (err.code === "WRONG_PIN") {
          const n = err.attemptsBeforeLock;
          setGeneral(typeof n === "number" ? `Wrong recovery code. ${n} ${n === 1 ? "try" : "tries"} left.` : "Wrong recovery code.");
          setCode("");
          beep();
          codeRef.current?.focus();
        } else {
          setGeneral(backendMessage(err));
        }
      }
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="gk-center">
      <h1 className="gk-content-title">Forgot the owner PIN</h1>
      <p>Type the 16-character recovery code that was written down when Gokul Office was first set up.</p>
      {general ? <Banner kind="error">{general}</Banner> : null}
      {lockSecs !== null ? (
        <LockedNotice
          key={lockSecs}
          userName="The owner"
          what="recovery codes"
          advice="Wait, then try again."
          seconds={lockSecs}
          onDone={() => {
            setLockSecs(null);
          }}
        />
      ) : null}
      <FormGrid onLast={() => void submit()}>
        <TextField
          label="Recovery code"
          name="recoveryCode"
          value={code}
          onChange={setCode}
          transform="upper"
          error={errors.code}
          readOnly={saving}
          inputRef={codeRef}
          hint="Dashes and spaces are ignored."
          required
        />
        <PinField
          label="New PIN"
          name="newPin"
          stacked={false}
          value={pin}
          onChange={setPin}
          readOnly={saving}
          error={errors.pin}
          inputRef={pinRef}
        />
        <PinField
          label="Confirm new PIN"
          name="confirmPin"
          stacked={false}
          value={confirm}
          onChange={setConfirm}
          readOnly={saving}
          error={errors.confirm}
        />
      </FormGrid>
      <div className="gk-actions">
        <Button label={saving ? "Checking..." : "Reset PIN"} keyHint="Enter" variant="primary" onClick={() => void submit()} />
      </div>
    </div>
  );
}
