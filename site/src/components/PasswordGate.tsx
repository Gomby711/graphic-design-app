"use client"

import { useState, type FormEvent } from "react"
import { Lock, ArrowRight, ShieldCheck } from "lucide-react"
import { WebGLShader } from "@/components/ui/web-gl-shader"
import { LiquidButton } from "@/components/ui/liquid-glass-button"

/**
 * The site's front door. The password is checked entirely server-side
 * (POST /api/login → bcrypt.compare against a hash that only ever lives in
 * the server's environment). Nothing here can leak the password — reading
 * this file, the compiled bundle, or devtools network tab reveals only
 * whatever the visitor already typed, never the real value.
 */
export default function PasswordGate() {
  const [password, setPassword] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle")
  const [error, setError] = useState("")

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!password) return
    setStatus("loading")
    setError("")
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        window.location.href = "/portal/"
        return
      }
      const data = await res.json().catch(() => ({}))
      setStatus("error")
      setError(data.error || "Incorrect password.")
      setPassword("")
    } catch {
      setStatus("error")
      setError("Couldn't reach the server. Try again.")
    }
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-ink text-paper">
      <WebGLShader />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink/70 via-ink/40 to-ink" />

      <div className="relative z-10 w-full max-w-md px-6">
        <div className="rounded-2xl border border-white/10 bg-black/40 p-8 backdrop-blur-xl shadow-[0_8px_60px_rgba(0,0,0,0.5)]">
          <div className="mb-8 flex flex-col items-center text-center">
            <img
              src="/icon.png"
              alt="graphic design tips"
              className="mb-4 h-16 w-16 rounded-2xl shadow-[0_2px_20px_rgba(201,164,100,0.35)] ring-1 ring-white/10"
            />
            <h1 className="font-serif text-3xl font-medium tracking-tight text-paper">
              graphic<span className="italic text-primary">design</span>tips
            </h1>
            <p className="mt-2 text-xs uppercase tracking-[0.2em] text-paper/50">
              Private lesson archive
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4" autoComplete="off">
            <label htmlFor="site-password" className="sr-only">
              Password
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/40" />
              <input
                id="site-password"
                type="password"
                inputMode="text"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full rounded-full border border-white/15 bg-white/5 py-3 pl-10 pr-4 text-sm text-paper placeholder:text-paper/30 outline-none transition focus:border-primary/60 focus:bg-white/10"
                disabled={status === "loading"}
              />
            </div>

            {error && (
              <p role="alert" className="-mt-1 text-center text-xs text-red-300/90">
                {error}
              </p>
            )}

            <LiquidButton
              type="submit"
              size="xl"
              disabled={status === "loading" || !password}
              className="mt-1 w-full border border-white/15 text-paper"
            >
              {status === "loading" ? "Verifying…" : "Enter"}
              <ArrowRight className="h-4 w-4" />
            </LiquidButton>
          </form>

          <div className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-paper/35">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Access is verified on the server — nothing here reveals the password.</span>
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] text-paper/30">
          graphicdesigntips — by Evan Taye Lee
        </p>
      </div>
    </div>
  )
}
