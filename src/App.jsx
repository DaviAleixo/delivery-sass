import React from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, Navigate, useParams } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { TenantProvider } from '@/lib/TenantContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import PDVPage from './pages/PDV';
import DynamicHead from '@/components/DynamicHead';
import ErrorBoundary from '@/components/ErrorBoundary';
import { PrintQueueProvider } from '@/hooks/useFifoPrintQueue';
import StagingBanner from '@/components/common/StagingBanner';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => {
  const { slug } = useParams();
  const content = Layout ? (
    <Layout currentPageName={currentPageName} key={slug || 'root'}>{children}</Layout>
  ) : (
    <React.Fragment key={slug || 'root'}>{children}</React.Fragment>
  );
  return <ErrorBoundary>{content}</ErrorBoundary>;
};

// Redireciona a raiz da loja (/:slug) para o cardápio da loja (/:slug/menu)
const StoreRootRedirect = () => {
  const { slug } = useParams();
  const targetSlug = slug || (typeof window !== "undefined" ? localStorage.getItem("current_tenant_slug") : null) || "vrumm";
  return <Navigate to={`/${targetSlug}/menu`} replace />;
};

// Redireciona rotas soltas para a rota da loja ativa com prefixo /:slug
const SlugRedirect = ({ targetPage = "menu" }) => {
  const currentSlug = (typeof window !== "undefined" ? localStorage.getItem("current_tenant_slug") : null) || "vrumm";
  const target = targetPage ? `/${currentSlug}/${targetPage}` : `/${currentSlug}/menu`;
  return <Navigate to={target} replace />;
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
    // auth_required or other errors: allow public access, don't redirect
  }

  // Render the main app
  return (
    <Routes>
      {/* 1. Rota raiz "/" sempre redireciona para a loja ativa (ex: /texas-grill/menu ou /vrumm/menu) */}
      <Route path="/" element={<SlugRedirect targetPage="menu" />} />

      {/* 2. Painel Master Super Admin e Login Master Geral (únicas páginas globais sem slug) */}
      {Pages["SuperAdmin"] && (
        <Route
          path="/SuperAdmin"
          element={
            <LayoutWrapper currentPageName="SuperAdmin">
              {React.createElement(Pages["SuperAdmin"])}
            </LayoutWrapper>
          }
        />
      )}
      {Pages["SuperAdmin"] && (
        <Route
          path="/superadmin"
          element={
            <LayoutWrapper currentPageName="SuperAdmin">
              {React.createElement(Pages["SuperAdmin"])}
            </LayoutWrapper>
          }
        />
      )}
      {Pages["AdminLogin"] && (
        <Route
          path="/AdminLogin"
          element={
            <LayoutWrapper currentPageName="AdminLogin">
              {React.createElement(Pages["AdminLogin"])}
            </LayoutWrapper>
          }
        />
      )}
      {Pages["AdminLogin"] && (
        <Route
          path="/adminlogin"
          element={
            <LayoutWrapper currentPageName="AdminLogin">
              {React.createElement(Pages["AdminLogin"])}
            </LayoutWrapper>
          }
        />
      )}

      {/* 3. Redirecionamentos de rotas soltas (ex: /Menu, /Dashboard) para a rota com slug da loja ativa */}
      <Route path="/Menu" element={<SlugRedirect targetPage="menu" />} />
      <Route path="/menu" element={<SlugRedirect targetPage="menu" />} />
      <Route path="/Home" element={<SlugRedirect targetPage="menu" />} />
      <Route path="/home" element={<SlugRedirect targetPage="menu" />} />
      <Route path="/PDV" element={<SlugRedirect targetPage="PDV" />} />
      <Route path="/pdv" element={<SlugRedirect targetPage="PDV" />} />
      <Route path="/MyOrders" element={<SlugRedirect targetPage="MyOrders" />} />
      <Route path="/myorders" element={<SlugRedirect targetPage="MyOrders" />} />
      <Route path="/meus-pedidos" element={<SlugRedirect targetPage="MyOrders" />} />

      {Object.keys(Pages).map((pageKey) => {
        if (pageKey === "SuperAdmin" || pageKey === "AdminLogin" || pageKey === "Menu" || pageKey === "Home") {
          return null;
        }
        return (
          <React.Fragment key={`redirect-${pageKey}`}>
            <Route path={`/${pageKey}`} element={<SlugRedirect targetPage={pageKey} />} />
            {pageKey !== pageKey.toLowerCase() && (
              <Route path={`/${pageKey.toLowerCase()}`} element={<SlugRedirect targetPage={pageKey} />} />
            )}
          </React.Fragment>
        );
      })}

      {/* 4. Rotas Multi-Tenant com Slug obrigatório (:slug, :slug/menu, :slug/dashboard, etc.) */}
      <Route path="/:slug" element={<StoreRootRedirect />} />
      <Route path="/:slug/menu" element={
        <LayoutWrapper currentPageName="Menu">
          {Pages["Menu"] ? React.createElement(Pages["Menu"]) : <MainPage />}
        </LayoutWrapper>
      } />
      <Route path="/:slug/Menu" element={
        <LayoutWrapper currentPageName="Menu">
          {Pages["Menu"] ? React.createElement(Pages["Menu"]) : <MainPage />}
        </LayoutWrapper>
      } />
      <Route path="/:slug/myorders" element={
        <LayoutWrapper currentPageName="MyOrders">
          {Pages["MyOrders"] ? React.createElement(Pages["MyOrders"]) : <MainPage />}
        </LayoutWrapper>
      } />
      <Route path="/:slug/meus-pedidos" element={
        <LayoutWrapper currentPageName="MyOrders">
          {Pages["MyOrders"] ? React.createElement(Pages["MyOrders"]) : <MainPage />}
        </LayoutWrapper>
      } />
      <Route path="/:slug/admin" element={
        <LayoutWrapper currentPageName="AdminLogin">
          {Pages["AdminLogin"] ? React.createElement(Pages["AdminLogin"]) : <MainPage />}
        </LayoutWrapper>
      } />
      <Route path="/:slug/PDV" element={
        <LayoutWrapper currentPageName="PDV">
          <PDVPage />
        </LayoutWrapper>
      } />
      <Route path="/:slug/pdv" element={
        <LayoutWrapper currentPageName="PDV">
          <PDVPage />
        </LayoutWrapper>
      } />

      {/* Mapeamento de todas as páginas do painel com prefixo do slug da loja (:slug/:path) */}
      {Object.entries(Pages).flatMap(([path, Page]) => [
        <Route
          key={`slug-${path}`}
          path={`/:slug/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />,
        ...(path !== path.toLowerCase() ? [
          <Route
            key={`slug-${path}-lower`}
            path={`/:slug/${path.toLowerCase()}`}
            element={
              <LayoutWrapper currentPageName={path}>
                <Page />
              </LayoutWrapper>
            }
          />
        ] : [])
      ])}

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <TenantProvider>
            <PrintQueueProvider>
              <DynamicHead />
              <NavigationTracker />
              <AuthenticatedApp />
            </PrintQueueProvider>
          </TenantProvider>
        </Router>
        <Toaster />
        <StagingBanner />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;