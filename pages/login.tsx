// pages/login.tsx
import React, { useState } from "react";
import {
  getAuth,
  signInWithEmailAndPassword,
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from "firebase/auth";
import { app } from "@/firebaseClient";
import { useRouter } from "next/router";

declare global {
  interface Window {
    recaptchaVerifier?: RecaptchaVerifier;
  }
}

const LoginPage: React.FC = () => {
  const router = useRouter();
  const auth = getAuth(app);

  const [isAdmin, setIsAdmin] = useState(false);

  // Field login
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [confirmation, setConfirmation] = useState<any>(null);

  // Admin login
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");

  // UI state
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  function digitsOnly(raw: string) {
    return raw.replace(/\D/g, "");
  }

  async function requestOTP() {
    try {
      setLoading(true);
      setErrorMsg(null);
      setInfoMsg(null);

      const trimmed = digitsOnly(mobile);
      if (trimmed.length !== 10) {
        setErrorMsg("Please enter a valid 10-digit mobile number.");
        return;
      }

      let verifier = window.recaptchaVerifier;
      if (!verifier) {
        verifier = new RecaptchaVerifier(auth, "recaptcha-container", {
          size: "invisible",
        });
        window.recaptchaVerifier = verifier;
      }

      const full = "+91" + trimmed;
      const result = await signInWithPhoneNumber(auth, full, verifier);
      setConfirmation(result);
      setInfoMsg(`OTP has been sent to +91 ${trimmed}.`);
    } catch (err) {
      console.error(err);
      setErrorMsg(
        "Unable to send OTP at the moment. Please check the number and try again."
      );
    } finally {
      setLoading(false);
    }
  }

  async function verifyOTP() {
    try {
      setLoading(true);
      setErrorMsg(null);
      setInfoMsg(null);

      if (!confirmation) {
        setErrorMsg("Please request an OTP first.");
        return;
      }
      if (!otp.trim()) {
        setErrorMsg("Please enter the OTP received on your mobile.");
        return;
      }

      await confirmation.confirm(otp.trim());
      // Successful field login – redirect to main app
      router.replace("/");
    } catch (err) {
      console.error(err);
      setErrorMsg("Invalid OTP. Please check and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function adminLogin() {
    try {
      setLoading(true);
      setErrorMsg(null);
      setInfoMsg(null);

      if (!email.trim() || !pwd.trim()) {
        setErrorMsg("Admin email and password are required.");
        return;
      }

      await signInWithEmailAndPassword(auth, email.trim(), pwd);
      // Successful admin login – redirect to main app
      router.replace("/");
    } catch (err) {
      console.error(err);
      setErrorMsg("Invalid admin credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen w-full bg-cover bg-center bg-no-repeat flex flex-col items-center justify-center px-4"
      style={{
        backgroundImage:
          "linear-gradient(to bottom, rgba(0,0,0,0.35), rgba(0,0,0,0.55)), url('/login-construction.jpg')",
      }}
    >
      {/* Logo / Brand */}
      <div className="absolute top-6 left-6 flex items-center gap-2">
        <div className="h-9 w-9 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white font-bold">
          GW
        </div>
        <span className="text-white/90 font-medium tracking-wide">
          GovWorks Console
        </span>
      </div>

      {/* Login Card */}
      <div className="w-full max-w-sm md:max-w-md lg:max-w-lg text-white bg-white/10 backdrop-blur-xl rounded-2xl p-6 sm:p-8 shadow-2xl">
        <h1 className="text-xl font-semibold">GovWorks – Secure Login</h1>
        <p className="text-sm text-white/70 mt-1 mb-4">
          Field officers (JE / SDO / EE / FE) use mobile OTP. Admin / HQ use
          official email ID.
        </p>

        {/* Error / Info messages */}
        {errorMsg && (
          <div className="mb-3 rounded-lg bg-red-500/20 border border-red-400 px-3 py-2 text-sm">
            {errorMsg}
          </div>
        )}
        {infoMsg && (
          <div className="mb-3 rounded-lg bg-emerald-500/20 border border-emerald-400 px-3 py-2 text-sm">
            {infoMsg}
          </div>
        )}

        {/* Mode Toggle */}
        <div className="flex mb-4 rounded-full bg-white/20 p-1">
          <button
            type="button"
            onClick={() => {
              setIsAdmin(false);
              setErrorMsg(null);
              setInfoMsg(null);
            }}
            className={`flex-1 py-2 rounded-full ${
              !isAdmin ? "bg-white text-black font-semibold" : "text-white/70"
            }`}
          >
            Field Officer Login
          </button>

          <button
            type="button"
            onClick={() => {
              setIsAdmin(true);
              setErrorMsg(null);
              setInfoMsg(null);
            }}
            className={`flex-1 py-2 rounded-full ${
              isAdmin ? "bg-white text-black font-semibold" : "text-white/70"
            }`}
          >
            Admin / HQ Login
          </button>
        </div>

        {/* FIELD LOGIN */}
        {!isAdmin ? (
          <>
            {/* Mobile input */}
            <div className="mb-3">
              <label className="text-sm text-white/70">Registered Mobile</label>
              <div className="flex gap-2 mt-1">
                <div className="px-3 py-2 rounded-lg bg-white/20 text-white">
                  +91
                </div>
                <input
                  type="tel"
                  className="flex-1 rounded-lg px-3 py-2 bg-white/10 border border-white/30 text-white placeholder-white/50"
                  placeholder="10-digit mobile number"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                />
              </div>
            </div>

            {!confirmation ? (
              <button
                type="button"
                onClick={requestOTP}
                disabled={loading}
                className="w-full bg-emerald-500 py-3 rounded-lg font-semibold mt-2 disabled:opacity-60"
              >
                {loading ? "Sending OTP…" : "Send OTP"}
              </button>
            ) : (
              <>
                <div className="mb-3 mt-4">
                  <label className="text-sm text-white/70">
                    Enter OTP received on your mobile
                  </label>
                  <input
                    type="tel"
                    className="w-full rounded-lg px-3 py-2 bg-white/10 border border-white/30 text-white placeholder-white/50 mt-1"
                    placeholder="6-digit OTP"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={verifyOTP}
                  disabled={loading}
                  className="w-full bg-emerald-500 py-3 rounded-lg font-semibold mt-1 disabled:opacity-60"
                >
                  {loading ? "Verifying…" : "Verify OTP & Continue"}
                </button>
              </>
            )}
          </>
        ) : (
          // ADMIN / HQ LOGIN
          <>
            {/* Admin email */}
            <div className="mb-3">
              <label className="text-sm text-white/70">Admin Email</label>
              <input
                type="email"
                className="w-full rounded-lg px-3 py-2 bg-white/10 border border-white/30 text-white placeholder-white/50 mt-1"
                placeholder="name@department.gov.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="mb-3">
              <label className="text-sm text-white/70">Password</label>
              <input
                type="password"
                className="w-full rounded-lg px-3 py-2 bg-white/10 border border-white/30 text-white placeholder-white/50 mt-1"
                placeholder="••••••••"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
              />
            </div>

            <button
              type="button"
              onClick={adminLogin}
              disabled={loading}
              className="w-full bg-white text-black py-3 rounded-lg font-semibold mt-2 disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Login as Admin"}
            </button>
          </>
        )}
      </div>

      {/* Invisible Recaptcha container for phone auth */}
      <div id="recaptcha-container" className="hidden" />
    </div>
  );
};

export default LoginPage;
