-- Migration 002: login lockout columns, append-only audit log, user protection triggers.
-- Never edit this file after release; add 003+.

ALTER TABLE users ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0);
ALTER TABLE users ADD COLUMN locked_until    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN last_failed_at  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN last_login_at   TEXT;
ALTER TABLE users ADD COLUMN must_change_pin INTEGER NOT NULL DEFAULT 0 CHECK (must_change_pin IN (0, 1));

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only: UPDATE is not allowed'); END;
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only: DELETE is not allowed'); END;
CREATE TRIGGER users_no_delete BEFORE DELETE ON users
BEGIN SELECT RAISE(ABORT, 'users cannot be deleted: deactivate instead'); END;
CREATE TRIGGER users_first_is_owner BEFORE INSERT ON users
WHEN (SELECT COUNT(*) FROM users) = 0 AND NEW.role <> 'owner'
BEGIN SELECT RAISE(ABORT, 'the first user must be an owner'); END;
CREATE TRIGGER users_keep_one_owner BEFORE UPDATE OF role, active ON users
WHEN OLD.role = 'owner' AND OLD.active = 1
 AND (NEW.role <> 'owner' OR NEW.active = 0)
 AND (SELECT COUNT(*) FROM users WHERE role = 'owner' AND active = 1 AND id <> OLD.id) = 0
BEGIN SELECT RAISE(ABORT, 'at least one active owner is required'); END;
