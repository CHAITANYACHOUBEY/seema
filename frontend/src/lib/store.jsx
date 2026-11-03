import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { toast } from "sonner";
import { api, errMsg, setTokenGetter } from "@/lib/api";

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;
  const [site, setSite] = useState(null);
  const [me, setMe] = useState(null);
  const [cart, setCart] = useState(null);
  const [drawer, setDrawer] = useState(false);
  const [ready, setReady] = useState(false);

  const refreshCart = useCallback(async () => {
    try { setCart((await api.get("/cart")).data); } catch { setCart(null); }
  }, []);
  const refreshMe = useCallback(async () => {
    try { setMe((await api.get("/me")).data); } catch { setMe(null); }
  }, []);

  useEffect(() => { api.get("/site").then((r) => setSite(r.data)); }, []);

  useEffect(() => {
    if (!isLoaded) return;
    (async () => {
      setTokenGetter(isSignedIn ? () => tokenRef.current() : null);
      if (isSignedIn) {
        const gid = localStorage.getItem("se_cart");
        if (gid) {
          await api.post("/cart/merge", { guest_id: gid }).catch(() => {});
          localStorage.removeItem("se_cart");
        }
        await refreshMe();
      } else setMe(null);
      await refreshCart();
      setReady(true);
    })();
  }, [isLoaded, isSignedIn, refreshCart, refreshMe]);

  const addToCart = async (sku, qty = 1, open = true) => {
    try {
      const r = await api.post("/cart/items", { sku, qty, mode: "add" });
      setCart(r.data);
      if (open) setDrawer(true);
      toast.success("Added to cart");
      return true;
    } catch (e) { toast.error(errMsg(e)); return false; }
  };
  const setQty = async (sku, qty) => {
    try { setCart((await api.post("/cart/items", { sku, qty, mode: "set" })).data); } catch (e) { toast.error(errMsg(e)); }
  };
  const can = (p) => !!me && (me.perms.includes("*") || me.perms.includes(p));
  const isStaff = !!me && me.role !== "customer";

  return (
    <Ctx.Provider value={{ site, me, cart, setCart, drawer, setDrawer, ready, isSignedIn, addToCart, setQty, refreshCart, refreshMe, can, isStaff }}>
      {children}
    </Ctx.Provider>
  );
}
