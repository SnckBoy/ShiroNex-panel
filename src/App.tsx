/**

 * @license

 * SPDX-License-Identifier: Apache-2.0

 */



import React, { useState, useEffect, lazy, Suspense } from "react";

import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";

import { AuthProvider, useAuth } from "./context/AuthContext";

const Login = lazy(() => import("./pages/Login"));

const Register = lazy(() => import("./pages/Register"));

const Dashboard = lazy(() => import("./pages/Dashboard"));

const ServerList = lazy(() => import("./pages/ServerList"));

const CreateServer = lazy(() => import("./pages/CreateServer"));

const ServerView = lazy(() => import("./pages/ServerView"));

const SettingsPage = lazy(() => import("./pages/SettingsPage"));

const ApiKeysPage = lazy(() => import("./pages/ApiKeysPage"));

const AdminServers = lazy(() => import("./pages/AdminServers"));

const PlayitTunnel = lazy(() => import("./pages/PlayitTunnel"));

const Nodes = lazy(() => import("./pages/Nodes"));

const Allocations = lazy(() => import("./pages/Allocations"));

const Cloudflare = lazy(() => import("./pages/Cloudflare"));

import Layout from "./components/Layout";

import { motion, AnimatePresence } from "framer-motion";

import { SettingsProvider, useSettings } from "./context/SettingsContext";

import { GlobalBackground } from "./components/GlobalBackground";

import { SystemUpdateListener } from "./components/SystemUpdateListener";

import { TutorialOverlay } from "./components/TutorialOverlay";



const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  
  const { user, loading } = useAuth();
  
  if (loading) return (
    
    <div className="h-[100dvh] w-full flex items-center justify-center bg-transparent text-foreground">
    
      <motion.div
        
        animate={{ scale: [1, 1.2, 1], rotate: [0, 180, 360] }}
        
        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        
        className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full"
        
      />
    
    </div>div>
    
  );
  
  if (!user) return <Navigate to="/login" />;
  
  return <Layout>{children}</Layout>Layout>;
  
};



const AnimatedRoutes = () => {
  
  const location = useLocation();
  
  return (
    
    <AnimatePresence mode="wait">
    
      <motion.div
        
        key={location.pathname.split("/")[1]}
        
        initial={{ opacity: 0, y: 20 }}
        
        animate={{ opacity: 1, y: 0 }}
        
        exit={{ opacity: 0, y: -20 }}
        
        transition={{ duration: 0.3 }}
        
        className="h-full w-full flex flex-col"
        
      >
      
        <Suspense fallback={<div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">Loading ShiroNex…</div>div>}>
        
          <Routes location={location}>
          
            <Route path="/login" element={<Login />} />
          
            <Route path="/register" element={<Register />} />
          
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>ProtectedRoute>} />
            
            <Route path="/nodes" element={<ProtectedRoute><Nodes /></ProtectedRoute>ProtectedRoute>} />
            
            <Route path="/allocations" element={<ProtectedRoute><Allocations /></ProtectedRoute>ProtectedRoute>} />
            
            <Route path="/cloudflare" element={<ProtectedRoute><Cloudflare /></ProtectedRoute>ProtectedRoute>} />
            
            <Route path="/servers" element={<ProtectedRoute><ServerList /></ProtectedRoute>ProtectedRoute>} />
            
            <Route path="/servers/create" element={<ProtectedRoute><CreateServer /></ProtectedRoute>ProtectedRoute>} />
            
            <Route path="/servers/:id/*" element={<ProtectedRoute><ServerView /></ProtectedRoute>ProtectedRoute>} />
            
            <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>ProtectedRoute>} />
            
            <Route path="/api-keys" element={<ProtectedRoute><ApiKeysPage /></ProtectedRoute>ProtectedRoute>} />
            
            <Route path="/admin/servers" element={<ProtectedRoute><AdminServers /></ProtectedRoute>ProtectedRoute>} />
            
            </Route>Routes>
            
            </Route>Suspense>
            
            </Route>motion.div>
            
            </Route>AnimatePresence>
            
  );
            
              };
            

            
const TutorialManager = () => {
  
  const { panelName, enableTutorial } = useSettings();
            
  const [showTutorial, setShowTutorial] = useState(false);
            
  const { user, loading } = useAuth();
            
  const location = useLocation();
            

            
  useEffect(() => {
    
    if (enableTutorial === false) {
      
      setShowTutorial(false);
            
      return;
            
              }
            

            
    if (loading || !user || location.pathname === '/login') return;
            

            
    const isDev = process.env.NODE_ENV === 'development';
            
    const tutorialKey = isDev ? `tutorialShown_dev_${user.id}` : `tutorialShown_prod_${user.id}`;
            

            
    const tutorialShown = isDev
            
      ? sessionStorage.getItem(tutorialKey)
            
      : localStorage.getItem(tutorialKey);
            

            
    if (!tutorialShown) {
      
      setShowTutorial(true);
            
              }
            
              }, [user, loading, location.pathname, enableTutorial]);
            

            
  const handleTutorialComplete = () => {
    
    if (!user) return;
            
    const isDev = process.env.NODE_ENV === 'development';
            
    const tutorialKey = isDev ? `tutorialShown_dev_${user.id}` : `tutorialShown_prod_${user.id}`;
            

            
    if (isDev) {
      
      sessionStorage.setItem(tutorialKey, 'true');
            
              } else {
                
      localStorage.setItem(tutorialKey, 'true');
            
              }
            

            
    setShowTutorial(false);
            
              };
            

            
  if (!showTutorial) return null;
            

            
  return <TutorialOverlay onComplete={handleTutorialComplete} panelName={panelName} />;
            
              };
            

            
export default function App() {
  
  return (
            
    <SettingsProvider>
    
      <AuthProvider>
      
        <SystemUpdateListener />
      
        <GlobalBackground />
      
        <Router>
        
          <AnimatedRoutes />
        
          <TutorialManager />
        
        </Router>Router>
      
      </AuthProvider>AuthProvider>
    
    </SettingsProvider>SettingsProvider>
            
  );
            
              }
            
</div>


