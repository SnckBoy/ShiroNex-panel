import { useCallback, useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import PlayerManager, { ManagedPlayer } from "./PlayerManager";

const PLAYER_NAME = /^[a-zA-Z0-9_]{3,16}$/;

function parsePlayers(line: string) {
  const match = line.match(/there are\s+(\d+)\s+of\s+a\s+max(?:imum)?\s+of\s+(\d+)\s+players? online:?\s*(.*)$/i);
  if (!match) return null;
  const names = match[3].split(",").map(name => name.trim()).filter(name => PLAYER_NAME.test(name));
  return { max: Number(match[2]), names };
}

export default function ServerPlayers({ serverId }: { serverId: string }) {
  const { token } = useAuth();
  const [players, setPlayers] = useState<ManagedPlayer[]>([]);
  const [maxPlayers, setMaxPlayers] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);

  const refresh = useCallback(async () => {
    await axios.post(`/api/servers/${serverId}/command`, { command: "list" });
  }, [serverId]);

  useEffect(() => {
    if (!token || !serverId) return;
    let mounted = true;
    const socket: Socket = io({ auth: { token }, transports: ["websocket", "polling"], reconnectionAttempts: 5, reconnectionDelay: 2000 });
    socket.on("connect", () => { if (!mounted) return; setConnected(true); socket.emit("joinServer", serverId); void refresh(); });
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));
    socket.on("log", (data: string) => {
      if (!mounted || typeof data !== "string") return;
      for (const raw of data.split(/\r?\n/)) {
        const line = raw.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
        const list = parsePlayers(line);
        if (list) {
          setMaxPlayers(Number.isFinite(list.max) ? list.max : null);
          setPlayers(list.names.map(name => ({ name, online: true })));
          continue;
        }
        const joined = line.match(/:\s+([a-zA-Z0-9_]{3,16})\s+joined the game/i);
        if (joined && PLAYER_NAME.test(joined[1])) {
          setPlayers(previous => previous.some(player => player.name === joined[1]) ? previous : [...previous, { name: joined[1], online: true }]);
          continue;
        }
        const left = line.match(/:\s+([a-zA-Z0-9_]{3,16})\s+left the game/i);
        if (left) setPlayers(previous => previous.filter(player => player.name !== left[1]));
      }
    });
    return () => { mounted = false; socket.emit("leaveServer", serverId); socket.removeAllListeners(); socket.disconnect(); };
  }, [refresh, serverId, token]);

  return <PlayerManager serverId={serverId} players={players} maxPlayers={maxPlayers} connected={connected} onRefresh={refresh} />;
}
