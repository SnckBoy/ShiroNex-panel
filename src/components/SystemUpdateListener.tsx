import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { RefreshCw } from "lucide-react";
import { motion } from "framer-motion";

export function SystemUpdateListener() {
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    let socket: ReturnType<typeof io> | null = null;

    const connect = () => {
      socket?.disconnect();
      socket = null;
      // Must match the key AuthContext stores the JWT under
      // ("shironex_token"). This previously read a nonexistent "token" key,
      // so the update banner never appeared for any signed-in user.
      const token = localStorage.getItem("shironex_token");
      if (!token) return;

      socket = io({ auth: { token } });
      socket.on("system_update_started", () => {
        setShowPrompt(true);
        // Automatically refresh after 10 seconds as a fallback
        setTimeout(() => {
          window.location.reload();
        }, 10000);
      });
    };

    connect();
    // Reconnect immediately on login/logout within this tab instead of only
    // on the next full page reload.
    window.addEventListener("shironex-auth-changed", connect);

    return () => {
      socket?.disconnect();
      window.removeEventListener("shironex-auth-changed", connect);
    };
  }, []);

  if (!showPrompt) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card border border-emerald-500/30 p-8 rounded-2xl max-w-md w-full text-center shadow-[0_0_50px_-12px_rgba(16,185,129,0.3)]"
      >
        <RefreshCw className="w-12 h-12 text-emerald-400 mx-auto mb-4 animate-spin" />
        <h2 className="text-xl font-bold text-foreground mb-2">System Update in Progress</h2>
        <p className="text-muted-foreground mb-6">
          The panel is updating and restarting. Please refresh the page to continue using the panel.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-foreground font-medium rounded-xl transition-colors w-full"
        >
          Refresh Now
        </button>
      </motion.div>
    </div>
  );
}
