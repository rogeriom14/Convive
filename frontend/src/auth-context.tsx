import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { storage } from "@/src/utils/storage";
import { api, TOKEN_KEY } from "@/src/api";

export type User = {
  id: string;
  role: "resident" | "admin" | "super_admin";
  name?: string;
  email?: string;
  building_id?: string;
  tower_id?: string;
  apartment?: string;
  status?: "pending" | "approved";
  building?: any;
  tower?: any;
};

type Ctx = {
  user: User | null;
  loading: boolean;
  loginResident: (b: { building_id: string; tower_id: string; apartment: string; password: string }) => Promise<User>;
  loginAdmin: (b: { email: string; password: string }) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  rememberUnit: (u: { building: any; tower: any; apartment: string }) => Promise<void>;
  rememberedUnit: { building: any; tower: any; apartment: string } | null;
  clearRememberedUnit: () => Promise<void>;
};

const AuthContext = createContext<Ctx | null>(null);
const REMEMBER_KEY = "convive_remembered_unit";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [rememberedUnit, setRememberedUnit] = useState<any>(null);

  const bootstrap = useCallback(async () => {
    const t = await storage.secureGet<string>(TOKEN_KEY, "");
    const remembered = await storage.getItem<any>(REMEMBER_KEY, null);
    if (remembered) setRememberedUnit(remembered as any);
    if (t) {
      try {
        const me = await api.get<User>("/auth/me");
        setUser(me);
      } catch {
        await storage.secureRemove(TOKEN_KEY);
        setUser(null);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  const refresh = useCallback(async () => {
    try {
      const me = await api.get<User>("/auth/me");
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  const finishLogin = async (data: { access_token: string; user: User }) => {
    await storage.secureSet(TOKEN_KEY, data.access_token);
    try {
      const me = await api.get<User>("/auth/me");
      setUser(me);
      return me;
    } catch {
      setUser(data.user);
      return data.user;
    }
  };

  return (
    <AuthContext.Provider value={{
      user, loading, rememberedUnit,
      loginResident: async (b) => {
        const data = await api.post<{ access_token: string; user: User }>("/auth/login-resident", b);
        return finishLogin(data);
      },
      loginAdmin: async (b) => {
        const data = await api.post<{ access_token: string; user: User }>("/auth/login-admin", b);
        return finishLogin(data);
      },
      logout: async () => {
        await storage.secureRemove(TOKEN_KEY);
        setUser(null);
      },
      refresh,
      rememberUnit: async (u) => {
        await storage.setItem(REMEMBER_KEY, u as any);
        setRememberedUnit(u);
      },
      clearRememberedUnit: async () => {
        await storage.removeItem(REMEMBER_KEY);
        setRememberedUnit(null);
      },
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const c = useContext(AuthContext);
  if (!c) throw new Error("useAuth must be inside AuthProvider");
  return c;
}
