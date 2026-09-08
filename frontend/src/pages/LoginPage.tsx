import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlassCard } from "@/components/ui/GlassCard";
import { LogIn } from "lucide-react";

export const LoginPage: React.FC = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const data = await login({ username, password });
      if (data.user.is_superuser || data.user.is_staff) {
        navigate("/admin");
      } else if (data.user.is_cr_admin) {
        // CR-only admin's home is the admin panel Users page (they manage
        // CR access + view CR users). The CR dashboard is reachable via
        // the plugin-injected sidebar item if they also have a
        // ControlRoomAccess record.
        // NOTE: is_cr_admin() returns True for is_staff users too (hierarchy),
        // so the is_staff check above MUST come first to avoid sending
        // regular staff admins to /admin/users.
        navigate("/admin/users");
      } else if (data.user.has_control_room_access) {
        // CR user (non-admin with ControlRoomAccess) — their primary view
        // is the Control Room dashboard (standby coverage for their scoped
        // teams). They have no overtime/leave/holiday access.
        navigate("/control-room/dashboard");
      } else {
        navigate("/dashboard");
      }
    } catch {
      setError("Invalid username or password");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.45 }}
        className="w-full max-w-md"
      >
        <GlassCard delay={0} className="p-8">
          <div className="mb-6 text-center">
            <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <LogIn className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">Time Tracker</h1>
            <p className="mt-1 text-muted-foreground">Sign in to your account</p>
          </div>

          {error && (
            <div className="mb-4 rounded border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </GlassCard>
      </motion.div>
    </div>
  );
};
