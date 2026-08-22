import express from "express";
import { login, logout, getMe, getUsers, changePassword, changeUsername, register, googleLogin, setupStatus, setupOwner } from "../controllers/auth.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

router.get("/setup-status", setupStatus);
router.post("/setup", setupOwner);
router.post("/register", register);
router.post("/login", login);
router.post("/google", googleLogin);
router.post("/logout", logout);
router.get("/me", requireAuth, getMe);
router.get("/users", requireAdmin, getUsers);
router.put("/password", requireAuth, changePassword);
router.put("/username", requireAuth, changeUsername);

export default router;
