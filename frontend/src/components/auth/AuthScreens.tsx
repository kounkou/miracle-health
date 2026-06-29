import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

const IconMail = () => (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m2 7 10 7 10-7" />
    </svg>
);

const IconLock = () => (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
);

const IconCheck = () => (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M20 6 9 17l-5-5" />
    </svg>
);

const IconArrow = () => (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
);

function Input({ icon, ...props }: { icon: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <div className="input-wrap">
            <span className="input-icon">{icon}</span>
            <input {...props} />
        </div>
    );
}

function PasswordInput({
    icon,
    visible,
    onToggleVisibility,
    ...props
}: {
    icon: React.ReactNode;
    visible: boolean;
    onToggleVisibility: () => void;
} & React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <div className="input-wrap password-wrap">
            <span className="input-icon">{icon}</span>
            <input {...props} type={visible ? "text" : "password"} />
            <button
                type="button"
                className="password-toggle"
                onClick={onToggleVisibility}
                aria-label={visible ? "Hide password" : "Show password"}
                aria-pressed={visible}
            >
                {visible ? "Hide" : "Show"}
            </button>
        </div>
    );
}

export function RegisterForm({ onSwitch, onSuccess }: { onSwitch: () => void; onSuccess: (email: string) => void }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [passwordConfirm, setPasswordConfirm] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError("");

        if (password !== passwordConfirm) {
            setError("Passwords do not match");
            setLoading(false);
            return;
        }

        try {
            await apiFetch("/register", {
                method: "POST",
                body: JSON.stringify({ email, password }),
            });
            onSuccess(email);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="card animate-in">
            <div className="card-header">
                <div className="logo-mark"></div>
                <h1>Create account</h1>
                <p>Start your journey. We'll send a confirmation email.</p>
            </div>

            <form onSubmit={submit}>
                <Input
                    icon={<IconMail />}
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoFocus
                />
                <Input
                    icon={<IconLock />}
                    type="password"
                    placeholder="Password (min 6 chars)"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                />
                <Input
                    icon={<IconLock />}
                    type="password"
                    placeholder="Confirm password"
                    value={passwordConfirm}
                    onChange={e => setPasswordConfirm(e.target.value)}
                    required
                />

                {error && <div className="alert alert-error">{error}</div>}

                <button type="submit" className="btn-primary" disabled={loading}>
                    {loading ? <span className="spinner" /> : <>Create account <IconArrow /></>}
                </button>
            </form>

            <p className="switch-text">
                Already have an account?{" "}
                <button className="link-btn" onClick={onSwitch}>Sign in</button>
            </p>
        </div>
    );
}

export function LoginForm({ onSwitch, onLogin }: { onSwitch: () => void; onLogin: (token: string, email: string, expiresAt?: string, isAdmin?: boolean) => void }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError("");
        try {
            const data = await apiFetch("/login", {
                method: "POST",
                body: JSON.stringify({ email, password }),
            });
            onLogin(data.token, data.email, data.expiresAt, data.isAdmin === true);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="card animate-in">
            <div className="card-header">
                <div className="logo-mark"></div>
                <h1>Welcome back</h1>
                <p>Sign in to continue.</p>
            </div>

            <form onSubmit={submit}>
                <Input
                    icon={<IconMail />}
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoFocus
                />
                <PasswordInput
                    icon={"🔒"}
                    placeholder="Your password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    visible={showPassword}
                    onToggleVisibility={() => setShowPassword((prev) => !prev)}
                    required
                />

                {error && <div className="alert alert-error">{error}</div>}

                <button type="submit" className="btn-primary" disabled={loading}>
                    {loading ? <span className="spinner" /> : <>Sign in <IconArrow /></>}
                </button>
            </form>

            {/* <p className="switch-text">
                No account?{" "}
                <button className="link-btn" onClick={onSwitch}>Register</button>
            </p> */}
        </div>
    );
}

export function EmailSentScreen({ email, onBackToLogin }: { email: string; onBackToLogin: () => void }) {
    return (
        <div className="card animate-in">
            <div className="card-header">
                <div className="success-icon"><IconCheck /></div>
                <h1>Check your inbox</h1>
                <p>
                    We sent a confirmation link to <strong>{email}</strong>.
                    Click it to activate your account.
                </p>
            </div>

            <div className="dev-note">
                <strong>Running locally?</strong> The confirmation link is printed to
                the Go server console (no SMTP needed in dev mode).
            </div>

            <button className="btn-secondary" onClick={onBackToLogin}>
                Back to sign in
            </button>
        </div>
    );
}

export function ConfirmScreen({ token, onDone }: { token: string; onDone: () => void }) {
    const [status, setStatus] = useState("loading");
    const [msg, setMsg] = useState("");

    useEffect(() => {
        apiFetch(`/confirm?token=${token}`)
            .then((d) => {
                setStatus("success");
                setMsg(d.message);
            })
            .catch((e) => {
                setStatus("error");
                setMsg(e.message);
            });
    }, [token]);

    return (
        <div className="card animate-in">
            <div className="card-header">
                {status === "loading" && <><div className="spinner large" /><h1>Confirming...</h1></>}
                {status === "success" && <><div className="success-icon"><IconCheck /></div><h1>Email confirmed!</h1><p>{msg}</p></>}
                {status === "error" && <><div className="logo-mark error">x</div><h1>Oops</h1><p>{msg}</p></>}
            </div>
            {status !== "loading" && (
                <button className="btn-primary" onClick={onDone}>
                    Go to sign in <IconArrow />
                </button>
            )}
        </div>
    );
}
