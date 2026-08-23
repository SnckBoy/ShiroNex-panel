import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { searchMarketplace, MarketplaceKind, MarketplaceProvider } from "../services/marketplace.js";

const router = express.Router();
router.use(requireAuth);

const allowedKinds = new Set<MarketplaceKind>(["plugin", "mod", "modpack"]);
const allowedProviders = new Set<MarketplaceProvider | "all">(["modrinth", "hangar", "spiget", "all"]);

router.get("/search", async (req, res) => {
  const kind = String(req.query.kind || "plugin") as MarketplaceKind;
  const provider = String(req.query.provider || "all") as MarketplaceProvider | "all";
  if (!allowedKinds.has(kind)) return res.status(400).json({ error: "Unsupported marketplace kind" });
  if (!allowedProviders.has(provider)) return res.status(400).json({ error: "Unsupported marketplace provider" });

  try {
    const items = await searchMarketplace({
      query: String(req.query.q || ""),
      kind,
      provider,
      gameVersion: String(req.query.gameVersion || "") || undefined,
      loader: String(req.query.loader || "") || undefined,
      limit: Number(req.query.limit) || 20,
    });
    res.json({ items, cachedForSeconds: 60 });
  } catch (error: any) {
    const status = error?.response?.status === 429 ? 429 : 502;
    res.status(status).json({ error: "Marketplace provider unavailable", retryable: true });
  }
});

export default router;
