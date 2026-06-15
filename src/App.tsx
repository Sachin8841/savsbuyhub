import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/components/AuthProvider";
import { ProtectedRoute, AdminRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import Sales from "./pages/Sales";
import Returns from "./pages/Returns";
import Settings from "./pages/Settings";
import Forecast from "./pages/Forecast";
import PnL from "./pages/PnL";
import Invest from "./pages/Invest";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <ThemeToggle />
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/forecast" element={<Forecast />} />
              <Route path="/login" element={<Login />} />
              <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route path="/" element={<AdminRoute><Dashboard /></AdminRoute>} />
                <Route path="/inventory" element={<AdminRoute><Inventory /></AdminRoute>} />
                <Route path="/sales" element={<AdminRoute><Sales /></AdminRoute>} />
                <Route path="/returns" element={<AdminRoute><Returns /></AdminRoute>} />
                <Route path="/pnl" element={<AdminRoute><PnL /></AdminRoute>} />
                <Route path="/invest" element={<Invest />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
