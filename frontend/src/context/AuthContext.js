import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";

const AuthContext = createContext(null);

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function formatApiErrorDetail(detail) {
  if (detail == null) return "A aparut o eroare. Incercati din nou.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const refreshingRef = useRef(false);

  const checkAuth = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/auth/me`, { withCredentials: true });
      setUser(data);
    } catch {
      try {
        await axios.post(`${API}/auth/refresh`, {}, { withCredentials: true });
        const { data } = await axios.get(`${API}/auth/me`, { withCredentials: true });
        setUser(data);
      } catch {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  // Auto-refresh interceptor: if any API call gets 401, try to refresh token
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        if (
          error.response?.status === 401 &&
          !originalRequest._retry &&
          !originalRequest.url?.includes('/auth/login') &&
          !originalRequest.url?.includes('/auth/refresh') &&
          !originalRequest.url?.includes('/auth/register')
        ) {
          originalRequest._retry = true;
          if (!refreshingRef.current) {
            refreshingRef.current = true;
            try {
              await axios.post(`${API}/auth/refresh`, {}, { withCredentials: true });
              refreshingRef.current = false;
              return axios(originalRequest);
            } catch {
              refreshingRef.current = false;
              setUser(null);
            }
          }
        }
        return Promise.reject(error);
      }
    );
    return () => axios.interceptors.response.eject(interceptor);
  }, []);

  const login = async (email, password) => {
    try {
      const { data } = await axios.post(`${API}/auth/login`, { email, password }, { withCredentials: true });
      setUser(data);
      return { success: true };
    } catch (e) {
      return { success: false, error: formatApiErrorDetail(e.response?.data?.detail) || e.message };
    }
  };

  const register = async (email, password, name) => {
    try {
      const { data } = await axios.post(`${API}/auth/register`, { email, password, name }, { withCredentials: true });
      setUser(data);
      return { success: true };
    } catch (e) {
      return { success: false, error: formatApiErrorDetail(e.response?.data?.detail) || e.message };
    }
  };

  const logout = async () => {
    try {
      await axios.post(`${API}/auth/logout`, {}, { withCredentials: true });
    } catch {}
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
