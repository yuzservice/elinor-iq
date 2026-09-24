import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Button, Input } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { ApiError } from "../services/api";

export function LoginPage() {
  const { user, ready, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  if (ready && user) return <Navigate to="/" replace />;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextUsername = String(form.get("username") || username).trim();
    const nextPassword = String(form.get("password") || password);
    setUsername(nextUsername);
    setPassword(nextPassword);
    setPending(true);
    setError("");
    try {
      await login(nextUsername, nextPassword);
      navigate("/");
    } catch (caught) {
      setError(caught instanceof ApiError && caught.message ? caught.message : "نام کاربری یا رمز عبور نادرست است.");
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-[420px] rounded-[24px] bg-surface p-8 shadow-soft">
        <div className="text-[11px] font-semibold tracking-brand text-accent">ELINOR</div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">ورود به هوش خرده‌فروشی</h1>
        <p className="mt-3 text-sm leading-7 text-muted">
          فضای آرام مدیریت الینور. فقط برای تیم داخلی.
        </p>
        <form onSubmit={onSubmit} className="mt-10 space-y-4">
          <Input
            autoFocus
            name="username"
            autoComplete="username"
            placeholder="نام کاربری"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <Input
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder="رمز عبور"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error ? <div className="text-sm text-rose">{error}</div> : null}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "در حال ورود..." : "ورود"}
          </Button>
        </form>
      </div>
    </div>
  );
}
