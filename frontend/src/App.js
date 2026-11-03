import { useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { SignIn, SignUp } from "@clerk/react";
import { Toaster } from "sonner";
import ClerkAuthProvider from "@/components/auth/ClerkAuthProvider";
import { AppProvider } from "@/lib/store";
import Header from "@/components/shop/Header";
import Footer from "@/components/shop/Footer";
import CartDrawer from "@/components/shop/CartDrawer";
import Home from "@/pages/Home";
import Shop from "@/pages/Shop";
import ProductPage from "@/pages/Product";
import Checkout from "@/pages/Checkout";
import { AccountPage, OrderPage } from "@/pages/Account";
import { QuotePage, Wholesale } from "@/pages/Wholesale";
import { ContactPage, FaqPage, InfoPage } from "@/pages/Info";
import AdminLayout from "@/pages/admin/AdminLayout";
import Dashboard from "@/pages/admin/Dashboard";
import { ProductEditor, ProductList } from "@/pages/admin/Product";
import Categories from "@/pages/admin/Categories";
import Customers from "@/pages/admin/Customer";
import Orders from "@/pages/admin/Order";
import Quotations from "@/pages/admin/Quotations";
import { Coupons, Inventory, Invoices, Service, Staff } from "@/pages/admin/AdminMisc";
import Reports from "@/pages/admin/Reports";
import { Content, Settings } from "@/pages/admin/SiteAdmin";

function StoreLayout() {
  const loc = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  return (
    <>
      <Header />
      <AnimatePresence mode="wait">
        <motion.main key={loc.pathname} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="min-h-[60vh]">
          <Outlet />
        </motion.main>
      </AnimatePresence>
      <Footer />
      <CartDrawer />
    </>
  );
}

const AuthPage = ({ children }) => <div className="flex min-h-[70vh] items-center justify-center px-4 py-12">{children}</div>;

function App() {
  return (
    <BrowserRouter>
      <ClerkAuthProvider>
        <AppProvider>
          <Toaster position="top-center" richColors />
          <Routes>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="products" element={<ProductList />} />
              <Route path="products/:id" element={<ProductEditor />} />
              <Route path="categories" element={<Categories />} />
              <Route path="customers" element={<Customers />} />
              <Route path="orders" element={<Orders />} />
              <Route path="quotations" element={<Quotations />} />
              <Route path="invoices" element={<Invoices />} />
              <Route path="inventory" element={<Inventory />} />
              <Route path="coupons" element={<Coupons />} />
              <Route path="service" element={<Service />} />
              <Route path="reports" element={<Reports />} />
              <Route path="content" element={<Content />} />
              <Route path="settings" element={<Settings />} />
              <Route path="staff" element={<Staff />} />
            </Route>
            <Route element={<StoreLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/shop" element={<Shop />} />
              <Route path="/category/:slug" element={<Shop />} />
              <Route path="/product/:slug" element={<ProductPage />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/account/orders/:id" element={<OrderPage />} />
              <Route path="/wholesale" element={<Wholesale />} />
              <Route path="/quote" element={<QuotePage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/faq" element={<FaqPage />} />
              <Route path="/about" element={<InfoPage page="about" />} />
              <Route path="/quality" element={<InfoPage page="quality" />} />
              <Route path="/shipping-policy" element={<InfoPage page="shipping" />} />
              <Route path="/returns-policy" element={<InfoPage page="returns" />} />
              <Route path="/privacy" element={<InfoPage page="privacy" />} />
              <Route path="/terms" element={<InfoPage page="terms" />} />
              <Route path="/sign-in/*" element={<AuthPage><SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" withSignUp /></AuthPage>} />
              <Route path="/sign-up/*" element={<AuthPage><SignUp routing="path" path="/sign-up" signInUrl="/sign-in" /></AuthPage>} />
              <Route path="*" element={<div className="py-32 text-center"><p className="font-display text-5xl">Page not found</p><a href="/" className="mt-4 inline-block underline">Go home</a></div>} />
            </Route>
          </Routes>
        </AppProvider>
      </ClerkAuthProvider>
    </BrowserRouter>
  );
}

export default App;
