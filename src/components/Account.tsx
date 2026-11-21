// Account UI: header button / menu, sign-in dialog and the "my robots" list.
// Works against services/accountApi (today the in-browser demo backend).
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { useT } from "../i18n/useT";
import { mechanisms } from "../presets/factory";
import { AccountError } from "../services";
import { openAccountRobot, useAccount } from "../services/accountStore";

export function AccountButton({
  onSignIn,
  onRobots,
}: {
  onSignIn: () => void;
  onRobots: () => void;
}) {
  const t = useT();
  const { session, ready, signOut } = useAccount();
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menu]);
  if (!ready) return null;
  if (!session)
    return (
      <button className="account-cta" onClick={onSignIn}>
        {t("Giriş yap")}
      </button>
    );
  const u = session.user;
  return (
    <div className="account-menu" ref={ref}>
      <button
        className="account-chip"
        aria-haspopup="menu"
        aria-expanded={menu}
        onClick={() => setMenu(!menu)}
      >
        <span className="avatar" aria-hidden="true">
          {u.displayName.slice(0, 1).toUpperCase()}
        </span>
        <span className="account-name">{u.displayName}</span>
        <ChevronDown size={13} />
      </button>
      {menu && (
        <div className="account-popup" role="menu">
          <p className="account-who">
            <b>{u.displayName}</b>
            <small>{u.email}</small>
            {session.mock && <em className="tag missing">{t("Demo hesap")}</em>}
          </p>
          <button
            role="menuitem"
            onClick={() => {
              setMenu(false);
              onRobots();
            }}
          >
            <UserRound size={14} /> {t("Hesabımdaki robotlar")}
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setMenu(false);
              void signOut();
            }}
          >
            <LogOut size={14} /> {t("Çıkış yap")}
          </button>
        </div>
      )}
    </div>
  );
}

export function SignInDialog({
  onDone,
  onCancel,
}: {
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const { signIn, busy } = useAccount();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await signIn(email, name);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  return (
    <form className="account-dialog" onSubmit={submit}>
      <h2>{t("Hesabına giriş yap")}</h2>
      <p className="ob-warning">
        {t(
          "Bu bir demo hesaptır: şifre yok, robotların yalnız bu tarayıcıda saklanır. Simülatör Probot Studio sitesine taşındığında gerçek Probot hesabın kullanılacak.",
        )}
      </p>
      <label className="setup-field">
        <span>{t("E-posta")}</span>
        <input
          type="email"
          autoComplete="email"
          value={email}
          required
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="setup-field">
        <span>{t("Adın veya takım adın")}</span>
        <input
          type="text"
          value={name}
          maxLength={60}
          required
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      {error && (
        <p className="setup-error" role="alert">
          {t(error)}
        </p>
      )}
      <div className="wizard-actions">
        <button type="button" onClick={onCancel}>
          {t("Vazgeç")}
        </button>
        <button className="primary" type="submit" disabled={busy}>
          {t("Giriş yap")}
        </button>
      </div>
    </form>
  );
}

export function MyRobotsDialog({
  onOpen,
  onSaveCurrent,
  currentName,
}: {
  onOpen: (id: string) => void;
  onSaveCurrent: (asNew: boolean) => void;
  currentName: string;
}) {
  const t = useT();
  const account = useAccount();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState("");
  const open = openAccountRobot(account);
  useEffect(() => {
    void account.refresh();
  }, []);
  const label = (summary: string) => {
    const [mech, ...rest] = summary.split(" · ");
    const m = mechanisms.find((x) => x.id === mech);
    return [m ? t(m.label) : t("Compound / ReCalc modeli"), ...rest].join(
      " · ",
    );
  };
  const when = (iso: string) =>
    new Date(iso).toLocaleString(t.lang === "en" ? "en-GB" : "tr-TR", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  return (
    <div className="account-dialog robots">
      <h2>{t("Hesabımdaki robotlar")}</h2>
      <div className="robots-current">
        <span>
          {t("Ekrandaki robot")}: <b>{currentName}</b>
          {open && <em className="tag recalc">{t("hesapta kayıtlı")}</em>}
        </span>
        <div className="button-row">
          <button className="primary" onClick={() => onSaveCurrent(false)}>
            {open ? t("Değişiklikleri kaydet") : t("Hesabıma kaydet")}
          </button>
          {open && (
            <button onClick={() => onSaveCurrent(true)}>
              {t("Kopya olarak kaydet")}
            </button>
          )}
        </div>
      </div>
      {error && <p className="setup-error">{error}</p>}
      {account.robots.length === 0 ? (
        <p className="hint">{t("Hesabında henüz kayıtlı robot yok.")}</p>
      ) : (
        <ul className="robot-list">
          {account.robots.map((r) => (
            <li key={r.id} className={open?.id === r.id ? "active" : ""}>
              <div>
                <b>{r.name}</b>
                <small>
                  {label(r.summary)} · {t("güncellendi")} {when(r.updatedAt)}
                </small>
              </div>
              {confirm === r.id ? (
                <div className="button-row">
                  <span className="setup-error">{t("Silinsin mi?")}</span>
                  <button
                    onClick={async () => {
                      setError("");
                      try {
                        await account.remove(r.id);
                      } catch (e) {
                        setError(
                          e instanceof AccountError ? t(e.message) : String(e),
                        );
                      }
                      setConfirm(null);
                    }}
                  >
                    {t("Evet, sil")}
                  </button>
                  <button onClick={() => setConfirm(null)}>{t("Hayır")}</button>
                </div>
              ) : (
                <div className="button-row">
                  <button onClick={() => onOpen(r.id)}>{t("Aç")}</button>
                  <button onClick={() => setConfirm(r.id)}>{t("Sil")}</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="hint">
        {t(
          "Demo hesap: robotlar bu tarayıcıda saklanır. Probot Studio'ya taşınınca hesabına bağlanacak.",
        )}
      </p>
    </div>
  );
}
