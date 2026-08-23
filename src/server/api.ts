import express from "express";
import { readJSON } from "../services/db.js";

const router = express.Router();
import authRoutes from "./auth.js";
import serverRoutes from "./servers.js";
import systemRoutes from "./system.js";
import apiKeyRoutes from "./api-keys.js";
import nodeRoutes from "./nodes.js";
import nodeAgentRoutes from "./nodeAgent.js";
import allocationRoutes from "./allocations.js";
import cloudflareRoutes from "./cloudflare.js";
import marketplaceRoutes from "./marketplace.js";

router.use("/auth", authRoutes);
router.use("/servers", serverRoutes);
router.use("/system", systemRoutes);
router.use("/admin/api-keys", apiKeyRoutes);
router.use("/nodes", nodeRoutes);
router.use("/node-agent", nodeAgentRoutes);
router.use("/allocations", allocationRoutes);
router.use("/cloudflare", cloudflareRoutes);
router.use("/marketplace", marketplaceRoutes);

router.get("/settings", async (req, res) => {
  const settings = await readJSON("settings.json") || {};
  res.json({ 
    panelName: settings.panelName || "ShiroNex",
    panelLogo: settings.panelLogo || "",
    panelBackgroundImage: settings.panelBackgroundImage || "",
    panelBackgroundBlur: settings.panelBackgroundBlur !== undefined ? settings.panelBackgroundBlur : 10,
    enablePlayit: settings.enablePlayit !== undefined ? settings.enablePlayit : false,
    enableTutorial: settings.enableTutorial !== undefined ? settings.enableTutorial : true,
    enableLoginAnimation: settings.enableLoginAnimation !== undefined ? settings.enableLoginAnimation : true,
    enableRegistration: settings.enableRegistration !== undefined ? settings.enableRegistration : true,
    theme: settings.theme || "aurora",
    appearance: settings.appearance || "dark",
    accent: settings.accent || "purple",
    backgroundEffect: settings.backgroundEffect || "aurora",
    reducedMotion: settings.reducedMotion !== undefined ? Boolean(settings.reducedMotion) : false,
    enableGoogleLogin: settings.enableGoogleLogin !== undefined ? settings.enableGoogleLogin : false,
    firebaseApiKey: settings.firebaseApiKey || "",
    firebaseAuthDomain: settings.firebaseAuthDomain || "",
    firebaseProjectId: settings.firebaseProjectId || "",
    firebaseStorageBucket: settings.firebaseStorageBucket || "",
    firebaseMessagingSenderId: settings.firebaseMessagingSenderId || "",
    firebaseAppId: settings.firebaseAppId || ""
  });
});

export default router;
